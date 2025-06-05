import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';

const LiveStream: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeout = useRef<number | null>(null);
  const retryCount = useRef<number>(0);
  const maxRetryCount = 10; // Retry up to 10 times
  const retryInterval = 200; // Reduced from 500ms for faster retries
  const wsReconnectDelay = 500; // Reduced from 1000ms for faster reconnection

  const runId = useRef(Date.now()); // Unique ID for each live stream run
  const [isLoading, setIsLoading] = useState(true);

  const loadHlsStream = () => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      console.error('Video element not found');
      return;
    }

    const streamUrl = `https://casa-cameras-data.s3.amazonaws.com/live-stream/${runId.current}/stream.m3u8`;

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
          setIsLoading(false); // Video started playing
        }).catch((error) => {
          console.error('Error playing video:', error);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error('HLS Fatal Error', data);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Fatal network error encountered, trying to recover...');
              retryHlsLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Fatal media error encountered, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Unrecoverable error:', data);
              retryHlsLoad();
              break;
          }
        }
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.src = streamUrl;
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement.play().then(() => {
          setIsLoading(false); // Video started playing
        }).catch((error) => {
          console.error('Error playing video:', error);
        });
      });
    } else {
      console.error('This browser does not support HLS');
    }
  };

  const retryHlsLoad = () => {
    if (retryCount.current >= maxRetryCount) {
      console.error(`Max retry attempts (${maxRetryCount}) reached. Unable to load stream.`);
      return;
    }

    if (retryTimeout.current) {
      window.clearTimeout(retryTimeout.current);
    }

    console.info(`Retrying HLS load, attempt ${retryCount.current + 1}/${maxRetryCount}...`);

    retryTimeout.current = window.setTimeout(() => {
      retryCount.current += 1;
      loadHlsStream();
    }, retryInterval);
  };

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket is already open');
      return;
    }

    const ws = new WebSocket('wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection opened');
      retryCount.current = 0; // Reset retry count on successful connection
      ws.send(JSON.stringify({ action: 'start_live_stream', runId: runId.current }));
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      if (retryCount.current < maxRetryCount) {
        retryCount.current += 1;
        console.log(`Reconnecting WebSocket, attempt ${retryCount.current}`);
        setTimeout(connectWebSocket, wsReconnectDelay); // Delay before retrying
      } else {
        console.error('Max WebSocket reconnection attempts reached.');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close(); // Trigger onclose to handle reconnection
    };
  };

  useEffect(() => {
    // Start WebSocket and HLS loading in parallel for faster startup
    connectWebSocket();
    loadHlsStream();

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'stop_live_stream', runId: runId.current }));
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (hlsRef.current) hlsRef.current.destroy();
      if (retryTimeout.current) window.clearTimeout(retryTimeout.current);
      retryCount.current = 0; // Reset retry count on unmount
    };
  }, []);

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-10 rounded">
          <div className="text-white text-sm flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Loading stream...
          </div>
        </div>
      )}
      <video ref={videoRef} controls autoPlay muted playsInline></video>
    </div>
  );
};

export default LiveStream;
