import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { logger } from './utils/Logger';
import type { CameraDevice } from './components/CameraPage';

export type CameraCardProps = {
  camera: CameraDevice;
};

const CameraCard = forwardRef<HTMLDivElement, CameraCardProps>(({ camera }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

  const mediaSessionIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const renewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraNameRef = useRef(camera.name);
  const maxRetries = 400;
  const [isLoading, setIsLoading] = useState(true);

  const localOfferOptions = {
    offerToReceiveVideo: true,
    offerToReceiveAudio: true,
  };

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
                getLiveStream();
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
    async (retryAttempt = 0) => {
      logger.debug(`[getLiveStream] Attempt ${retryAttempt + 1}/${maxRetries}`);
      if (retryAttempt >= maxRetries) {
        logger.error('[getLiveStream] Max retries reached.');
        setIsLoading(false);
        return;
      }

      // Show loading on first attempt
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
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
              // Increase the pause on 500
              logger.warn(`[Extend] 500 error, backoff... Attempt ${retryAttempt + 1}`);
              setTimeout(() => {
                getLiveStream(retryAttempt + 1);
              }, 2000 * Math.pow(2, retryAttempt));
            } else if (response.status === 404 || response.status === 410) {
              logger.warn('[Extend] Session expired. Starting new session.');
              mediaSessionIdRef.current = null;
              getLiveStream();
            } else {
              logger.warn(`[Extend] Non-500 error. Attempt ${retryAttempt + 1}`);
              setTimeout(() => {
                getLiveStream(retryAttempt + 1);
              }, Math.min(200 * Math.pow(2, retryAttempt), 2000));
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
              getLiveStream(retryAttempt + 1);
            }, Math.min(200 * Math.pow(2, retryAttempt), 2000));
            return;
          }

          const response = await fetch(
            'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/camera/command',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
              getLiveStream(retryAttempt + 1);
            }, Math.min(200 * Math.pow(2, retryAttempt), 2000));
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
              getLiveStream(retryAttempt + 1);
            }, Math.min(200 * Math.pow(2, retryAttempt), 2000));
          }
        }
      } catch (error) {
        logger.error('[getLiveStream] Error:', error);
        setTimeout(() => {
          getLiveStream(retryAttempt + 1);
        }, Math.min(200 * Math.pow(2, retryAttempt), 2000));
      }
    },
    [createOffer, initializePeerConnection, scheduleRenewal]
  );

  useEffect(() => {
    initializePeerConnection();
    getLiveStream();

    return () => {
      if (renewalTimerRef.current) {
        clearTimeout(renewalTimerRef.current);
        renewalTimerRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [getLiveStream, initializePeerConnection]);

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
