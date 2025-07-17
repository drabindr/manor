#!/usr/bin/env python3
"""
Parameterized HLS Streaming Script for Casa Camera System

Usage:
    python3 hls.py --rtsp-url "rtsp://admin:pass@192.168.1.100:554/cam/realmonitor" --stream-path "live-stream" --stream-id "camera_main"
    python3 hls.py --rtsp-url "rtsp://admin:pass@192.168.1.101:554/cam/realmonitor" --stream-path "doorbell-stream" --stream-id "doorbell"

Environment Variables Required:
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
"""

import subprocess
import threading
import sys
import boto3
import time
import os
import json
import tempfile
import websocket
import ssl
import logging
import psutil
import signal
import logging.handlers
import argparse
from concurrent.futures import ThreadPoolExecutor
from botocore.exceptions import BotoCoreError, NoCredentialsError, EndpointConnectionError, ClientError

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='HLS Streaming Script for Casa Camera System')
    parser.add_argument('--rtsp-url', required=True, help='RTSP URL of the camera')
    parser.add_argument('--stream-path', required=True, help='S3 path for the stream (e.g., "live-stream", "doorbell-stream")')
    parser.add_argument('--stream-id', required=True, help='Stream identifier (e.g., "camera_main", "doorbell")')
    parser.add_argument('--websocket-url', default="wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod", help='WebSocket URL')
    parser.add_argument('--s3-bucket', default="casa-cameras-data", help='S3 bucket name')
    parser.add_argument('--cloudwatch-namespace', default="CasaCameraStream", help='CloudWatch namespace')
    parser.add_argument('--scale', help='Video scale filter (e.g., "640:480")')
    parser.add_argument('--help-only', action='store_true', help='Show help and exit')
    return parser.parse_args()

# Parse arguments
args = parse_arguments()

if args.help_only:
    print(__doc__)
    sys.exit(0)

# Set up directory for logs
logs_dir = "./logs"
os.makedirs(logs_dir, exist_ok=True)

# Configure Logging
log_filename = os.path.join(logs_dir, f"streaming_{args.stream_id}.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(message)s',
    handlers=[
        logging.handlers.TimedRotatingFileHandler(
            log_filename, when="H", interval=1, backupCount=7*24
        )
    ]
)

# Configuration from command line arguments
rtsp_url = args.rtsp_url
websocket_url = args.websocket_url
s3_bucket = args.s3_bucket
stream_path = args.stream_path
stream_id = args.stream_id
cloudwatch_namespace = args.cloudwatch_namespace
scale_filter = args.scale

# AWS Configuration
region_name = 'us-east-1'

# Initialize AWS Credentials from Environment Variables
aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')

# Check if AWS credentials are set
if not aws_access_key_id or not aws_secret_access_key:
    logging.error("AWS credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.")
    sys.exit(1)

# Global variables for streaming management
s3_client = None
cloudwatch_client = None
is_uploading = False
ffmpeg_process = None
current_run_id = None
current_output_dir = None
s3_prefix = None
start_time = None  # For measuring stream duration

# For concurrency guard on uploads
upload_in_progress = {}  # {filename: True/False}

##############################################################################
#                         AWS CLIENT INITIALIZATION
##############################################################################
def setup_clients(retries=3):
    """
    Initialize the S3 and CloudWatch clients with limited retries.
    If it fails continuously, we'll log an error but continue running.
    """
    global s3_client, cloudwatch_client
    for attempt in range(retries):
        try:
            s3_client = boto3.client(
                's3',
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name
            )
            cloudwatch_client = boto3.client(
                'cloudwatch',
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name
            )
            logging.info("AWS clients initialized.")
            return
        except (NoCredentialsError, BotoCoreError, ClientError, EndpointConnectionError) as e:
            logging.error("Failed to initialize AWS clients: %s", e, exc_info=True)
            time.sleep(5)
    logging.error("Could not initialize AWS clients after multiple retries. Continuing without CloudWatch/S3.")

