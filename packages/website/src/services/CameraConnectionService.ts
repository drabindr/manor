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

class CameraConnectionService {
  private nestCameraConnections = new Map<string, CameraConnectionState>();
  private casaCameraConnection: CasaCameraConnectionState | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the camera connection service early in the page load cycle
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return this.initPromise || Promise.resolve();
    }

    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private async _performInit(): Promise<void> {
    try {
      logger.info('[CameraConnectionService] Initializing early camera connections');
      
      // Start Casa camera connection immediately
      this._preConnectCasaCamera();
      
      // Get camera list and start pre-connecting to Nest cameras
      this._preloadNestCameras();
      
      this.initialized = true;
      logger.info('[CameraConnectionService] Early camera connections initialized');
    } catch (error) {
      logger.error('[CameraConnectionService] Failed to initialize:', error);
    }
  }

  /**
   * Pre-establish Casa camera WebSocket connection
   */
  private _preConnectCasaCamera(): void {
    const runId = Date.now();
    this.casaCameraConnection = {
      isConnecting: true,
      isConnected: false,
      runId,
    };

    try {
      const ws = new WebSocket('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
      
      ws.onopen = () => {
        logger.info('[CameraConnectionService] Casa camera WebSocket pre-connected');
        if (this.casaCameraConnection) {
          this.casaCameraConnection.isConnecting = false;
          this.casaCameraConnection.isConnected = true;
          this.casaCameraConnection.websocket = ws;
          
          // Start the live stream immediately
          ws.send(JSON.stringify({ action: 'start_live_stream', runId }));
        }
      };

      ws.onclose = () => {
        logger.info('[CameraConnectionService] Casa camera WebSocket pre-connection closed');
        if (this.casaCameraConnection) {
          this.casaCameraConnection.isConnected = false;
          this.casaCameraConnection.websocket = undefined;
        }
      };

      ws.onerror = (error) => {
        logger.error('[CameraConnectionService] Casa camera WebSocket pre-connection error:', error);
        if (this.casaCameraConnection) {
          this.casaCameraConnection.isConnecting = false;
          this.casaCameraConnection.error = 'WebSocket connection failed';
        }
      };

    } catch (error) {
      logger.error('[CameraConnectionService] Failed to pre-connect Casa camera:', error);
      if (this.casaCameraConnection) {
        this.casaCameraConnection.isConnecting = false;
        this.casaCameraConnection.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
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
      
      // Pre-create a few RTCPeerConnection instances for faster camera loading
      for (let i = 0; i < 3; i++) {
        this._createPreConnection(`pre-connection-${i}`);
      }
    } catch (error) {
      logger.error('[CameraConnectionService] Failed to preload Nest cameras:', error);
    }
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

      const state: CameraConnectionState = {
        isConnecting: false,
        isConnected: false,
        connection,
      };

      this.nestCameraConnections.set(connectionId, state);
      logger.debug(`[CameraConnectionService] Pre-connection ${connectionId} created`);
    } catch (error) {
      logger.error(`[CameraConnectionService] Failed to create pre-connection ${connectionId}:`, error);
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

      // Make the API call to start the stream
      const response = await fetch(
        'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/camera/command',
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
        }
      );

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
        
        logger.info(`[CameraConnectionService] Stream started for camera ${cameraName}`);
      } else {
        throw new Error('Invalid response from camera API');
      }
    } catch (error) {
      state.isConnecting = false;
      state.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[CameraConnectionService] Failed to start stream for ${cameraName}:`, error);
      throw error;
    }
  }

  /**
   * Clean up connections when no longer needed
   */
  cleanup(): void {
    logger.info('[CameraConnectionService] Cleaning up connections');
    
    // Clean up Nest camera connections
    for (const [cameraName, state] of this.nestCameraConnections.entries()) {
      if (state.connection) {
        state.connection.close();
      }
    }
    this.nestCameraConnections.clear();

    // Clean up Casa camera connection
    if (this.casaCameraConnection?.websocket) {
      this.casaCameraConnection.websocket.close();
    }
    this.casaCameraConnection = null;

    this.initialized = false;
    this.initPromise = null;
  }
}

// Create singleton instance
const cameraConnectionService = new CameraConnectionService();

export default cameraConnectionService;