import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

export interface AuthConfig {
  userPoolId: string;
  userPoolClientId: string;
  identityPoolId: string;
  authDomain: string;
  region: string;
}

export interface User {
  sub: string;
  email: string;
  givenName: string;
  familyName: string;
  role?: string;
  homeId?: string;
}

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class AuthService {
  private config: AuthConfig;
  private cognitoClient: CognitoIdentityProviderClient;
  private user: User | null = null;
  private tokens: AuthTokens | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isFirstRefresh: boolean = true;
  private isRefreshing: boolean = false;
  private refreshRetryCount: number = 0;
  private maxRefreshRetries: number = 3;

  constructor(config: AuthConfig) {
    this.config = config;
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: config.region,
    });
    
    // Load existing auth state from localStorage
    this.loadAuthState();
    
    // Start proactive token refresh if authenticated
    if (this.isAuthenticated()) {
      this.scheduleTokenRefresh();
    }
  }

  // Initialize Sign in with Apple
  async signInWithApple(): Promise<void> {
    const appleAuthUrl = this.buildAppleAuthUrl();
    window.location.href = appleAuthUrl;
  }

  private buildAppleAuthUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.userPoolClientId,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'openid email profile',
      identity_provider: 'SignInWithApple',
    });

    return `https://${this.config.authDomain}/oauth2/authorize?${params.toString()}`;
  }

  // Handle OAuth callback
  async handleCallback(code: string): Promise<User> {
    console.log('[Auth] Starting handleCallback with code:', code.substring(0, 20) + '...');
    console.log('[Auth] Current URL:', window.location.href);
    console.log('[Auth] Redirect URI will be:', `${window.location.origin}/auth/callback`);
    
    try {
      // Exchange code for tokens via Cognito
      const tokenRequestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.userPoolClientId,
        code: code,
        redirect_uri: `${window.location.origin}/auth/callback`,
      });
      
      console.log('[Auth] Token request body:', tokenRequestBody.toString());
      console.log('[Auth] Making request to:', `https://${this.config.authDomain}/oauth2/token`);
      
      const tokenResponse = await fetch(`https://${this.config.authDomain}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenRequestBody,
      });

      console.log('[Auth] Token response status:', tokenResponse.status);
      console.log('[Auth] Token response headers:', Object.fromEntries(tokenResponse.headers.entries()));

      if (!tokenResponse.ok) {
        // Handle error and try admin create user path
        const errorData = await tokenResponse.text();
        console.error('[Auth] Token exchange error:', errorData);
        console.error('[Auth] Response status:', tokenResponse.status);
        console.error('[Auth] Response statusText:', tokenResponse.statusText);
        
        if (errorData.includes('given_name') || errorData.includes('family_name')) {
          return this.handleMissingNameAttributes(code);
        }
        throw new Error('Failed to exchange code for tokens: ' + errorData);
      }

      const tokenData = await tokenResponse.json();
      
      // Parse ID token to get user info
      const idTokenPayload = this.parseJWT(tokenData.id_token);
      
      this.tokens = {
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
      };

      this.tokens = {
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
      };

      this.user = {
        sub: idTokenPayload.sub,
        email: idTokenPayload.email,
        givenName: idTokenPayload.given_name || idTokenPayload.name?.split(' ')[0] || 'User',
        familyName: idTokenPayload.family_name || idTokenPayload.name?.split(' ').slice(1).join(' ') || 'Name',
        role: idTokenPayload['custom:role'],
        homeId: idTokenPayload['custom:homeId'],
      };

      // Save to localStorage
      this.saveAuthState();

      // Schedule proactive token refresh
      this.scheduleTokenRefresh();
      return this.user;
    } catch (error) {
      console.error('Error handling auth callback:', error);
      // Clear any partial state
      this.user = null;
      this.tokens = null;
      localStorage.removeItem('casa_guard_auth_state');
      throw error;
    }
  }

  // Handle the case where name attributes are missing
  private async handleMissingNameAttributes(code: string): Promise<User> {
    console.log('Handling missing name attributes case - still exchanging code with Cognito');
    
    try {
      // Still exchange the code with Cognito to get real tokens
      // We just need to handle the potential missing name gracefully
      const tokenResponse = await fetch(`https://${this.config.authDomain}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.userPoolClientId,
          code: code,
          redirect_uri: `${window.location.origin}/auth/callback`,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('Token exchange still failed:', errorData);
        throw new Error('Failed to exchange code for tokens even with missing name handling: ' + errorData);
      }

      const tokenData = await tokenResponse.json();
      console.log('✅ Successfully exchanged code for real Cognito tokens');
      
      // Parse ID token to get user info
      const idTokenPayload = this.parseJWT(tokenData.id_token);
      
      // Store real tokens from Cognito
      this.tokens = {
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
      };

      // Create user with fallback names if missing
      this.user = {
        sub: idTokenPayload.sub,
        email: idTokenPayload.email || 'user@example.com',
        givenName: idTokenPayload.given_name || idTokenPayload.name?.split(' ')[0] || 'Apple',
        familyName: idTokenPayload.family_name || idTokenPayload.name?.split(' ').slice(1).join(' ') || 'User',
        role: idTokenPayload['custom:role'],
        homeId: idTokenPayload['custom:homeId'],
      };
      
      console.log('User created with fallback names:', this.user);
      
      // Save to localStorage
      this.saveAuthState();
      
      // Schedule token refresh with real refresh token
      this.scheduleTokenRefresh();
      
      return this.user;
    } catch (error) {
      console.error('Error in handleMissingNameAttributes:', error);
      throw error;
    }
  }



  // Get AWS credentials for making authenticated API calls
  async getAWSCredentials() {
    if (!this.tokens) {
      throw new Error('User not authenticated');
    }

    const credentials = fromCognitoIdentityPool({
      client: new CognitoIdentityClient({ region: this.config.region }),
      identityPoolId: this.config.identityPoolId,
      logins: {
        [`cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}`]: this.tokens.idToken,
      },
    });

    return credentials;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    if (!this.user || !this.tokens) {
      return false;
    }
    
    // If tokens are expired but we have a refresh token and aren't already refreshing, try to refresh
    if (this.isTokenExpired() && this.tokens.refreshToken && !this.isRefreshing) {
      console.log('Tokens expired but refresh token available, attempting refresh...');
      // Start refresh process but don't wait for it
      this.refreshTokens().catch(error => {
        console.error('Failed to refresh tokens during auth check:', error);
      });
    }
    
    // If we're refreshing or tokens are still valid, consider user authenticated
    // This prevents premature sign-outs during token refresh
    if (this.isRefreshing || !this.isTokenExpired()) {
      return true;
    }
    
    // Only return false if tokens are expired AND we don't have a refresh token
    return !!this.tokens.refreshToken;
  }

  private isTokenExpired(): boolean {
    if (!this.tokens) return true;
    // Only consider token expired if it's actually expired (no aggressive buffer)
    return Date.now() >= this.tokens.expiresAt;
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.user;
  }

  // Get access token for API calls
  getAccessToken(): string | null {
    if (!this.tokens) {
      console.warn('No tokens available');
      return null;
    }
    
    // Check if token is expired or will expire within 15 minutes (more aggressive)
    const timeUntilExpiry = this.tokens.expiresAt - Date.now();
    const willExpireSoon = timeUntilExpiry <= (15 * 60 * 1000); // 15 minutes
    
    if (willExpireSoon && this.tokens.refreshToken && !this.isRefreshing) {
      console.log('Access token will expire soon, refreshing...');
      // Try to refresh proactively if we have a refresh token
      this.refreshTokens().catch(error => {
        console.error('Failed to refresh token proactively:', error);
      });
    }
    
    // Return current token even if it will expire soon - the refresh happens async
    // This prevents immediate logouts while refresh is in progress
    if (this.isTokenExpired()) {
      console.warn('Access token is expired');
      return null;
    }
    
    return this.tokens.accessToken;
  }

  // Refresh tokens
  async refreshTokens(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    if (this.isRefreshing) {
      console.log('🔄 Token refresh already in progress, skipping...');
      return;
    }

    this.isRefreshing = true;
    console.log('🔄 Attempting token refresh...');
    console.log('Refresh token (first 20 chars):', this.tokens.refreshToken.substring(0, 20) + '...');

    try {
      const tokenResponse = await fetch(`https://${this.config.authDomain}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.userPoolClientId,
          refresh_token: this.tokens.refreshToken,
        }),
      });

      console.log('Token refresh response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token refresh failed:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText
        });
        
        // Only sign out if the refresh token is definitely invalid (400/401)
        // For network errors (5xx) or other temporary issues, keep trying
        if (tokenResponse.status === 400 || tokenResponse.status === 401) {
          console.error('Refresh token is invalid, signing out...');
          this.isRefreshing = false;
          this.refreshRetryCount = 0;
          this.signOut();
          throw new Error(`Invalid refresh token: ${tokenResponse.status} ${errorText}`);
        }
        
        // For other errors, we'll retry
        this.refreshRetryCount++;
        if (this.refreshRetryCount < this.maxRefreshRetries) {
          console.log(`🔄 Retrying token refresh... (attempt ${this.refreshRetryCount}/${this.maxRefreshRetries})`);
          this.isRefreshing = false;
          // Retry after a delay
          setTimeout(() => {
            this.refreshTokens().catch(error => {
              console.error('Token refresh retry failed:', error);
            });
          }, Math.pow(2, this.refreshRetryCount) * 1000); // Exponential backoff
          return;
        } else {
          console.error('Max refresh retries reached, keeping user logged in but scheduling next attempt');
          this.refreshRetryCount = 0;
          this.isRefreshing = false;
          // Schedule next refresh attempt in 5 minutes for network issues
          this.scheduleTokenRefresh();
          throw new Error(`Failed to refresh tokens after ${this.maxRefreshRetries} attempts: ${tokenResponse.status} ${errorText}`);
        }
      }

      const tokenData = await tokenResponse.json();
      console.log('✅ Token refresh successful');
      console.log('New token expires in:', tokenData.expires_in, 'seconds');
      
      // Reset retry counter on success
      this.refreshRetryCount = 0;
      
      // Preserve refresh token if not included in response (common with Cognito)
      const newRefreshToken = tokenData.refresh_token || this.tokens.refreshToken;
      
      this.tokens = {
        ...this.tokens,
        accessToken: tokenData.access_token,
        idToken: tokenData.id_token,
        refreshToken: newRefreshToken,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
      };

      // Update user info from new ID token
      const idTokenPayload = this.parseJWT(tokenData.id_token);
      this.user = {
        sub: idTokenPayload.sub,
        email: idTokenPayload.email,
        givenName: idTokenPayload.given_name,
        familyName: idTokenPayload.family_name,
        role: idTokenPayload['custom:role'],
        homeId: idTokenPayload['custom:homeId'],
      };

      this.saveAuthState();
      
      // Schedule next refresh
      this.scheduleTokenRefresh();
      
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      
      // Don't automatically sign out for network errors or temporary failures
      // Only sign out if explicitly handled above for auth errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Invalid refresh token')) {
        console.log('Auth error detected, user signed out');
      } else {
        console.log('Network or temporary error, keeping user logged in');
        // Still schedule next refresh attempt in case this was a temporary issue
        if (this.tokens) {
          this.scheduleTokenRefresh();
        }
      }
      
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Schedule proactive token refresh
  private scheduleTokenRefresh(): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (!this.tokens) return;

    let refreshTime: number;

    if (this.isFirstRefresh) {
      // First refresh: do it much sooner to test refresh functionality early
      // This helps verify the refresh token works without waiting ~24 hours
      refreshTime = 5 * 60 * 1000; // 5 minutes after login
      console.log('Scheduling FIRST token refresh in 5 minutes (early test)');
      this.isFirstRefresh = false;
    } else if (this.refreshRetryCount > 0) {
      // If we've had refresh failures, schedule more aggressively
      refreshTime = 5 * 60 * 1000; // 5 minutes for retry attempts
      console.log(`Scheduling RETRY token refresh in 5 minutes (retry attempt)`);
    } else {
      // Subsequent refreshes: use normal schedule (30 minutes before expiry for safety)
      const timeUntilExpiry = this.tokens.expiresAt - Date.now();
      refreshTime = Math.max(timeUntilExpiry - (30 * 60 * 1000), 60000); // At least 1 minute from now
      console.log(`Scheduling token refresh in ${Math.round(refreshTime / 1000 / 60)} minutes`);
    }

    this.refreshTimer = setTimeout(async () => {
      try {
        console.log('Proactively refreshing tokens...');
        await this.refreshTokens();
      } catch (error) {
        console.error('Proactive token refresh failed:', error);
        // Don't force sign out here, let the user continue until next API call fails
      }
    }, refreshTime);
  }

  // Clear refresh timer
  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // Sign out
  signOut(): void {
    // Clear refresh timer
    this.clearRefreshTimer();
    
    // Reset refresh state
    this.isRefreshing = false;
    this.refreshRetryCount = 0;
    
    // Reset first refresh flag for next login
    this.isFirstRefresh = true;
    
    // First clear local state
    this.user = null;
    this.tokens = null;
    localStorage.removeItem('casa_guard_auth_state');
    
    // Simply redirect to home page without going through Cognito logout flow
    // This is more reliable and avoids issues with Cognito logout endpoint
    window.location.href = '/';
  }

  // Save auth state to localStorage
  private saveAuthState(): void {
    const authState = {
      user: this.user,
      tokens: this.tokens,
    };
    localStorage.setItem('casa_guard_auth_state', JSON.stringify(authState));
  }

  // Load auth state from localStorage
  private loadAuthState(): void {
    try {
      const savedState = localStorage.getItem('casa_guard_auth_state');
      if (savedState) {
        const authState = JSON.parse(savedState);
        this.user = authState.user;
        this.tokens = authState.tokens;

        // Check if tokens are expired
        if (this.isTokenExpired()) {
          console.log('Loaded tokens are expired, attempting refresh...');
          this.refreshTokens().catch((error) => {
            console.error('Failed to refresh tokens on startup:', error);
            // Only clear state if refresh token is definitely invalid
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Invalid refresh token') || errorMessage.includes('No refresh token available')) {
              console.log('Clearing invalid auth state');
              this.user = null;
              this.tokens = null;
              localStorage.removeItem('casa_guard_auth_state');
            } else {
              console.log('Keeping auth state despite refresh failure - will retry later');
              // Keep the tokens but schedule a retry
              this.scheduleTokenRefresh();
            }
          });
        } else {
          // Tokens are still valid, schedule next refresh
          this.scheduleTokenRefresh();
        }
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
      localStorage.removeItem('casa_guard_auth_state');
    }
  }

  // Debug function to log token contents
  private logTokenContent(token: any): void {
    console.log('Token Content:', JSON.stringify(token, null, 2));
    
    // Log specifically name-related fields
    console.log('Name fields:', {
      name: token.name,
      given_name: token.given_name,
      family_name: token.family_name,
      firstName: token.firstName,
      lastName: token.lastName,
    });
  }

  // Parse JWT token
  private parseJWT(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      const payload = JSON.parse(jsonPayload);
      
      // Log token content for debugging
      this.logTokenContent(payload);
      
      return payload;
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return {};
    }
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    return this.user?.role === role;
  }

  // Check if user belongs to specific home
  belongsToHome(homeId: string): boolean {
    return this.user?.homeId === homeId;
  }

  // Debug method to check token health
  getTokenStatus(): { 
    hasTokens: boolean; 
    isExpired: boolean; 
    expiresIn: number; 
    refreshScheduled: boolean;
    expiresAt: string;
    isFakeToken: boolean;
    isRefreshing: boolean;
    refreshRetryCount: number;
  } {
    const hasTokens = !!this.tokens;
    const isExpired = this.isTokenExpired();
    const expiresIn = this.tokens ? Math.max(0, this.tokens.expiresAt - Date.now()) : 0;
    const refreshScheduled = !!this.refreshTimer;
    const expiresAt = this.tokens ? new Date(this.tokens.expiresAt).toISOString() : 'N/A';
    const isFakeToken = this.tokens?.accessToken === 'placeholder-token';

    console.log('Token Status:', {
      hasTokens,
      isExpired,
      expiresIn: `${Math.round(expiresIn / 1000 / 60)} minutes`,
      refreshScheduled,
      expiresAt,
      isFakeToken: isFakeToken ? '⚠️ FAKE TOKENS DETECTED' : '✅ Real tokens',
      isRefreshing: this.isRefreshing ? '🔄 Refreshing in progress' : '✅ Not refreshing',
      refreshRetryCount: this.refreshRetryCount
    });

    return {
      hasTokens,
      isExpired,
      expiresIn,
      refreshScheduled,
      expiresAt,
      isFakeToken,
      isRefreshing: this.isRefreshing,
      refreshRetryCount: this.refreshRetryCount
    };
  }

  // Method to force a token refresh for testing
  async forceTokenRefresh(): Promise<void> {
    console.log('🔧 Forcing token refresh for testing...');
    
    if (!this.tokens) {
      throw new Error('No tokens available to refresh');
    }
    
    if (this.tokens.accessToken === 'placeholder-token') {
      throw new Error('Cannot refresh fake/placeholder tokens');
    }
    
    // Reset retry count for forced refresh
    this.refreshRetryCount = 0;
    
    return this.refreshTokens();
  }
}

// Export singleton instance
let authService: AuthService | null = null;

export const initializeAuth = (config: AuthConfig): AuthService => {
  authService = new AuthService(config);
  // Expose to window for debugging
  if (typeof window !== 'undefined') {
    (window as any).authService = authService;
  }
  return authService;
};

export const getAuthService = (): AuthService => {
  if (!authService) {
    throw new Error('Auth service not initialized. Call initializeAuth first.');
  }
  return authService;
};

export default AuthService;
