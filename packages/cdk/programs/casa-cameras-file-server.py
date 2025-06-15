from flask import Flask, send_file, abort, request, jsonify, Response
from datetime import datetime
import os
import logging
import time
import re
import mimetypes
from flask_cors import CORS

app = Flask(__name__)
# Enable CORS for all routes and origins
CORS(app, expose_headers=['Accept-Ranges', 'Content-Range', 'Content-Length'])

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Configuration
RAW_VIDEO_DIR = "/media/external/raw"

# Initialize server metrics
app.request_count = 0
app.start_time = time.time()

# Check if base directory exists
if not os.path.isdir(RAW_VIDEO_DIR):
    logging.error(f"CRITICAL: Base video directory not found: {RAW_VIDEO_DIR}")

# Helper Functions
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

def get_cache_control(quality: str) -> str:
    """Get appropriate cache control based on quality/network."""
    if quality == 'high':
        return 'public, max-age=7200, s-maxage=86400'  # Cache longer for high quality
    elif quality == 'low':
        return 'public, max-age=1800, s-maxage=7200'   # Cache less for low quality
    else:
        return 'public, max-age=3600, s-maxage=86400'  # Default medium

def serve_video_range(file_path: str, range_header: str, quality: str):
    """Serve video with HTTP Range support for seeking."""
    file_size = os.path.getsize(file_path)
    
    # Parse range header (bytes=start-end)
    range_match = re.search(r'bytes=(\d+)-(\d*)', range_header)
    if not range_match:
        abort(416, description="Range Not Satisfiable")
    
    start = int(range_match.group(1))
    end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
    
    # Validate range
    if start >= file_size or end >= file_size:
        abort(416, description="Range Not Satisfiable")
    
    # Calculate content length
    content_length = end - start + 1
    
    def generate():
        with open(file_path, 'rb') as f:
            f.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk_size = min(8192, remaining)
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
    
    response = Response(
        generate(),
        206,  # Partial Content
        mimetype='video/mp4',
        direct_passthrough=True
    )
    
    # Set range response headers
    response.headers['Accept-Ranges'] = 'bytes'
    response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
    response.headers['Content-Length'] = str(content_length)
    response.headers['Cache-Control'] = get_cache_control(quality)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Length'
    
    logging.info(f"Serving range {start}-{end}/{file_size} for {file_path}")
    return response

def serve_full_video(file_path: str, quality: str):
    """Serve complete video file."""
    response = send_file(file_path, mimetype='video/mp4', as_attachment=False)
    response.headers['Accept-Ranges'] = 'bytes'
    response.headers['Cache-Control'] = get_cache_control(quality)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Expose-Headers'] = 'Accept-Ranges, Content-Range, Content-Length'
    return response

# API Endpoints

@app.route('/')
def index():
    """Root endpoint providing API information."""
    uptime = time.time() - app.start_time
    uptime_str = f"{uptime:.1f} seconds"
    if uptime > 3600:
        uptime_str = f"{uptime/3600:.1f} hours"
    elif uptime > 60:
        uptime_str = f"{uptime/60:.1f} minutes"
    
    return jsonify({
        "service": "Casa Cameras Enhanced File Server", 
        "version": "2.0",
        "status": "running",
        "protocol": "HTTPS",
        "uptime": uptime_str,
        "base_directory": RAW_VIDEO_DIR,
        "directory_exists": os.path.isdir(RAW_VIDEO_DIR),
        "endpoints": {
            "/": "This information page",
            "/health": "Health check and server status",
            "/metrics": "Server performance metrics", 
            "/listAvailableDates": "Get available video dates",
            "/listAvailableTimes?date=YYYY-MM-DD": "Get available times for a date",
            "/getRawVideo?date=YYYY-MM-DD&hour=HH&minute=MM": "Stream video file"
        },
        "features": [
            "HTTP Range Requests (video seeking)",
            "CORS enabled",
            "HTTPS with SSL/TLS",
            "Video quality detection",
            "Smart caching headers",
            "Performance metrics"
        ]
    })

@app.route('/getRawVideo')
def get_raw_video():
    """Enhanced video serving with HTTP range support for seeking."""
    date_str = request.args.get('date')
    hour_str = request.args.get('hour')
    minute_str = request.args.get('minute')
    quality = request.args.get('quality', 'medium')  # New quality parameter
    
    # Validate inputs
    date = parse_date(date_str)
    hour, minute = validate_time_params(hour_str, minute_str)
    
    # Construct file path
    file_path = os.path.join(
        RAW_VIDEO_DIR,
        f"{date.year}",
        f"{date.month:02}",
        f"{date.day:02}",
        f"{hour:02}",
        f"{minute:02}.mp4"
    )
    
    logging.info(f"Requesting video file: {file_path} (quality: {quality})")
    
    if not os.path.isfile(file_path):
        logging.warning(f"Video file not found: {file_path}")
        abort(404, description="Video file not found for the specified time.")
    
    try:
        # Support HTTP Range requests for video seeking
        range_header = request.headers.get('Range', None)
        if range_header:
            return serve_video_range(file_path, range_header, quality)
        else:
            return serve_full_video(file_path, quality)
    except Exception as e:
        logging.error(f"Error serving video {file_path}: {e}")
        abort(500, description="Internal server error while serving video.")

