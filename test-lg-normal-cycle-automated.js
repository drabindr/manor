#!/usr/bin/env node

/**
 * Automated LG Appliances NORMAL Cycle Start Test
 * 
 * This script automatically tests starting a NORMAL cycle on both LG washer
 * and dryer without any user prompts. It runs comprehensive tests and monitors
 * state changes to identify the root cause of cycle start issues.
 * 
 * Key Features:
 * - Fully automated (no user prompts)
 * - Tests both washer and dryer
 * - Tests multiple payload structures
 * - Monitors state changes over time
 * - Provides detailed logging for debugging
 * 
 * Run with: node test-lg-normal-cycle-automated.js
 */

const axios = require('axios');

const API_BASE = 'https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod';

// Configuration
const WAIT_TIME_AFTER_COMMAND = 5000; // 5 seconds
const STATE_MONITORING_DURATION = 30000; // 30 seconds
const STATE_CHECK_INTERVAL = 3000; // 3 seconds

console.log('🚀 Automated LG NORMAL Cycle Start Test');
console.log('=====================================\n');

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
      timestamp: new Date().toISOString()
    };
  }
}

async function getDeviceStatus(deviceId) {
  const result = await makeRequest('POST', '/lg/devices/status', {
    data: { deviceId }
  });
  
  if (!result.success) {
    console.log(`   ❌ Status check failed: ${result.status} - ${JSON.stringify(result.data)}`);
    return null;
  }
  
  return result.data;
}

async function monitorStateChanges(deviceId, deviceName, initialState, duration = STATE_MONITORING_DURATION) {
  console.log(`   📊 Monitoring ${deviceName} state changes for ${duration/1000}s...`);
  console.log(`   Initial state: ${initialState}`);
  
  const startTime = Date.now();
  let lastState = initialState;
  let stateChanges = [];
  
  while (Date.now() - startTime < duration) {
    await new Promise(resolve => setTimeout(resolve, STATE_CHECK_INTERVAL));
    
    const status = await getDeviceStatus(deviceId);
    if (status && status.currentState !== lastState) {
      const change = {
        from: lastState,
        to: status.currentState,
        timestamp: new Date().toISOString(),
        elapsed: Math.round((Date.now() - startTime) / 1000)
      };
      stateChanges.push(change);
      console.log(`   🔄 State change: ${change.from} → ${change.to} (after ${change.elapsed}s)`);
      lastState = status.currentState;
      
      // If we detect a successful start, we can stop monitoring early
      if (status.currentState === 'DETECTING' || status.currentState === 'RUNNING' || 
          status.currentState === 'WASHING' || status.currentState === 'DRYING') {
        console.log(`   ✅ Cycle appears to have started successfully!`);
        break;
      }
    }
  }
  
  const finalStatus = await getDeviceStatus(deviceId);
  console.log(`   Final state: ${finalStatus?.currentState || 'unknown'}`);
  
  return {
    stateChanges,
    finalState: finalStatus?.currentState || 'unknown',
    success: stateChanges.length > 0 && finalStatus?.currentState !== initialState
  };
}

