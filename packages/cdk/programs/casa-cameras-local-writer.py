import subprocess
import threading
import sys
import boto3 # AWS SDK
import time
import os
import logging
import psutil # For system metrics
from datetime import datetime, timedelta
import logging.handlers
import argparse # For command-line arguments
import signal # For graceful shutdown

# --- Constants ---
DEFAULT_RTSP_URL = "rtsp://admin:casa1234@192.168.86.101:554/cam/realmonitor?channel=1&subtype=0"
DEFAULT_REGION = 'us-east-1'
DEFAULT_RAW_VIDEO_DIR = "/media/external/raw" # Base directory for storing raw video files
DEFAULT_LOGS_DIR = "./logs"
CLOUDWATCH_NAMESPACE = "CasaCameraLocalWriter"
DEFAULT_DISK_LIMIT_PERCENT = 90 # Percentage threshold for disk usage warning
DEFAULT_RETENTION_DAYS = 7 # How many days of recordings to keep
FFMPEG_RETRY_DELAY_SECONDS = 15 # Time to wait before restarting FFmpeg after failure
FFMPEG_MAX_RETRIES = 5 # Max consecutive retries before a longer pause
FFMPEG_LONG_RETRY_PAUSE_SECONDS = 300 # Longer pause after max retries
SYSTEM_METRICS_INTERVAL_SECONDS = 1800 # How often to send system metrics (30 minutes)
RENAME_CHECK_INTERVAL_SECONDS = 30 # How often to check for temp files to rename
CLEANUP_INTERVAL_SECONDS = 3600 # How often to run the old file cleanup (1 hour)
SEGMENT_DURATION_SECONDS = 60 # Duration of each video segment (should match FFmpeg setting)
RTSP_TIMEOUT_MICROSECONDS = "5000000" # RTSP stream timeout (5 seconds in microseconds)

# --- Global Variables ---
stop_event = threading.Event() # Used to signal threads to stop gracefully
cloudwatch_client = None # Global CloudWatch client instance

# --- Argument Parsing ---
def parse_arguments():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(description="Casa Camera Local Writer: Record RTSP stream, manage files, and upload metrics.")
    parser.add_argument(
        '--rtsp-url',
        default=os.environ.get('RTSP_URL', DEFAULT_RTSP_URL), # Allow override via env var
        help=f'RTSP stream URL (default: {DEFAULT_RTSP_URL})'
    )
    parser.add_argument(
        '--output-dir',
        default=os.environ.get('OUTPUT_DIR', DEFAULT_RAW_VIDEO_DIR), # Allow override via env var
        help=f'Base directory for saving video files (default: {DEFAULT_RAW_VIDEO_DIR})'
    )
    parser.add_argument(
        '--logs-dir',
        default=DEFAULT_LOGS_DIR,
        help=f'Directory for log files (default: {DEFAULT_LOGS_DIR})'
    )
    parser.add_argument(
        '--aws-region',
        default=os.environ.get('AWS_REGION', DEFAULT_REGION), # Allow override via env var
        help=f'AWS Region for CloudWatch (default: {DEFAULT_REGION})'
    )
    parser.add_argument(
        '--aws-access-key-id',
        default=os.environ.get('AWS_ACCESS_KEY_ID'), # Prefer environment variables
        help='AWS Access Key ID (Overrides environment variables if provided. SECURITY RISK!)'
    )
    parser.add_argument(
        '--aws-secret-access-key',
        default=os.environ.get('AWS_SECRET_ACCESS_KEY'), # Prefer environment variables
        help='AWS Secret Access Key (Overrides environment variables if provided. SECURITY RISK!)'
    )
    parser.add_argument(
        '--disk-limit',
        type=int,
        default=DEFAULT_DISK_LIMIT_PERCENT,
        help=f'Disk usage warning threshold (percent, default: {DEFAULT_DISK_LIMIT_PERCENT})'
    )
    parser.add_argument(
        '--retention-days',
        type=int,
        default=DEFAULT_RETENTION_DAYS,
        help=f'Days of video recordings to retain (default: {DEFAULT_RETENTION_DAYS})'
    )
    parser.add_argument(
        '--log-level',
        default='INFO',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
        help='Set the logging level (default: INFO)'
    )
    return parser.parse_args()

