import boto3
import os
import ffmpeg
import re
import concurrent.futures
import argparse
from datetime import datetime, timedelta
from PIL import Image

# AWS Credentials and Setup
aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
region_name = 'us-east-1'

# Initialize S3 client with the provided credentials
s3 = boto3.client(
    's3',
    aws_access_key_id=aws_access_key_id,
    aws_secret_access_key=aws_secret_access_key,
    region_name=region_name
)

# Function to clean up a directory
def clean_directory(directory):
    if os.path.exists(directory):
        for file in os.listdir(directory):
            file_path = os.path.join(directory, file)
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"Removed file: {file_path}")
    else:
        os.makedirs(directory)
        print(f"Created directory: {directory}")

# Function to get all video files for a given day (in EST) from S3 (stored in UTC)
def get_video_files(bucket, address, camera, date_est, limit=None):
    date_est_start = datetime.strptime(date_est, '%Y-%m-%d')
    date_est_end = date_est_start + timedelta(days=1)
    
    date_utc_start = date_est_start + timedelta(hours=5)  # EST to UTC
    date_utc_end = date_est_end + timedelta(hours=5)  # EST to UTC

    video_files = []
    for single_date in (date_utc_start + timedelta(n) for n in range((date_utc_end - date_utc_start).days)):
        prefix = f"address={address}/camera={camera}/date={single_date.strftime('%Y-%m-%d')}/"
        response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        
        for obj in response.get('Contents', []):
            if re.search(r'\.(mp4|mkv)$', obj['Key']):
                video_files.append(obj['Key'])
                if limit and len(video_files) >= limit:
                    break
        if limit and len(video_files) >= limit:
            break

    return video_files

# Function to download a single video file from S3
def download_video_file(bucket, key, download_path):
    os.makedirs(download_path, exist_ok=True)
    file_name = os.path.join(download_path, key.split('/')[-1])
    s3.download_file(bucket, key, file_name)
    print(f"Downloaded {file_name}")
    return file_name

# Function to merge video files using ffmpeg
def merge_videos(input_files, output_file):
    try:
        with open('input.txt', 'w') as f:
            for file in input_files:
                f.write(f"file '{file}'\n")

        # Capture ffmpeg output for debugging
        process = (
            ffmpeg
            .input('input.txt', format='concat', safe=0)
            .output(output_file, c='copy')
            .run_async(pipe_stdout=True, pipe_stderr=True)
        )
        stdout, stderr = process.communicate()

        # Log ffmpeg output
        print("FFmpeg output:", stdout.decode())
        print("FFmpeg error:", stderr.decode())

        if process.returncode != 0:
            print(f"FFmpeg failed with return code {process.returncode}")
            return False

        return True
    finally:
        os.remove('input.txt')

# Function to download and merge videos in a sliding window fashion
def process_videos_in_sliding_window(bucket, video_files, download_path, output_file, window_size):
    temp_output_file = output_file
    intermediate_files = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count()) as executor:
        for i in range(0, len(video_files), window_size):
            window_files = video_files[i:i + window_size]
            
            # Download videos in parallel
            download_futures = [executor.submit(download_video_file, bucket, key, download_path) for key in window_files]
            local_files = [future.result() for future in concurrent.futures.as_completed(download_futures)]

            # Validate downloaded files
            local_files = [file for file in local_files if os.path.exists(file)]
            if not local_files:
                raise FileNotFoundError(f"No valid files downloaded for window {i // window_size}")

            # Merge videos in parallel
            temp_merged_file = os.path.join(download_path, f"merged_{i // window_size}.mp4")
            merge_success = merge_videos(local_files, temp_merged_file)
            if not merge_success or not os.path.exists(temp_merged_file):
                raise FileNotFoundError(f"Failed to create merged file: {temp_merged_file}")

            intermediate_files.append(temp_merged_file)

            # Clean up local files after processing
            for file in local_files:
                if os.path.exists(file):
                    os.remove(file)

    # Final merge of all intermediate files
    final_merge_success = merge_videos(intermediate_files, temp_output_file)
    if not final_merge_success or not os.path.exists(temp_output_file):
        raise FileNotFoundError(f"Failed to create final merged file: {temp_output_file}")

    # Clean up intermediate files
    for file in intermediate_files:
        if os.path.exists(file):
            os.remove(file)

