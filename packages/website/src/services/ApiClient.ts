import { getAuthService } from './AuthService';

interface ApiConfig {
  baseURL: string;
  timeout?: number;
}

class AuthenticatedHttpClient {
  private baseURL: string;
  private timeout: number;

  constructor(config: ApiConfig) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout || 30000;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const authService = getAuthService();
    if (!authService) {
      // Auth service not yet initialized, return basic headers
      return { 'Content-Type': 'application/json' };
    }
    
    const token = authService.getAccessToken();
    
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    options: {
      body?: any;
      headers?: Record<string, string>;
      requiresAuth?: boolean;
    } = {}
  ): Promise<T> {
    const { body, headers = {}, requiresAuth = true } = options;
    
    const url = `${this.baseURL}${endpoint}`;
    const requestHeaders = {
      ...headers,
      ...(requiresAuth && await this.getAuthHeaders()),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 && requiresAuth) {
          // Token might be expired, try to refresh
          try {
            const authService = getAuthService();
            if (!authService) {
              throw new Error('Auth service not available');
            }
            await authService.refreshTokens();
            
            // Retry the request with new token
            const newHeaders = {
              ...headers,
              ...await this.getAuthHeaders(),
            };
            
            const retryResponse = await fetch(url, {
              method,
              headers: newHeaders,
              body: body ? JSON.stringify(body) : undefined,
            });

            if (!retryResponse.ok) {
              throw new Error(`HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
            }

            return retryResponse.json();
          } catch (refreshError) {
            // Refresh failed, redirect to login
            const authService = getAuthService();
            if (authService) {
              authService.signOut();
            }
            throw new Error('Authentication expired. Please sign in again.');
          }
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      }

      return response.text() as unknown as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }

  // HTTP methods
  async get<T>(endpoint: string, options?: { headers?: Record<string, string>; requiresAuth?: boolean }): Promise<T> {
    return this.request<T>('GET', endpoint, options);
  }

  async post<T>(endpoint: string, body?: any, options?: { headers?: Record<string, string>; requiresAuth?: boolean }): Promise<T> {
    return this.request<T>('POST', endpoint, { ...options, body });
  }

  async put<T>(endpoint: string, body?: any, options?: { headers?: Record<string, string>; requiresAuth?: boolean }): Promise<T> {
    return this.request<T>('PUT', endpoint, { ...options, body });
  }

  async patch<T>(endpoint: string, body?: any, options?: { headers?: Record<string, string>; requiresAuth?: boolean }): Promise<T> {
    return this.request<T>('PATCH', endpoint, { ...options, body });
  }

  async delete<T>(endpoint: string, options?: { headers?: Record<string, string>; requiresAuth?: boolean }): Promise<T> {
    return this.request<T>('DELETE', endpoint, options);
  }
}

// Create singleton instance
const apiClient = new AuthenticatedHttpClient({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'https://api.mymanor.click',
  timeout: 30000,
});

export default apiClient;