##############################################################################
#                            CLOUDWATCH METRICS
##############################################################################
def emit_metric(metric_name, value, unit="Count"):
    """Send a custom metric to CloudWatch if client is initialized, handle exceptions gracefully."""
    if cloudwatch_client is None:
        return
    try:
        cloudwatch_client.put_metric_data(
            Namespace=cloudwatch_namespace,
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Unit': unit,
                    'Dimensions': [
                        {
                            'Name': 'StreamId',
                            'Value': stream_id
                        }
                    ]
                },
            ]
        )
        logging.debug("Emitted CloudWatch metric: %s - %s %s", metric_name, value, unit)
    except (BotoCoreError, ClientError, EndpointConnectionError) as e:
        logging.error("Error emitting metric %s: %s", metric_name, e, exc_info=True)

def emit_system_metrics():
    """Emit system metrics (CPU, Memory, Disk usage) every 30 minutes indefinitely."""
    while True:
        try:
            if cloudwatch_client:
                cpu_usage = psutil.cpu_percent()
                memory_info = psutil.virtual_memory()
                disk_info = psutil.disk_usage('/')

                emit_metric("CPUUsage", cpu_usage, "Percent")
                emit_metric("MemoryUsage", memory_info.percent, "Percent")
                emit_metric("DiskUsage", disk_info.percent, "Percent")

                logging.info(
                    "Emitted system metrics: CPU %.1f%%, Memory %.1f%%, Disk %.1f%%",
                    cpu_usage, memory_info.percent, disk_info.percent
                )
        except Exception as e:
            logging.error("Error emitting system metrics: %s", e, exc_info=True)
        time.sleep(1800)

##############################################################################
#                              FFMPEG LOGIC
##############################################################################
def run_ffmpeg(output_dir_path):
    """
    Launch FFmpeg to start streaming to the given local directory and keep it running.
    """
    global ffmpeg_process

    m3u8_filename = "stream.m3u8"

    # Build FFmpeg command
    ffmpeg_command = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-i", rtsp_url,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-c:a", "aac",
        "-g", "30",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "6",
        "-hls_flags", "omit_endlist",
        "-hls_segment_filename", os.path.join(output_dir_path, "segment_%03d.ts"),
        os.path.join(output_dir_path, m3u8_filename)
    ]

    # Add video filter if scale is specified
    if scale_filter:
        # Insert video filter before codec
        video_filter_index = ffmpeg_command.index("-c:v")
        ffmpeg_command.insert(video_filter_index, "-vf")
        ffmpeg_command.insert(video_filter_index + 1, f"scale={scale_filter},format=yuv420p")
    else:
        # Default format filter
        video_filter_index = ffmpeg_command.index("-c:v")
        ffmpeg_command.insert(video_filter_index, "-vf")
        ffmpeg_command.insert(video_filter_index + 1, "format=yuv420p")

    logging.info("Starting FFmpeg process for stream: %s", stream_id)
    ffmpeg_process = subprocess.Popen(ffmpeg_command, stderr=subprocess.PIPE, universal_newlines=True)

    # Start a thread to capture and log FFmpeg's stderr output
    threading.Thread(target=log_ffmpeg_errors, args=(ffmpeg_process,), daemon=True).start()
    logging.info("FFmpeg process started for stream: %s", stream_id)

def log_ffmpeg_errors(process):
    """Log FFmpeg stderr output line by line. This helps see if it stops producing output."""
    while True:
        output = process.stderr.readline()
        if output:
            logging.debug("FFmpeg stderr: %s", output.strip())
        else:
            break  # Process might have exited or no more output

def stop_ffmpeg():
    """Stop the FFmpeg process if it is running."""
    global ffmpeg_process
    if ffmpeg_process:
        logging.info("Terminating FFmpeg process for stream: %s", stream_id)
        ffmpeg_process.terminate()
        ffmpeg_process.wait()
        ffmpeg_process = None
        logging.info("FFmpeg process terminated for stream: %s", stream_id)

