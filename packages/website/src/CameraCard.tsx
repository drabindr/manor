import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { logger } from './utils/Logger';
import { performance } from './utils/performance';
import type { CameraDevice } from './components/CameraPage';

export type CameraCardProps = {
  camera: CameraDevice;
  priority?: number; // Lower numbers = higher priority, default 0
};

const CameraCard = forwardRef<HTMLDivElement, CameraCardProps>(({ camera, priority = 0 }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

  const mediaSessionIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const renewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraNameRef = useRef(camera.name);
  const maxFastRetries = 5; // Fast initial retry attempts for quick failure detection
  const [isLoading, setIsLoading] = useState(true);
  const backgroundRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBackgroundRetryingRef = useRef(false);

  const localOfferOptions = {
    offerToReceiveVideo: true,
    offerToReceiveAudio: true,
  };

  // Optimized fetch configuration for better performance
  const createOptimizedFetchConfig = () => {
    const config: RequestInit = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      },
      keepalive: true
    };

    // Add timeout support if available
    try {
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        config.signal = AbortSignal.timeout(8000); // 8 second timeout
      }
    } catch (e) {
      // Fallback for browsers without AbortSignal.timeout
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      config.signal = controller.signal;
    }

    return config;
  };

  // Background retry function for continued attempts after fast retries fail
  const startBackgroundRetry = useCallback(() => {
    if (isBackgroundRetryingRef.current) return; // Already retrying in background
    
    isBackgroundRetryingRef.current = true;
    logger.debug('[startBackgroundRetry] Switching to background retry mode');
    
    const backgroundRetry = () => {
      if (!isBackgroundRetryingRef.current) return;
      
      logger.debug('[backgroundRetry] Attempting to reload camera stream');
      getLiveStream(0, true); // Reset retry count, mark as background retry
      
      // Schedule next background retry in 45 seconds
      backgroundRetryTimerRef.current = setTimeout(backgroundRetry, 45000);
    };
    
    // Start first background retry in 30 seconds
    backgroundRetryTimerRef.current = setTimeout(backgroundRetry, 30000);
  }, []);

  const stopBackgroundRetry = useCallback(() => {
    if (backgroundRetryTimerRef.current) {
      clearTimeout(backgroundRetryTimerRef.current);
      backgroundRetryTimerRef.current = null;
    }
    isBackgroundRetryingRef.current = false;
  }, []);

  // Guard to avoid spamming re-initialization
  const isReinitScheduledRef = useRef(false);

  const initializePeerConnection = useCallback(() => {
    if (!pcRef.current) {
      logger.debug('[initializePeerConnection] Creating RTCPeerConnection');

      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = peerConnection;

      peerConnection.createDataChannel('dataChannel');
      peerConnection.addTransceiver('audio', { direction: 'recvonly' });
      peerConnection.addTransceiver('video', { direction: 'recvonly' });

      peerConnection.ontrack = (event) => {
        if (videoRef.current) {
          logger.debug('[ontrack] Received remote track');
          videoRef.current.srcObject = event.streams[0];
          setIsLoading(false); // Video is now loading/playing
          
          // Track successful camera load when video starts playing
          const videoElement = videoRef.current;
          const handleCanPlay = () => {
            performance.cameraMetrics.endCameraLoad(camera.name, true);
            videoElement.removeEventListener('canplay', handleCanPlay);
            // Stop background retrying since camera is now working
            stopBackgroundRetry();
          };
          videoElement.addEventListener('canplay', handleCanPlay);
        }
      };

      // PeerConnection state
      peerConnection.onconnectionstatechange = () => {
        logger.debug('[PeerConnection state]:', peerConnection.connectionState);

        // If you want to forcibly re-init on certain states:
        if (
          peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed'
        ) {
          logger.warn('[PeerConnection] State is disconnected or failed.');
          if (!isReinitScheduledRef.current) {
            isReinitScheduledRef.current = true;
            setTimeout(() => {
              // Double-check state
              if (
                pcRef.current &&
                ['disconnected', 'failed'].includes(pcRef.current.connectionState)
              ) {
                logger.debug('[PeerConnection] Re-initializing after delay...');
                pcRef.current.close();
                pcRef.current = null;
                // Force new stream
                mediaSessionIdRef.current = null;
                getLiveStream(0, false); // Reset attempt count, not a background retry
              }
              isReinitScheduledRef.current = false;
            }, 2000); // wait 2s instead of 5s for faster recovery
          }
        }
      };

      // ICE connection state
      peerConnection.oniceconnectionstatechange = () => {
        logger.debug('[ICE Connection State]:', peerConnection.iceConnectionState);
        // Some additional handling if needed
      };
    }
  }, []);

  const createOffer = useCallback(async (): Promise<string | null> => {
    if (!pcRef.current) {
      logger.error('[createOffer] No RTCPeerConnection available');
      return null;
    }
    try {
      const offer = await pcRef.current.createOffer(localOfferOptions);
      await pcRef.current.setLocalDescription(offer);
      return offer.sdp || null;
    } catch (error) {
      logger.error('[createOffer] Error creating offer:', error);
      return null;
    }
  }, []);

  const scheduleRenewal = useCallback(
    (expiresAt: string) => {
      const expiresAtTime = new Date(expiresAt).getTime();
      const now = Date.now();
      const timeUntilExpiration = expiresAtTime - now;
      // Renew 30s before
      const renewalTime = timeUntilExpiration - 30000;

      if (renewalTimerRef.current) {
        clearTimeout(renewalTimerRef.current);
      }

      if (renewalTime <= 0) {
        logger.warn('[scheduleRenewal] Renewal time <= 0, renewing immediately');
        getLiveStream();
        return;
      }

      renewalTimerRef.current = setTimeout(() => {
        logger.debug('[scheduleRenewal] Renewing stream before expiration');
        getLiveStream();
      }, renewalTime);
    },
    []
  );

  const getLiveStream = useCallback(
    async (retryAttempt = 0, isBackgroundRetry = false) => {
      const currentMaxRetries = isBackgroundRetry ? 1 : maxFastRetries; // Background retries only try once
      logger.debug(`[getLiveStream] Attempt ${retryAttempt + 1}/${currentMaxRetries}${isBackgroundRetry ? ' (background)' : ''}`);
      
      if (retryAttempt >= currentMaxRetries) {
        if (isBackgroundRetry) {
          // Background retry failed, just return (next background retry will happen in 45s)
          logger.debug('[getLiveStream] Background retry failed, will try again later');
          return;
        } else {
          // Fast retries exhausted, switch to background retry mode
          logger.warn('[getLiveStream] Fast retries exhausted, switching to background retry mode');
          setIsLoading(false);
          // Track failed camera load for initial attempts
          performance.cameraMetrics.endCameraLoad(camera.name, false);
          startBackgroundRetry();
          return;
        }
      }

      // Show loading on first attempt or when background retry succeeds in re-establishing
      if (retryAttempt === 0) {
        setIsLoading(true);
      }

      initializePeerConnection();

      try {
        let expiresAt: string | undefined;

        if (mediaSessionIdRef.current) {
          // Extend existing stream
          const response = await fetch(
            'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/camera/command',
            {
              ...createOptimizedFetchConfig(),
              body: JSON.stringify({
                data: {
                  deviceId: cameraNameRef.current,
                  command: 'sdm.devices.commands.CameraLiveStream.ExtendWebRtcStream',
                  params: { mediaSessionId: mediaSessionIdRef.current },
                },
              }),
            }
          );

          if (!response.ok) {
            logger.error(`[Extend] Error ${response.status}: ${response.statusText}`);
            if (response.status === 500) {
              // Server error - use exponential backoff but cap at 5 seconds
              logger.warn(`[Extend] 500 error, backoff... Attempt ${retryAttempt + 1}`);
              setTimeout(() => {
                getLiveStream(retryAttempt + 1, isBackgroundRetry);
              }, Math.min(1000 * Math.pow(2, retryAttempt), 5000));
            } else if (response.status === 404 || response.status === 410) {
              logger.warn('[Extend] Session expired. Starting new session.');
              mediaSessionIdRef.current = null;
              getLiveStream(0, isBackgroundRetry);
            } else {
              logger.warn(`[Extend] Non-500 error. Attempt ${retryAttempt + 1}`);
              setTimeout(() => {
                getLiveStream(retryAttempt + 1, isBackgroundRetry);
              }, Math.min(500 * Math.pow(1.5, retryAttempt), 3000)); // Gentler backoff for other errors
            }
            return;
          }

          const data = await response.json();
          expiresAt = data.results?.expiresAt;
          if (expiresAt) {
            scheduleRenewal(expiresAt);
          } else {
            logger.error('[Extend] No expiresAt in response');
          }
        } else {
          // Generate new stream
          if (!pcRef.current) return;

          const offerSdp = await createOffer();
          if (!offerSdp) {
            logger.warn(`[Generate] Offer SDP invalid. Attempt ${retryAttempt + 1}`);
            setTimeout(() => {
              getLiveStream(retryAttempt + 1, isBackgroundRetry);
            }, Math.min(500 * Math.pow(1.5, retryAttempt), 3000)); // Gentler backoff
            return;
          }

          const response = await fetch(
            'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/camera/command',
            {
              ...createOptimizedFetchConfig(),
              body: JSON.stringify({
                data: {
                  deviceId: cameraNameRef.current,
                  command: 'sdm.devices.commands.CameraLiveStream.GenerateWebRtcStream',
                  params: { offerSdp },
                },
              }),
            }
          );

          if (!response.ok) {
            logger.error(`[Generate] Error ${response.status}: ${response.statusText}`);
            setTimeout(() => {
              getLiveStream(retryAttempt + 1, isBackgroundRetry);
            }, Math.min(500 * Math.pow(1.5, retryAttempt), 3000)); // Gentler backoff
            return;
          }

          const data = await response.json();
          const answerSdp = data.results?.answerSdp;
          const sessionId = data.results?.mediaSessionId;
          expiresAt = data.results?.expiresAt;

          if (answerSdp && sessionId) {
            mediaSessionIdRef.current = sessionId;
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
            );
            if (expiresAt) {
              scheduleRenewal(expiresAt);
            } else {
              logger.error('[Generate] No expiresAt in response');
            }
          } else {
            logger.error('[Generate] Missing answerSdp or mediaSessionId');
            setTimeout(() => {
              getLiveStream(retryAttempt + 1, isBackgroundRetry);
            }, Math.min(500 * Math.pow(1.5, retryAttempt), 3000)); // Gentler backoff
          }
        }
      } catch (error) {
        logger.error('[getLiveStream] Error:', error);
        // More aggressive retry for network errors, but with reasonable cap
        setTimeout(() => {
          getLiveStream(retryAttempt + 1, isBackgroundRetry);
        }, Math.min(500 * Math.pow(1.5, retryAttempt), 3000));
      }
    },
    [createOffer, initializePeerConnection, scheduleRenewal, startBackgroundRetry]
  );

  useEffect(() => {
    // Implement priority-based loading: high priority cameras load immediately,
    // lower priority cameras are staggered to reduce initial network congestion
    const loadDelay = priority * 800; // 800ms delay per priority level
    
    const initTimer = setTimeout(() => {
      // Start performance tracking
      performance.cameraMetrics.startCameraLoad(camera.name);
      
      initializePeerConnection();
      getLiveStream(0, false); // Start with initial attempt
    }, loadDelay);

    return () => {
      clearTimeout(initTimer);
      stopBackgroundRetry(); // Clean up background retry timer
      if (renewalTimerRef.current) {
        clearTimeout(renewalTimerRef.current);
        renewalTimerRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [getLiveStream, initializePeerConnection, priority, stopBackgroundRetry]);

  return (
    <div
      ref={containerRef}
      className='bg-gray-900 border border-gray-700 rounded-lg overflow-hidden relative'
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-10">
          <div className="text-white text-sm flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Loading camera...
          </div>
        </div>
      )}
      <video
        ref={(el) => (videoRef.current = el)}
        autoPlay
        playsInline
        muted
        controls
        className='w-full h-full object-cover'
      ></video>
    </div>
  );
});

export default CameraCard;
