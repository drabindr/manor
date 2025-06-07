import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocketService from '../WebSocketService';

// Mock WebSocket with static constants
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  }
}

// Mock document.hidden
Object.defineProperty(document, 'hidden', {
  writable: true,
  value: false,
});

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    // Mock WebSocket constructor
    vi.stubGlobal('WebSocket', MockWebSocket);
    
    // Reset document.hidden
    (document as any).hidden = false;
    
    service = new WebSocketService('ws://test.com', 'test-home');
  });

  afterEach(() => {
    if (service) {
      service.disconnect();
    }
    vi.restoreAllMocks();
  });

  describe('Basic functionality', () => {
    it('should create service with correct URL and home ID', () => {
      expect(service.getUrl()).toBe('ws://test.com');
      expect(service.getHomeId()).toBe('test-home');
    });

    it('should start not online', () => {
      expect(service.isOnline()).toBe(false);
    });

    it('should be able to connect', async () => {
      service.connect();
      
      // Wait for async connection
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(service.isOnline()).toBe(true);
    });

    it('should be able to disconnect', async () => {
      service.connect();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      service.disconnect();
      expect(service.isOnline()).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it.skip('should dispatch events on connect', async () => {
      const eventPromise = new Promise((resolve) => {
        const eventListener = (event: any) => {
          if (event.detail.type === 'websocket-connected') {
            document.removeEventListener('event', eventListener);
            resolve(event);
          }
        };
        document.addEventListener('event', eventListener);
      });
      
      service.connect();
      
      const event = await eventPromise;
      expect(event).toBeDefined();
    });
  });

  describe('Command Management', () => {
    it('should send commands when connected', async () => {
      service.connect();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const commandId = service.sendCommand('GetSystemState');
      expect(commandId).toBeDefined();
      expect(typeof commandId).toBe('string');
    });
  });
});