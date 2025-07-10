#!/bin/bash

# Setup script for TP-Link Outdoor Lighting Automation on casa5
# This script deploys the automation and sets up cron job

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="casa5"
REMOTE_USER="drabindr"
REMOTE_DIR="/home/drabindr"
SERVICE_NAME="outdoor-lighting"

echo "🚀 Setting up TP-Link Outdoor Lighting Automation on $REMOTE_HOST"
echo "========================================================"

# Check if we can connect to casa5
echo "🔍 Testing SSH connection to $REMOTE_HOST..."
if ! ssh $REMOTE_HOST "echo 'Connection successful'"; then
    echo "❌ Cannot connect to $REMOTE_HOST. Please check your SSH setup."
    exit 1
fi

# Copy the script to casa5
echo "📦 Copying automation script to $REMOTE_HOST..."
scp "$SCRIPT_DIR/outdoor-lighting-controller.py" "$REMOTE_HOST:$REMOTE_DIR/${SERVICE_NAME}-controller.py"

# Install dependencies on casa5
echo "📋 Installing Python dependencies on $REMOTE_HOST..."
ssh $REMOTE_HOST "
    # Try pip3 with --break-system-packages first
    if pip3 install --break-system-packages python-kasa astral pytz 2>/dev/null; then
        echo '✅ Dependencies installed with pip3 --break-system-packages'
    else
        echo '⚠️  pip3 failed, trying alternative methods...'
        # Try apt packages if available
        sudo apt update && sudo apt install -y python3-full python3-pip || true
        pip3 install --break-system-packages python-kasa astral pytz || {
            echo '❌ Failed to install dependencies'
            echo 'You may need to install them manually on casa5:'
            echo 'pip3 install --break-system-packages python-kasa astral pytz'
        }
    fi
"

# Test the script on casa5
echo "🧪 Testing the automation script on $REMOTE_HOST..."
ssh $REMOTE_HOST "cd $REMOTE_DIR && python3 ${SERVICE_NAME}-controller.py --service &" &
TEST_PID=$!
sleep 5
kill $TEST_PID 2>/dev/null || true
wait $TEST_PID 2>/dev/null || true

# Create the cron entry (similar to casa5 pattern)
echo "⏰ Setting up cron job on $REMOTE_HOST..."
CRON_ENTRY="@reboot /usr/bin/python3 $REMOTE_DIR/${SERVICE_NAME}-controller.py --service >> $REMOTE_DIR/${SERVICE_NAME}_cron.log 2>&1"

# Add to crontab if not already present
ssh $REMOTE_HOST "
    # Backup current crontab
    crontab -l > /tmp/crontab_backup_\$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
    
    # Check if our cron job already exists
    if ! crontab -l 2>/dev/null | grep -q '${SERVICE_NAME}-controller.py'; then
        # Add our cron job
        (crontab -l 2>/dev/null || true; echo '$CRON_ENTRY') | crontab -
        echo '✅ Cron job added successfully'
    else
        echo '⚠️  Cron job already exists, updating...'
        # Remove old entries and add new one
        (crontab -l 2>/dev/null | grep -v '${SERVICE_NAME}-controller.py' || true; echo '$CRON_ENTRY') | crontab -
        echo '✅ Cron job updated successfully'
    fi
"

# Show final crontab
echo "📋 Current crontab on $REMOTE_HOST:"
ssh $REMOTE_HOST "crontab -l"

echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "📊 To check status:"
echo "   ssh $REMOTE_HOST 'tail -f $REMOTE_DIR/${SERVICE_NAME}_cron.log'"
echo ""
echo "🔄 To restart the service:"
echo "   ssh $REMOTE_HOST 'pkill -f ${SERVICE_NAME}-controller.py; nohup python3 $REMOTE_DIR/${SERVICE_NAME}-controller.py --service >> $REMOTE_DIR/${SERVICE_NAME}_cron.log 2>&1 &'"
echo ""
echo "📊 To check current lighting status:"
echo "   ssh $REMOTE_HOST 'cd $REMOTE_DIR && echo \"2\" | python3 ${SERVICE_NAME}-controller.py'"
echo ""
echo "🌅 The automation will:"
echo "   - Turn ON outdoor lights at sunset"
echo "   - Turn OFF outdoor lights at 9:00 PM"
echo "   - Check and correct light states every 5 minutes"
echo "   - Restart automatically on reboot"
