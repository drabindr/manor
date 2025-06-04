/**
 * Logger.ts - Centralized logging utility for manor-website
 * 
 * This utility provides a consistent logging interface with configurable log levels.
 * By default, debug logs are suppressed unless explicitly enabled.
 */

// Log levels in order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// Logger configuration
interface LoggerConfig {
  minLevel: LogLevel;
  enableConsoleColors: boolean;
  prefix: string;
}

class Logger {
  private static instance: Logger;
  private config: LoggerConfig = {
    minLevel: LogLevel.NONE, // Default to NONE level (all logs suppressed)
    enableConsoleColors: true,
    prefix: '[manor]'
  };

  private constructor() {
    // Initialize from URL parameter
    this.checkUrlForDebugMode();
    
    // Listen for URL changes (for single-page applications)
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => this.checkUrlForDebugMode());
      
      // For frameworks that use history.pushState
      const originalPushState = history.pushState;
      history.pushState = function() {
        const result = originalPushState.apply(this, arguments as any);
        window.dispatchEvent(new Event('popstate'));
        return result;
      };
    }
  }

  /**
   * Get the singleton logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Check URL for debug parameter
   */
  private checkUrlForDebugMode(): void {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const debugParam = urlParams.get('debug');
      const logLevelParam = urlParams.get('log_level');
      
      if (debugParam !== null) {
        this.config.minLevel = LogLevel.DEBUG;
        this.info('Debug logging enabled via URL parameter');
      } else if (logLevelParam !== null) {
        // Allow setting specific log level via URL parameter
        switch (logLevelParam.toLowerCase()) {
          case 'debug':
            this.config.minLevel = LogLevel.DEBUG;
            break;
          case 'info':
            this.config.minLevel = LogLevel.INFO;
            break;
          case 'warn':
            this.config.minLevel = LogLevel.WARN;
            break;
          case 'error':
            this.config.minLevel = LogLevel.ERROR;
            break;
          case 'none':
            this.config.minLevel = LogLevel.NONE;
            break;
          default:
            this.config.minLevel = LogLevel.INFO;
        }
        this.info(`Log level set to ${LogLevel[this.config.minLevel]} via URL parameter`);
      } else {
        this.config.minLevel = LogLevel.NONE;
      }
    }
  }

  /**
   * Get debug URL
   * Returns the current URL with the debug parameter added or removed
   */
  public getLogLevelUrl(level: LogLevel): string {
    if (typeof window === 'undefined') return '';
    
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    
    if (level === LogLevel.DEBUG) {
      params.set('debug', 'true');
      params.delete('log_level');
    } else if (level === LogLevel.NONE) {
      params.delete('debug');
      params.delete('log_level'); // Default level, no need for parameter
    } else {
      params.delete('debug');
      params.set('log_level', LogLevel[level].toLowerCase());
    }
    
    url.search = params.toString();
    return url.toString();
  }

  /**
   * Check if debug logging is enabled
   */
  public isDebugEnabled(): boolean {
    return this.config.minLevel === LogLevel.DEBUG;
  }

  /**
   * Set the minimum log level
   */
  public setLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  /**
   * Get the current minimum log level
   */
  public getLevel(): LogLevel {
    return this.config.minLevel;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, ...args: any[]): void {
    if (this.config.minLevel <= LogLevel.DEBUG) {
      if (this.config.enableConsoleColors) {
        console.debug(`%c${this.config.prefix} %c[DEBUG]%c ${message}`, 
          'color: #7986CB', 'color: #64B5F6', 'color: #90CAF9', ...args);
      } else {
        console.debug(`${this.config.prefix} [DEBUG] ${message}`, ...args);
      }
    }
  }

  /**
   * Log an info message
   */
  public info(message: string, ...args: any[]): void {
    if (this.config.minLevel <= LogLevel.INFO) {
      if (this.config.enableConsoleColors) {
        console.info(`%c${this.config.prefix} %c[INFO]%c ${message}`, 
          'color: #7986CB', 'color: #4CAF50', 'color: inherit', ...args);
      } else {
        console.info(`${this.config.prefix} [INFO] ${message}`, ...args);
      }
    }
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    if (this.config.minLevel <= LogLevel.WARN) {
      if (this.config.enableConsoleColors) {
        console.warn(`%c${this.config.prefix} %c[WARN]%c ${message}`, 
          'color: #7986CB', 'color: #FF9800', 'color: inherit', ...args);
      } else {
        console.warn(`${this.config.prefix} [WARN] ${message}`, ...args);
      }
    }
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    if (this.config.minLevel <= LogLevel.ERROR) {
      if (this.config.enableConsoleColors) {
        console.error(`%c${this.config.prefix} %c[ERROR]%c ${message}`, 
          'color: #7986CB', 'color: #F44336', 'color: inherit', ...args);
      } else {
        console.error(`${this.config.prefix} [ERROR] ${message}`, ...args);
      }
    }
  }
}

// Export a singleton instance
export const logger = Logger.getInstance();

// Export a hook for React components
export function useLogger() {
  return logger;
}
