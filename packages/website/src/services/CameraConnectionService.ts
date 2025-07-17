import { logger } from '../utils/Logger';

export interface CameraConnectionState {
  isConnecting: boolean;
  isConnected: boolean;
  connection?: RTCPeerConnection;
  stream?: MediaStream;
  error?: string;
  sessionId?: string;
  expiresAt?: string;
}

export interface CasaCameraConnectionState {
  isConnecting: boolean;
  isConnected: boolean;
  websocket?: WebSocket;
  runId: number;
  error?: string;
}

export interface DoorbellCameraConnectionState {
  isConnecting: boolean;
  isConnected: boolean;
  websocket?: WebSocket;
  runId: number;
  error?: string;
}

class CameraConnectionService {
  private nestCameraConnections = new Map<string, CameraConnectionState>();
  private casaCameraConnection: CasaCameraConnectionState | null = null;
  private doorbellCameraConnection: DoorbellCameraConnectionState | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private cleanupScheduled = false;
  private readonly maxPreConnections = 3;
  private readonly connectionTimeout = 15000; // 15 seconds
  private readonly initMutex = new Set<string>(); // Prevent concurrent init calls

  /**
   * Initialize the camera connection service early in the page load cycle
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return this.initPromise || Promise.resolve();
    }

    // Prevent concurrent initialization attempts
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private async _performInit(): Promise<void> {
    const initId = `init-${Date.now()}`;
    
    // Check if initialization is already in progress
    if (this.initMutex.has(initId) || this.initMutex.size > 0) {
      logger.warn('[CameraConnectionService] Initialization already in progress');
      return;
    }

    this.initMutex.add(initId);

    try {
      logger.info('[CameraConnectionService] Initializing early camera connections');
      
      // Start Casa camera connection immediately
      await this._preConnectCasaCamera();
      
      // Start doorbell camera connection
      await this._preConnectDoorbellCamera();
      
      // Get camera list and start pre-connecting to Nest cameras
      await this._preloadNestCameras();
      
      this.initialized = true;
      logger.info('[CameraConnectionService] Early camera connections initialized');
    } catch (error) {
      logger.error('[CameraConnectionService] Failed to initialize:', error);
      // Reset state on failure to allow retry
      this.initialized = false;
      this.initPromise = null;
      throw error;
    } finally {
      this.initMutex.delete(initId);
    }
  }

  /**
   * Pre-establish Casa camera WebSocket connection
   */
  private async _preConnectCasaCamera(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const runId = Date.now();
      this.casaCameraConnection = {
        isConnecting: true,
        isConnected: false,
        runId,
      };

      let connectionTimeout: NodeJS.Timeout | undefined;

      try {
        const ws = new WebSocket('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
        
        // Set connection timeout
        connectionTimeout = setTimeout(() => {
          logger.warn('[CameraConnectionService] Casa camera WebSocket connection timeout');
          ws.close();
          if (this.casaCameraConnection) {
            this.casaCameraConnection.isConnecting = false;
            this.casaCameraConnection.error = 'Connection timeout';
          }
          resolve(); // Don't reject on timeout, just resolve to continue
        }, this.connectionTimeout);
        
        ws.onopen = () => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          logger.info('[CameraConnectionService] Casa camera WebSocket pre-connected');
          if (this.casaCameraConnection) {
            this.casaCameraConnection.isConnecting = false;
            this.casaCameraConnection.isConnected = true;
            this.casaCameraConnection.websocket = ws;
            
            // Start the live stream immediately
            try {
              ws.send(JSON.stringify({ action: 'start_live_stream', runId }));
            } catch (sendError) {
              logger.error('[CameraConnectionService] Failed to send stream start command:', sendError);
            }
          }
          resolve();
        };

        ws.onclose = () => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          logger.info('[CameraConnectionService] Casa camera WebSocket pre-connection closed');
          if (this.casaCameraConnection) {
            this.casaCameraConnection.isConnected = false;
            this.casaCameraConnection.websocket = undefined;
          }
          resolve(); // Don't treat close as error during initialization
        };

        ws.onerror = (error) => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          logger.error('[CameraConnectionService] Casa camera WebSocket pre-connection error:', error);
          if (this.casaCameraConnection) {
            this.casaCameraConnection.isConnecting = false;
            this.casaCameraConnection.error = 'WebSocket connection failed';
          }
          resolve(); // Don't reject on error, just continue with degraded functionality
        };

      } catch (error) {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        logger.error('[CameraConnectionService] Failed to pre-connect Casa camera:', error);
        if (this.casaCameraConnection) {
          this.casaCameraConnection.isConnecting = false;
          this.casaCameraConnection.error = error instanceof Error ? error.message : 'Unknown error';
        }
        resolve(); // Don't reject on error, just continue with degraded functionality
      }
    });
  }

  /**
   * Pre-establish Doorbell camera WebSocket connection
   */
  private async _preConnectDoorbellCamera(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const runId = Date.now();
      this.doorbellCameraConnection = {
        isConnecting: true,
        isConnected: false,
        runId,
      };

      let connectionTimeout: NodeJS.Timeout | undefined;

      try {
        const ws = new WebSocket('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
        
        // Set connection timeout
        connectionTimeout = setTimeout(() => {
          logger.warn('[CameraConnectionService] Doorbell camera WebSocket connection timeout');
          ws.close();
          if (this.doorbellCameraConnection) {
            this.doorbellCameraConnection.isConnecting = false;
            this.doorbellCameraConnection.error = 'Connection timeout';
          }
          resolve(); // Don't reject on timeout, just resolve to continue
        }, this.connectionTimeout);
        
        ws.onopen = () => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          logger.info('[CameraConnectionService] Doorbell camera WebSocket pre-connected');
          if (this.doorbellCameraConnection) {
            this.doorbellCameraConnection.isConnecting = false;
            this.doorbellCameraConnection.isConnected = true;
            this.doorbellCameraConnection.websocket = ws;
            
            // Start the doorbell stream immediately
            try {
              ws.send(JSON.stringify({ action: 'start_doorbell_stream', runId }));
            } catch (sendError) {
              logger.error('[CameraConnectionService] Failed to send doorbell stream start command:', sendError);
            }
          }
          resolve();
        };

        ws.onclose = () => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          logger.info('[CameraConnectionService] Doorbell camera WebSocket pre-connection closed');
          if (this.doorbellCameraConnection) {
            this.doorbellCameraConnection.isConnected = false;
            this.doorbellCameraConnection.websocket = undefined;
          }
          resolve(); // Don't treat close as error during initialization
        };

        ws.onerror = (error) => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
          logger.error('[CameraConnectionService] Doorbell camera WebSocket pre-connection error:', error);
          if (this.doorbellCameraConnection) {
            this.doorbellCameraConnection.isConnecting = false;
            this.doorbellCameraConnection.error = 'WebSocket connection failed';
          }
          resolve(); // Don't reject on error, just continue with degraded functionality
        };

      } catch (error) {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        logger.error('[CameraConnectionService] Failed to pre-connect Doorbell camera:', error);
        if (this.doorbellCameraConnection) {
          this.doorbellCameraConnection.isConnecting = false;
          this.doorbellCameraConnection.error = error instanceof Error ? error.message : 'Unknown error';
        }
        resolve(); // Don't reject on error, just continue with degraded functionality
      }
    });
  }

  /**
   * Pre-load camera list and establish basic connections
   */
  private async _preloadNestCameras(): Promise<void> {
    try {
      // Get camera list from the API (if authenticated)
      // For now, we'll pre-initialize WebRTC connections without specific camera data
      // This can be enhanced once we have access to the camera list
      logger.info('[CameraConnectionService] Pre-initializing WebRTC connections');
      
      // Pre-create a limited number of RTCPeerConnection instances for faster camera loading
      const connectionPromises: Promise<void>[] = [];
      
      for (let i = 0; i < this.maxPreConnections; i++) {
        connectionPromises.push(this._createPreConnectionAsyncWrapper(`pre-connection-${i}`));
      }
      
      // Wait for all pre-connections to complete (or timeout)
      await Promise.allSettled(connectionPromises);
      
      logger.info(`[CameraConnectionService] Pre-initialized ${this.maxPreConnections} WebRTC connections`);
    } catch (error) {
      logger.error('[CameraConnectionService] Failed to preload Nest cameras:', error);
      // Don't throw, continue with degraded functionality
    }
  }

  /**
   * Async wrapper for creating pre-connections with timeout handling
   */
  private async _createPreConnectionAsyncWrapper(connectionId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        this._createPreConnection(connectionId);
        resolve();
      } catch (error) {
        logger.error(`[CameraConnectionService] Failed to create pre-connection ${connectionId}:`, error);
        resolve(); // Always resolve to not block other connections
      }
    });
  }

  /**
   * Create a pre-initialized RTCPeerConnection
   */
  private _createPreConnection(connectionId: string): void {
    try {
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Set up basic configuration
      connection.createDataChannel('dataChannel');
      connection.addTransceiver('audio', { direction: 'recvonly' });
      connection.addTransceiver('video', { direction: 'recvonly' });

      // Add connection state monitoring for cleanup
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
          logger.debug(`[CameraConnectionService] Pre-connection ${connectionId} state: ${connection.connectionState}`);
          // Clean up failed connections
          this.nestCameraConnections.delete(connectionId);
        }
      };

      const state: CameraConnectionState = {
        isConnecting: false,
        isConnected: false,
        connection,
      };

      this.nestCameraConnections.set(connectionId, state);
      logger.debug(`[CameraConnectionService] Pre-connection ${connectionId} created`);
    } catch (error) {
      logger.error(`[CameraConnectionService] Failed to create pre-connection ${connectionId}:`, error);
      // Don't re-throw, just log the error
    }
  }

  /**
   * Get or create a connection for a specific camera
   */
  async getOrCreateCameraConnection(cameraName: string): Promise<CameraConnectionState | null> {
    // Check if we already have a connection for this camera
    let state = this.nestCameraConnections.get(cameraName);
    
    if (!state) {
      // Try to reuse a pre-connection
      const preConnection = this._findAvailablePreConnection();
      if (preConnection) {
        // Move the pre-connection to the specific camera
        this.nestCameraConnections.delete(preConnection.id);
        state = preConnection.state;
        this.nestCameraConnections.set(cameraName, state);
        logger.debug(`[CameraConnectionService] Reusing pre-connection for ${cameraName}`);
      } else {
        // Create a new connection
        this._createPreConnection(cameraName);
        state = this.nestCameraConnections.get(cameraName);
      }
    }

    return state || null;
  }

  /**
   * Find an available pre-connection that can be reused
   */
  private _findAvailablePreConnection(): { id: string; state: CameraConnectionState } | null {
    for (const [id, state] of this.nestCameraConnections.entries()) {
      if (id.startsWith('pre-connection-') && !state.isConnecting && state.connection) {
        return { id, state };
      }
    }
    return null;
  }

  /**
   * Get Casa camera connection state
   */
  getCasaCameraConnection(): CasaCameraConnectionState | null {
    return this.casaCameraConnection;
  }

  /**
   * Get Doorbell camera connection state
   */
  getDoorbellCameraConnection(): DoorbellCameraConnectionState | null {
    return this.doorbellCameraConnection;
  }

  /**
   * Start stream for a specific camera using pre-established connection
   */
  async startCameraStream(cameraName: string): Promise<void> {
    const state = await this.getOrCreateCameraConnection(cameraName);
    if (!state || !state.connection) {
      throw new Error(`No connection available for camera ${cameraName}`);
    }

    if (state.isConnecting) {
      logger.info(`[CameraConnectionService] Camera ${cameraName} already connecting`);
      return;
    }

    state.isConnecting = true;

    // Add timeout for the entire operation
    const streamTimeout = setTimeout(() => {
      state.isConnecting = false;
      state.error = 'Stream start timeout';
      logger.error(`[CameraConnectionService] Stream start timeout for ${cameraName}`);
    }, this.connectionTimeout);

    try {
      // Create offer using the pre-established connection
      const offer = await state.connection.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      });
      
      await state.connection.setLocalDescription(offer);
      
      if (!offer.sdp) {
        throw new Error('Failed to create offer SDP');
      }

      // Make the API call to start the stream with timeout
      const controller = new AbortController();
      const apiTimeout = setTimeout(() => controller.abort(), 10000); // 10 second API timeout

      const response = await fetch(
        'https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/google/camera/command',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              deviceId: cameraName,
              command: 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream',
              params: { offerSdp: offer.sdp },
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(apiTimeout);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const answerSdp = data.results?.answerSdp;
      const sessionId = data.results?.mediaSessionId;
      const expiresAt = data.results?.expiresAt;

      if (answerSdp && sessionId) {
        await state.connection.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
        );
        
        state.sessionId = sessionId;
        state.expiresAt = expiresAt;
        state.isConnected = true;
        state.isConnecting = false;
        state.error = undefined; // Clear any previous errors
        
        logger.info(`[CameraConnectionService] Stream started for camera ${cameraName}`);
      } else {
        throw new Error('Invalid response from camera API');
      }
    } catch (error) {
      state.isConnecting = false;
      state.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[CameraConnectionService] Failed to start stream for ${cameraName}:`, error);
      throw error;
    } finally {
      clearTimeout(streamTimeout);
    }
  }

  /**
   * Clean up connections when no longer needed
   */
  cleanup(): void {
    if (this.cleanupScheduled) {
      logger.debug('[CameraConnectionService] Cleanup already in progress');
      return;
    }

    this.cleanupScheduled = true;
    logger.info('[CameraConnectionService] Cleaning up connections');
    
    try {
      // Clean up Nest camera connections
      for (const [cameraName, state] of this.nestCameraConnections.entries()) {
        if (state.connection) {
          try {
            state.connection.close();
          } catch (error) {
            logger.warn(`[CameraConnectionService] Error closing connection for ${cameraName}:`, error);
          }
        }
      }
      this.nestCameraConnections.clear();

      // Clean up Casa camera connection
      if (this.casaCameraConnection?.websocket) {
        try {
          this.casaCameraConnection.websocket.close();
        } catch (error) {
          logger.warn('[CameraConnectionService] Error closing Casa camera WebSocket:', error);
        }
      }
      this.casaCameraConnection = null;

      // Clean up Doorbell camera connection
      if (this.doorbellCameraConnection?.websocket) {
        try {
          this.doorbellCameraConnection.websocket.close();
        } catch (error) {
          logger.warn('[CameraConnectionService] Error closing Doorbell camera WebSocket:', error);
        }
      }
      this.doorbellCameraConnection = null;

      // Clear initialization state
      this.initialized = false;
      this.initPromise = null;
      this.initMutex.clear();
    } catch (error) {
      logger.error('[CameraConnectionService] Error during cleanup:', error);
    } finally {
      this.cleanupScheduled = false;
    }
  }

  /**
   * Get service status for debugging
   */
  getStatus(): { 
    initialized: boolean; 
    nestConnections: number; 
    casaConnected: boolean;
    doorbellConnected: boolean;
    initInProgress: boolean;
  } {
    return {
      initialized: this.initialized,
      nestConnections: this.nestCameraConnections.size,
      casaConnected: this.casaCameraConnection?.isConnected ?? false,
      doorbellConnected: this.doorbellCameraConnection?.isConnected ?? false,
      initInProgress: this.initMutex.size > 0
    };
  }
}

// Create singleton instance
const cameraConnectionService = new CameraConnectionService();

export default cameraConnectionService;