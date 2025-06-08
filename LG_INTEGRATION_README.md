# LG Appliances Integration Test Suite

This directory contains a comprehensive test suite for the LG appliances integration, specifically designed to test and troubleshoot NORMAL cycle starting functionality for both washer and dryer.

## 🎯 Quick Start

1. **Check Integration Health**: `node test-lg-health-check.js`
2. **Refresh Credentials** (if needed): `node lg-credential-refresh-guide.js`
3. **Test NORMAL Cycles**: `node test-lg-normal-cycle-automated.js`

## 📄 Test Scripts

### `test-lg-health-check.js`
**Purpose**: Comprehensive integration health check and diagnostics
- Tests API connectivity and authentication
- Discovers devices and checks remote control status
- Provides clear next steps based on findings
- **Auto-proceeds**: Yes (no user prompts)
- **Runtime**: ~5-10 seconds

### `test-lg-normal-cycle-automated.js`
**Purpose**: Automated NORMAL cycle start testing for both devices
- Tests multiple start methods and payload structures
- Monitors state changes over time
- Automatically stops cycles for cleanup
- **Auto-proceeds**: Yes (no user prompts)
- **Runtime**: ~60-90 seconds

### `test-lg-remote-control-fix.js`
**Purpose**: Diagnose and attempt to fix remote control issues
- Analyzes raw device state and profile data
- Attempts multiple methods to enable remote control
- Tests cycle start after remote control fixes
- **Auto-proceeds**: Yes (no user prompts)
- **Runtime**: ~30-60 seconds

### `lg-credential-refresh-guide.js`
**Purpose**: Step-by-step credential refresh instructions
- Provides detailed instructions for getting new LG tokens
- Shows AWS SSM parameter update commands
- Includes troubleshooting guidance
- **Auto-proceeds**: N/A (informational only)
- **Runtime**: <1 second

### `lg-integration-final-report.js`
**Purpose**: Comprehensive status report and summary
- Shows investigation findings and achievements
- Documents current status and next steps
- Provides support commands and maintenance recommendations
- **Auto-proceeds**: N/A (informational only)
- **Runtime**: <1 second

## 🔧 Backend Integration

The backend LG integration (`packages/cdk/lambda/casa-integrations/providers/lg.ts`) has been enhanced with:

- **Robust Remote Control Detection**: Handles both array and object profile formats
- **Multiple Payload Strategies**: Different payload structures for cycle starting
- **Comprehensive Error Handling**: Detailed logging and debugging
- **State Change Monitoring**: Tracks device state transitions
- **Fallback Mechanisms**: Multiple approaches when primary methods fail

## 🚨 Common Issues & Solutions

### 401 Unauthorized Error
**Cause**: LG access token expired
**Solution**: Run `node lg-credential-refresh-guide.js` and follow instructions

### Remote Control Disabled
**Cause**: Remote control not enabled in LG ThinQ app
**Solution**: 
1. Open LG ThinQ mobile app
2. Go to device settings
3. Enable "Remote Control" or "ThinQ Care"

### No State Change After Start Command
**Possible Causes**:
- Device door is open
- No water supply (washer)
- Device already running
- Physical safety locks engaged

## 📊 Test Results Interpretation

### ✅ Success Indicators
- Authentication successful (200 response)
- Devices discovered (washer and dryer found)
- Remote control enabled for both devices
- State changes detected after start commands
- Cleanup stop commands successful

### ❌ Failure Indicators
- 401 errors (expired credentials)
- 500 errors (backend issues)
- No devices found (authentication or connectivity)
- Remote control disabled (app settings)
- No state changes (physical or configuration issues)

## 🔄 Maintenance

### Weekly Health Checks
```bash
node test-lg-health-check.js
```

### After Credential Updates
```bash
node test-lg-health-check.js
node test-lg-normal-cycle-automated.js
```

### Troubleshooting Issues
```bash
node test-lg-remote-control-fix.js
aws logs tail /aws/lambda/[IntegrationLambda] --since 1h
```

## 📚 Additional Scripts (Legacy)

The following scripts were created during the investigation but are superseded by the main test suite:

- `test-lg-integration.js` - Basic integration test
- `test-lg-comprehensive.js` - Comprehensive test script
- `test-lg-cycle-debug.js` - Cycle debugging
- `test-lg-cycle-investigation.js` - Investigation script
- Various other debugging and monitoring scripts

## 🎯 Success Criteria

The integration is considered successful when:

1. **Authentication Works**: `test-lg-health-check.js` shows ✅ for authentication
2. **Devices Discovered**: Both washer and dryer are found and accessible
3. **Remote Control Enabled**: Both devices show remote control capability
4. **Cycles Start Successfully**: `test-lg-normal-cycle-automated.js` shows state changes for both devices
5. **No User Prompts**: All scripts run completely automatically

## 📞 Support

For issues or questions:
1. Run health check first: `node test-lg-health-check.js`
2. Check AWS CloudWatch logs for detailed errors
3. Verify LG ThinQ app settings and connectivity
4. Follow credential refresh guide if authentication fails

---

**Note**: All test scripts are designed to run automatically without user prompts, making them suitable for CI/CD pipelines and automated monitoring.
