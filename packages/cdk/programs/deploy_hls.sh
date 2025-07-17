#!/bin/bash

# Deployment script for HLS streaming services
# This script deploys both the original camera stream and the new doorbell stream

set -e

echo "🚀 Deploying HLS streaming services to casa5..."

# Configuration
REMOTE_USER="drabindr"
REMOTE_HOST="casa5"
REMOTE_PATH="/home/drabindr"
LOCAL_PROGRAMS_PATH="packages/cdk/programs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the correct directory
if [ ! -d "$LOCAL_PROGRAMS_PATH" ]; then
    print_error "Please run this script from the manor project root directory"
    exit 1
fi

# Copy files to casa5
print_status "Copying files to casa5..."

# Copy the parameterized HLS manager
scp "$LOCAL_PROGRAMS_PATH/hls_parameterized.py" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

# Copy configuration files
scp "$LOCAL_PROGRAMS_PATH/camera_main_config.json" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"
scp "$LOCAL_PROGRAMS_PATH/doorbell_config.json" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

# Copy the standalone doorbell script (backup)
scp "$LOCAL_PROGRAMS_PATH/hls_doorbell.py" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

print_status "Files copied successfully"

# Update the existing crontab
print_status "Updating crontab on casa5..."

ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    # Create backup of current crontab
    crontab -l > /tmp/crontab_backup_$(date +%Y%m%d_%H%M%S)
    
    # Remove old HLS entries
    crontab -l | grep -v "hls.py" | grep -v "hls_doorbell.py" | grep -v "hls_parameterized.py" > /tmp/new_crontab
    
    # Add new entries for both camera and doorbell
    cat >> /tmp/new_crontab << 'CRON_ENTRIES'
# HLS Camera Stream (Main Camera)
@reboot /usr/bin/python3 /home/drabindr/hls_parameterized.py --config /home/drabindr/camera_main_config.json >> /home/drabindr/logs/camera_main_cron.log 2>&1

# HLS Doorbell Stream
@reboot /usr/bin/python3 /home/drabindr/hls_parameterized.py --config /home/drabindr/doorbell_config.json >> /home/drabindr/logs/doorbell_cron.log 2>&1

# Backup: Standalone doorbell script
# @reboot /usr/bin/python3 /home/drabindr/hls_doorbell.py >> /home/drabindr/logs/doorbell_standalone_cron.log 2>&1
CRON_ENTRIES
    
    # Install new crontab
    crontab /tmp/new_crontab
    
    # Make scripts executable
    chmod +x /home/drabindr/hls_parameterized.py
    chmod +x /home/drabindr/hls_doorbell.py
    
    # Create logs directory
    mkdir -p /home/drabindr/logs
    
    echo "Crontab updated successfully"
    echo "New crontab contents:"
    crontab -l
EOF

print_status "Crontab updated successfully"

# Check if processes are running and restart if needed
print_status "Checking running processes..."

ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    echo "Current HLS processes:"
    ps aux | grep -E "(hls|doorbell)" | grep -v grep
    
    echo ""
    echo "Stopping existing HLS processes..."
    pkill -f "hls.*\.py" || true
    sleep 2
    
    echo "Starting new HLS processes..."
    
    # Start camera stream
    nohup /usr/bin/python3 /home/drabindr/hls_parameterized.py --config /home/drabindr/camera_main_config.json >> /home/drabindr/logs/camera_main_manual.log 2>&1 &
    
    # Start doorbell stream
    nohup /usr/bin/python3 /home/drabindr/hls_parameterized.py --config /home/drabindr/doorbell_config.json >> /home/drabindr/logs/doorbell_manual.log 2>&1 &
    
    sleep 3
    
    echo "New HLS processes:"
    ps aux | grep -E "(hls|doorbell)" | grep -v grep
    
    echo ""
    echo "Log files created:"
    ls -la /home/drabindr/logs/*hls* /home/drabindr/logs/*doorbell* /home/drabindr/logs/*camera* 2>/dev/null || echo "No log files found yet"
EOF

print_status "Deployment completed successfully!"

echo ""
echo "📋 Summary:"
echo "✅ Parameterized HLS manager deployed"
echo "✅ Camera and doorbell configurations deployed"
echo "✅ Crontab updated for both streams"
echo "✅ Processes restarted"
echo ""
echo "🔍 To monitor the streams:"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'tail -f /home/drabindr/logs/camera_main_manual.log'"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'tail -f /home/drabindr/logs/doorbell_manual.log'"
echo ""
echo "🔄 To restart services:"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'pkill -f hls.*py && nohup /usr/bin/python3 /home/drabindr/hls_parameterized.py --config /home/drabindr/camera_main_config.json >> /home/drabindr/logs/camera_main_manual.log 2>&1 & nohup /usr/bin/python3 /home/drabindr/hls_parameterized.py --config /home/drabindr/doorbell_config.json >> /home/drabindr/logs/doorbell_manual.log 2>&1 &'"
