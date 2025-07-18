import React, { useRef, useEffect, useState, forwardRef } from 'react';
import Hls from 'hls.js';

export interface CasaCameraConfig {
  streamId: string;
  streamPath: string;
  startCommand: string;
  stopCommand: string;
  displayName: string;
}

interface CasaCameraCardProps {
  config?: CasaCameraConfig;
}

const CasaCameraCard = forwardRef<HTMLDivElement, CasaCameraCardProps>(({ config }, ref) => {
  // Default to main casa camera config if none provided
  const defaultConfig: CasaCameraConfig = {
    streamId: 'camera_main',
    streamPath: 'live-stream',
    startCommand: 'start_live_stream',
    stopCommand: 'stop_live_stream',
    displayName: 'Casa Camera'
  };

  const finalConfig = { ...defaultConfig, ...config };

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const retryCount = useRef<number>(0);
  const maxRetryCount = 10;
  const retryInterval = 200;
  const wsReconnectDelay = 500;

  const runId = useRef(Date.now());
  const [isLoading, setIsLoading] = useState(true);

  // Forward the ref
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(containerRef.current);
      } else {
        ref.current = containerRef.current;
      }
    }
  }, [ref]);

  const loadHlsStream = () => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      console.error('Video element not found');
      return;
    }

    // Use the same URL structure as main branch with runId-based directories
    const streamUrl = `https://casa-cameras-data.s3.amazonaws.com/${finalConfig.streamPath}/${runId.current}/stream.m3u8`;
    console.log(`Loading ${finalConfig.displayName} stream from: ${streamUrl}`);

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDuration: 0.3,
        liveMaxLatencyDuration: 0.7,
        maxLiveSyncPlaybackRate: 1.2,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoElement.play().then(() => {
          setIsLoading(false);
          console.log(`${finalConfig.displayName} stream started`);
        }).catch((error) => {
          console.error(`Error playing ${finalConfig.displayName} video:`, error);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error(`HLS Fatal Error for ${finalConfig.displayName}:`, data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error(`Fatal network error for ${finalConfig.displayName}, trying to recover...`);
              retryHlsLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error(`Fatal media error for ${finalConfig.displayName}, trying to recover...`);
              hls.recoverMediaError();
              break;
            default:
              console.error(`Unrecoverable error for ${finalConfig.displayName}:`, data);
              retryHlsLoad();
              break;
          }
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = streamUrl;
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement.play().then(() => {
          setIsLoading(false);
        }).catch((error) => {
          console.error(`Error playing ${finalConfig.displayName} video:`, error);
        });
      });
    } else {
      console.error('This browser does not support HLS');
    }
  };

  const retryHlsLoad = () => {
    if (retryCount.current >= maxRetryCount) {
      console.error(`Max retry attempts (${maxRetryCount}) reached for ${finalConfig.displayName}. Unable to load stream.`);
      return;
    }

    if (retryTimeout.current) {
      window.clearTimeout(retryTimeout.current);
    }

    console.info(`Retrying ${finalConfig.displayName} HLS load, attempt ${retryCount.current + 1}/${maxRetryCount}...`);

    retryTimeout.current = window.setTimeout(() => {
      retryCount.current += 1;
      loadHlsStream();
    }, retryInterval);
  };

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log(`WebSocket is already open for ${finalConfig.displayName}`);
      return;
    }

    const ws = new WebSocket('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`WebSocket connection opened for ${finalConfig.displayName}`);
      retryCount.current = 0;
      // Use the same message structure as main branch
      ws.send(JSON.stringify({ 
        action: finalConfig.startCommand, 
        runId: runId.current
      }));
    };

    ws.onclose = () => {
      console.log(`WebSocket connection closed for ${finalConfig.displayName}`);
      if (retryCount.current < maxRetryCount) {
        retryCount.current += 1;
        console.log(`Reconnecting ${finalConfig.displayName} WebSocket, attempt ${retryCount.current}`);
        setTimeout(connectWebSocket, wsReconnectDelay);
      } else {
        console.error(`Max WebSocket reconnection attempts reached for ${finalConfig.displayName}.`);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${finalConfig.displayName}:`, error);
      ws.close();
    };
  };

  useEffect(() => {
    console.log(`Initializing ${finalConfig.displayName} stream...`);
    connectWebSocket();
    setTimeout(loadHlsStream, 2000); // Give WebSocket command time to process

    return () => {
      console.log(`Cleaning up ${finalConfig.displayName} stream...`);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          action: finalConfig.stopCommand, 
          runId: runId.current
        }));
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (hlsRef.current) hlsRef.current.destroy();
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
      retryCount.current = 0;
    };
  }, [finalConfig.streamId]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/80 z-10 rounded-xl">
          <div className="text-white text-sm flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            <span>Loading stream...</span>
          </div>
        </div>
      )}
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover rounded-xl"
        controls 
        autoPlay 
        muted 
        playsInline
      />
    </div>
  );
});

CasaCameraCard.displayName = 'CasaCameraCard';

export default CasaCameraCard;
