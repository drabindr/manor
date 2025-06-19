/**
 * Background Data Service
 * 
 * Pre-fetches critical application data in the background to improve
 * perceived load time and user experience. This service starts loading
 * data immediately when the app initializes, before components mount.
 */

import { logger } from '../utils/Logger';
import apiClient from './ApiClient';
import { wsService } from '../WebSocketService';

interface CachedData<T> {
  data: T | null;
  timestamp: number;
  isLoading: boolean;
  error: Error | null;
}

interface BackgroundDataCache {
  cameras: CachedData<any[]>;
  thermostat: CachedData<any>;
  alarmState: CachedData<string>;
  deviceStates: CachedData<any>;
}

class BackgroundDataService {
  private cache: BackgroundDataCache;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly CACHE_TTL = 30000; // 30 seconds cache TTL
  private readonly API_BASE = 'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod';

  constructor() {
    this.cache = {
      cameras: { data: null, timestamp: 0, isLoading: false, error: null },
      thermostat: { data: null, timestamp: 0, isLoading: false, error: null },
      alarmState: { data: null, timestamp: 0, isLoading: false, error: null },
      deviceStates: { data: null, timestamp: 0, isLoading: false, error: null }
    };
  }

  /**
   * Initialize the background data service and start pre-fetching critical data
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return this.initPromise || Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private async _performInit(): Promise<void> {
    try {
      logger.info('[BackgroundDataService] Starting background data pre-fetching...');

      // Start all pre-fetch operations in parallel for maximum speed
      const prefetchPromises = [
        this._prefetchCameras(),
        this._prefetchThermostat(),
        this._prefetchAlarmState(),
        this._prefetchDeviceStates()
      ];

      // Use Promise.allSettled to ensure all operations complete
      // even if some fail (graceful degradation)
      const results = await Promise.allSettled(prefetchPromises);

      // Log any failures but don't throw to prevent app breakage
      results.forEach((result, index) => {
        const operations = ['cameras', 'thermostat', 'alarmState', 'deviceStates'];
        if (result.status === 'rejected') {
          logger.warn(`[BackgroundDataService] ${operations[index]} pre-fetch failed:`, result.reason);
        }
      });

      this.initialized = true;
      logger.info('[BackgroundDataService] Background data pre-fetching completed');

    } catch (error) {
      logger.error('[BackgroundDataService] Background data service initialization failed:', error);
      // Don't throw - allow app to continue with degraded functionality
    }
  }

  /**
   * Pre-fetch camera data
   */
  private async _prefetchCameras(): Promise<void> {
    if (this.cache.cameras.isLoading) return;

    this.cache.cameras.isLoading = true;
    try {
      logger.debug('[BackgroundDataService] Pre-fetching cameras...');
      
      const response = await fetch(`${this.API_BASE}/google/devices/list`);
      
      if (response.status === 401) {
        // Don't redirect here - let the component handle auth redirects
        throw new Error('Authentication required for camera data');
      }

      const data = await response.json();
      const devices = data || [];
      const cameraDevices = devices.filter(
        (device: any) =>
          (device.type === "sdm.devices.types.CAMERA" ||
            device.type === "sdm.devices.types.DOORBELL" ||
            device.type === "sdm.devices.types.DISPLAY") &&
          device.traits?.["sdm.devices.traits.CameraLiveStream"]?.supportedProtocols?.includes(
            "WEB_RTC"
          )
      );

      this.cache.cameras.data = cameraDevices;
      this.cache.cameras.timestamp = Date.now();
      this.cache.cameras.error = null;
      
      logger.debug(`[BackgroundDataService] Pre-fetched ${cameraDevices.length} cameras`);

    } catch (error) {
      this.cache.cameras.error = error as Error;
      logger.error('[BackgroundDataService] Camera pre-fetch failed:', error);
    } finally {
      this.cache.cameras.isLoading = false;
    }
  }

