import cameraConnectionService from '../services/CameraConnectionService';

// Mock WebSocket and RTCPeerConnection for testing
global.WebSocket = jest.fn().mockImplementation(() => ({
  onopen: null,
  onclose: null,
  onerror: null,
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1, // OPEN
}));

global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn(),
  addTransceiver: jest.fn(),
  createOffer: jest.fn().mockResolvedValue({
    sdp: 'mock-sdp',
    setLocalDescription: jest.fn(),
  }),
  setLocalDescription: jest.fn(),
  setRemoteDescription: jest.fn(),
  close: jest.fn(),
  ontrack: null,
  onconnectionstatechange: null,
  oniceconnectionstatechange: null,
  connectionState: 'new',
  iceConnectionState: 'new',
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('CameraConnectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cameraConnectionService.cleanup();
  });

  afterEach(() => {
    cameraConnectionService.cleanup();
  });

  test('should initialize successfully', async () => {
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    
    await cameraConnectionService.init();
    
    // Check that initialization was attempted
    expect(WebSocket).toHaveBeenCalledWith('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
    
    consoleInfoSpy.mockRestore();
  });

  test('should create camera connections', async () => {
    await cameraConnectionService.init();
    
    const connection = await cameraConnectionService.getOrCreateCameraConnection('test-camera');
    
    expect(connection).toBeTruthy();
    expect(connection?.connection).toBeTruthy();
    expect(RTCPeerConnection).toHaveBeenCalled();
  });

  test('should reuse pre-connections when available', async () => {
    await cameraConnectionService.init();
    
    // Get first connection
    const connection1 = await cameraConnectionService.getOrCreateCameraConnection('camera1');
    const connection2 = await cameraConnectionService.getOrCreateCameraConnection('camera2');
    
    expect(connection1).toBeTruthy();
    expect(connection2).toBeTruthy();
    
    // Should have created multiple RTCPeerConnection instances for pre-connections
    expect(RTCPeerConnection).toHaveBeenCalledTimes(5); // 3 pre-connections + 2 specific cameras
  });

  test('should handle Casa camera connection', async () => {
    await cameraConnectionService.init();
    
    const casaConnection = cameraConnectionService.getCasaCameraConnection();
    
    expect(casaConnection).toBeTruthy();
    expect(casaConnection?.runId).toBeTruthy();
    expect(WebSocket).toHaveBeenCalled();
  });

  test('should cleanup connections properly', async () => {
    await cameraConnectionService.init();
    
    const connection = await cameraConnectionService.getOrCreateCameraConnection('test-camera');
    const casaConnection = cameraConnectionService.getCasaCameraConnection();
    
    expect(connection?.connection?.close).toBeTruthy();
    expect(casaConnection?.websocket?.close).toBeTruthy();
    
    cameraConnectionService.cleanup();
    
    // Verify cleanup was called
    expect(connection?.connection?.close).toHaveBeenCalled();
  });

  test('should handle WebSocket connection errors gracefully', async () => {
    const mockWebSocket = {
      onopen: null,
      onclose: null,
      onerror: null,
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1,
    };

    global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket);

    await cameraConnectionService.init();

    // Simulate WebSocket error
    const errorHandler = mockWebSocket.onerror;
    if (errorHandler) {
      errorHandler(new Error('Connection failed'));
    }

    const casaConnection = cameraConnectionService.getCasaCameraConnection();
    expect(casaConnection).toBeTruthy();
    // Error should be handled gracefully without crashing
  });
});