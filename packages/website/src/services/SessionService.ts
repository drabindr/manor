// SessionService.ts - Frontend session management for camera caching

export interface SessionInfo {
  sessionId: string;
  timestamp: number;
  deviceSessions: Map<string, string>; // deviceId -> mediaSessionId
}

class SessionService {
  private static instance: SessionService;
  private sessionInfo: SessionInfo | null = null;
  private readonly SESSION_KEY = 'manor_camera_session';
  private readonly SESSION_TTL = 10 * 60 * 1000; // 10 minutes

  private constructor() {
    this.loadSession();
  }

  public static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Load session from localStorage
   */
  private loadSession(): void {
    try {
      const stored = localStorage.getItem(this.SESSION_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        const now = Date.now();
        
        // Check if session is expired
        if (data.timestamp && (now - data.timestamp) < this.SESSION_TTL) {
          this.sessionInfo = {
            sessionId: data.sessionId,
            timestamp: data.timestamp,
            deviceSessions: new Map(data.deviceSessions || [])
          };
          console.log(`[SessionService] Loaded existing session: ${this.sessionInfo.sessionId}`);
        } else {
          console.log('[SessionService] Existing session expired, will create new one');
          localStorage.removeItem(this.SESSION_KEY);
        }
      }
    } catch (error) {
      console.error('[SessionService] Error loading session:', error);
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  /**
   * Save session to localStorage
   */
  private saveSession(): void {
    if (!this.sessionInfo) return;
    
    try {
      const data = {
        sessionId: this.sessionInfo.sessionId,
        timestamp: this.sessionInfo.timestamp,
        deviceSessions: Array.from(this.sessionInfo.deviceSessions.entries())
      };
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[SessionService] Error saving session:', error);
    }
  }

  /**
   * Get current session ID, creating one if needed
   */
  public getSessionId(): string {
    if (!this.sessionInfo || this.isSessionExpired()) {
      this.createNewSession();
    }
    return this.sessionInfo!.sessionId;
  }

  /**
   * Create a new session
   */
  private createNewSession(): void {
    this.sessionInfo = {
      sessionId: this.generateSessionId(),
      timestamp: Date.now(),
      deviceSessions: new Map()
    };
    this.saveSession();
    console.log(`[SessionService] Created new session: ${this.sessionInfo.sessionId}`);
  }

  /**
   * Check if current session is expired
   */
  private isSessionExpired(): boolean {
    if (!this.sessionInfo) return true;
    const now = Date.now();
    return (now - this.sessionInfo.timestamp) >= this.SESSION_TTL;
  }

  /**
   * Refresh the session timestamp (extend TTL)
   */
  public refreshSession(): void {
    if (this.sessionInfo) {
      this.sessionInfo.timestamp = Date.now();
      this.saveSession();
    }
  }

  /**
   * Store media session ID for a device
   */
  public setDeviceMediaSession(deviceId: string, mediaSessionId: string): void {
    if (!this.sessionInfo) {
      this.createNewSession();
    }
    this.sessionInfo!.deviceSessions.set(deviceId, mediaSessionId);
    this.saveSession();
  }

  /**
   * Get media session ID for a device
   */
  public getDeviceMediaSession(deviceId: string): string | null {
    if (!this.sessionInfo || this.isSessionExpired()) {
      return null;
    }
    return this.sessionInfo.deviceSessions.get(deviceId) || null;
  }

  /**
   * Clear media session for a device
   */
  public clearDeviceMediaSession(deviceId: string): void {
    if (this.sessionInfo) {
      this.sessionInfo.deviceSessions.delete(deviceId);
      this.saveSession();
    }
  }

  /**
   * Clear entire session
   */
  public clearSession(): void {
    this.sessionInfo = null;
    localStorage.removeItem(this.SESSION_KEY);
    console.log('[SessionService] Session cleared');
  }

  /**
   * Get session statistics
   */
  public getSessionStats(): { sessionId: string | null; deviceCount: number; age: number } {
    if (!this.sessionInfo) {
      return { sessionId: null, deviceCount: 0, age: 0 };
    }
    
    return {
      sessionId: this.sessionInfo.sessionId,
      deviceCount: this.sessionInfo.deviceSessions.size,
      age: Date.now() - this.sessionInfo.timestamp
    };
  }
}

export default SessionService;