@app.route('/listAvailableTimes')
def list_available_times():
    """
    Scans the directory structure for a given date and returns a list of
    available video times (represented as total minutes from midnight).
    """
    date_str = request.args.get('date')
    date = parse_date(date_str)
    
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
                    if (minute_file.endswith(".mp4") and 
                        not minute_file.endswith("_temp.mp4") and 
                        len(minute_file) == 6 and 
                        minute_file[:2].isdigit()):
                        minute_int = int(minute_file[:2])
                        if 0 <= minute_int <= 59:
                            file_path = os.path.join(hour_dir, minute_file)
                            if os.path.isfile(file_path):
                                total_minutes = hour_int * 60 + minute_int
                                available_minutes.append(total_minutes)
    
    except Exception as e:
        logging.error(f"Error scanning directory {date_dir}: {e}")
        abort(500, description="Internal server error while scanning for videos.")
    
    logging.info(f"Found {len(available_minutes)} available video times for {date_str}.")
    return jsonify(sorted(available_minutes))

@app.route('/listAvailableDates')
def list_available_dates():
    """Returns a list of available recording dates in YYYY-MM-DD format."""
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

@app.route('/health')
def health_check():
    """Enhanced health check for network quality testing."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'server': 'casa-cameras-file-server',
        'version': '2.0.0-enhanced',
        'features': ['http_range', 'quality_adaptation', 'cors_enhanced']
    })

@app.route('/metrics')
def get_metrics():
    """Return server performance metrics."""
    try:
        import psutil
        
        # Basic system metrics
        metrics = {
            'cpu_percent': psutil.cpu_percent(),
            'memory_percent': psutil.virtual_memory().percent,
            'total_requests': app.request_count,
            'uptime_seconds': int(time.time() - app.start_time),
            'timestamp': datetime.now().isoformat()
        }
        
        # Disk usage for video directory
        if os.path.exists('/media/external'):
            metrics['video_disk_usage_percent'] = psutil.disk_usage('/media/external').percent
        
        return jsonify(metrics)
    except ImportError:
        # Fallback if psutil not available
        return jsonify({
            'total_requests': app.request_count,
            'uptime_seconds': int(time.time() - app.start_time),
            'timestamp': datetime.now().isoformat(),
            'note': 'Install psutil for detailed system metrics'
        })

# Request tracking
@app.before_request
def track_requests():
    app.request_count += 1

# Error Handling
@app.errorhandler(400)
def bad_request(e):
    logging.warning(f"Bad Request: {e.description}")
    return jsonify(error=str(e.description)), 400

@app.errorhandler(404)
def not_found(e):
    response = jsonify(error=str(e.description))
    response.headers['Access-Control-Allow-Origin'] = '*'
    logging.warning(f"Not Found: {e.description}")
    return response, 404

@app.errorhandler(416)
def range_not_satisfiable(e):
    response = jsonify(error="Range Not Satisfiable")
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Accept-Ranges'] = 'bytes'
    logging.warning(f"Range Not Satisfiable: {e.description}")
    return response, 416

@app.errorhandler(500)
def internal_server_error(e):
    response = jsonify(error=str(e.description))
    response.headers['Access-Control-Allow-Origin'] = '*'
    logging.error(f"Internal Server Error: {e.description}")
    return response, 500

# Main Execution
if __name__ == '__main__':
    import argparse
    import ssl
    
    parser = argparse.ArgumentParser(description='Enhanced Casa Cameras File Server')
    parser.add_argument('--port', type=int, default=80, help='Port to run the server on (default: 80)')
    parser.add_argument('--https', action='store_true', help='Enable HTTPS with self-signed certificate')
    parser.add_argument('--cert', type=str, help='Path to SSL certificate file')
    parser.add_argument('--key', type=str, help='Path to SSL private key file')
    args = parser.parse_args()
    
    logging.info("Starting Enhanced Casa Cameras File Server v2.0.0")
    logging.info("Features: HTTP Range support, Quality adaptation, Enhanced CORS")
    
    # SSL Configuration
    ssl_context = None
    if args.https or args.cert or args.key:
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        
        if args.cert and args.key:
            # Use provided certificate and key
            ssl_context.load_cert_chain(args.cert, args.key)
            logging.info(f"Using provided SSL certificate: {args.cert}")
        else:
            # Generate self-signed certificate
            import tempfile
            import subprocess
            import os
            
            cert_dir = '/tmp/casa-ssl'
            os.makedirs(cert_dir, exist_ok=True)
            cert_file = os.path.join(cert_dir, 'server.crt')
            key_file = os.path.join(cert_dir, 'server.key')
            
            if not os.path.exists(cert_file) or not os.path.exists(key_file):
                logging.info("Generating self-signed SSL certificate...")
                # Generate self-signed certificate valid for local IPs and common names
                subprocess.run([
                    'openssl', 'req', '-x509', '-newkey', 'rsa:4096', '-keyout', key_file,
                    '-out', cert_file, '-days', '365', '-nodes', '-subj',
                    '/C=US/ST=CA/L=LocalNetwork/O=CasaGuard/CN=casa-video.local',
                    '-addext', 'subjectAltName=DNS:casa-video.local,DNS:localhost,IP:192.168.86.81,IP:127.0.0.1'
                ], check=True, capture_output=True)
                logging.info(f"Generated SSL certificate: {cert_file}")
            
            ssl_context.load_cert_chain(cert_file, key_file)
        
        protocol = 'HTTPS'
        default_port = 443 if args.port == 80 else args.port
    else:
        protocol = 'HTTP'
        default_port = args.port
    
    logging.info(f"Starting Flask server on host 0.0.0.0, port {default_port} ({protocol})")
    
    # Use a production-ready WSGI server in production
    # Example: gunicorn --bind 0.0.0.0:8443 --workers 2 --timeout 300 --certfile=/tmp/casa-ssl/server.crt --keyfile=/tmp/casa-ssl/server.key casa-cameras-file-server-enhanced:app
    app.run(host='0.0.0.0', port=default_port, debug=False, threaded=True, ssl_context=ssl_context)
