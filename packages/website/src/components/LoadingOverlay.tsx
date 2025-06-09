import React, { useEffect, useState } from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading }) => {
  // Add state for controlling fade animation
  const [isVisible, setIsVisible] = useState(false);
  const [showContent, setShowContent] = useState(false);
  
  // Control the visibility with a slight delay for smooth transitions
  useEffect(() => {
    if (isLoading) {
      // Check if initial loader is still showing
      const initialLoader = document.querySelector('.initial-loader');
      const isInitialLoaderVisible = initialLoader && !document.body.classList.contains('app-loaded');
      
      if (isInitialLoaderVisible) {
        // Wait for initial loader to finish before showing this overlay
        const checkInitialLoader = () => {
          if (document.body.classList.contains('app-loaded')) {
            setIsVisible(true);
            setTimeout(() => setShowContent(true), 100);
          } else {
            setTimeout(checkInitialLoader, 100);
          }
        };
        checkInitialLoader();
      } else {
        setIsVisible(true);
        setTimeout(() => setShowContent(true), 100);
      }
    } else {
      setShowContent(false);
      // Add a slight delay before hiding to prevent flickering on quick loads
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);
  
  // Don't render anything if not loading and not visible
  if (!isLoading && !isVisible) return null;
  
  return (
    <div 
      className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[10000]"
      style={{
        // Use hardware acceleration and reduce repaints
        transform: 'translateZ(0)',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        // Smooth transition for better UX
        opacity: isLoading && showContent ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
        // Prevent unintended touch events while loading
        pointerEvents: isLoading ? 'auto' : 'none'
      }}
    >
      <div className="relative mb-6">
        <div 
          className="w-20 h-20 rounded-full border-4 border-gray-800 flex items-center justify-center"
          style={{ 
            willChange: 'transform',
            transform: 'translateZ(0)'
          }}
        >
          <div 
            className="absolute inset-0 rounded-full border-t-4 border-yellow-500 animate-spin"
            style={{ willChange: 'transform' }}
          ></div>
          <div
            className="absolute inset-2 rounded-full border-t-3 border-yellow-400 animate-spin"
            style={{ 
              animationDuration: "1.5s",
              animationDirection: "reverse",
              willChange: 'transform' 
            }}
          ></div>
          <div className="relative z-10 flex items-center justify-center">
            <img 
              src="/logo2.png" 
              alt="MANOR logo" 
              className="w-12 h-12 object-contain"
            />
          </div>
        </div>
      </div>
      <div className="text-yellow-400 text-2xl font-bold tracking-wider uppercase mb-4">MANOR</div>
      <div className="text-white text-lg font-medium">Connecting to your home...</div>
      <div className="mt-4 text-gray-400 text-sm">Loading thermostat and camera data</div>
      <div className="mt-6 w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-500 animate-gradient-x"
          style={{ 
            width: "60%",
            willChange: 'transform'
          }}
        ></div>
      </div>
    </div>
  );
};

export default React.memo(LoadingOverlay);