  /**
   * Pre-fetch thermostat data
   */
  private async _prefetchThermostat(): Promise<void> {
    if (this.cache.thermostat.isLoading) return;

    this.cache.thermostat.isLoading = true;
    try {
      logger.debug('[BackgroundDataService] Pre-fetching thermostat...');
      
      const response = await fetch(`${this.API_BASE}/google/thermostat/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });

      if (response.status === 401) {
        throw new Error('Authentication required for thermostat data');
      }

      const data = await response.json();
      const currentTemperature =
        data.traits?.["sdm.devices.traits.Temperature"]?.ambientTemperatureCelsius ?? null;
      
      this.cache.thermostat.data = { currentTemp: currentTemperature };
      this.cache.thermostat.timestamp = Date.now();
      this.cache.thermostat.error = null;
      
      logger.debug('[BackgroundDataService] Pre-fetched thermostat data');

    } catch (error) {
      this.cache.thermostat.error = error as Error;
      logger.error('[BackgroundDataService] Thermostat pre-fetch failed:', error);
    } finally {
      this.cache.thermostat.isLoading = false;
    }
  }

  /**
   * Pre-fetch alarm state
   */
  private async _prefetchAlarmState(): Promise<void> {
    if (this.cache.alarmState.isLoading) return;

    this.cache.alarmState.isLoading = true;
    try {
      logger.debug('[BackgroundDataService] Pre-fetching alarm state...');
      
      // Try to get current alarm state from WebSocket service
      const currentMode = wsService.getCurrentMode();
      
      if (currentMode) {
        this.cache.alarmState.data = currentMode;
        this.cache.alarmState.timestamp = Date.now();
        this.cache.alarmState.error = null;
        logger.debug('[BackgroundDataService] Pre-fetched alarm state from WebSocket');
      } else {
        // If WebSocket isn't ready, trigger a state request
        wsService.sendCommand("GetSystemState");
        logger.debug('[BackgroundDataService] Requested alarm state via WebSocket');
      }

    } catch (error) {
      this.cache.alarmState.error = error as Error;
      logger.error('[BackgroundDataService] Alarm state pre-fetch failed:', error);
    } finally {
      this.cache.alarmState.isLoading = false;
    }
  }

  /**
   * Pre-fetch device states (lights, switches, etc.)
   */
  private async _prefetchDeviceStates(): Promise<void> {
    if (this.cache.deviceStates.isLoading) return;

    this.cache.deviceStates.isLoading = true;
    try {
      logger.debug('[BackgroundDataService] Pre-fetching device states...');
      
      // Pre-fetch TP-Link device states
      const tplinkPromise = fetch(`${this.API_BASE}/tplink/devices`).then(res => res.json()).catch(() => null);
      
      // Pre-fetch Hue device states  
      const huePromise = fetch(`${this.API_BASE}/hue/lights`).then(res => res.json()).catch(() => null);

      const [tplinkData, hueData] = await Promise.all([tplinkPromise, huePromise]);

      this.cache.deviceStates.data = {
        tplink: tplinkData,
        hue: hueData
      };
      this.cache.deviceStates.timestamp = Date.now();
      this.cache.deviceStates.error = null;
      
      logger.debug('[BackgroundDataService] Pre-fetched device states');

    } catch (error) {
      this.cache.deviceStates.error = error as Error;
      logger.error('[BackgroundDataService] Device states pre-fetch failed:', error);
    } finally {
      this.cache.deviceStates.isLoading = false;
    }
  }

  /**
   * Get cached cameras data if available and fresh
   */
  getCachedCameras(): any[] | null {
    return this._getCachedData(this.cache.cameras);
  }

  /**
   * Get cached thermostat data if available and fresh
   */
  getCachedThermostat(): any | null {
    return this._getCachedData(this.cache.thermostat);
  }

  /**
   * Get cached alarm state if available and fresh
   */
  getCachedAlarmState(): string | null {
    return this._getCachedData(this.cache.alarmState);
  }

  /**
   * Get cached device states if available and fresh
   */
  getCachedDeviceStates(): any | null {
    return this._getCachedData(this.cache.deviceStates);
  }

  /**
   * Generic method to get cached data if it's still fresh
   */
  private _getCachedData<T>(cache: CachedData<T>): T | null {
    if (!cache.data || cache.error) {
      return null;
    }

    const age = Date.now() - cache.timestamp;
    if (age > this.CACHE_TTL) {
      return null; // Data is stale
    }

    return cache.data;
  }

  /**
   * Check if specific data type is currently loading
   */
  isLoading(dataType: keyof BackgroundDataCache): boolean {
    return this.cache[dataType].isLoading;
  }

  /**
   * Force refresh of specific data type
   */
  async refresh(dataType: keyof BackgroundDataCache): Promise<void> {
    switch (dataType) {
      case 'cameras':
        return this._prefetchCameras();
      case 'thermostat':
        return this._prefetchThermostat();
      case 'alarmState':
        return this._prefetchAlarmState();
      case 'deviceStates':
        return this._prefetchDeviceStates();
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    Object.keys(this.cache).forEach(key => {
      const cacheKey = key as keyof BackgroundDataCache;
      this.cache[cacheKey] = { 
        data: null, 
        timestamp: 0, 
        isLoading: false, 
        error: null 
      };
    });
    logger.debug('[BackgroundDataService] Cache cleared');
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus() {
    return {
      initialized: this.initialized,
      cache: Object.keys(this.cache).reduce((status, key) => {
        const cacheKey = key as keyof BackgroundDataCache;
        const cache = this.cache[cacheKey];
        status[cacheKey] = {
          hasData: !!cache.data,
          age: cache.timestamp ? Date.now() - cache.timestamp : 0,
          isLoading: cache.isLoading,
          hasError: !!cache.error
        };
        return status;
      }, {} as any)
    };
  }
}

// Create singleton instance
const backgroundDataService = new BackgroundDataService();

export default backgroundDataService;
export type { BackgroundDataCache };