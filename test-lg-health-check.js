#!/usr/bin/env node

/**
 * LG Appliances Integration Health Check and Cycle Test
 * 
 * This script performs a comprehensive health check of the LG integration
 * and tests NORMAL cycle starting capabilities. It handles common issues
 * like expired tokens and provides clear next steps.
 * 
 * Features:
 * - Automated health check
 * - Token expiration detection
 * - NORMAL cycle testing (when possible)
 * - No user prompts - fully automated
 * - Clear diagnostic output
 */

const axios = require('axios');

const API_BASE = 'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod';

console.log('🏥 LG Appliances Integration Health Check');
console.log('=========================================\n');

async function makeRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    };
    if (data) config.data = data;
    
    const response = await axios(config);
    return { 
      success: true, 
      status: response.status, 
      data: response.data,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return { 
      success: false, 
      status: error.response?.status || 'ERROR', 
      data: error.response?.data || { error: error.message },
      timestamp: new Date().toISOString(),
      errorMessage: error.message
    };
  }
}

async function healthCheck() {
  console.log('🔍 Performing integration health check...\n');
  
  const checks = {
    apiConnectivity: false,
    authentication: false,
    deviceList: false,
    deviceCount: 0,
    washerFound: false,
    dryerFound: false,
    washerRemoteControl: false,
    dryerRemoteControl: false
  };
  
  // 1. Test API connectivity
  console.log('1️⃣ Testing API connectivity...');
  const connectivityTest = await makeRequest('GET', '/health');
  if (connectivityTest.success || connectivityTest.status !== 'ERROR') {
    console.log('   ✅ API endpoint is reachable');
    checks.apiConnectivity = true;
  } else {
    console.log('   ❌ API endpoint unreachable');
    console.log(`   Error: ${connectivityTest.errorMessage}`);
  }
  
  // 2. Test device listing (authentication check)
  console.log('\n2️⃣ Testing device listing and authentication...');
  const devicesResult = await makeRequest('GET', '/lg/devices/list');
  
  if (devicesResult.success) {
    console.log('   ✅ Authentication successful');
    console.log(`   ✅ Found ${devicesResult.data.length} device(s)`);
    checks.authentication = true;
    checks.deviceList = true;
    checks.deviceCount = devicesResult.data.length;
    
    // Identify devices
    const washer = devicesResult.data.find(d => d.deviceType === 'washer');
    const dryer = devicesResult.data.find(d => d.deviceType === 'dryer');
    
    if (washer) {
      console.log(`   📱 Washer found: ${washer.deviceName} (${washer.deviceId.substring(0, 8)}...)`);
      checks.washerFound = true;
    }
    
    if (dryer) {
      console.log(`   🌀 Dryer found: ${dryer.deviceName} (${dryer.deviceId.substring(0, 8)}...)`);
      checks.dryerFound = true;
    }
    
    // Test remote control status for each device
    if (washer) {
      console.log('\n3️⃣ Testing washer remote control status...');
      const washerStatus = await makeRequest('POST', '/lg/devices/status', {
        data: { deviceId: washer.deviceId }
      });
      
      if (washerStatus.success) {
        console.log(`   State: ${washerStatus.data.currentState}`);
        console.log(`   Powered: ${washerStatus.data.isPoweredOn}`);
        console.log(`   Remote control: ${washerStatus.data.remoteControlEnabled}`);
        checks.washerRemoteControl = washerStatus.data.remoteControlEnabled;
        
        if (washerStatus.data.remoteControlEnabled) {
          console.log('   ✅ Washer remote control enabled');
        } else {
          console.log('   ❌ Washer remote control disabled');
        }
      } else {
        console.log('   ❌ Failed to get washer status');
      }
    }
    
    if (dryer) {
      console.log('\n4️⃣ Testing dryer remote control status...');
      const dryerStatus = await makeRequest('POST', '/lg/devices/status', {
        data: { deviceId: dryer.deviceId }
      });
      
      if (dryerStatus.success) {
        console.log(`   State: ${dryerStatus.data.currentState}`);
        console.log(`   Powered: ${dryerStatus.data.isPoweredOn}`);
        console.log(`   Remote control: ${dryerStatus.data.remoteControlEnabled}`);
        checks.dryerRemoteControl = dryerStatus.data.remoteControlEnabled;
        
        if (dryerStatus.data.remoteControlEnabled) {
          console.log('   ✅ Dryer remote control enabled');
        } else {
          console.log('   ❌ Dryer remote control disabled');
        }
      } else {
        console.log('   ❌ Failed to get dryer status');
      }
    }
    
  } else if (devicesResult.status === 401 || devicesResult.data?.error?.includes('401')) {
    console.log('   ❌ Authentication failed (401 Unauthorized)');
    console.log('   🔑 LG access token appears to be expired');
    console.log('   📝 Action needed: Refresh LG ThinQ credentials');
  } else if (devicesResult.status === 500) {
    console.log('   ❌ Server error (500)');
    console.log('   🔧 Backend integration issue detected');
    console.log(`   Error details: ${JSON.stringify(devicesResult.data)}`);
  } else {
    console.log(`   ❌ Unexpected error: ${devicesResult.status}`);
    console.log(`   Details: ${JSON.stringify(devicesResult.data)}`);
  }
  
  return { checks, devices: devicesResult.success ? devicesResult.data : [] };
}