# --- Logging Setup ---
def setup_logging(logs_dir, log_level_str):
    """Configures logging to file and console."""
    os.makedirs(logs_dir, exist_ok=True)
    log_filename = os.path.join(logs_dir, "local-writer.log")
    log_level = getattr(logging, log_level_str.upper(), logging.INFO)

    log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - [%(threadName)s] - %(message)s')

    # File handler (rotates daily, keeps 7 backups)
    file_handler = logging.handlers.TimedRotatingFileHandler(
        log_filename, when="midnight", interval=1, backupCount=7, encoding='utf-8'
    )
    file_handler.setFormatter(log_formatter)

    # Console handler
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(log_formatter)

    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(log_level)
    # Remove existing handlers if any (e.g., during restarts)
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    logging.info(f"Logging configured. Level: {log_level_str}. Log file: {log_filename}")

# --- AWS CloudWatch Setup ---
def setup_cloudwatch(region, access_key, secret_key):
    """Initializes the Boto3 CloudWatch client."""
    global cloudwatch_client
    aws_kwargs = {'region_name': region}
    credentials_source = "default discovery (environment/config file/IAM role)"

    if access_key and secret_key:
        logging.warning("Using AWS credentials provided via command-line arguments or environment variables. Avoid passing secrets directly if possible.")
        aws_kwargs['aws_access_key_id'] = access_key
        aws_kwargs['aws_secret_access_key'] = secret_key
        credentials_source = "arguments or environment variables"
    elif access_key or secret_key:
        logging.warning("Partial AWS credentials provided. Both access key and secret key are required if overriding default discovery. Falling back to default discovery.")

    try:
        logging.info(f"Attempting to configure AWS CloudWatch client in region '{region}' using {credentials_source}.")
        cloudwatch_client = boto3.client('cloudwatch', **aws_kwargs)
        # Test connection with a simple, low-impact call
        cloudwatch_client.list_metrics(Namespace=CLOUDWATCH_NAMESPACE, MaxItems=1)
        logging.info("Successfully configured AWS CloudWatch client.")
        return True
    except Exception as e:
        logging.error(f"Failed to configure AWS CloudWatch client: {e}")
        logging.error("CloudWatch metrics will be disabled. Check credentials, permissions, and region.")
        cloudwatch_client = None # Ensure it's None if setup failed
        return False

# --- CloudWatch Metric Emission ---
def emit_metric(metric_name, value, unit="Count", dimensions=None):
    """Sends a metric to CloudWatch if the client is available."""
    if cloudwatch_client is None:
        logging.debug(f"CloudWatch client not available. Skipping metric: {metric_name}")
        return

    metric_data = {
        'MetricName': metric_name,
        'Value': value,
        'Unit': unit,
        'Timestamp': datetime.utcnow() # Use UTC timestamp for CloudWatch
    }
    if dimensions:
        metric_data['Dimensions'] = dimensions

    try:
        cloudwatch_client.put_metric_data(
            Namespace=CLOUDWATCH_NAMESPACE,
            MetricData=[metric_data]
        )
        logging.debug(f"Emitted CloudWatch metric: {metric_name}={value} {unit} {dimensions or ''}")
    except Exception as e:
        logging.error(f"Failed to emit CloudWatch metric '{metric_name}': {e}")

