#!/usr/bin/env python3
"""
Parameterized HLS Stream Manager
===============================
A reusable HLS streaming system that can be configured for different cameras.
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

class HLSStreamManager:
    def __init__(self, config):
        """Initialize HLS Stream Manager with configuration."""
        self.config = config
        self.stream_id = config['stream_id']
        self.rtsp_url = config['rtsp_url']
        self.websocket_url = config.get('websocket_url', os.getenv("WEBSOCKET_URL", "wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod"))
        self.s3_bucket = config.get('s3_bucket', 'casa-cameras-data')
        self.region_name = config.get('region_name', 'us-east-1')
        self.cloudwatch_namespace = config.get('cloudwatch_namespace', 'CasaCameraStream')
        
        # FFmpeg settings
        self.ffmpeg_settings = config.get('ffmpeg_settings', {})
        
        # Set up logging
        self.setup_logging()
        
        # Global variables
        self.s3_client = None
        self.cloudwatch_client = None
        self.is_uploading = False
        self.ffmpeg_process = None
        self.current_run_id = None
        self.current_output_dir = None
        self.s3_prefix = None
        self.start_time = None
        self.upload_in_progress = {}
        
    def setup_logging(self):
        """Set up logging for this stream."""
        logs_dir = "./logs"
        os.makedirs(logs_dir, exist_ok=True)
        
        log_filename = os.path.join(logs_dir, f"{self.stream_id}_streaming.log")
        logging.basicConfig(
            level=logging.INFO,
            format=f'%(asctime)s - {self.stream_id} - %(message)s',
            handlers=[
                logging.handlers.TimedRotatingFileHandler(
                    log_filename, when="H", interval=1, backupCount=7*24
                )
            ]
        )
        
    def setup_clients(self, retries=3):
        """Initialize AWS clients."""
        for attempt in range(retries):
            try:
                self.s3_client = boto3.client('s3', region_name=self.region_name)
                self.cloudwatch_client = boto3.client('cloudwatch', region_name=self.region_name)
                
                # Test the credentials by making a simple call
                self.s3_client.list_buckets()
                logging.info("AWS clients initialized for %s stream.", self.stream_id)
                return
            except (NoCredentialsError, BotoCoreError, ClientError, EndpointConnectionError) as e:
                logging.error("Failed to initialize AWS clients: %s", e, exc_info=True)
                time.sleep(5)
        logging.error("Could not initialize AWS clients after multiple retries.")
        
    def emit_metric(self, metric_name, value, unit="Count", dimensions=None):
        """Send a custom metric to CloudWatch."""
        if self.cloudwatch_client is None:
            return
        try:
            default_dimensions = [
                {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
                {'Name': 'StreamId', 'Value': self.stream_id}
            ]
            
            metric_data = {
                'MetricName': metric_name,
                'Value': value,
                'Unit': unit,
                'Dimensions': dimensions or default_dimensions
            }
            
            self.cloudwatch_client.put_metric_data(
                Namespace=self.cloudwatch_namespace,
                MetricData=[metric_data]
            )
            logging.debug("Emitted CloudWatch metric: %s - %s %s", metric_name, value, unit)
        except (BotoCoreError, ClientError, EndpointConnectionError) as e:
            logging.error("Error emitting metric %s: %s", metric_name, e, exc_info=True)
            
    def emit_system_metrics(self):
        """Emit system metrics every 30 minutes."""
        while True:
            try:
                if self.cloudwatch_client:
                    cpu_usage = psutil.cpu_percent()
                    memory_info = psutil.virtual_memory()
                    disk_info = psutil.disk_usage('/')

                    dimensions = [
                        {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
                        {'Name': 'StreamId', 'Value': self.stream_id}
                    ]

                    self.emit_metric("CPUUsage", cpu_usage, "Percent", dimensions)
                    self.emit_metric("MemoryUsage", memory_info.percent, "Percent", dimensions)
                    self.emit_metric("DiskUsage", disk_info.percent, "Percent", dimensions)

                    logging.info(
                        "Emitted %s system metrics: CPU %.1f%%, Memory %.1f%%, Disk %.1f%%",
                        self.stream_id, cpu_usage, memory_info.percent, disk_info.percent
                    )
            except Exception as e:
                logging.error("Error emitting system metrics: %s", e, exc_info=True)
            time.sleep(1800)
            
    def run_ffmpeg(self, output_dir_path):
        """Launch FFmpeg with the same settings as main branch."""
        m3u8_filename = "stream.m3u8"
        
        # Use the exact same FFmpeg command as main branch for consistency
        ffmpeg_command = [
            "ffmpeg",
            "-rtsp_transport", "tcp",
            "-i", self.rtsp_url,
            "-vf", "format=yuv420p",
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
        
        logging.info("Starting FFmpeg process for %s stream.", self.stream_id)
        self.ffmpeg_process = subprocess.Popen(ffmpeg_command, stderr=subprocess.PIPE, universal_newlines=True)
        
        threading.Thread(target=self.log_ffmpeg_errors, args=(self.ffmpeg_process,), daemon=True).start()
        logging.info("FFmpeg %s process started.", self.stream_id)
        
    def log_ffmpeg_errors(self, process):
        """Log FFmpeg stderr output."""
        while True:
            output = process.stderr.readline()
            if output:
                logging.debug("FFmpeg stderr: %s", output.strip())
            else:
                break
                
    def stop_ffmpeg(self):
        """Stop the FFmpeg process."""
        if self.ffmpeg_process:
            logging.info("Terminating FFmpeg %s process...", self.stream_id)
            self.ffmpeg_process.terminate()
            self.ffmpeg_process.wait()
            self.ffmpeg_process = None
            logging.info("FFmpeg %s process terminated.", self.stream_id)
            
    def upload_file_to_s3(self, file_path):
        """Upload a single file to S3 with main branch structure."""
        if not self.s3_client:
            logging.error("S3 client not initialized. Cannot upload.")
            return

        if not os.path.exists(file_path):
            logging.debug("File %s disappeared before uploading. Skipping.", file_path)
            return

        filename = os.path.basename(file_path)
        try:
            start_upload = time.time()
            
            # Use the same S3 key structure as main branch
            s3_key = f"{self.s3_prefix}{filename}"
            
            # Decide content type
            if filename.endswith('.m3u8'):
                content_type = 'application/vnd.apple.mpegurl'
            else:
                content_type = 'video/MP2T'  # for .ts segments

            self.s3_client.upload_file(
                file_path,
                self.s3_bucket,
                s3_key,
                ExtraArgs={
                    'ContentType': content_type,
                    'CacheControl': 'no-cache, no-store, must-revalidate',
                }
            )
            
            upload_duration = time.time() - start_upload
            
            dimensions = [
                {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
                {'Name': 'StreamId', 'Value': self.stream_id}
            ]
            self.emit_metric("UploadDuration", upload_duration, "Seconds", dimensions)
            logging.info("Uploaded %s to S3 in %.2f seconds.", s3_key, upload_duration)

            # Remove the local file after successful upload (like main branch)
            os.remove(file_path)
            logging.info("Removed local file %s after successful upload.", file_path)

        except Exception as e:
            dimensions = [
                {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
                {'Name': 'StreamId', 'Value': self.stream_id}
            ]
            self.emit_metric("UploadFailures", 1, "Count", dimensions)
            logging.error("Failed to upload %s file %s to S3: %s", self.stream_id, file_path, e, exc_info=True)
        finally:
            if filename in self.upload_in_progress:
                self.upload_in_progress[filename] = False
                
    def cleanup_old_segments(self):
        """Clean up old segments from S3 that are no longer in the current playlist."""
        try:
            # Get current playlist to see which segments are still needed
            playlist_key = f"{self.stream_id}-stream/playlist.m3u8"
            response = self.s3_client.get_object(Bucket=self.s3_bucket, Key=playlist_key)
            playlist_content = response['Body'].read().decode('utf-8')
            
            # Extract segment filenames from playlist
            current_segments = set()
            for line in playlist_content.split('\n'):
                line = line.strip()
                if line.endswith('.ts'):
                    current_segments.add(line)
            
            # List all segments in S3 for this stream
            prefix = f"{self.stream_id}-stream/"
            response = self.s3_client.list_objects_v2(Bucket=self.s3_bucket, Prefix=prefix)
            
            if 'Contents' in response:
                segments_to_delete = []
                for obj in response['Contents']:
                    key = obj['Key']
                    filename = os.path.basename(key)
                    
                    # If it's a segment file and not in current playlist, mark for deletion
                    if filename.endswith('.ts') and filename not in current_segments:
                        segments_to_delete.append({'Key': key})
                
                # Delete old segments in batches
                if segments_to_delete:
                    # Limit to deleting max 50 old segments at once to avoid overwhelming S3
                    segments_to_delete = segments_to_delete[:50]
                    
                    delete_response = self.s3_client.delete_objects(
                        Bucket=self.s3_bucket,
                        Delete={'Objects': segments_to_delete}
                    )
                    
                    deleted_count = len(segments_to_delete)
                    logging.info("Cleaned up %d old %s segments from S3", deleted_count, self.stream_id)
                    
        except Exception as e:
            logging.warning("Error cleaning up old %s segments: %s", self.stream_id, e)
                
    def upload_to_s3(self):
        """Continuously upload files to S3."""
        existing_files = {}
        logging.info("Starting S3 upload thread for %s stream.", self.stream_id)
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            while self.is_uploading:
                try:
                    if not self.current_output_dir or not os.path.exists(self.current_output_dir.name):
                        time.sleep(0.1)
                        continue

                    current_files = sorted(os.listdir(self.current_output_dir.name))
                    m3u8_files = [f for f in current_files if f.endswith('.m3u8')]
                    ts_files = [f for f in current_files if f.endswith('.ts')]

                    # Upload .m3u8 files first
                    for filename in m3u8_files:
                        file_path = os.path.join(self.current_output_dir.name, filename)
                        if not os.path.isfile(file_path):
                            continue
                        try:
                            stat = os.stat(file_path)
                            mtime, size = stat.st_mtime, stat.st_size

                            if (filename not in existing_files or
                                existing_files[filename] != (mtime, size)):

                                if not self.upload_in_progress.get(filename, False):
                                    self.upload_in_progress[filename] = True
                                    existing_files[filename] = (mtime, size)
                                    executor.submit(self.upload_file_to_s3, file_path)
                        except FileNotFoundError:
                            logging.warning("%s file %s not found. Skipping upload.", self.stream_id, file_path)

                    # Then upload TS files
                    for filename in ts_files:
                        file_path = os.path.join(self.current_output_dir.name, filename)
                        if not os.path.isfile(file_path):
                            continue
                        try:
                            stat = os.stat(file_path)
                            mtime, size = stat.st_mtime, stat.st_size

                            if (filename not in existing_files or
                                existing_files[filename] != (mtime, size)):

                                if not self.upload_in_progress.get(filename, False):
                                    self.upload_in_progress[filename] = True
                                    existing_files[filename] = (mtime, size)
                                    executor.submit(self.upload_file_to_s3, file_path)
                        except FileNotFoundError:
                            logging.warning("%s file %s not found. Skipping upload.", self.stream_id, file_path)

                    time.sleep(0.1)
                except Exception as e:
                    logging.error("Error in %s S3 upload loop: %s", self.stream_id, e, exc_info=True)
                    
    def start_uploading(self, run_id):
        """Start the uploading process."""
        if self.is_uploading:
            self.stop_uploading()

        self.current_run_id = run_id
        # Use the same S3 path structure as main branch with run_id directories
        self.s3_prefix = f"{self.config.get('s3_path', 'live-stream')}/{run_id}/"
        self.start_time = time.time()
        
        dimensions = [
            {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
            {'Name': 'StreamId', 'Value': self.stream_id}
        ]
        self.emit_metric("ConnectionStatus", 1, "Count", dimensions)

        self.current_output_dir = tempfile.TemporaryDirectory()
        self.run_ffmpeg(self.current_output_dir.name)

        logging.info("Starting %s upload process with run_id: %s", self.stream_id, run_id)
        self.is_uploading = True
        threading.Thread(target=self.upload_to_s3, daemon=True).start()
        
    def stop_uploading(self):
        """Stop the uploading process."""
        if self.is_uploading:
            self.is_uploading = False
            if self.start_time:
                stream_duration = time.time() - self.start_time
                dimensions = [
                    {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
                    {'Name': 'StreamId', 'Value': self.stream_id}
                ]
                self.emit_metric("StreamDuration", stream_duration, "Seconds", dimensions)
                self.start_time = None
            
            dimensions = [
                {'Name': 'StreamType', 'Value': self.config.get('stream_type', 'camera')},
                {'Name': 'StreamId', 'Value': self.stream_id}
            ]
            self.emit_metric("ConnectionStatus", 0, "Count", dimensions)
            logging.info("Stopping %s upload process.", self.stream_id)

        self.stop_ffmpeg()

        if self.current_output_dir:
            try:
                self.current_output_dir.cleanup()
            except Exception as e:
                logging.error("Error cleaning up %s temp dir: %s", self.stream_id, e, exc_info=True)
            self.current_output_dir = None
            
    def websocket_worker(self):
        """Connect to WebSocket and handle stream commands."""
        reconnect_interval = 5
        stream_commands = self.config.get('stream_commands', {
            'start': 'start_live_stream',
            'stop': 'stop_live_stream'
        })

        while True:
            logging.info("Connecting %s stream to WebSocket...", self.stream_id)
            try:
                def on_message(ws, message):
                    logging.info("Received %s WebSocket message: %s", self.stream_id, message)
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

                        # Use the same message handling as main branch
                        if action == stream_commands['start'] and run_id:
                            logging.info("Received start %s stream action with run_id: %s", self.stream_id, run_id)
                            self.start_uploading(run_id)
                        elif action in [stream_commands['stop'], "client_disconnected"]:
                            logging.info("Stopping %s stream due to %s.", self.stream_id, action)
                            self.stop_uploading()
                        elif action == "ping":
                            logging.info("%s stream ping received.", self.stream_id)
                        else:
                            logging.warning("Unknown action received for %s: %s", self.stream_id, action)
                            
                    except json.JSONDecodeError:
                        logging.error("Invalid %s message format: %s", self.stream_id, message)

                def on_error(ws, error):
                    logging.error("%s WebSocket error: %s", self.stream_id, error)

                def on_close(ws, *args):
                    logging.info("%s WebSocket connection closed.", self.stream_id)
                    logging.info("Will reconnect in %d seconds...", reconnect_interval)

                def on_open(ws):
                    logging.info("%s WebSocket connection established.", self.stream_id)

                ws_app = websocket.WebSocketApp(
                    self.websocket_url,
                    on_message=on_message,
                    on_error=on_error,
                    on_close=on_close,
                    on_open=on_open
                )
                
                ws_app.run_forever(
                    sslopt={"cert_reqs": ssl.CERT_NONE},
                    ping_interval=30,
                    ping_timeout=10
                )

            except Exception as e:
                logging.error("Exception in %s WebSocket connection: %s", self.stream_id, e, exc_info=True)

            time.sleep(reconnect_interval)
            
    def run(self):
        """Main entry point for the stream manager."""
        logging.info("%s stream script starting...", self.stream_id)

        # Wait for network initialization
        time.sleep(60)

        # Initialize AWS clients
        self.setup_clients()

        # Start system metrics thread
        threading.Thread(target=self.emit_system_metrics, daemon=True).start()

        # Start WebSocket worker
        threading.Thread(target=self.websocket_worker, daemon=True).start()

        # Keep main thread alive
        while True:
            time.sleep(3600)

def main():
    """Main function with command line argument parsing."""
    parser = argparse.ArgumentParser(description='HLS Stream Manager')
    parser.add_argument('--config', required=True, help='Configuration file path')
    parser.add_argument('--stream-id', help='Override stream ID from config')
    
    args = parser.parse_args()
    
    # Load configuration
    try:
        with open(args.config, 'r') as f:
            config = json.load(f)
    except FileNotFoundError:
        logging.error("Configuration file not found: %s", args.config)
        sys.exit(1)
    except json.JSONDecodeError:
        logging.error("Invalid JSON in configuration file: %s", args.config)
        sys.exit(1)
    
    # Override stream ID if provided
    if args.stream_id:
        config['stream_id'] = args.stream_id
    
    # Create and run stream manager
    stream_manager = HLSStreamManager(config)
    stream_manager.run()

if __name__ == "__main__":
    main()
