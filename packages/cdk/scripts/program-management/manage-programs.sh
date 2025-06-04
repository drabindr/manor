#!/bin/bash

# Program Management Script for Veedu CDK
# Manages compilation and upload of ESP8266/Arduino programs

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROGRAMS_DIR="$CDK_ROOT/programs"

echo "🏗️  Veedu CDK Program Management"
echo "==============================="
echo "📁 CDK Root: $CDK_ROOT"
echo "📁 Programs Directory: $PROGRAMS_DIR"
echo ""

# Function to list available programs
list_programs() {
    echo "📋 Available Programs:"
    if [ -d "$PROGRAMS_DIR" ]; then
        for program in "$PROGRAMS_DIR"/*; do
            if [ -d "$program" ]; then
                program_name=$(basename "$program")
                echo "  • $program_name"
                
                # Check if it's an Arduino sketch
                if [ -f "$program/$program_name.ino" ]; then
                    echo "    └─ Type: Arduino/ESP8266 sketch"
                fi
            fi
        done
    else
        echo "  No programs directory found"
    fi
    echo ""
}

# Function to compile a program
compile_program() {
    local program_name="$1"
    local program_path="$PROGRAMS_DIR/$program_name"
    
    if [ ! -d "$program_path" ]; then
        echo "❌ Program '$program_name' not found"
        return 1
    fi
    
    echo "🔨 Compiling $program_name..."
    
    # Check if it's an Arduino sketch
    if [ -f "$program_path/$program_name.ino" ]; then
        # Check if Arduino CLI is available
        if ! command -v arduino-cli &> /dev/null; then
            echo "❌ Arduino CLI not found. Please install it first:"
            echo "   brew install arduino-cli"
            return 1
        fi
        
        # Install required libraries for garage door
        if [[ "$program_name" == *"garage-door"* ]]; then
            echo "📚 Installing garage door dependencies..."
            arduino-cli lib install "WebSockets" 2>/dev/null || true
            arduino-cli lib install "ArduinoJson" 2>/dev/null || true
        fi
        
        cd "$PROGRAMS_DIR"
        arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 "$program_name"
        return $?
    else
        echo "❌ Unknown program type for '$program_name'"
        return 1
    fi
}

# Function to upload a program
upload_program() {
    local program_name="$1"
    local program_path="$PROGRAMS_DIR/$program_name"
    
    if [ ! -d "$program_path" ]; then
        echo "❌ Program '$program_name' not found"
        return 1
    fi
    
    # Find ESP8266 USB port automatically
    echo "🔍 Looking for ESP8266 on USB ports..."
    SERIAL_PORT=$(ls /dev/cu.usbserial-* 2>/dev/null | head -1)
    
    if [ -z "$SERIAL_PORT" ]; then
        echo "❌ No ESP8266 found on USB serial ports."
        echo "Please check ESP8266 is connected via USB"
        return 1
    fi
    
    echo "📡 ESP8266 found on $SERIAL_PORT"
    
    # Compile first
    if ! compile_program "$program_name"; then
        echo "❌ Compilation failed, cannot upload"
        return 1
    fi
    
    echo "⬆️ Uploading $program_name to ESP8266..."
    cd "$PROGRAMS_DIR"
    arduino-cli upload -p "$SERIAL_PORT" --fqbn esp8266:esp8266:nodemcuv2 "$program_name"
    
    if [ $? -eq 0 ]; then
        echo "🎉 Upload successful!"
        
        # Program-specific success messages
        if [[ "$program_name" == *"garage-door"* ]]; then
            echo ""
            echo "📋 Garage Door Program Uploaded Successfully!"
            echo "🔧 Next steps:"
            echo "  1. Open Arduino Serial Monitor (115200 baud)"
            echo "  2. Test sensor logic with test scripts"
            echo "  3. Verify WebSocket connectivity"
        fi
        
        return 0
    else
        echo "❌ Upload failed"
        return 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [command] [program-name]"
    echo ""
    echo "Commands:"
    echo "  list                    - List available programs"
    echo "  compile [program-name]  - Compile a program"
    echo "  upload [program-name]   - Compile and upload a program"
    echo "  help                    - Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 compile garage-door-opener-esp8266"
    echo "  $0 upload garage-door-opener-esp8266"
}

# Main script logic
case "$1" in
    "list")
        list_programs
        ;;
    "compile")
        if [ -z "$2" ]; then
            echo "❌ Please specify a program name"
            echo ""
            list_programs
            exit 1
        fi
        compile_program "$2"
        ;;
    "upload")
        if [ -z "$2" ]; then
            echo "❌ Please specify a program name"
            echo ""
            list_programs
            exit 1
        fi
        upload_program "$2"
        ;;
    "help"|"-h"|"--help")
        show_usage
        ;;
    *)
        if [ -z "$1" ]; then
            list_programs
            show_usage
        else
            echo "❌ Unknown command: $1"
            echo ""
            show_usage
            exit 1
        fi
        ;;
esac