# --- System Metrics Task ---
def system_metrics_emitter(output_dir, disk_limit):
    """Periodically emits system CPU, Memory, and Disk usage metrics."""
    logging.info("System metrics emitter thread started.")
    while not stop_event.is_set():
        try:
            # CPU Usage
            cpu_usage = psutil.cpu_percent()
            emit_metric("CPUUsage", cpu_usage, "Percent")

            # Memory Usage
            memory_info = psutil.virtual_memory()
            emit_metric("MemoryUsage", memory_info.percent, "Percent")

            # Disk Usage (Root)
            try:
                root_disk_info = psutil.disk_usage('/')
                emit_metric("DiskUsage", root_disk_info.percent, "Percent", dimensions=[{'Name': 'MountPoint', 'Value': 'Root'}])
                if root_disk_info.percent > disk_limit:
                    logging.critical(f"CRITICAL: Root disk usage ({root_disk_info.percent}%) exceeds limit ({disk_limit}%).")
            except FileNotFoundError:
                 logging.error("Root filesystem '/' not found for disk usage check.")
            except Exception as e:
                 logging.error(f"Error checking root disk usage: {e}")


            # Disk Usage (Video Output Directory)
            try:
                # Ensure we check the actual mount point if output_dir is deep within it
                # This finds the mount point containing the output directory
                output_mount_point = '/' # Default to root if finding mount fails
                best_match_len = 0
                for part in psutil.disk_partitions(all=True):
                    # Check if output_dir starts with the mount point path
                    # Add os.path.sep to ensure we match full path components (e.g., /media vs /media/external)
                    mount_point_with_sep = part.mountpoint if part.mountpoint == '/' else part.mountpoint + os.path.sep
                    if output_dir.startswith(mount_point_with_sep) and len(part.mountpoint) > best_match_len:
                        output_mount_point = part.mountpoint
                        best_match_len = len(part.mountpoint)

                if os.path.exists(output_mount_point): # Check if mount point exists
                    external_disk_info = psutil.disk_usage(output_mount_point)
                    emit_metric("DiskUsage", external_disk_info.percent, "Percent", dimensions=[{'Name': 'MountPoint', 'Value': 'VideoStorage'}]) # Use generic name or mount point
                    logging.info(f"Disk usage for '{output_mount_point}' (containing video files): {external_disk_info.percent:.1f}%")
                    if external_disk_info.percent > disk_limit:
                        logging.critical(f"CRITICAL: Video storage disk usage ({external_disk_info.percent}%) on '{output_mount_point}' exceeds limit ({disk_limit}%).")
                else:
                    logging.error(f"Video storage mount point '{output_mount_point}' not found or inaccessible for disk usage check.")
                    emit_metric("DiskCheckError", 1, "Count", dimensions=[{'Name': 'MountPoint', 'Value': 'VideoStorage'}])

            except FileNotFoundError:
                 logging.error(f"Video output directory '{output_dir}' or its mount point not found for disk usage check.")
                 emit_metric("DiskCheckError", 1, "Count", dimensions=[{'Name': 'MountPoint', 'Value': 'VideoStorage'}])
            except Exception as e:
                 logging.error(f"Error checking video storage disk usage: {e}")
                 emit_metric("DiskCheckError", 1, "Count", dimensions=[{'Name': 'MountPoint', 'Value': 'VideoStorage'}])


            logging.info(f"System metrics emitted. CPU: {cpu_usage:.1f}%, Memory: {memory_info.percent:.1f}%")

        except Exception as e:
            logging.error(f"Unexpected error in system metrics emitter: {e}")

        # Wait for the specified interval or until stop event is set
        stop_event.wait(SYSTEM_METRICS_INTERVAL_SECONDS)
    logging.info("System metrics emitter thread stopped.")