# Function to generate thumbnails and VTT file
def generate_thumbnails_and_vtt(bucket, s3_prefix, video_file, thumbnail_dir, vtt_file):
    os.makedirs(thumbnail_dir, exist_ok=True)

    # Generate thumbnails every 5 seconds
    ffmpeg.input(video_file).filter('fps', fps=1/5).output(os.path.join(thumbnail_dir, 'thumb%04d.jpg')).run()

    # Create VTT file
    thumbnails = sorted([f for f in os.listdir(thumbnail_dir) if re.search(r'thumb\d+\.jpg', f)])
    with open(vtt_file, 'w') as vtt:
        vtt.write('WEBVTT\n\n')
        for i, thumb in enumerate(thumbnails):
            timestamp = i * 5
            vtt.write(f"{timestamp//3600:02}:{(timestamp//60)%60:02}:{timestamp%60:02}.000 --> {timestamp//3600:02}:{(timestamp//60)%60:02}:{(timestamp+5)%60:02}.000\n")
            # Construct the correct S3 URL for the thumbnail
            full_url = f"https://{bucket}.s3.amazonaws.com/{s3_prefix}/thumbnails/{thumb}"
            vtt.write(f"{full_url}\n\n")

# Function to delete existing S3 files in a given prefix
def delete_existing_s3_files(bucket, prefix):
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    delete_keys = {'Objects': [{'Key': obj['Key']} for obj in response.get('Contents', [])]}
    
    if delete_keys['Objects']:
        s3.delete_objects(Bucket=bucket, Delete=delete_keys)
        print(f"Deleted existing files in {prefix}")
    else:
        print(f"No files to delete in {prefix}")

# Function to upload files to S3
def upload_files_to_s3(bucket, local_dir, s3_prefix):
    for root, _, files in os.walk(local_dir):
        for file in files:
            local_path = os.path.join(root, file)
            relative_path = os.path.relpath(local_path, local_dir)
            s3_path = f"{s3_prefix}/{relative_path}"
            s3.upload_file(local_path, bucket, s3_path)
            print(f"Uploaded {s3_path} to {bucket}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Download, combine video files from S3, generate thumbnails and VTT file, and upload to S3.')
    parser.add_argument('--date', required=True, help='The EST date for which to process videos (format: YYYY-MM-DD)')
    parser.add_argument('--skip-download', action='store_true', help='Skip downloading files and assume they are already present locally')
    parser.add_argument('--test-run', action='store_true', help='Limit to 2 hours of files for a quick test run')
    parser.add_argument('--window-size', type=int, default=5, help='Number of files to process in each window')
    args = parser.parse_args()

    source_bucket = 'casa-cameras-data'
    target_bucket = 'casa-cameras-daily-aggregate'
    address = '720FrontRd'
    camera = '1'
    date_est = args.date
    download_path = 'downloaded_videos'
    output_file = 'agg_video.mp4'
    thumbnail_dir = 'thumbnails'
    vtt_file = 'thumbnails.vtt'

    # Clean directories before starting
    clean_directory(download_path)
    clean_directory(thumbnail_dir)

    if not args.skip_download:
        video_files = get_video_files(source_bucket, address, camera, date_est)
        if args.test_run:
            # Estimate number of files in 2 hours based on typical interval (assuming 5 files per minute)
            video_files = video_files[:600]  # Adjust this estimate based on actual file frequency
        process_videos_in_sliding_window(source_bucket, video_files, download_path, output_file, args.window_size)

    if os.path.exists(output_file):
        s3_prefix = f"address={address}/camera={camera}/date={date_est}"
        generate_thumbnails_and_vtt(target_bucket, s3_prefix, output_file, thumbnail_dir, vtt_file)
        delete_existing_s3_files(target_bucket, s3_prefix)
        s3.upload_file(output_file, target_bucket, f"{s3_prefix}/agg_video.mp4")
        upload_files_to_s3(target_bucket, thumbnail_dir, f"{s3_prefix}/thumbnails")
        s3.upload_file(vtt_file, target_bucket, f"{s3_prefix}/thumbnails/thumbnails.vtt")
        print(f"Uploaded VTT file to s3://{target_bucket}/{s3_prefix}/thumbnails/thumbnails.vtt")
        os.remove(output_file)
        print(f"Removed local file: {output_file}")
    else:
        print("No combined video file to process.")