async function testNormalCycleStart(deviceName, deviceId, deviceType) {
  console.log(`\n🎯 Testing NORMAL cycle start for ${deviceName} (${deviceType})`);
  console.log(`   Device ID: ${deviceId.substring(0, 12)}...`);
  
  // Step 1: Get initial status
  console.log('\n1️⃣ Getting initial device status...');
  const initialStatus = await getDeviceStatus(deviceId);
  if (!initialStatus) {
    console.log(`   ❌ Cannot get device status, skipping ${deviceName}`);
    return { success: false, reason: 'status_unavailable' };
  }
  
  console.log(`   Current state: ${initialStatus.currentState}`);
  console.log(`   Powered on: ${initialStatus.isPoweredOn}`);
  console.log(`   Remote control: ${initialStatus.remoteControlEnabled}`);
  console.log(`   Remaining time: ${initialStatus.remainingTime || 'none'}`);
  
  if (!initialStatus.remoteControlEnabled) {
    console.log(`   ❌ Remote control disabled, cannot test ${deviceName}`);
    return { success: false, reason: 'remote_control_disabled' };
  }
  
  if (initialStatus.currentState === 'RUNNING' || initialStatus.currentState === 'WASHING' || 
      initialStatus.currentState === 'DRYING' || initialStatus.currentState === 'DETECTING') {
    console.log(`   ⚠️ Device already running (${initialStatus.currentState}), stopping first...`);
    const stopResult = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/stop`, {
      data: { deviceId }
    });
    console.log(`   Stop result: ${stopResult.status}`);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME_AFTER_COMMAND));
  }
  
  // Step 2: Get available cycles
  console.log('\n2️⃣ Checking available cycles...');
  const cyclesResult = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/cycles`, {
    data: { deviceId }
  });
  
  if (cyclesResult.success) {
    console.log(`   Available cycles: ${cyclesResult.data.join(', ')}`);
    if (!cyclesResult.data.includes('NORMAL')) {
      console.log(`   ⚠️ NORMAL cycle not in available cycles, but will still attempt`);
    }
  } else {
    console.log(`   ⚠️ Could not get available cycles: ${cyclesResult.status}`);
  }
  
  // Step 3: Test different methods to start NORMAL cycle
  console.log('\n3️⃣ Testing NORMAL cycle start methods...');
  
  const testMethods = [
    {
      name: 'Direct start function with NORMAL cycle',
      endpoint: `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/start`,
      payload: { data: { deviceId, cycle: 'NORMAL' } }
    },
    {
      name: 'Control endpoint with START and NORMAL cycle',
      endpoint: `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`,
      payload: { data: { deviceId, mode: 'START', cycle: 'NORMAL' } }
    },
    {
      name: 'Control endpoint with basic START',
      endpoint: `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`,
      payload: { data: { deviceId, mode: 'START' } }
    }
  ];
  
  let successfulMethod = null;
  
  for (let i = 0; i < testMethods.length; i++) {
    const method = testMethods[i];
    console.log(`\n   📝 Method ${i + 1}: ${method.name}`);
    
    // Get status before command
    const preStatus = await getDeviceStatus(deviceId);
    console.log(`   Pre-command state: ${preStatus?.currentState || 'unknown'}`);
    
    // Send command
    const result = await makeRequest('POST', method.endpoint, method.payload);
    console.log(`   API Response: ${result.status} ${result.success ? '✅' : '❌'}`);
    
    if (result.success) {
      console.log(`   Response data: ${JSON.stringify(result.data)}`);
    } else {
      console.log(`   Error: ${JSON.stringify(result.data)}`);
    }
    
    // Wait and check for state changes
    console.log(`   Waiting ${WAIT_TIME_AFTER_COMMAND/1000}s for state change...`);
    await new Promise(resolve => setTimeout(resolve, WAIT_TIME_AFTER_COMMAND));
    
    const postStatus = await getDeviceStatus(deviceId);
    console.log(`   Post-command state: ${postStatus?.currentState || 'unknown'}`);
    
    if (postStatus && postStatus.currentState !== preStatus?.currentState) {
      console.log(`   ✅ State changed! ${preStatus?.currentState} → ${postStatus.currentState}`);
      successfulMethod = method.name;
      
      // Monitor the cycle progression
      const monitoring = await monitorStateChanges(deviceId, deviceName, postStatus.currentState);
      
      if (monitoring.success) {
        console.log(`   🎉 SUCCESS: ${deviceName} cycle started successfully!`);
        console.log(`   State progression: ${monitoring.stateChanges.map(c => `${c.from}→${c.to}`).join(' → ')}`);
        
        // Stop the cycle for cleanup
        console.log(`   🛑 Stopping cycle for cleanup...`);
        await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/stop`, {
          data: { deviceId }
        });
        
        return { 
          success: true, 
          method: successfulMethod,
          stateChanges: monitoring.stateChanges,
          finalState: monitoring.finalState
        };
      }
    } else {
      console.log(`   ⚠️ No state change detected`);
    }
    
    // Brief pause between methods
    if (i < testMethods.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`   ❌ All methods failed to start cycle for ${deviceName}`);
  return { 
    success: false, 
    reason: 'no_state_change',
    testedMethods: testMethods.length
  };
}

async function main() {
  const startTime = Date.now();
  
  try {
    // Get device list
    console.log('📋 Getting device list...');
    const devicesResult = await makeRequest('GET', '/lg/devices/list');
    
    if (!devicesResult.success) {
      console.log(`❌ Failed to get device list: ${devicesResult.status} ${JSON.stringify(devicesResult.data)}`);
      return;
    }
    
    const devices = devicesResult.data;
    console.log(`✅ Found ${devices.length} device(s)`);
    
    // Find washer and dryer
    const washer = devices.find(d => d.deviceType === 'washer');
    const dryer = devices.find(d => d.deviceType === 'dryer');
    
    const results = {};
    
    // Test washer
    if (washer) {
      console.log(`\n📱 Found washer: ${washer.deviceName}`);
      results.washer = await testNormalCycleStart(washer.deviceName, washer.deviceId, 'washer');
    } else {
      console.log('\n❌ No washer found');
      results.washer = { success: false, reason: 'device_not_found' };
    }
    
    // Test dryer
    if (dryer) {
      console.log(`\n🌀 Found dryer: ${dryer.deviceName}`);
      results.dryer = await testNormalCycleStart(dryer.deviceName, dryer.deviceId, 'dryer');
    } else {
      console.log('\n❌ No dryer found');
      results.dryer = { success: false, reason: 'device_not_found' };
    }
    
    // Summary
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log('\n🏁 Test Complete!');
    console.log('==================');
    console.log(`Total execution time: ${totalTime} seconds`);
    console.log(`\n📊 Results Summary:`);
    
    if (results.washer) {
      console.log(`   Washer: ${results.washer.success ? '✅ SUCCESS' : '❌ FAILED'} - ${results.washer.reason || results.washer.method || 'unknown'}`);
      if (results.washer.stateChanges?.length > 0) {
        console.log(`   Washer state changes: ${results.washer.stateChanges.length}`);
      }
    }
    
    if (results.dryer) {
      console.log(`   Dryer: ${results.dryer.success ? '✅ SUCCESS' : '❌ FAILED'} - ${results.dryer.reason || results.dryer.method || 'unknown'}`);
      if (results.dryer.stateChanges?.length > 0) {
        console.log(`   Dryer state changes: ${results.dryer.stateChanges.length}`);
      }
    }
    
    console.log('\n💡 Next Steps:');
    if (!results.washer?.success && !results.dryer?.success) {
      console.log('   - Both devices failed to start NORMAL cycle');
      console.log('   - Check backend logs for LG API error messages');
      console.log('   - Verify device profile and available cycles');
      console.log('   - Consider physical requirements (door closed, water supply, etc.)');
    } else if (!results.washer?.success) {
      console.log('   - Washer failed but dryer succeeded');
      console.log('   - Focus on washer-specific payload structure');
      console.log('   - Check washer physical state and requirements');
      console.log('   - Compare working dryer payload with failing washer payload');
    } else if (!results.dryer?.success) {
      console.log('   - Dryer failed but washer succeeded');
      console.log('   - Focus on dryer-specific payload structure');
    } else {
      console.log('   - Both devices successfully started NORMAL cycle!');
      console.log('   - Integration is working correctly');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Auto-start the test
console.log('⏰ Starting automated test in 2 seconds...');
setTimeout(() => {
  main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}, 2000);
