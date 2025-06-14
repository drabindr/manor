from flask import Flask, send_file, abort, request, jsonify, Response
from datetime import datetime  # For parsing dates
import os  # For filesystem operations
import logging  # For logging
from flask_cors import CORS  # Import CORS

app = Flask(__name__)
# Enable CORS for all routes and origins (adjust in production if needed)
# This generally adds Access-Control-Allow-Origin: * by default
CORS(app)

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
# Define the base directory where raw video files are stored.
# IMPORTANT: Ensure this path is correct and accessible by the Flask process.
RAW_VIDEO_DIR = "/media/external/raw"
# Check if the base directory exists at startup
if not os.path.isdir(RAW_VIDEO_DIR):
    logging.error(f"CRITICAL: Base video directory not found: {RAW_VIDEO_DIR}")
    # Depending on requirements, you might want to exit or handle this differently.
    # For now, it will likely cause 404 errors later.

# --- Helper Functions ---

def parse_date(date_str):
    """Safely parse YYYY-MM-DD date string."""
    if not date_str:
        abort(400, description="Missing 'date' query parameter.")
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        abort(400, description="Invalid date format. Expected YYYY-MM-DD.")

def validate_time_params(hour, minute):
    """Validate hour and minute parameters."""
    if hour is None or minute is None:
        abort(400, description="Missing 'hour' or 'minute' query parameter.")
    if not hour.isdigit() or not minute.isdigit():
        abort(400, description="Hour and minute must be numeric.")
    hour_int, minute_int = int(hour), int(minute)
    if not (0 <= hour_int <= 23 and 0 <= minute_int <= 59):
        abort(400, description="Invalid hour or minute value.")
    return hour_int, minute_int

# --- API Endpoints ---

@app.route('/getRawVideo')
def get_raw_video():
    """
    Serves a specific video file based on date, hour, and minute.
    Query Parameters:
        date (str): Date in YYYY-MM-DD format.
        hour (str): Hour (00-23).
        minute (str): Minute (00-59).
    Returns:
        Video file stream or 404/400 error.
    """
    date_str = request.args.get('date')
    hour_str = request.args.get('hour')
    minute_str = request.args.get('minute')

    # Validate inputs
    date = parse_date(date_str)
    hour, minute = validate_time_params(hour_str, minute_str)

    # Construct the expected file path based on the directory structure
    # Path: /base_dir/YYYY/MM/DD/HH/MM.mp4
    file_path = os.path.join(
        RAW_VIDEO_DIR,
        f"{date.year}",
        f"{date.month:02}",
        f"{date.day:02}",
        f"{hour:02}",
        f"{minute:02}.mp4"
    )
    logging.info(f"Requesting video file: {file_path}")

    # Check if the file exists and serve it
    if os.path.isfile(file_path):
        try:
            # Use Response for more control over headers
            response = send_file(file_path, mimetype='video/mp4', as_attachment=False)
            # Add Cache-Control header: cache for 1 hour in browser, 1 day in shared caches (like CDNs)
            response.headers['Cache-Control'] = 'public, max-age=3600, s-maxage=86400'
            # Explicitly add Access-Control-Allow-Origin header - flask-cors should do this,
            # but being explicit might help with media requests in some browsers.
            response.headers['Access-Control-Allow-Origin'] = '*'
            logging.info(f"Serving file: {file_path}")
            return response
        except Exception as e:
            logging.error(f"Error sending file {file_path}: {e}")
            abort(500, description="Internal server error while sending file.")
    else:
        logging.warning(f"Video file not found: {file_path}")
        abort(404, description="Video file not found for the specified time.")