async function testNormalCycle(deviceName, deviceId, deviceType, remoteControlEnabled) {
  if (!remoteControlEnabled) {
    console.log(`   ❌ Skipping cycle test - remote control disabled for ${deviceName}`);
    return { success: false, reason: 'remote_control_disabled' };
  }
  
  console.log(`   🎯 Testing NORMAL cycle start for ${deviceName}...`);
  
  // Get initial state
  const initialStatus = await makeRequest('POST', '/lg/devices/status', {
    data: { deviceId }
  });
  
  if (!initialStatus.success) {
    console.log(`   ❌ Cannot get device status`);
    return { success: false, reason: 'status_unavailable' };
  }
  
  const initialState = initialStatus.data.currentState;
  console.log(`   Initial state: ${initialState}`);
  
  // Test start command
  const startResult = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`, {
    data: { deviceId, mode: 'START', cycle: 'NORMAL' }
  });
  
  console.log(`   Start command: ${startResult.status} ${startResult.success ? '✅' : '❌'}`);
  
  if (startResult.success) {
    // Wait for state change
    console.log('   ⏳ Waiting 5s for state change...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const newStatus = await makeRequest('POST', '/lg/devices/status', {
      data: { deviceId }
    });
    
    if (newStatus.success) {
      const newState = newStatus.data.currentState;
      console.log(`   State change: ${initialState} → ${newState}`);
      
      if (newState !== initialState) {
        console.log(`   🎉 SUCCESS: Cycle started! State changed to ${newState}`);
        
        // Stop the cycle for cleanup
        const stopResult = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`, {
          data: { deviceId, mode: 'STOP' }
        });
        console.log(`   Cleanup stop: ${stopResult.status} ${stopResult.success ? '✅' : '❌'}`);
        
        return { 
          success: true, 
          stateChange: `${initialState} → ${newState}`,
          cleanupStop: stopResult.success
        };
      } else {
        console.log(`   ⚠️ No state change detected (remained ${newState})`);
        return { success: false, reason: 'no_state_change' };
      }
    } else {
      console.log(`   ❌ Cannot verify state change`);
      return { success: false, reason: 'status_check_failed' };
    }
  } else {
    console.log(`   ❌ Start command failed: ${JSON.stringify(startResult.data)}`);
    return { success: false, reason: 'start_command_failed', error: startResult.data };
  }
}

