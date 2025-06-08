#!/usr/bin/env node

/**
 * LG ThinQ Credential Refresh Helper
 * 
 * This script provides step-by-step instructions for refreshing
 * expired LG ThinQ credentials and updating them in AWS.
 */

console.log('🔑 LG ThinQ Credential Refresh Helper');
console.log('====================================\n');

console.log('📋 Current Status:');
console.log('   ❌ LG access token has expired (401 Unauthorized)');
console.log('   🔧 Need to refresh credentials to restore functionality\n');

console.log('📱 Step 1: Prepare LG ThinQ App');
console.log('   1. Open the LG ThinQ mobile app on your phone');
console.log('   2. Ensure you are logged in to your LG account');
console.log('   3. Verify your washer and dryer are connected and visible');
console.log('   4. Check that remote control is enabled for both devices\n');

console.log('🔐 Step 2: Extract New Credentials');
console.log('   Option A - Using Web Browser (Recommended):');
console.log('   1. Open a web browser and go to: https://ca.account.lge.com/login');
console.log('   2. Log in with your LG account credentials');
console.log('   3. Open browser developer tools (F12)');
console.log('   4. Go to Network tab and refresh the page');
console.log('   5. Look for API calls to "api-aic.lgthinq.com"');
console.log('   6. Find the "Authorization: Bearer <token>" header');
console.log('   7. Copy the token value (long string after "Bearer ")');
console.log('   8. Find the "x-client-id" header for your user ID\n');

console.log('   Option B - Using Network Capture:');
console.log('   1. Set up a network capture tool (like Charles Proxy)');
console.log('   2. Connect your phone through the proxy');
console.log('   3. Use the LG ThinQ app to control a device');
console.log('   4. Capture the API calls to api-aic.lgthinq.com');
console.log('   5. Extract Bearer token and client ID from headers\n');

console.log('☁️  Step 3: Update AWS Credentials');
console.log('   Run these commands to update the stored credentials:');
console.log('');
console.log('   # Update the access token');
console.log('   aws ssm put-parameter \\');
console.log('     --name "/lg/access-token" \\');
console.log('     --value "YOUR_NEW_ACCESS_TOKEN" \\');
console.log('     --type "SecureString" \\');
console.log('     --overwrite');
console.log('');
console.log('   # Update the user ID (if changed)');
console.log('   aws ssm put-parameter \\');
console.log('     --name "/lg/user-id" \\');
console.log('     --value "YOUR_USER_ID" \\');
console.log('     --type "SecureString" \\');
console.log('     --overwrite');
console.log('');

console.log('✅ Step 4: Verify the Fix');
console.log('   After updating credentials, run:');
console.log('   node test-lg-health-check.js');
console.log('');
console.log('   Expected result:');
console.log('   ✅ Authentication: successful');
console.log('   ✅ Devices found: 2 (washer and dryer)');
console.log('   ✅ Remote control enabled for both\n');

console.log('🔧 Step 5: Test NORMAL Cycle');
console.log('   Once authentication is working, run:');
console.log('   node test-lg-normal-cycle-automated.js');
console.log('');
console.log('   This will test starting NORMAL cycles on both devices\n');

console.log('⚠️  Important Notes:');
console.log('   • LG access tokens typically expire every 30-90 days');
console.log('   • Keep a backup of working credentials');
console.log('   • Test the integration after each credential refresh');
console.log('   • Ensure devices have remote control enabled in the app');
console.log('   • Check that devices are connected to WiFi\n');

console.log('🆘 Troubleshooting:');
console.log('   If you still get 401 errors after updating:');
console.log('   • Double-check the token format (no extra spaces/characters)');
console.log('   • Verify the user ID is correct');
console.log('   • Ensure you\'re using the Canadian (CA) LG account');
console.log('   • Try logging out and back into the LG ThinQ app');
console.log('   • Check AWS SSM parameter encryption settings\n');

console.log('📞 Need Help?');
console.log('   If you encounter issues:');
console.log('   1. Check AWS CloudWatch logs for detailed error messages');
console.log('   2. Verify AWS SSM parameters are set correctly');
console.log('   3. Test API connectivity with curl commands');
console.log('   4. Ensure your LG account region matches the API endpoint\n');

console.log('🎯 Next Steps:');
console.log('   1. Refresh LG ThinQ credentials using steps above');
console.log('   2. Update AWS SSM parameters');
console.log('   3. Run health check to verify fix');
console.log('   4. Test NORMAL cycle functionality');
console.log('   5. Document working configuration for future reference\n');

console.log('✨ Once credentials are refreshed, the integration should work perfectly!');
console.log('   Both washer and dryer will be able to start NORMAL cycles remotely.');