# --- FFmpeg Recording Task ---
def run_ffmpeg_recorder(rtsp_url, output_dir, disk_limit):
    """
    Manages the FFmpeg process to record the RTSP stream into timed segments.
    Includes retry logic and disk space checks.
    """
    logging.info("FFmpeg recorder thread started.")
    current_retries = 0
    ffmpeg_process = None

    while not stop_event.is_set():
        # --- Pre-run Checks ---
        # 1. Check Disk Space
        try:
            # Check the mount point containing the output directory
            output_mount_point = '/'
            best_match_len = 0
            for part in psutil.disk_partitions(all=True):
                 # Check if output_dir starts with the mount point path
                 # Add os.path.sep to ensure we match full path components (e.g., /media vs /media/external)
                 mount_point_with_sep = part.mountpoint if part.mountpoint == '/' else part.mountpoint + os.path.sep
                 if output_dir.startswith(mount_point_with_sep) and len(part.mountpoint) > best_match_len:
                     output_mount_point = part.mountpoint
                     best_match_len = len(part.mountpoint)

            if os.path.exists(output_mount_point):
                disk_info = psutil.disk_usage(output_mount_point)
                if disk_info.percent > disk_limit:
                    logging.error(f"Disk usage on '{output_mount_point}' ({disk_info.percent}%) exceeds limit ({disk_limit}%). Pausing FFmpeg launch for 60s.")
                    emit_metric("FFmpegPaused", 1, "Count", dimensions=[{'Name': 'Reason', 'Value': 'DiskFull'}])
                    stop_event.wait(60)
                    continue # Re-check condition in the next loop iteration
            else:
                logging.error(f"Video storage mount point '{output_mount_point}' not found. Pausing FFmpeg launch for 60s.")
                emit_metric("FFmpegPaused", 1, "Count", dimensions=[{'Name': 'Reason', 'Value': 'DiskNotFound'}])
                stop_event.wait(60)
                continue

        except Exception as e:
            logging.error(f"Error checking disk space before FFmpeg launch: {e}. Pausing for 60s.")
            emit_metric("FFmpegError", 1, "Count", dimensions=[{'Name': 'Type', 'Value': 'DiskCheckFailed'}])
            stop_event.wait(60)
            continue

        # 2. Prepare Output Directory for the *current* time (FFmpeg needs it)
        # FFmpeg segment muxer will use strftime based on segment *end* time.
        # We just need the base structure YYYY/MM/DD/HH to exist roughly.
        # It's safer to let FFmpeg create the final minute directory if needed.
        try:
            current_time = datetime.now()
            # Ensure YYYY/MM/DD/HH exists
            current_hour_dir = os.path.join(output_dir, current_time.strftime("%Y/%m/%d/%H"))
            os.makedirs(current_hour_dir, exist_ok=True)
        except OSError as e:
            logging.error(f"Failed to create base directory structure {current_hour_dir}: {e}. Retrying after delay.")
            emit_metric("FFmpegError", 1, "Count", dimensions=[{'Name': 'Type', 'Value': 'DirectoryCreationFailed'}])
            stop_event.wait(FFMPEG_RETRY_DELAY_SECONDS)
            continue

        # --- Construct FFmpeg Command ---
        # Output pattern using strftime for YYYY/MM/DD/HH/MM_temp.mp4
        # The segment muxer creates the file *after* the segment duration completes.
        # The filename corresponds to the *start* time of the segment.
        output_pattern = os.path.join(output_dir, "%Y/%m/%d/%H/%M_temp.mp4")

        ffmpeg_command = [
            "ffmpeg",
            "-hide_banner", # Reduce startup noise
            "-loglevel", "warning", # Log errors and warnings from ffmpeg (info/verbose can be noisy)
            # --- Input Options (Before -i) ---
            "-rtsp_transport", "tcp", # Use TCP for RTSP (more reliable than UDP over potentially lossy networks)
            "-timeout", RTSP_TIMEOUT_MICROSECONDS, # RTSP stream read/write timeout (microseconds) - CORRECTED OPTION & PLACEMENT
            "-fflags", "+igndts", # Ignore DTS errors which can sometimes occur
            # --- Input Source ---
            "-i", rtsp_url, # Input RTSP stream
            # --- Output Options (After -i) ---
            "-c:v", "copy", # Copy video stream without re-encoding (low CPU)
            # Optional: Re-encoding example (higher CPU)
            # "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
            "-c:a", "aac", # Encode audio to AAC (common, compatible format)
            # "-c:a", "copy", # Or copy if the source audio is suitable (e.g., AAC)
            "-b:a", "128k", # Audio bitrate
            "-map", "0:v:0", # Map the first video stream
            "-map", "0:a:0?", # Map the first audio stream, if it exists (?)
            "-f", "segment", # Use the segment muxer
            "-segment_time", str(SEGMENT_DURATION_SECONDS), # Create a new segment every X seconds (e.g., 60)
            "-segment_format", "mp4", # Output format for segments
            "-segment_atclocktime", "1", # Align segments with clock time (e.g., start segments at HH:MM:00)
            "-segment_time_delta", "0.05", # Small delta to ensure alignment robustness
            "-strftime", "1", # Enable strftime in segment filename pattern
            "-reset_timestamps", "1", # Reset timestamps at the beginning of each segment
            "-movflags", "+faststart", # Optimize mp4 files for streaming (write moov atom at the start)
            # --- Output Target ---
            output_pattern # Output filename pattern
        ]

        # --- Run FFmpeg Process ---
        try:
            logging.info(f"Starting FFmpeg process. Output pattern: {output_pattern}")
            logging.info(f"FFmpeg command: {' '.join(ffmpeg_command)}") # Log the command for debugging

            # Use Popen for non-blocking execution and capturing output
            ffmpeg_process = subprocess.Popen(
                ffmpeg_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, # Redirect stderr to stdout
                universal_newlines=True, # Decode output as text
                bufsize=1 # Line buffered output
            )
            pid = ffmpeg_process.pid
            logging.info(f"FFmpeg process started with PID: {pid}")
            emit_metric("FFmpegStatus", 1, "Count", dimensions=[{'Name': 'Status', 'Value': 'Running'}]) # 1 = Running
            current_retries = 0 # Reset retries on successful start

            # Monitor FFmpeg output line by line
            while not stop_event.is_set():
                line = ffmpeg_process.stdout.readline()
                if line == '' and ffmpeg_process.poll() is not None:
                    # FFmpeg process has exited
                    break
                if line:
                    line = line.strip()
                    # Log relevant lines, filter noise if necessary
                    # Keywords indicating segment writing or key events:
                    if any(k in line for k in ["Opening '", "segment", "muxing overhead", "Error", "failed", "timed out"]):
                        logging.info(f"FFmpeg (PID:{pid}): {line}")
                    elif not any(k in line for k in ["frame=", "bitrate=", "speed=", "size=", "time=", "dup=", "drop="]):
                         logging.info(f"FFmpeg (PID:{pid}): {line}") # Log other potentially useful lines
                    else:
                         logging.debug(f"FFmpeg (PID:{pid}): {line}") # Log progress lines as debug

            # --- FFmpeg Process Ended ---
            if stop_event.is_set():
                logging.info("Stop event received, terminating FFmpeg process...")
                if ffmpeg_process and ffmpeg_process.poll() is None: # Check if process still exists
                    ffmpeg_process.terminate() # Ask nicely first
                    try:
                        ffmpeg_process.wait(timeout=5) # Wait up to 5 seconds
                        logging.info(f"FFmpeg process (PID:{pid}) terminated gracefully.")
                    except subprocess.TimeoutExpired:
                        logging.warning(f"FFmpeg process (PID:{pid}) did not terminate gracefully, killing.")
                        ffmpeg_process.kill() # Force kill
                    except Exception as e:
                        logging.error(f"Error during FFmpeg termination: {e}")
                else:
                    logging.info("FFmpeg process already stopped.")

                emit_metric("FFmpegStatus", 0, "Count", dimensions=[{'Name': 'Status', 'Value': 'Stopped'}]) # 0 = Stopped
                break # Exit the main while loop

            # If we are here, FFmpeg exited unexpectedly
            return_code = ffmpeg_process.poll() if ffmpeg_process else -1 # Get exit code if process exists
            logging.error(f"FFmpeg process (PID:{pid}) exited unexpectedly with code {return_code}.")
            emit_metric("FFmpegStatus", 0, "Count", dimensions=[{'Name': 'Status', 'Value': 'Crashed'}])
            emit_metric("FFmpegError", 1, "Count", dimensions=[{'Name': 'Type', 'Value': 'Crash'}, {'Name': 'ExitCode', 'Value': str(return_code)}])
            ffmpeg_process = None # Clear the variable

            # Retry logic
            current_retries += 1
            if current_retries > FFMPEG_MAX_RETRIES:
                logging.error(f"FFmpeg failed {current_retries} times. Pausing for {FFMPEG_LONG_RETRY_PAUSE_SECONDS} seconds.")
                stop_event.wait(FFMPEG_LONG_RETRY_PAUSE_SECONDS)
                current_retries = 0 # Reset after long pause
            else:
                logging.info(f"Retrying FFmpeg in {FFMPEG_RETRY_DELAY_SECONDS} seconds (attempt {current_retries}/{FFMPEG_MAX_RETRIES})...")
                stop_event.wait(FFMPEG_RETRY_DELAY_SECONDS)

        except FileNotFoundError:
            logging.critical("FFmpeg command not found. Ensure FFmpeg is installed and in the system's PATH.")
            emit_metric("FFmpegError", 1, "Count", dimensions=[{'Name': 'Type', 'Value': 'NotFound'}])
            stop_event.wait(300) # Wait a long time if FFmpeg is missing
        except Exception as e:
            logging.error(f"An unexpected error occurred managing the FFmpeg process: {e}", exc_info=True)
            emit_metric("FFmpegError", 1, "Count", dimensions=[{'Name': 'Type', 'Value': 'UnhandledException'}])
            if ffmpeg_process and ffmpeg_process.poll() is None:
                pid = ffmpeg_process.pid
                logging.warning(f"Terminating potentially hanging FFmpeg process (PID: {pid}).")
                try:
                    ffmpeg_process.terminate()
                    ffmpeg_process.wait(timeout=5)
                except:
                    try:
                        ffmpeg_process.kill()
                    except Exception as kill_e:
                         logging.error(f"Error killing FFmpeg process {pid}: {kill_e}")
            ffmpeg_process = None
            stop_event.wait(FFMPEG_RETRY_DELAY_SECONDS) # Wait before potentially retrying

    logging.info("FFmpeg recorder thread stopped.")
    # Final status update if stopped gracefully
    if cloudwatch_client:
         emit_metric("FFmpegStatus", 0, "Count", dimensions=[{'Name': 'Status', 'Value': 'Stopped'}])


