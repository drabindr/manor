import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { logger } from './utils/Logger';

const CasaCameraCard = forwardRef<HTMLDivElement>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const retryCount = useRef<number>(0);
  const maxRetryCount = 1000;
  const retryInterval = 500;
  const wsReconnectDelay = 1000;
  const runId = useRef(Date.now());

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

    const streamUrl = `https://casa-cameras-data.s3.amazonaws.com/live-stream/${runId.current}/stream.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDuration: 2,
        liveMaxLatencyDuration: 5,
        maxLiveSyncPlaybackRate: 1.5,
        lowLatencyMode: false,
        autoStartLoad: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoElement
          .play()
          .then(() => resetRetryCount())
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
          .then(() => resetRetryCount())
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
    <div ref={containerRef} className="w-full h-full bg-black">
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
