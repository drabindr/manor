import json
import os
from datetime import datetime

import boto3
from openai import OpenAI

# Initialize S3 and CloudWatch clients
s3_client = boto3.client('s3')
cloudwatch_client = boto3.client('cloudwatch')

# Define constants
SCRATCH_BUCKET_NAME = 'casa-watermeter-daily'
SCRATCH_FILE_KEY = 'latest.scratch'
WATERMETER_BUCKET_NAME = 'casa-watermeter-daily'

# Set your OpenAI API key from environment variable
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Initialize the OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)

def generate_presigned_url(s3_bucket, s3_key, expiration=3600):
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': s3_bucket, 'Key': s3_key},
                                                    ExpiresIn=expiration)
        return response
    except Exception as e:
        print(f"Error generating presigned URL: {str(e)}")
        return None

def extract_watermeter_value(date_str):
    # Fetch the latest reading from the scratch file
    previous_value = fetch_latest_reading_from_scratch_file()

    # Construct the S3 key based on the date input
    image_key = f"{date_str}.jpg"

    # Log the S3 path being used
    print(f"Fetching image from S3 with key: {image_key}")

    # Generate a presigned URL for the image
    presigned_url = generate_presigned_url(WATERMETER_BUCKET_NAME, image_key)
    if not presigned_url:
        return None

    # Construct the prompt with the latest reading
    prompt = [
        {
            "type": "text",
            "text": f"Read the water meter reading. The previous reading was {previous_value}. Use this information to find the new reading in the image."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": presigned_url
            }
        }
    ]

    # Log the prompt
    print(f"Prompt to GPT-4: {json.dumps(prompt, indent=2)}")

    # Call the OpenAI API
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Read the water meter digits using the previous known value as a reference.  the value should be increasing, but should not increase more than 10 typically.  there 6 digits to read in.  only return the new value as a response, it should be a number no words."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=300
        )
        new_reading_str = response.choices[0].message.content.strip()
        print(f"New reading extracted: {new_reading_str}")
        try:
            new_reading = int(new_reading_str)
            return new_reading
        except ValueError:
            print(f"Error: Could not convert the extracted reading '{new_reading_str}' to an integer.")
    except Exception as e:
        print(f"Error: Failed to get response from GPT-4 Vision API. {str(e)}")
    
    return None

def lambda_handler(event, context):
    try:
        # Assuming the date is provided as a string in the event, e.g., "08-30-2024-23-48"
        date_str = event['date']
        value = extract_watermeter_value(date_str)
        if value is not None:
            print(f'Success: extracted value - {value}')
            try:
                timestamp = datetime.strptime(date_str, '%m-%d-%Y-%H-%M')
                print(f'Success: extracted timestamp - {timestamp}')
            except ValueError as e:
                print(f'Error parsing date string: {e}')
                return {'statusCode': 400, 'body': json.dumps(f'Error parsing date string: {e}')}

            difference = compute_and_log_difference(value)
            if difference is not None:
                update_latest_reading_in_scratch_file(value)
                if difference <= 50:
                    print('Difference is less than 50, lets emit the metrics')
                    emit_metrics_to_cloudwatch(value, timestamp, difference)
                else:
                    print('Difference is greater than 50, skip emitting daily consumption.')

            return {'statusCode': 200, 'body': json.dumps(f'Success: Published {timestamp} - Value: {value}')}
        else:
            print('Failed to extract water meter value.')
            return {'statusCode': 500, 'body': json.dumps('Failed to extract water meter value.')}

    except Exception as e:
        print(f'Unhandled exception: {str(e)}')
        return {'statusCode': 500, 'body': json.dumps(f'Unhandled exception: {str(e)}')}

def update_latest_reading_in_scratch_file(reading_value):
    value_as_str = str(reading_value)
    s3_client.put_object(Body=value_as_str, Bucket=SCRATCH_BUCKET_NAME, Key=SCRATCH_FILE_KEY)
    print(f'Scratch file updated with value: {reading_value}')

def fetch_latest_reading_from_scratch_file():
    fetched_object = s3_client.get_object(Bucket=SCRATCH_BUCKET_NAME, Key=SCRATCH_FILE_KEY)
    content = fetched_object['Body'].read().decode('utf-8')
    print(f'Latest reading from scratch file: {content}')
    return content

def compute_and_log_difference(new_value):
    latest_reading = fetch_latest_reading_from_scratch_file()
    if latest_reading is not None:
        try:
            latest_reading = int(latest_reading)
            difference = new_value - latest_reading
            print(f'Found a difference of {difference}')
            return difference
        except ValueError:
            print('Error: Latest reading could not be converted to an integer.')
    else:
        print('Error: Latest reading could not be retrieved.')
    return None

def emit_metrics_to_cloudwatch(value, timestamp, delta):
    metrics = [
        {
            'MetricName': 'WaterMeterValue',
            'Value': value,
            'Unit': 'None',
            'Timestamp': timestamp
        },
        {
            'MetricName': 'WaterMeterDelta',
            'Value': delta,
            'Unit': 'None',
            'Timestamp': timestamp
        }
    ]
    cloudwatch_client.put_metric_data(Namespace='casa-watermeter', MetricData=metrics)
    print(f'Success: Metrics emitted to CloudWatch')

if __name__ == "__main__":
    # Simulate an AWS Lambda event using the provided date string
    test_event = {
        "date": "08-30-2024-23-48"
    }

    # Simulate context (optional)
    class Context:
        def __init__(self):
            self.function_name = "lambda_function"
            self.memory_limit_in_mb = 128
            self.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:lambda_function"
            self.aws_request_id = "1234567890"

    context = Context()

    # Run the handler function locally
    result = lambda_handler(test_event, context)
    print(json.dumps(result, indent=4))