async function main() {
  const startTime = Date.now();
  
  try {
    // Perform health check
    const { checks, devices } = await healthCheck();
    
    // Test cycles if authentication is working
    const cycleResults = {};
    
    if (checks.authentication && checks.deviceList) {
      console.log('\n5️⃣ Testing NORMAL cycle start capabilities...');
      
      const washer = devices.find(d => d.deviceType === 'washer');
      const dryer = devices.find(d => d.deviceType === 'dryer');
      
      if (washer) {
        console.log(`\n📱 Testing washer: ${washer.deviceName}`);
        cycleResults.washer = await testNormalCycle(
          washer.deviceName, 
          washer.deviceId, 
          'washer', 
          checks.washerRemoteControl
        );
      }
      
      if (dryer) {
        console.log(`\n🌀 Testing dryer: ${dryer.deviceName}`);
        cycleResults.dryer = await testNormalCycle(
          dryer.deviceName, 
          dryer.deviceId, 
          'dryer', 
          checks.dryerRemoteControl
        );
      }
    }
    
    // Generate comprehensive report
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log('\n🏁 Health Check and Cycle Test Complete!');
    console.log('==========================================');
    console.log(`Total execution time: ${totalTime} seconds\n`);
    
    console.log('📊 Integration Health Status:');
    console.log(`   API Connectivity: ${checks.apiConnectivity ? '✅' : '❌'}`);
    console.log(`   Authentication: ${checks.authentication ? '✅' : '❌'}`);
    console.log(`   Device Discovery: ${checks.deviceList ? '✅' : '❌'} (${checks.deviceCount} devices)`);
    console.log(`   Washer Found: ${checks.washerFound ? '✅' : '❌'}`);
    console.log(`   Dryer Found: ${checks.dryerFound ? '✅' : '❌'}`);
    console.log(`   Washer Remote Control: ${checks.washerRemoteControl ? '✅' : '❌'}`);
    console.log(`   Dryer Remote Control: ${checks.dryerRemoteControl ? '✅' : '❌'}`);
    
    if (Object.keys(cycleResults).length > 0) {
      console.log('\n🎯 NORMAL Cycle Test Results:');
      
      if (cycleResults.washer) {
        console.log(`   Washer: ${cycleResults.washer.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (cycleResults.washer.success) {
          console.log(`     State change: ${cycleResults.washer.stateChange}`);
          console.log(`     Cleanup: ${cycleResults.washer.cleanupStop ? '✅' : '❌'}`);
        } else {
          console.log(`     Reason: ${cycleResults.washer.reason}`);
        }
      }
      
      if (cycleResults.dryer) {
        console.log(`   Dryer: ${cycleResults.dryer.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        if (cycleResults.dryer.success) {
          console.log(`     State change: ${cycleResults.dryer.stateChange}`);
          console.log(`     Cleanup: ${cycleResults.dryer.cleanupStop ? '✅' : '❌'}`);
        } else {
          console.log(`     Reason: ${cycleResults.dryer.reason}`);
        }
      }
    }
    
    // Provide actionable next steps
    console.log('\n💡 Next Steps:');
    
    if (!checks.authentication) {
      console.log('   🔑 PRIORITY 1: Fix LG authentication');
      console.log('     - LG access token appears to be expired');
      console.log('     - Re-authenticate with LG ThinQ app and update stored credentials');
      console.log('     - Update SSM parameters: /lg/user-id and /lg/access-token');
    } else if (!checks.washerRemoteControl || !checks.dryerRemoteControl) {
      console.log('   📱 PRIORITY 2: Enable remote control on devices');
      console.log('     - Open LG ThinQ mobile app');
      console.log('     - Go to device settings for each appliance');
      console.log('     - Enable "Remote Control" or "ThinQ Care" features');
      console.log('     - Ensure devices are connected to WiFi');
    } else if (cycleResults.washer?.success && cycleResults.dryer?.success) {
      console.log('   🎉 SUCCESS: Both washer and dryer can start NORMAL cycles!');
      console.log('     - Integration is working correctly');
      console.log('     - Both devices respond to START commands');
      console.log('     - Ready for production use');
    } else if (cycleResults.washer?.success || cycleResults.dryer?.success) {
      console.log('   ⚠️ PARTIAL SUCCESS: One device working, one failing');
      console.log('     - Check physical status of failing device (door closed, water, etc.)');
      console.log('     - Verify remote control is enabled for failing device');
      console.log('     - Check device-specific error messages in backend logs');
    } else {
      console.log('   🔧 TROUBLESHOOTING: Both devices failing to start cycles');
      console.log('     - Check AWS CloudWatch logs for detailed error messages');
      console.log('     - Verify devices are not already running cycles');
      console.log('     - Ensure physical prerequisites (door closed, water, power, etc.)');
      console.log('     - Test individual device states and control capabilities');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error during health check:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Auto-start with slight delay for readability
console.log('⏰ Starting health check in 2 seconds...\n');
setTimeout(() => {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}, 2000);
