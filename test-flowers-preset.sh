#!/bin/bash
# test-flowers-preset.sh - Test script for the new Flowers preset functionality

echo "🌸 Testing Bhyve Flowers Preset Implementation"
echo "=============================================="

# Base API URL - update this to match your deployment
API_BASE="https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod"

# Function to make API calls with proper error handling
make_api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo ""
    echo "📡 $description"
    echo "   → $method $endpoint"
    
    if [ -n "$data" ]; then
        echo "   → Data: $data"
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
            -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_BASE/$endpoint")
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
            -X "$method" \
            "$API_BASE/$endpoint")
    fi
    
    # Extract HTTP status and body
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    # Check if successful
    if [[ "$http_status" =~ ^2[0-9][0-9]$ ]]; then
        echo "   ✅ Success ($http_status)"
        echo "   📄 Response: $body" | head -c 200
        if [ ${#body} -gt 200 ]; then echo "..."; fi
    else
        echo "   ❌ Failed ($http_status)"
        echo "   📄 Error: $body"
        return 1
    fi
    
    echo ""
    return 0
}

# Step 1: List Bhyve devices to get device ID
echo "1️⃣ Getting Bhyve devices..."
make_api_call "GET" "bhyve/devices/list" "" "Listing Bhyve irrigation devices"

if [ $? -ne 0 ]; then
    echo "❌ Failed to get devices. Please check your Bhyve integration setup."
    exit 1
fi

echo ""
echo "📝 Please copy a device ID from the response above and set it in the script"
echo "   Example: DEVICE_ID=\"your-device-id-here\""
echo ""

# You'll need to update this with an actual device ID from your system
DEVICE_ID="5d276c2d4f0c7d841e151723"

if [ "$DEVICE_ID" = "your-device-id-here" ]; then
    echo "⚠️  Please update the DEVICE_ID variable in this script with a real device ID"
    echo "   You can find it in the response from step 1 above"
    exit 1
fi

echo "🎯 Using device ID: $DEVICE_ID"

# Step 2: Check current status before starting preset
echo "2️⃣ Checking current irrigation status..."
make_api_call "POST" "bhyve/presets/status" "{\"device_id\":\"$DEVICE_ID\"}" "Getting current preset status"

# Step 3: Start the Flowers preset
echo "3️⃣ Starting Flowers preset..."
make_api_call "POST" "bhyve/presets/flowers" "{\"device_id\":\"$DEVICE_ID\"}" "Starting Flowers preset (Front Flower Bed → Backyard)"

if [ $? -ne 0 ]; then
    echo "❌ Failed to start Flowers preset"
    exit 1
fi

echo "✅ Flowers preset started successfully!"
echo ""
echo "🔄 The preset will:"
echo "   1. Start watering the Front Flower Bed for 1 minute"
echo "   2. Wait 5 seconds"
echo "   3. Start watering the Backyard for 1 minute"
echo ""
echo "📱 Check your Bhyve app or the Manor website to see real-time updates"

# Step 4: Monitor status for a few iterations
echo "4️⃣ Monitoring preset status..."
for i in {1..5}; do
    echo "   📊 Status check #$i"
    make_api_call "POST" "bhyve/presets/status" "{\"device_id\":\"$DEVICE_ID\"}" "Checking preset status"
    
    if [ $i -lt 5 ]; then
        echo "   ⏰ Waiting 30 seconds before next check..."
        sleep 30
    fi
done

# Step 5: Test cancellation (optional)
echo ""
echo "5️⃣ Testing preset cancellation..."
echo "❓ Do you want to test canceling the preset? (y/N)"
read -r cancel_test

if [[ "$cancel_test" =~ ^[Yy]$ ]]; then
    make_api_call "POST" "bhyve/presets/cancel" "{\"device_id\":\"$DEVICE_ID\"}" "Canceling active presets"
    
    # Check status after cancellation
    echo "   📊 Verifying cancellation..."
    make_api_call "POST" "bhyve/presets/status" "{\"device_id\":\"$DEVICE_ID\"}" "Checking status after cancellation"
else
    echo "   ⏭️  Skipping cancellation test"
fi

echo ""
echo "🎉 Test completed!"
echo ""
echo "🔍 What to verify:"
echo "   ✅ Flowers preset starts successfully"
echo "   ✅ Front Flower Bed waters for ~1 minute"
echo "   ✅ Short pause (5 seconds)"
echo "   ✅ Backyard waters for ~1 minute"
echo "   ✅ Status updates show correct sequence"
echo "   ✅ Real-time updates appear in the UI"
echo "   ✅ Cancellation works if tested"
echo ""
echo "🌸 Flowers preset testing complete!"
