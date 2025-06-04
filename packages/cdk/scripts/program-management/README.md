# Program Management Scripts

This directory contains scripts for managing and deploying programs in the Veedu CDK project.

## Scripts

### `manage-programs.sh` - General Program Manager
A comprehensive script for managing all programs in the CDK project.

**Usage:**
```bash
# List all available programs
./manage-programs.sh list

# Compile a specific program
./manage-programs.sh compile garage-door-opener-esp8266

# Compile and upload a program to ESP8266
./manage-programs.sh upload garage-door-opener-esp8266

# Show help
./manage-programs.sh help
```

**Features:**
- Auto-detects ESP8266 USB ports
- Manages Arduino library dependencies
- Supports multiple program types
- Program-specific success messages

### `upload-garage-door-firmware.sh` - Garage Door Specific
Specialized script for uploading garage door firmware with enhanced features.

**Usage:**
```bash
./upload-garage-door-firmware.sh
```

**Features:**
- Auto-installs WebSockets and ArduinoJson libraries
- Provides detailed success information
- Includes troubleshooting guidance
- Works from any directory (uses relative paths)

## Directory Structure

```
veedu-cdk/
├── scripts/
│   └── program-management/
│       ├── README.md                          # This file
│       ├── manage-programs.sh                 # General program manager
│       └── upload-garage-door-firmware.sh     # Garage door specific uploader
└── programs/
    └── garage-door-opener-esp8266/
        └── garage-door-opener-esp8266.ino     # Arduino sketch
```

## Prerequisites

### Arduino CLI Installation
```bash
# macOS
brew install arduino-cli

# Or download from: https://arduino.github.io/arduino-cli/
```

### ESP8266 Board Package
The scripts will automatically install required packages, but you can manually install:
```bash
arduino-cli core update-index
arduino-cli core install esp8266:esp8266
```

### Required Libraries
For garage door projects, these libraries are auto-installed:
- WebSockets (by Markus Sattler)
- ArduinoJson

## Usage Examples

### Quick Start - Upload Garage Door Firmware
```bash
cd veedu-cdk/scripts/program-management
./upload-garage-door-firmware.sh
```

### General Program Management
```bash
# List all programs
./manage-programs.sh list

# Upload garage door program
./manage-programs.sh upload garage-door-opener-esp8266
```

### Running from Workspace Root
The scripts handle relative paths, so you can run them from anywhere:
```bash
# From workspace root
./veedu-cdk/scripts/program-management/upload-garage-door-firmware.sh

# From any directory
/path/to/veedu-cdk/scripts/program-management/manage-programs.sh list
```

## Troubleshooting

### ESP8266 Not Found
- Ensure ESP8266 is connected via USB
- Check USB drivers are installed
- Verify device appears in: `ls /dev/cu.*`

### Compilation Errors
- Check Arduino CLI is installed: `arduino-cli version`
- Verify ESP8266 board package: `arduino-cli board listall | grep esp8266`
- Check program syntax in Arduino IDE

### Upload Failures
- Try pressing RESET button on ESP8266
- Check USB cable and port
- Verify correct board selection (nodemcuv2)

## Adding New Programs

To add support for new programs:

1. **Add program to `programs/` directory**:
   ```
   programs/
   └── my-new-program/
       └── my-new-program.ino
   ```

2. **Update `manage-programs.sh`** if special dependencies are needed:
   ```bash
   # Add in compile_program function
   if [[ "$program_name" == *"my-new-program"* ]]; then
       echo "📚 Installing my-new-program dependencies..."
       arduino-cli lib install "SomeLibrary"
   fi
   ```

3. **Test the new program**:
   ```bash
   ./manage-programs.sh compile my-new-program
   ./manage-programs.sh upload my-new-program
   ```

## Integration with CDK

These scripts are designed to work seamlessly with the Veedu CDK project structure:
- All paths are relative to the CDK root
- Scripts can be called from any directory
- Compatible with CDK deployment workflows
- Supports multiple target platforms (currently ESP8266, extensible)
