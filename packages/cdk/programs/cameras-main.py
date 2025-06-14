import cv2
import time
import logging
from logging import handlers
import boto3
from botocore.exceptions import NoCredentialsError
import tempfile
import os
import psutil
import threading

# Configure logging
logs_dir = "/tmp/logs"
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

log_filename = os.path.join(logs_dir, "camera-stream.log")
logger = logging.getLogger("CameraLogger")
logger.setLevel(logging.INFO)
handler = logging.handlers.TimedRotatingFileHandler(
    log_filename, when="H", interval=1, backupCount=7*24
)
formatter = logging.Formatter('%(asctime)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# RTSP URL
rtsp_url = "rtsp://admin:casa1234@192.168.86.59:554/cam/realmonitor?channel=1&subtype=0"

# Video file parameters
fps = 15.0
frame_size = (1280, 720)

# AWS Credentials and Setup
aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
region_name = 'us-east-1'
bucket_name = 'casa-cameras-data'

s3_client = boto3.client('s3', aws_access_key_id=aws_access_key_id,
                         aws_secret_access_key=aws_secret_access_key, region_name=region_name)

cloudwatch_client = boto3.client('cloudwatch', aws_access_key_id=aws_access_key_id,
                                 aws_secret_access_key=aws_secret_access_key, region_name=region_name)

def upload_to_s3(file_path, s3_path):
    try:
        s3_client.upload_file(file_path, bucket_name, s3_path)
        file_size = os.path.getsize(file_path)
        logger.info(f"Uploaded {file_path} to s3://{bucket_name}/{s3_path} with size {file_size} bytes")
        emit_cloudwatch_metric(file_size)
    except NoCredentialsError:
        logger.error("Credentials not available")

def emit_cloudwatch_metric(file_size):
    try:
        memory = psutil.virtual_memory()
        cpu = psutil.cpu_percent()
        disk = psutil.disk_usage('/')

        cloudwatch_client.put_metric_data(
            Namespace='casa-cameras',
            MetricData=[
                {
                    'MetricName': 'SuccessfulUploads',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Count',
                    'Value': 1
                },
                {
                    'MetricName': 'UploadFileSize',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Bytes',
                    'Value': file_size
                },
                {
                    'MetricName': 'TotalMemoryAvailable',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Bytes',
                    'Value': memory.total
                },
                {
                    'MetricName': 'TotalMemoryFree',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Bytes',
                    'Value': memory.available
                },
                {
                    'MetricName': 'MemoryUtilizationPercent',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Percent',
                    'Value': memory.percent
                },
                {
                    'MetricName': 'TotalCpuUtilization',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Percent',
                    'Value': cpu
                },
                {
                    'MetricName': 'DiskUtilizationPercent',
                    'Dimensions': [
                        {
                            'Name': 'CameraStream',
                            'Value': 'Camera1'
                        },
                    ],
                    'Unit': 'Percent',
                    'Value': disk.percent
                },
            ]
        )
        logger.info("Successfully emitted metrics to CloudWatch")
    except Exception as e:
        logger.error(f"Failed to emit metrics to CloudWatch: {e}")

def record_video():
    cap = cv2.VideoCapture(rtsp_url)

    if not cap.isOpened():
        logger.error("Error: Unable to open camera stream")
        return False

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    logger.info(f"Frame size: {frame_width}x{frame_height}")

    fourcc = cv2.VideoWriter_fourcc(*'X264')

    while True:
        current_time = time.strftime("%Y%m%d-%H%M%S")
        year = time.strftime("%Y")
        month = time.strftime("%m")
        day = time.strftime("%d")
        hour = time.strftime("%H")
        minute = time.strftime("%M")

        s3_path = f"address=720FrontRd/camera=1/date={year}-{month}-{day}/hour={hour}/min={minute}/video_{current_time}.mkv"
        
        with tempfile.NamedTemporaryFile(suffix=".mkv", delete=False) as temp_video_file:
            out = cv2.VideoWriter(temp_video_file.name, fourcc, fps, frame_size)

            start_time = time.time()
            duration = 5  # Duration of each video file in seconds

            while (time.time() - start_time) < duration:
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Failed to read frame from camera stream")
                    cap.release()
                    return False
                frame = cv2.resize(frame, frame_size)
                out.write(frame)

            out.release()
            upload_thread = threading.Thread(target=upload_to_s3, args=(temp_video_file.name, s3_path))
            upload_thread.start()
            logger.info(f"Recorded video file to {s3_path}")

    cap.release()
    cv2.destroyAllWindows()
    return True

def main():
    while True:
        success = record_video()
        if not success:
            logger.info("Restarting camera stream...")
            time.sleep(5)  # Wait a bit before trying again

if __name__ == "__main__":
    main()
