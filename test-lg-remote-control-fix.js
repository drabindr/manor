#!/usr/bin/env node

/**
 * LG Remote Control Debug and Re-enable Test
 * 
 * This script focuses on diagnosing and potentially fixing the remote control
 * disabled issue for the LG appliances, particularly the dryer.
 */

const axios = require('axios');

const API_BASE = 'https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod';

console.log('🔧 LG Remote Control Debug and Fix Test');
console.log('======================================\n');

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

async function analyzeRemoteControl(deviceName, deviceId, deviceType) {
  console.log(`\n🔍 Analyzing remote control for ${deviceName} (${deviceType})`);
  console.log(`   Device ID: ${deviceId.substring(0, 12)}...`);
  
  // Get detailed device status
  const statusResult = await makeRequest('POST', '/lg/devices/status', {
    data: { deviceId }
  });
  
  if (!statusResult.success) {
    console.log(`   ❌ Status check failed: ${statusResult.status}`);
    return;
  }
  
  const status = statusResult.data;
  console.log(`\n📊 Current Device Status:`);
  console.log(`   State: ${status.currentState}`);
  console.log(`   Powered on: ${status.isPoweredOn}`);
  console.log(`   Remote control: ${status.remoteControlEnabled}`);
  console.log(`   Remaining time: ${status.remainingTime || 'none'}`);
  
  // Check raw state structure for remote control properties
  console.log(`\n🔬 Raw State Analysis:`);
  if (status.rawState && Array.isArray(status.rawState)) {
    console.log(`   Raw state is array with ${status.rawState.length} items`);
    status.rawState.forEach((item, index) => {
      if (item.remoteControlEnable) {
        console.log(`   Item ${index} remoteControlEnable:`, JSON.stringify(item.remoteControlEnable, null, 2));
      }
    });
  } else if (status.rawState?.remoteControlEnable) {
    console.log(`   Direct remoteControlEnable:`, JSON.stringify(status.rawState.remoteControlEnable, null, 2));
  } else {
    console.log(`   No remoteControlEnable found in raw state`);
  }
  
  // Check raw profile for remote control capabilities
  console.log(`\n🔬 Profile Analysis:`);
  if (status.rawProfile?.property) {
    if (Array.isArray(status.rawProfile.property)) {
      console.log(`   Profile property is array with ${status.rawProfile.property.length} items`);
      status.rawProfile.property.forEach((prop, index) => {
        if (prop.remoteControlEnable) {
          console.log(`   Item ${index} remoteControlEnable:`, JSON.stringify(prop.remoteControlEnable, null, 2));
        }
      });
    } else {
      console.log(`   Profile property is object`);
      if (status.rawProfile.property.remoteControlEnable) {
        console.log(`   remoteControlEnable:`, JSON.stringify(status.rawProfile.property.remoteControlEnable, null, 2));
      }
    }
  }
  
  // Try to enable remote control if it's disabled
  if (!status.remoteControlEnabled) {
    console.log(`\n🔄 Attempting to enable remote control...`);
    
    // Method 1: Try power on command
    console.log(`   📝 Method 1: Power ON command`);
    const powerOnResult = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`, {
      data: { deviceId, mode: 'POWER_ON' }
    });
    console.log(`   Power ON result: ${powerOnResult.status} ${powerOnResult.success ? '✅' : '❌'}`);
    
    if (powerOnResult.success) {
      // Wait and check if remote control is now enabled
      await new Promise(resolve => setTimeout(resolve, 5000));
      const newStatus = await makeRequest('POST', '/lg/devices/status', { data: { deviceId } });
      if (newStatus.success) {
        console.log(`   After power ON - Remote control: ${newStatus.data.remoteControlEnabled}`);
        console.log(`   After power ON - State: ${newStatus.data.currentState}`);
        
        if (newStatus.data.remoteControlEnabled) {
          console.log(`   ✅ Remote control now enabled!`);
          return { success: true, method: 'power_on' };
        }
      }
    }
    
    // Method 2: Try different control approaches
    const controlMethods = [
      { mode: 'POWER_ON', description: 'Power ON (retry)' },
      { mode: 'START', description: 'Basic START' },
      { mode: 'PAUSE', description: 'PAUSE command' },
      { mode: 'STOP', description: 'STOP command' }
    ];
    
    for (const method of controlMethods) {
      console.log(`   📝 Method: ${method.description}`);
      const result = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`, {
        data: { deviceId, mode: method.mode }
      });
      console.log(`   Result: ${result.status} ${result.success ? '✅' : '❌'}`);
      
      if (result.success) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const checkStatus = await makeRequest('POST', '/lg/devices/status', { data: { deviceId } });
        if (checkStatus.success && checkStatus.data.remoteControlEnabled) {
          console.log(`   ✅ Remote control enabled after ${method.description}!`);
          return { success: true, method: method.description };
        }
      }
    }
    
    console.log(`   ❌ All remote control enable methods failed`);
    return { success: false, reason: 'remote_control_stuck_disabled' };
  } else {
    console.log(`   ✅ Remote control already enabled`);
    return { success: true, method: 'already_enabled' };
  }
}

