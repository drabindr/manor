#!/bin/bash

# Deployment script for HLS streaming services
# This script deploys both the original camera stream and the new doorbell stream
set -e

echo "🚀 Deploying HLS streaming services to casa5..."

# Configuration
REMOTE_USER="drabindr"
REMOTE_HOST="casa5"
REMOTE_PATH="/home/drabindr"

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
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
MANOR_ROOT=$(echo "$SCRIPT_DIR" | sed 's|/packages/cdk/programs||')
LOCAL_PROGRAMS_PATH="${SCRIPT_DIR}"

# Print diagnostics for debugging
print_status "Script running from: $SCRIPT_DIR"
print_status "Manor root detected as: $MANOR_ROOT"
print_status "Using programs path: $LOCAL_PROGRAMS_PATH"

# Copy files to casa5
print_status "Copying files to casa5..."

# First, ensure AWS credentials are configured via AWS CLI
print_status "Verifying AWS credentials..."
ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    # Check if AWS CLI is configured
    if aws sts get-caller-identity &>/dev/null; then
        echo "AWS credentials are configured and working"
    else
        echo "WARNING: AWS credentials not properly configured"
        echo "Please run 'aws configure' on casa5"
    fi
EOF

# Copy the parameterized HLS manager
scp "${LOCAL_PROGRAMS_PATH}/hls_parameterized.py" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

# Copy configuration files
scp "${LOCAL_PROGRAMS_PATH}/camera_main_config.json" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"
scp "${LOCAL_PROGRAMS_PATH}/doorbell_config.json" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"



print_status "Files copied successfully"

# Configure supervisor services
print_status "Configuring supervisor services on casa5..."

ssh "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    # Remove any old crontab entries to avoid conflicts
    crontab -r 2>/dev/null || echo "No existing crontab to remove"
    
    # Make scripts executable
    chmod +x /home/drabindr/hls_parameterized.py
    
    # Create logs directory
    mkdir -p /home/drabindr/logs
    
    # Reload supervisor to pick up new configurations
    sudo supervisorctl reread
    sudo supervisorctl update
    
    echo "Supervisor services configured successfully"
    echo "Available supervisor services:"
    sudo supervisorctl status
EOF

print_status "Supervisor services configured successfully"

# Restart supervisor services
print_status "Restarting supervisor services..."

ssh -o ConnectTimeout=10 "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
    echo "Current supervisor services:"
    sudo supervisorctl status
    
    echo ""
    echo "Stopping existing HLS services..."
    sudo supervisorctl stop camera-main-stream doorbell-stream 2>/dev/null || echo "Services not running"
    sleep 2
    
    echo "Starting HLS services..."
    sudo supervisorctl start camera-main-stream doorbell-stream
    
    sleep 3
    
    echo "New HLS service status:"
    sudo supervisorctl status camera-main-stream doorbell-stream
    
    echo ""
    echo "Log files available:"
    timeout 5 ls -la /home/drabindr/logs/*.log 2>/dev/null || echo "No log files found yet"
    echo "Log check completed"
    
    # Show sample of logs
    echo ""
    echo "Showing live logs from camera stream (will run for 30 seconds)..."
    timeout 30 tail -f /home/drabindr/logs/camera_main_streaming.log
    
    echo ""
    echo "Showing live logs from doorbell stream (will run for 30 seconds)..."
    timeout 30 tail -f /home/drabindr/logs/doorbell_streaming.log
EOF

print_status "Deployment completed successfully!"

echo ""
echo "📋 Summary:"
echo "✅ Parameterized HLS manager deployed"
echo "✅ Camera and doorbell configurations deployed"
echo "✅ Supervisor services configured and started"
echo "✅ Legacy crontab entries removed"
echo ""
echo "🔍 To monitor the streams:"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'tail -f /home/drabindr/logs/camera_main_streaming.log'"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'tail -f /home/drabindr/logs/doorbell_streaming.log'"
echo ""
echo "🔄 To manage services:"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'sudo supervisorctl status'"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'sudo supervisorctl restart camera-main-stream doorbell-stream'"
echo "   ssh $REMOTE_USER@$REMOTE_HOST 'sudo supervisorctl stop camera-main-stream doorbell-stream'"
