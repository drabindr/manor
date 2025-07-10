#!/bin/bash

# Quick deployment script for outdoor lighting controller updates
# This script copies the updated script to casa5 and restarts the service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="casa5"
REMOTE_DIR="/home/drabindr"
SCRIPT_NAME="outdoor-lighting-controller.py"

echo "🚀 Deploying outdoor lighting controller updates to $REMOTE_HOST"
echo "============================================================"

# Copy the updated script
echo "📦 Copying updated script to $REMOTE_HOST..."
scp "$SCRIPT_DIR/$SCRIPT_NAME" "$REMOTE_HOST:$REMOTE_DIR/$SCRIPT_NAME"

# Restart the service
echo "🔄 Restarting the service..."
ssh $REMOTE_HOST "
    # Stop current process
    pkill -f $SCRIPT_NAME || true
    sleep 2
    
    # Start new process
    nohup /usr/bin/python3 $REMOTE_DIR/$SCRIPT_NAME --service >> $REMOTE_DIR/outdoor-lighting_cron.log 2>&1 &
    
    # Give it a moment to start
    sleep 3
    
    # Check if it's running
    if pgrep -f $SCRIPT_NAME > /dev/null; then
        echo '✅ Service restarted successfully'
    else
        echo '❌ Service failed to start'
        exit 1
    fi
"

# Show recent logs
echo "📋 Recent log entries:"
ssh $REMOTE_HOST "tail -5 $REMOTE_DIR/outdoor-lighting_cron.log"

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 To monitor logs: ssh $REMOTE_HOST 'tail -f $REMOTE_DIR/outdoor-lighting_cron.log'"
echo "📊 To check status:  ssh $REMOTE_HOST 'ps aux | grep $SCRIPT_NAME | grep -v grep'"
