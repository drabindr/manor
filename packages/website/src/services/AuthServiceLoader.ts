// Dynamic loader for AuthService to prevent circular dependency issues
import type { AuthService, AuthConfig } from './AuthService';

let authService: AuthService | null = null;
let authServicePromise: Promise<AuthService> | null = null;

export async function loadAuthService(config: AuthConfig): Promise<AuthService> {
  if (authService) {
    return authService;
  }

  if (authServicePromise) {
    return authServicePromise;
  }

  authServicePromise = (async () => {
    try {
      const { AuthService: AuthServiceClass, initializeAuth } = await import('./AuthService');
      authService = initializeAuth(config);
      return authService;
    } catch (error) {
      console.error('Failed to load AuthService:', error);
      authServicePromise = null; // Reset promise so we can retry
      throw error;
    }
  })();

  return authServicePromise;
}

export function getAuthService(): AuthService | null {
  return authService;
}

export function isAuthServiceLoaded(): boolean {
  return authService !== null;
}