# --- Segment Renaming Task ---
def rename_completed_segments(output_dir):
    """
    Periodically scans for temporary segment files (*_temp.mp4) created by FFmpeg
    and renames them to their final names (removing _temp).
    """
    logging.info("Segment rename thread started.")
    min_age_before_rename = SEGMENT_DURATION_SECONDS + 10 # Only rename files older than segment duration + buffer (e.g., 70s)

    while not stop_event.is_set():
        renamed_count = 0
        checked_count = 0
        try:
            now_ts = time.time()
            logging.debug(f"Checking for completed segments to rename in {output_dir}")

            # Walk through the directory structure (YYYY/MM/DD/HH)
            for root, _, files in os.walk(output_dir):
                for filename in files:
                    if filename.endswith("_temp.mp4"):
                        checked_count += 1
                        temp_file_path = os.path.join(root, filename)
                        final_filename = filename.replace("_temp.mp4", ".mp4")
                        final_file_path = os.path.join(root, final_filename)

                        try:
                            # 1. Check if final file already exists (e.g., from previous run)
                            if os.path.exists(final_file_path):
                                logging.warning(f"Final file {final_file_path} already exists. Removing temp file {temp_file_path}.")
                                try:
                                    os.remove(temp_file_path)
                                except OSError as e:
                                    logging.error(f"Failed to remove redundant temp file {temp_file_path}: {e}")
                                continue # Move to the next file

                            # 2. Check file age: Ensure it's old enough to be considered complete
                            file_mod_time = os.path.getmtime(temp_file_path)
                            file_age = now_ts - file_mod_time
                            if file_age < min_age_before_rename:
                                logging.debug(f"Skipping rename, temp file {temp_file_path} is too recent (age: {file_age:.1f}s).")
                                continue # File might still be actively written or just finished

                            # 3. Attempt Rename
                            logging.info(f"Attempting rename: {temp_file_path} -> {final_file_path}")
                            os.rename(temp_file_path, final_file_path)
                            renamed_count += 1
                            logging.info(f"Successfully renamed segment: {final_file_path}")
                            emit_metric("SegmentsRenamed", 1)

                        except FileNotFoundError:
                            logging.warning(f"Temp file {temp_file_path} disappeared before processing.")
                            continue # File was likely already renamed or deleted
                        except OSError as e:
                            logging.error(f"Failed to rename or process temp file {temp_file_path}: {e}")
                            emit_metric("RenameError", 1)
                        except Exception as e:
                            logging.error(f"Unexpected error processing temp file {temp_file_path}: {e}", exc_info=True)
                            emit_metric("RenameError", 1)

            if checked_count > 0 or renamed_count > 0:
                 logging.debug(f"Segment rename check finished. Checked: {checked_count}, Renamed: {renamed_count}.")

        except Exception as e:
            logging.error(f"An error occurred during the segment rename scan: {e}", exc_info=True)

        # Wait for the interval or until stop event
        stop_event.wait(RENAME_CHECK_INTERVAL_SECONDS)

    logging.info("Segment rename thread stopped.")