@app.route('/listAvailableTimes')
def list_available_times():
    """
    Scans the directory structure for a given date and returns a list of
    available video times (represented as total minutes from midnight).
    Query Parameters:
        date (str): Date in YYYY-MM-DD format.
    Returns:
        JSON list of integers (minutes from midnight) or 400 error.
    """
    date_str = request.args.get('date')
    date = parse_date(date_str) # Reuse validation

    # Construct the path to the directory for the given date
    date_dir = os.path.join(
        RAW_VIDEO_DIR,
        f"{date.year}",
        f"{date.month:02}",
        f"{date.day:02}"
    )
    logging.info(f"Scanning for available times in: {date_dir}")

    available_minutes = []

    if not os.path.isdir(date_dir):
        logging.warning(f"Date directory not found: {date_dir}")
        # Return empty list if directory doesn't exist for the date
        return jsonify(available_minutes)

    try:
        # Walk through the hour directories (00-23)
        for hour_str in sorted(os.listdir(date_dir)):
            if hour_str.isdigit() and 0 <= int(hour_str) <= 23:
                hour_int = int(hour_str)
                hour_dir = os.path.join(date_dir, hour_str)
                if not os.path.isdir(hour_dir):
                    continue

                # Walk through the minute files (00-59.mp4)
                for minute_file in sorted(os.listdir(hour_dir)):
                    # Ensure it's XX.mp4 and not something else like .DS_Store or temp files
                    if minute_file.endswith(".mp4") and not minute_file.endswith("_temp.mp4") and len(minute_file) == 6 and minute_file[:2].isdigit():
                         minute_int = int(minute_file[:2])
                         if 0 <= minute_int <= 59:
                             # Check if the file *actually* exists (listdir might be cached)
                             file_path = os.path.join(hour_dir, minute_file)
                             if os.path.isfile(file_path):
                                 total_minutes = hour_int * 60 + minute_int
                                 available_minutes.append(total_minutes)

    except FileNotFoundError:
        logging.warning(f"Error accessing directory structure under {date_dir} (might be partially missing)")
        # Return whatever was found so far, or empty list if error occurred early
        return jsonify(available_minutes)
    except Exception as e:
        logging.error(f"Error scanning directory {date_dir}: {e}")
        abort(500, description="Internal server error while scanning for videos.")

    logging.info(f"Found {len(available_minutes)} available video times for {date_str}.")
    # Return the sorted list of times (as total minutes from midnight)
    return jsonify(sorted(available_minutes))

@app.route('/listAvailableDates')
def list_available_dates():
    """
    Returns a list of available recording dates in YYYY-MM-DD format, sorted from newest to oldest.
    """
    dates = []
    try:
        # Traverse year/month/day directory structure
        for year in sorted(os.listdir(RAW_VIDEO_DIR), reverse=True):
            if not year.isdigit():
                continue
            year_dir = os.path.join(RAW_VIDEO_DIR, year)
            if not os.path.isdir(year_dir):
                continue
            for month in sorted(os.listdir(year_dir), reverse=True):
                if not month.isdigit():
                    continue
                month_dir = os.path.join(year_dir, month)
                if not os.path.isdir(month_dir):
                    continue
                for day in sorted(os.listdir(month_dir), reverse=True):
                    if not day.isdigit():
                        continue
                    # Build date string
                    try:
                        y, m, d = int(year), int(month), int(day)
                        dates.append(f"{y}-{m:02d}-{d:02d}")
                    except ValueError:
                        continue
    except Exception as e:
        logging.error(f"Error listing available dates: {e}")
    return jsonify(dates)

# --- Error Handling ---

@app.errorhandler(400)
def bad_request(e):
    logging.warning(f"Bad Request: {e.description}")
    return jsonify(error=str(e.description)), 400

@app.errorhandler(404)
def not_found(e):
    # Make sure 404 responses also have CORS headers if needed by client
    response = jsonify(error=str(e.description))
    response.headers['Access-Control-Allow-Origin'] = '*'
    logging.warning(f"Not Found: {e.description}")
    return response, 404

@app.errorhandler(500)
def internal_server_error(e):
    # Make sure 500 responses also have CORS headers if needed by client
    response = jsonify(error=str(e.description))
    response.headers['Access-Control-Allow-Origin'] = '*'
    logging.error(f"Internal Server Error: {e.description}")
    return response, 500

# --- Main Execution ---

if __name__ == '__main__':
    # Run on 0.0.0.0 to be accessible externally
    # Use a production-ready WSGI server (like Gunicorn or Waitress) instead of Flask's built-in server for deployment.
    # Example using Gunicorn: gunicorn --bind 0.0.0.0:80 server:app
    logging.info("Starting Flask server on host 0.0.0.0, port 80")
    app.run(host='0.0.0.0', port=80, debug=False) # Turn debug OFF for production
