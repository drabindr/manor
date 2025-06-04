// Token Refresh Verification Script
// Run this in browser console while logged in

console.log('🔍 Token Refresh Verification Test');
console.log('==================================');

// Check localStorage for auth state
const authState = localStorage.getItem('casa_guard_auth_state');
if (!authState) {
  console.log('❌ No auth state found in localStorage');
} else {
  const parsed = JSON.parse(authState);
  console.log('✅ Auth state found:', {
    hasTokens: !!parsed.tokens,
    hasRefreshToken: !!parsed.tokens?.refreshToken,
    expiresAt: parsed.tokens?.expiresAt,
    expiresDate: new Date(parsed.tokens?.expiresAt),
    timeUntilExpiry: parsed.tokens?.expiresAt ? Math.round((parsed.tokens.expiresAt - Date.now()) / 1000 / 60) + ' minutes' : 'unknown',
    hasUser: !!parsed.user
  });
  
  // Check if tokens are about to expire or already expired
  if (parsed.tokens?.expiresAt) {
    const timeLeft = parsed.tokens.expiresAt - Date.now();
    const minutesLeft = Math.round(timeLeft / 1000 / 60);
    
    if (timeLeft <= 0) {
      console.log('⚠️ Tokens are EXPIRED');
    } else if (minutesLeft <= 5) {
      console.log('⚠️ Tokens expire in', minutesLeft, 'minutes - should trigger refresh soon');
    } else {
      console.log('✅ Tokens are valid for', minutesLeft, 'minutes');
    }
  }
  
  // Test if refresh token works
  console.log('\n🔄 Testing token refresh...');
  
  // Get the auth service instance (if available)
  if (window.authService) {
    console.log('✅ AuthService instance found');
    
    // Try to refresh tokens manually
    window.authService.refreshTokens()
      .then(() => {
        console.log('✅ Token refresh successful!');
        const newAuthState = JSON.parse(localStorage.getItem('casa_guard_auth_state'));
        console.log('New expiry:', new Date(newAuthState.tokens.expiresAt));
        console.log('New time until expiry:', Math.round((newAuthState.tokens.expiresAt - Date.now()) / 1000 / 60) + ' minutes');
      })
      .catch(error => {
        console.log('❌ Token refresh failed:', error.message);
      });
  } else {
    console.log('❌ AuthService instance not found on window object');
  }
}

// Check for any active refresh timers
console.log('\n⏰ Checking for active refresh timers...');
// This would require access to the AuthService instance

console.log('\n📝 Next Steps:');
console.log('1. If tokens expire in < 24 hours, you may have old tokens from before the update');
console.log('2. Sign out and sign back in to get new tokens with 1-year refresh validity');
console.log('3. Watch the browser console for automatic refresh attempts');