# --- File Cleanup Task ---
def cleanup_old_files(output_dir, retention_days):
    """Periodically removes video files older than the specified retention period."""
    logging.info("File cleanup thread started.")
    while not stop_event.is_set():
        try:
            cutoff_time = datetime.now() - timedelta(days=retention_days)
            logging.info(f"Starting cleanup of files older than {cutoff_time.strftime('%Y-%m-%d %H:%M:%S')} ({retention_days} days) in {output_dir}")
            removed_files_count = 0
            removed_dirs_count = 0
            checked_files_count = 0

            # Walk the directory tree from the bottom up
            for root, dirs, files in os.walk(output_dir, topdown=False):
                # Process files first
                for file in files:
                    # Only target final .mp4 files for cleanup
                    if not file.endswith(".mp4") or file.endswith("_temp.mp4"):
                        continue

                    checked_files_count += 1
                    file_path = os.path.join(root, file)
                    try:
                        file_mod_time_ts = os.path.getmtime(file_path)
                        file_mod_time = datetime.fromtimestamp(file_mod_time_ts)

                        if file_mod_time < cutoff_time:
                            logging.info(f"Removing old file: {file_path} (Modified: {file_mod_time.strftime('%Y-%m-%d %H:%M:%S')})")
                            os.remove(file_path)
                            removed_files_count += 1
                    except FileNotFoundError:
                        logging.warning(f"File not found during cleanup (possibly already deleted): {file_path}")
                    except Exception as e:
                        logging.error(f"Error processing file {file_path} during cleanup: {e}")

                # After processing files, try removing the directory if it's empty
                # Ensure we don't try to remove the base output directory itself
                if not os.listdir(root) and os.path.abspath(root) != os.path.abspath(output_dir):
                    try:
                        os.rmdir(root)
                        logging.info(f"Removed empty directory: {root}")
                        removed_dirs_count += 1
                    except OSError as e:
                        # It might fail if a file was just created there, which is okay
                        logging.warning(f"Could not remove directory {root} (likely not empty): {e}")
                    except Exception as e:
                        logging.error(f"Error removing directory {root}: {e}")


            logging.info(f"Cleanup finished. Checked: {checked_files_count} files, Removed Files: {removed_files_count}, Removed Dirs: {removed_dirs_count}.")
            emit_metric("FilesCleaned", removed_files_count)
            emit_metric("DirectoriesCleaned", removed_dirs_count)

        except Exception as e:
            logging.error(f"An error occurred during the cleanup cycle: {e}", exc_info=True)
            emit_metric("CleanupError", 1)

        # Wait for the interval or until stop event
        stop_event.wait(CLEANUP_INTERVAL_SECONDS)

    logging.info("File cleanup thread stopped.")


