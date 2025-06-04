#!/bin/bash

# Upload Improved Stable Garage Door Firmware to ESP8266
# This script uploads the stability-improved firmware version

echo "🚀 Uploading Improved Stable Garage Door Firmware to ESP8266..."
echo "============================================================="

# Check if ESP8266 is connected
if [ ! -e "/dev/cu.usbserial-0001" ]; then
    echo "❌ ESP8266 not found at /dev/cu.usbserial-0001"
    echo "💡 Please check:"
    echo "   1. ESP8266 is connected via USB"
    echo "   2. USB driver is installed"
    echo "   3. Device is recognized by system"
    ls /dev/cu.* 2>/dev/null | grep -E "(usbserial|wchusbserial)" || echo "   No USB serial devices found"
    exit 1
fi

echo "✅ ESP8266 found at /dev/cu.usbserial-0001"

# Set ESP8266 board configuration for Arduino CLI
BOARD="esp8266:esp8266:nodemcuv2"
PORT="/dev/cu.usbserial-0001"
FIRMWARE_FILE="programs/garage-door-opener-esp8266/garage-door-opener-esp8266.ino"

echo "📋 Configuration:"
echo "   Board: $BOARD"
echo "   Port: $PORT"
echo "   Firmware: $FIRMWARE_FILE"

# Check if Arduino CLI is installed
if ! command -v arduino-cli &> /dev/null; then
    echo "❌ Arduino CLI not found. Installing..."
    
    # Install Arduino CLI using Homebrew
    if command -v brew &> /dev/null; then
        echo "📦 Installing Arduino CLI via Homebrew..."
        brew install arduino-cli
    else
        echo "❌ Homebrew not found. Please install Arduino CLI manually:"
        echo "   https://arduino.github.io/arduino-cli/0.35/installation/"
        exit 1
    fi
fi

echo "✅ Arduino CLI found"

# Update core index
echo "🔄 Updating Arduino core index..."
arduino-cli core update-index

# Install ESP8266 core if not already installed
echo "🔄 Installing/updating ESP8266 core..."
arduino-cli core install esp8266:esp8266

# Install required libraries
echo "📚 Installing required libraries..."
arduino-cli lib install "ESP8266WiFi"
arduino-cli lib install "WebSockets"
arduino-cli lib install "ArduinoJson"

# Compile the firmware
echo "🔨 Compiling stable firmware..."
if arduino-cli compile --fqbn "$BOARD" "$FIRMWARE_FILE"; then
    echo "✅ Compilation successful!"
else
    echo "❌ Compilation failed!"
    exit 1
fi

# Upload the firmware
echo "📤 Uploading firmware to ESP8266..."
echo "⚠️  ESP8266 will reset and start with new stable firmware"

if arduino-cli upload -p "$PORT" --fqbn "$BOARD" "$FIRMWARE_FILE"; then
    echo "✅ Upload successful!"
    echo ""
    echo "🎉 STABILITY-IMPROVED FIRMWARE UPLOADED SUCCESSFULLY!"
    echo "=============================================="
    echo "🔧 New Features:"
    echo "   ✅ Watchdog timer management"
    echo "   ✅ Memory leak prevention"
    echo "   ✅ Automatic reset/recovery mechanisms"
    echo "   ✅ Connection health monitoring"
    echo "   ✅ Simplified state management"
    echo "   ✅ Stack overflow protection"
    echo "   ✅ Reduced timing intervals for faster response"
    echo ""
    echo "📊 Monitoring:"
    echo "   - Device will auto-restart if unhealthy for 5+ minutes"
    echo "   - Forced restart every 24 hours for stability"
    echo "   - Max 10 consecutive failures before restart"
    echo "   - Memory monitoring with 8KB minimum threshold"
    echo ""
    echo "🔗 Starting serial monitor to verify operation..."
    echo "   Press Ctrl+C to stop monitoring"
    echo ""
    
    # Wait a moment for device to boot
    sleep 3
    
    # Start serial monitor
    arduino-cli monitor -p "$PORT" --config baudrate=115200
    
else
    echo "❌ Upload failed!"
    echo "💡 Troubleshooting:"
    echo "   1. Check if ESP8266 is in programming mode"
    echo "   2. Try pressing RESET button during upload"
    echo "   3. Check USB cable connection"
    echo "   4. Verify port permissions: ls -la $PORT"
    exit 1
fi