##############################################################################
#                         UPLOADING TO S3 LOGIC
##############################################################################
def upload_file_to_s3(file_path):
    """
    Upload a single file to S3 and track upload duration.
    After successful upload, remove the file from local disk.
    """
    global s3_prefix

    if not s3_client:
        logging.error("S3 client not initialized. Cannot upload.")
        return

    if not os.path.exists(file_path):
        logging.debug("File %s disappeared before uploading. Skipping.", file_path)
        return

    filename = os.path.basename(file_path)
    try:
        start_upload = time.time()
        s3_key = f"{s3_prefix}{filename}"

        # Decide content type
        if filename.endswith('.m3u8'):
            content_type = 'application/vnd.apple.mpegurl'
        else:
            content_type = 'video/MP2T'  # for .ts segments

        s3_client.upload_file(
            file_path,
            s3_bucket,
            s3_key,
            ExtraArgs={
                'ContentType': content_type,
                'CacheControl': 'no-cache, no-store, must-revalidate',
            }
        )
        upload_duration = time.time() - start_upload
        emit_metric("UploadDuration", upload_duration, "Seconds")
        logging.info("Uploaded %s to S3 in %.2f seconds.", s3_key, upload_duration)

        # Remove the local file after successful upload
        os.remove(file_path)
        logging.info("Removed local file %s after successful upload.", file_path)

    except (BotoCoreError, ClientError, EndpointConnectionError) as e:
        emit_metric("UploadFailures", 1)
        logging.error("Failed to upload file %s to S3: %s", file_path, e, exc_info=True)
    except Exception as e:
        emit_metric("UploadFailures", 1)
        logging.error("Unexpected error uploading file %s to S3: %s", file_path, e, exc_info=True)
    finally:
        if filename in upload_in_progress:
            upload_in_progress[filename] = False

def upload_to_s3():
    """
    Continuously checks the output directory for new/updated files and uploads them to S3.
    We track (mtime, size) in a dictionary so we don't miss rapid updates.
    We always upload .m3u8 first, then TS files. 
    Concurrency guard prevents multiple threads from uploading the same file simultaneously.
    """
    global is_uploading, current_output_dir

    existing_files = {}  # filename -> (mtime, size)

    logging.info("Starting S3 upload thread for stream: %s", stream_id)
    with ThreadPoolExecutor(max_workers=4) as executor:
        while is_uploading:
            try:
                if not current_output_dir or not os.path.exists(current_output_dir.name):
                    time.sleep(0.1)
                    continue

                current_files = sorted(os.listdir(current_output_dir.name))

                # Separate m3u8 from ts files
                m3u8_files = [f for f in current_files if f.endswith('.m3u8')]
                ts_files = [f for f in current_files if f.endswith('.ts')]

                # 1) Upload .m3u8 files first
                for filename in m3u8_files:
                    file_path = os.path.join(current_output_dir.name, filename)
                    if not os.path.isfile(file_path):
                        continue
                    try:
                        stat = os.stat(file_path)
                        mtime, size = stat.st_mtime, stat.st_size

                        # Check if new or changed
                        if (filename not in existing_files or
                            existing_files[filename] != (mtime, size)):

                            # If not already uploading
                            if not upload_in_progress.get(filename, False):
                                upload_in_progress[filename] = True
                                existing_files[filename] = (mtime, size)
                                executor.submit(upload_file_to_s3, file_path)
                    except FileNotFoundError:
                        logging.warning("File %s not found. Skipping upload.", file_path)

                # 2) Then upload TS files
                for filename in ts_files:
                    file_path = os.path.join(current_output_dir.name, filename)
                    if not os.path.isfile(file_path):
                        continue
                    try:
                        stat = os.stat(file_path)
                        mtime, size = stat.st_mtime, stat.st_size

                        # Check if new or changed
                        if (filename not in existing_files or
                            existing_files[filename] != (mtime, size)):

                            if not upload_in_progress.get(filename, False):
                                upload_in_progress[filename] = True
                                existing_files[filename] = (mtime, size)
                                executor.submit(upload_file_to_s3, file_path)
                    except FileNotFoundError:
                        logging.warning("File %s not found. Skipping upload.", file_path)

                time.sleep(0.1)
            except Exception as e:
                logging.error("Error in S3 upload loop: %s", e, exc_info=True)

##############################################################################
#                         STARTING / STOPPING A STREAM
##############################################################################
def start_uploading(run_id):
    """
    Start the uploading process for a new stream identified by run_id.
    This will create a brand-new temp directory, start FFmpeg, etc.
    """
    global is_uploading, current_run_id, s3_prefix, start_time, current_output_dir

    # If we're already uploading, stop first
    if is_uploading:
        stop_uploading()

    current_run_id = run_id
    s3_prefix = f"{stream_path}/{run_id}/"
    start_time = time.time()
    emit_metric("ConnectionStatus", 1)

    # Create a fresh temp directory for this run
    current_output_dir = tempfile.TemporaryDirectory()

    # Start FFmpeg with the new output path
    run_ffmpeg(current_output_dir.name)

    logging.info("Starting upload process with run_id: %s for stream: %s", run_id, stream_id)
    is_uploading = True
    threading.Thread(target=upload_to_s3, daemon=True).start()