# --- Graceful Shutdown Handler ---
def signal_handler(signum, frame):
    """Sets the stop_event when SIGINT or SIGTERM is received."""
    logging.warning(f"Received signal {signum}. Initiating graceful shutdown...")
    stop_event.set()

# --- Main Execution ---
if __name__ == "__main__":
    args = parse_arguments()

    setup_logging(args.logs_dir, args.log_level)
    logging.info("--- Casa Camera Local Writer Starting ---")
    logging.info(f"Arguments: {vars(args)}") # Log parsed arguments (be careful with secrets)

    # Ensure output directory exists
    try:
        os.makedirs(args.output_dir, exist_ok=True)
        logging.info(f"Ensured output directory exists: {args.output_dir}")
    except OSError as e:
        logging.critical(f"Failed to create output directory {args.output_dir}: {e}. Exiting.")
        sys.exit(1)

    # Setup CloudWatch (optional, script continues if fails)
    setup_cloudwatch(args.aws_region, args.aws_access_key_id, args.aws_secret_access_key)

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler) # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler) # kill command

    # Start background threads
    threads = []
    threads.append(threading.Thread(target=system_metrics_emitter, args=(args.output_dir, args.disk_limit), name="MetricsEmitter", daemon=True))
    threads.append(threading.Thread(target=cleanup_old_files, args=(args.output_dir, args.retention_days), name="FileCleanup", daemon=True))
    threads.append(threading.Thread(target=rename_completed_segments, args=(args.output_dir,), name="SegmentRenamer", daemon=True))
    threads.append(threading.Thread(target=run_ffmpeg_recorder, args=(args.rtsp_url, args.output_dir, args.disk_limit), name="FFmpegRecorder", daemon=True)) # Main recorder thread

    for t in threads:
        t.start()

    # Keep the main thread alive, waiting for the stop event
    try:
        while not stop_event.is_set():
            # Check if essential threads are alive periodically
            is_recorder_alive = any(t.name == "FFmpegRecorder" and t.is_alive() for t in threads)
            if not is_recorder_alive:
                 # Check if stop event is set before logging error - avoids spurious logs during shutdown
                 if not stop_event.is_set():
                     logging.error("FFmpeg recorder thread has stopped unexpectedly. The script might not be recording.")
                     # The recorder loop has its own retry, but if the thread itself dies, we might need intervention.
                     # For now, just log the error. Consider adding logic to restart the thread if needed.
                     emit_metric("ThreadStatus", 0, "Count", dimensions=[{'Name':'ThreadName', 'Value':'FFmpegRecorder'}]) # 0 = Stopped


            # Wait for a bit or until stop_event is set
            stop_event.wait(60) # Check thread status every minute

    except Exception as e:
        logging.critical(f"An unexpected error occurred in the main loop: {e}", exc_info=True)
        stop_event.set() # Trigger shutdown on main loop error

    finally:
        logging.info("Main thread waiting for background threads to stop...")
        # Wait for threads to finish (with a timeout)
        # Note: Daemon threads might exit abruptly if main exits, but the stop_event helps them finish cleanly.
        shutdown_timeout = FFMPEG_RETRY_DELAY_SECONDS + 10 # Give threads time to finish current cycle
        # Join threads in reverse order of creation (optional, but sometimes helps dependencies)
        for t in reversed(threads):
             if t.is_alive():
                 logging.debug(f"Waiting for thread {t.name} to join...")
                 t.join(timeout=shutdown_timeout)
                 if t.is_alive():
                      logging.warning(f"Thread {t.name} did not stop within the timeout.")
                 else:
                      logging.debug(f"Thread {t.name} joined.")

        logging.info("--- Casa Camera Local Writer Stopped ---")
