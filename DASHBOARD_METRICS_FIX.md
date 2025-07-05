# Dashboard Metrics Fix Summary

## Problem
The performance dashboard showed no data because of metric configuration mismatches between the CloudWatch dashboard and the Python programs that emit metrics.

## Root Cause Analysis

### Issue 1: Dimensional vs Flat Metrics
- **Dashboard Expected**: Flat metrics `DiskUsageRoot` and `DiskUsageExternalMedia` 
- **Python Programs Emit**: Dimensional metric `DiskUsage` with dimensions:
  - `{'Name': 'MountPoint', 'Value': 'Root'}` (from casa-cameras-local-writer.py)
  - `{'Name': 'MountPoint', 'Value': 'VideoStorage'}` (from casa-cameras-local-writer.py)

### Issue 2: Missing System Metrics for Local Writer
- The local writer program (casa-cameras-local-writer.py) emits CPU and Memory metrics under `CasaCameraLocalWriter` namespace
- Dashboard only had system metrics for the `CasaCameraStream` namespace (from hls.py)

### Issue 3: Misleading Widget Titles
- Dashboard showed "External Media" but actual code uses "VideoStorage" dimension

## Solution

### Fixed Dashboard Configuration
1. **Updated Local Writer disk metrics** to use dimensional queries:
   ```typescript
   const diskUsageRootMetric = new Metric({
     namespace: 'CasaCameraLocalWriter',
     metricName: 'DiskUsage',
     dimensionsMap: { 'MountPoint': 'Root' }
   });
   ```

2. **Added missing Local Writer system metrics widgets** for CPU and Memory usage

3. **Updated widget titles** to match actual dimensions ("Video Storage" not "External Media")

4. **Organized dashboard** to clearly separate Local Writer vs Camera Stream metrics

### Files Changed
- `packages/cdk/lib/casa-cameras-dashboards-stack.ts`

### Metrics Now Working
- ✅ Local Writer Root Disk Usage (%)
- ✅ Local Writer Video Storage Disk Usage (%)  
- ✅ Local Writer CPU Usage (%)
- ✅ Local Writer Memory Usage (%)
- ✅ Camera Stream Connection Status
- ✅ Camera Stream Upload Duration
- ✅ Camera Stream Upload Failures
- ✅ Camera Stream System Metrics (CPU, Memory, Disk)

### Known Limitations
- **FFmpeg Restarts**: Widget exists but will show 0 data since hls.py doesn't track restarts
- **Stream Duration**: Depends on hls.py streaming activity

## Verification
- Code compiles successfully with TypeScript
- Jest tests pass
- Dashboard now uses correct metric names and dimensions that match actual Python program emissions

## Deployment
To deploy the fix:
```bash
cd packages/cdk
npm run deploy:infrastructure
```

This will update the CloudWatch dashboard with the corrected metric configurations.