def stop_uploading():
    """Stop the ongoing upload process and the FFmpeg stream."""
    global is_uploading, start_time, current_output_dir

    if is_uploading:
        is_uploading = False
        if start_time:
            stream_duration = time.time() - start_time
            emit_metric("StreamDuration", stream_duration, "Seconds")
            start_time = None
        emit_metric("ConnectionStatus", 0)
        logging.info("Stopping upload process for stream: %s", stream_id)

    # Stop FFmpeg
    stop_ffmpeg()

    # Clean up the temp directory
    if current_output_dir:
        try:
            current_output_dir.cleanup()
        except Exception as e:
            logging.error("Error cleaning up temp dir: %s", e, exc_info=True)
        current_output_dir = None

##############################################################################
#                          WEBSOCKET / RECONNECT LOGIC
##############################################################################
def websocket_worker():
    """
    Connect to the WebSocket in a loop. If the connection closes, wait and reconnect.
    """
    reconnect_interval = 5

    while True:
        logging.info("Connecting to WebSocket for stream: %s", stream_id)
        try:
            # Set up event handlers
            def on_message(ws, message):
                logging.info("Received WebSocket message for stream %s: %s", stream_id, message)
                try:
                    msg = json.loads(message)
                    event_data = msg.get("event")

                    if event_data:
                        action = event_data.get("event")
                        run_id = event_data.get("runId")
                    else:
                        # fallback if 'event' is not present
                        action = msg.get("action")
                        run_id = msg.get("runId")

                    if action == "start_live_stream" and run_id:
                        logging.info("Received start_live_stream action with run_id: %s for stream: %s", run_id, stream_id)
                        start_uploading(run_id)
                    elif action in ["stop_live_stream", "client_disconnected"]:
                        logging.info("Stopping stream %s due to %s.", stream_id, action)
                        stop_uploading()
                    elif action == "ping":
                        logging.info("Ping received for stream: %s. Doing nothing.", stream_id)
                    else:
                        logging.warning("Unknown action received for stream %s: %s", stream_id, action)
                except json.JSONDecodeError:
                    logging.error("Invalid message format for stream %s: %s", stream_id, message)

            def on_error(ws, error):
                logging.error("WebSocket error for stream %s: %s", stream_id, error)

            def on_close(ws, *args):
                logging.info("WebSocket connection closed for stream: %s", stream_id)
                logging.info("Will reconnect in %d seconds...", reconnect_interval)

            def on_open(ws):
                logging.info("WebSocket connection established for stream: %s", stream_id)

            ws_app = websocket.WebSocketApp(
                websocket_url,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
                on_open=on_open
            )
            # Use SSL with no cert check if needed, plus keepalives
            ws_app.run_forever(
                sslopt={"cert_reqs": ssl.CERT_NONE},
                ping_interval=30,
                ping_timeout=10
            )

        except Exception as e:
            logging.error("Exception in WebSocket connection for stream %s: %s", stream_id, e, exc_info=True)

        # Sleep before attempting another reconnect
        time.sleep(reconnect_interval)

##############################################################################
#                            SIGNAL HANDLERS
##############################################################################
def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    logging.info("Received signal %d. Shutting down stream: %s", signum, stream_id)
    stop_uploading()
    sys.exit(0)

# Setup signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

##############################################################################
#                               MAIN ENTRY
##############################################################################
if __name__ == "__main__":
    logging.info("Stream script starting for: %s", stream_id)

    # If your environment needs to wait for the network to come up, keep this.
    time.sleep(60)

    # Initialize AWS clients
    setup_clients()

    # Start system metrics in a separate thread
    threading.Thread(target=emit_system_metrics, daemon=True).start()

    # WebSocket worker
    threading.Thread(target=websocket_worker, daemon=True).start()

    # Keep main thread alive
    while True:
        time.sleep(3600)
