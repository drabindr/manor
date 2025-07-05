import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import Hls from 'hls.js';
import { logger } from './utils/Logger';
import cameraConnectionService from './services/CameraConnectionService';
import metricsService from './services/MetricsService';

const CasaCameraCard = forwardRef<HTMLDivElement>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const retryCount = useRef<number>(0);
  const maxRetryCount = 1000;
  const retryInterval = 200; // Reduced from 500ms for faster retries
  const wsReconnectDelay = 500; // Reduced from 1000ms for faster reconnection
  const runId = useRef(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  
  // Performance tracking
  const loadStartTimeRef = useRef<number | null>(null);
  const hasRecordedLoadMetric = useRef(false);

  // Start performance tracking when component mounts
  useEffect(() => {
    loadStartTimeRef.current = performance.now ? performance.now() : Date.now();
  }, []);

  // Helper function to record load completion
  const recordLoadCompletion = () => {
    if (loadStartTimeRef.current && !hasRecordedLoadMetric.current) {
      const loadTime = (performance.now ? performance.now() : Date.now()) - loadStartTimeRef.current;
      hasRecordedLoadMetric.current = true;
      
      try {
        metricsService.recordCameraLoadMetric('proprietary', 'casa-camera', loadTime);
        logger.debug(`[CasaCameraCard] Proprietary camera loaded in ${loadTime}ms`);
      } catch (error) {
        logger.debug('Failed to record proprietary camera load metric:', error);
      }
    }
  };

  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

  const resetRetryCount = () => {
    retryCount.current = 0;
  };

  function retryHlsLoad(): void {
    if (retryCount.current >= maxRetryCount) {
      logger.error(`Max retry attempts (${maxRetryCount}) reached. Unable to load stream.`);
      return;
    }

    if (retryTimeout.current) {
      window.clearTimeout(retryTimeout.current);
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    retryTimeout.current = window.setTimeout(() => {
      retryCount.current += 1;
      logger.debug(`Retrying HLS load attempt ${retryCount.current}`);
      loadHlsStream();
    }, retryInterval);
  }

  function loadHlsStream(): void {
    const videoElement = videoRef.current;
    if (!videoElement) {
      logger.error('Video element not found');
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Check if we should use the pre-established runId
    const preConnection = cameraConnectionService.getCasaCameraConnection();
    if (preConnection?.runId && preConnection.isConnected) {
      runId.current = preConnection.runId;
      logger.info('Using pre-established Casa camera stream runId:', runId.current);
    }

    const streamUrl = `https://casa-cameras-data.s3.amazonaws.com/live-stream/${runId.current}/stream.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDuration: 0.3, // Reduced for lower latency
        liveMaxLatencyDuration: 1.5, // Reduced for lower latency
        maxLiveSyncPlaybackRate: 1.5,
        lowLatencyMode: true, // Enable for better performance
        autoStartLoad: true,
        maxBufferLength: 10, // Reduced for faster start
        maxMaxBufferLength: 20, // Reduced for faster start
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoElement
          .play()
          .then(() => {
            resetRetryCount();
            setIsLoading(false); // Video started playing
            recordLoadCompletion(); // Record performance metric
          })
          .catch((error) => logger.error('Error playing video:', error));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        // Filter out 403 Forbidden errors for segment files
        const isSegmentNotFoundError = 
          data.response && 
          data.response.code === 403 && 
          data.url && 
          data.url.includes('segment_');
        
        if (!isSegmentNotFoundError) {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                logger.warn('Network error encountered. Retrying HLS load...');
                retryHlsLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                logger.warn('Media error encountered. Attempting to recover...');
                hls.recoverMediaError();
                break;
              default:
                logger.warn('Fatal error encountered. Retrying HLS load...');
                retryHlsLoad();
                break;
            }
          } else {
            // Only log non-segment errors
            if (!(data.url && data.url.includes('segment_'))) {
              logger.warn('Non-fatal HLS error encountered:', data);
            }
          }
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = streamUrl;
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement
          .play()
          .then(() => {
            resetRetryCount();
            setIsLoading(false); // Video started playing
            recordLoadCompletion(); // Record performance metric
          })
          .catch((error) => logger.error('Error playing video:', error));
      });
    } else {
      logger.error('This browser does not support HLS');
    }

    videoElement.addEventListener('pause', () => {
      if (!videoElement.ended) {
        logger.debug('Video paused. Attempting to resume playback...');
        videoElement
          .play()
          .catch((error) => logger.error('Error resuming video:', error));
      }
    });

    videoElement.addEventListener('ended', () => {
      logger.debug('Video ended. Attempting to restart playback...');
      videoElement.currentTime = 0;
      videoElement
        .play()
        .catch((error) => logger.error('Error restarting video:', error));
    });

    videoElement.addEventListener('stalled', () => {
      logger.warn('Video stalled. Attempting to recover...');
      videoElement
        .play()
        .catch((error) => {
          logger.error('Error recovering from stall:', error);
          logger.warn('Attempting full HLS reload due to stall recovery failure...');
          retryHlsLoad();
        });
    });

    videoElement.addEventListener('error', (e) => {
      logger.error('Video element error:', e);
      const vidError = videoElement.error;
      if (vidError && vidError.code === MediaError.MEDIA_ERR_ABORTED) {
        logger.warn('Media aborted error encountered. Attempting full reload of HLS stream...');
      } else {
        logger.warn('Non-abort video error encountered, retrying HLS load...');
      }
      retryHlsLoad();
    });
  }

  function connectWebSocket(): void {
    // First, try to use pre-established connection
    const preConnection = cameraConnectionService.getCasaCameraConnection();
    
    if (preConnection?.websocket && 
        preConnection.websocket.readyState === WebSocket.OPEN && 
        preConnection.isConnected) {
      logger.info('Using pre-established WebSocket connection');
      wsRef.current = preConnection.websocket;
      runId.current = preConnection.runId;
      resetRetryCount();
      // Connection is already established and stream started
      return;
    }

    // Fallback to creating new connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
    wsRef.current = ws;

    ws.onopen = () => {
      logger.info('WebSocket connection opened');
      resetRetryCount();
      ws.send(JSON.stringify({ action: 'start_live_stream', runId: runId.current }));
    };

    ws.onclose = () => {
      logger.info('WebSocket connection closed');
      if (retryCount.current < maxRetryCount) {
        retryCount.current += 1;
        logger.debug(`Retrying WebSocket connection attempt ${retryCount.current}`);
        setTimeout(connectWebSocket, wsReconnectDelay);
      } else {
        logger.error('Max WebSocket reconnection attempts reached.');
      }
    };

    ws.onerror = () => {
      logger.error('WebSocket encountered an error. Attempting to reconnect...');
      ws.close();
      setTimeout(connectWebSocket, wsReconnectDelay);
    };
  }

  useEffect(() => {
    // Start WebSocket and HLS loading in parallel for faster startup
    connectWebSocket();
    loadHlsStream();

    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);

    const currentRunId = runId.current;

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'stop_live_stream', runId: currentRunId }));
      }
      if (wsRef.current) wsRef.current.close();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
      clearInterval(pingInterval);
      resetRetryCount();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-10">
          <div className="text-white text-sm flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Loading camera...
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain bg-black"
      ></video>
    </div>
  );
});

export default CasaCameraCard;
