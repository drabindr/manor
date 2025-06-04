// Browser Console Debug Script for Auth Issues
// Paste this into the browser console to debug authentication

console.log('🔍 Casa Guard Auth Debug Tool');
console.log('============================');

// Check localStorage auth state
const authState = localStorage.getItem('casa_guard_auth_state');
if (!authState) {
    console.log('❌ No auth state found in localStorage');
} else {
    try {
        const parsed = JSON.parse(authState);
        console.log('✅ Auth state found:', parsed);
        
        if (parsed.tokens) {
            const now = Date.now();
            const expiresAt = parsed.tokens.expiresAt;
            const timeToExpiry = expiresAt - now;
            const minutesToExpiry = Math.round(timeToExpiry / 1000 / 60);
            
            console.log(`⏰ Token expires at: ${new Date(expiresAt).toISOString()}`);
            console.log(`⏰ Current time: ${new Date(now).toISOString()}`);
            console.log(`⏰ Time until expiry: ${minutesToExpiry} minutes`);
            
            // Check if expired (with 2-minute buffer like the code)
            const isExpiredWithBuffer = now >= (expiresAt - (2 * 60 * 1000));
            console.log(`🔍 Is expired (with 2min buffer): ${isExpiredWithBuffer}`);
            
            // Check actual expiry
            const isActuallyExpired = now >= expiresAt;
            console.log(`🔍 Is actually expired: ${isActuallyExpired}`);
            
            if (parsed.tokens.refreshToken) {
                console.log('✅ Refresh token available');
            } else {
                console.log('❌ No refresh token available');
            }
        }
        
        if (parsed.user) {
            console.log('✅ User data available:', parsed.user);
        } else {
            console.log('❌ No user data');
        }
        
    } catch (e) {
        console.log('❌ Error parsing auth state:', e);
    }
}

// Check if auth service is available globally
if (window.authService) {
    console.log('✅ Auth service found on window');
    try {
        const status = window.authService.getTokenStatus();
        console.log('📊 Token status from service:', status);
    } catch (e) {
        console.log('❌ Error getting token status:', e);
    }
} else {
    console.log('❌ Auth service not found on window object');
}

// Function to manually test token refresh
window.debugRefreshTokens = async function() {
    console.log('🔄 Testing manual token refresh...');
    try {
        if (window.authService) {
            await window.authService.refreshTokens();
            console.log('✅ Token refresh successful');
        } else {
            console.log('❌ Auth service not available');
        }
    } catch (e) {
        console.log('❌ Token refresh failed:', e);
    }
};

console.log('💡 Run debugRefreshTokens() to test manual token refresh');
