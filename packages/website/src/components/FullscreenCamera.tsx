import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { UilVideo } from '@iconscout/react-unicons';
import { CameraDevice } from './CameraPage';

interface FullscreenCameraProps {
  expandedCameraName: string | null;
  onClose: () => void;
  cameras: CameraDevice[];
  fullscreenElement: HTMLDivElement | null;
}

const FullscreenCamera: React.FC<FullscreenCameraProps> = ({
  expandedCameraName,
  onClose,
  cameras,
  fullscreenElement,
}) => {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );

  // Enhanced iPhone haptic feedback helper
  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40
      };
      navigator.vibrate(patterns[intensity]);
    }
    
    // Enhanced haptic feedback for modern browsers
    if ('hapticFeedback' in navigator) {
      const intensityLevels = {
        light: 0.3,
        medium: 0.6,
        heavy: 1.0
      };
      (navigator as any).hapticFeedback?.impact(intensityLevels[intensity]);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Track orientation changes
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  if (!expandedCameraName || !fullscreenElement) return null;

  const cameraObj = cameras.find(c => c.name === expandedCameraName);
  const cameraName =
    expandedCameraName === 'CasaCam'
      ? 'Casa Camera'
      : cameraObj?.customName || cameraObj?.parentRelations?.[0]?.displayName || 'Camera';

  const portalRoot = document.getElementById('fullscreen-root');
  if (!portalRoot) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col pointer-events-none">
      {/* Header - highest z-index */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pb-4 bg-gradient-to-b from-black/90 via-black/70 to-transparent pointer-events-auto z-50"
        style={{
          paddingTop: isLandscape
            ? 'calc(env(safe-area-inset-top, 0px) + 20px)'
            : 'calc(env(safe-area-inset-top, 0px) + 80px)',
        }}
      >
        <div className="flex items-center space-x-2 text-white font-medium pointer-events-auto">
          <div className="bg-blue-500/20 p-1.5 rounded-lg pointer-events-auto">
            <UilVideo className="text-blue-400" size={18} />
          </div>
          <span>{cameraName}</span>
          <div className="ml-2 flex items-center space-x-1 rounded-full bg-green-900/30 px-2 py-0.5 border border-green-700/30 text-xs text-green-400 pointer-events-auto">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
            <span>Live</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="flex items-center space-x-2 rounded-full bg-gray-800/70 px-4 py-2 text-white shadow-lg transition-all duration-300 border border-gray-700/50 hover:bg-gray-700/90 active:bg-gray-600/90 pointer-events-auto z-50 touch-manipulation min-h-[44px]"
          style={{ 
            WebkitTapHighlightColor: 'transparent',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden'
          }}
        >
          <span>Close</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {/* Camera container - below header */}
      <div
        id="fullscreen-camera-container"
        className="flex-1 flex items-center justify-center pointer-events-auto z-10"
      />
    </div>,
    portalRoot
  );
};

export default React.memo(FullscreenCamera);