async function testCycleAfterRemoteControlFix(deviceName, deviceId, deviceType) {
  console.log(`\n🎯 Testing NORMAL cycle after remote control fix for ${deviceName}`);
  
  // Get status
  const statusResult = await makeRequest('POST', '/lg/devices/status', { data: { deviceId } });
  if (!statusResult.success || !statusResult.data.remoteControlEnabled) {
    console.log(`   ❌ Remote control still not enabled, cannot test cycle`);
    return { success: false, reason: 'remote_control_disabled' };
  }
  
  console.log(`   ✅ Remote control enabled, testing cycle start...`);
  const initialState = statusResult.data.currentState;
  
  // Try to start NORMAL cycle
  const startResult = await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`, {
    data: { deviceId, mode: 'START', cycle: 'NORMAL' }
  });
  
  console.log(`   Start command result: ${startResult.status} ${startResult.success ? '✅' : '❌'}`);
  
  if (startResult.success) {
    // Wait and check for state change
    await new Promise(resolve => setTimeout(resolve, 5000));
    const newStatusResult = await makeRequest('POST', '/lg/devices/status', { data: { deviceId } });
    
    if (newStatusResult.success) {
      const newState = newStatusResult.data.currentState;
      console.log(`   State change: ${initialState} → ${newState}`);
      
      if (newState !== initialState) {
        console.log(`   🎉 SUCCESS: Cycle started! State changed from ${initialState} to ${newState}`);
        
        // Stop for cleanup
        await makeRequest('POST', `/${deviceType === 'washer' ? 'lg/washer' : 'lg/dryer'}/control`, {
          data: { deviceId, mode: 'STOP' }
        });
        
        return { success: true, stateChange: `${initialState} → ${newState}` };
      } else {
        console.log(`   ⚠️ No state change detected`);
        return { success: false, reason: 'no_state_change' };
      }
    }
  }
  
  return { success: false, reason: 'start_command_failed' };
}

async function main() {
  try {
    // Get device list
    console.log('📋 Getting device list...');
    const devicesResult = await makeRequest('GET', '/lg/devices/list');
    
    if (!devicesResult.success) {
      console.log(`❌ Failed to get device list: ${devicesResult.status}`);
      return;
    }
    
    const devices = devicesResult.data;
    console.log(`✅ Found ${devices.length} device(s)`);
    
    // Find washer and dryer
    const washer = devices.find(d => d.deviceType === 'washer');
    const dryer = devices.find(d => d.deviceType === 'dryer');
    
    const results = {};
    
    // Analyze and fix washer
    if (washer) {
      console.log(`\n📱 Processing washer: ${washer.deviceName}`);
      const remoteControlResult = await analyzeRemoteControl(washer.deviceName, washer.deviceId, 'washer');
      
      if (remoteControlResult.success) {
        const cycleResult = await testCycleAfterRemoteControlFix(washer.deviceName, washer.deviceId, 'washer');
        results.washer = { remoteControl: remoteControlResult, cycle: cycleResult };
      } else {
        results.washer = { remoteControl: remoteControlResult, cycle: null };
      }
    }
    
    // Analyze and fix dryer
    if (dryer) {
      console.log(`\n🌀 Processing dryer: ${dryer.deviceName}`);
      const remoteControlResult = await analyzeRemoteControl(dryer.deviceName, dryer.deviceId, 'dryer');
      
      if (remoteControlResult.success) {
        const cycleResult = await testCycleAfterRemoteControlFix(dryer.deviceName, dryer.deviceId, 'dryer');
        results.dryer = { remoteControl: remoteControlResult, cycle: cycleResult };
      } else {
        results.dryer = { remoteControl: remoteControlResult, cycle: null };
      }
    }
    
    // Summary
    console.log('\n🏁 Remote Control Fix Test Complete!');
    console.log('=====================================');
    
    if (results.washer) {
      console.log(`\n📱 Washer Results:`);
      console.log(`   Remote Control: ${results.washer.remoteControl.success ? '✅' : '❌'} (${results.washer.remoteControl.method || results.washer.remoteControl.reason})`);
      if (results.washer.cycle) {
        console.log(`   Cycle Start: ${results.washer.cycle.success ? '✅' : '❌'} (${results.washer.cycle.stateChange || results.washer.cycle.reason})`);
      }
    }
    
    if (results.dryer) {
      console.log(`\n🌀 Dryer Results:`);
      console.log(`   Remote Control: ${results.dryer.remoteControl.success ? '✅' : '❌'} (${results.dryer.remoteControl.method || results.dryer.remoteControl.reason})`);
      if (results.dryer.cycle) {
        console.log(`   Cycle Start: ${results.dryer.cycle.success ? '✅' : '❌'} (${results.dryer.cycle.stateChange || results.dryer.cycle.reason})`);
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

main().catch(console.error);
