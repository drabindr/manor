# Manor iOS App (Veedu/CasaGuard)

This is the iOS application for the Manor home automation platform, previously known as Veedu/CasaGuard.

## Overview

The iOS app provides geofencing capabilities and home automation controls for the Manor ecosystem. It includes features for:

- Location-based automation triggers
- Home/away detection
- Security notifications
- Device control interface

## Project Structure

- `casaguard.xcodeproj` - Main Xcode project file
- `casaguard/` - Source code directory
- `casaguardTests/` - Unit tests
- `casaguardUITests/` - UI tests
- `veedu.entitlements` - App entitlements and capabilities

## Development

### Prerequisites

- Xcode 15.0 or later
- iOS 17.0+ deployment target
- macOS for development

### Getting Started

1. **Open the project in Xcode:**
   ```bash
   npm run ios:open
   ```
   Or manually: `open casaguard.xcodeproj`

2. **Build the project:**
   ```bash
   npm run ios:build:debug
   ```

3. **Run tests:**
   ```bash
   npm run ios:test
   ```

### Available Scripts

From the manor root directory:

- `npm run ios:build` - Build release configuration
- `npm run ios:build:debug` - Build debug configuration  
- `npm run ios:test` - Run unit and UI tests
- `npm run ios:clean` - Clean build artifacts
- `npm run ios:open` - Open project in Xcode

### Local Development

For iOS development, you'll primarily work within Xcode. The npm scripts are provided for CI/CD integration and command-line builds.

## Architecture

The app is built using SwiftUI and follows modern iOS development patterns:

- `casaguardApp.swift` - App entry point
- `ContentView.swift` - Main UI view
- `HomeLocationManager.swift` - Location and geofencing logic
- `EndpointManager.swift` - API communication
- `APNSManager.swift` - Push notification handling

## Integration with Manor Platform

This iOS app integrates with the Manor backend services:

- **CDK Package** (`@manor/cdk`) - Provides backend infrastructure
- **Website Package** (`@manor/website`) - Web dashboard interface

## Location Services

The app requires location permissions for geofencing functionality:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysUsageDescription` 
- `NSLocationAlwaysAndWhenInUseUsageDescription`

These are configured in the Info.plist files.

## Deployment

For App Store deployment, use Xcode's built-in archiving and distribution tools, or the npm script:

```bash
npm run ios:archive
```

## Contributing

When making changes to the iOS app:

1. Follow Swift/iOS best practices
2. Update tests for new functionality
3. Test on multiple device types and iOS versions
4. Ensure geofencing works reliably

## Support

For iOS-specific issues, please include:
- Device model and iOS version
- Xcode version used
- Build logs and crash reports
- Location permissions status
