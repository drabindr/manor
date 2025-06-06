import React, { useCallback, useEffect, useRef } from 'react';

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavigationProps {
  tabs: Tab[];
  activeTab: string;
  setActiveTab: (tabId: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ tabs, activeTab, setActiveTab }) => {
  const navRef = useRef<HTMLElement>(null);

  // Enhanced tab button handler with haptic feedback simulation
  const handleTabChange = useCallback((tabId: string) => {
    if (activeTab !== tabId) {
      // Simulate haptic feedback on supported devices
      if ('vibrate' in navigator) {
        navigator.vibrate(10); // Light haptic feedback
      }
      
      // Enhanced visual feedback for tab change
      const button = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (button) {
        button.classList.add('tab-switching');
        setTimeout(() => {
          button.classList.remove('tab-switching');
        }, 200);
      }
      
      setActiveTab(tabId);
    }
  }, [activeTab, setActiveTab]);
  
  // Enhanced navigation visibility and performance
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const ensureVisibility = () => {
      nav.style.transform = 'translateZ(0)';
      nav.style.visibility = 'visible';
      nav.style.display = 'flex';
      nav.style.opacity = '1';
      nav.style.pointerEvents = 'auto';
    };

    // Apply immediately
    ensureVisibility();

    // Enhanced intersection observer for better visibility control
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            ensureVisibility();
          }
        });
      },
      { threshold: 0.8, rootMargin: '10px' }
    );

    observer.observe(nav);

    // Cleanup
    return () => observer.disconnect();
  }, []);
  
  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 w-full border-t border-gray-700/30 flex justify-around z-50"
      style={{
        background: "linear-gradient(to bottom, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98))",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
        paddingTop: "12px",
        borderTop: "1px solid rgba(251, 191, 36, 0.15)",
        boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.15), 0 -2px 8px rgba(0, 0, 0, 0.1)",
        // Enhanced iOS optimizations
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: 9999,
        WebkitTransform: "translate3d(0,0,0)",
        transform: "translate3d(0,0,0)",
        WebkitBackfaceVisibility: "hidden",
        backfaceVisibility: "hidden",
        willChange: "transform",
        visibility: "visible",
        display: "flex",
        // Enhanced safe area support
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            aria-label={`${tab.label} tab`}
            aria-selected={isActive}
            className={`relative flex flex-col items-center justify-center py-2 px-3 flex-1 transition-all touch-manipulation haptic-medium button-interactive ${
              isActive ? "text-yellow-400" : "text-gray-400 hover:text-gray-200 active:text-gray-100"
            }`}
            onClick={() => handleTabChange(tab.id)}
            style={{
              // Enhanced transition timing with spring easing
              transitionDuration: "250ms",
              transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
              // Hardware acceleration optimization
              transform: isActive ? "translateZ(0)" : "none",
              willChange: isActive ? "transform, opacity, color" : "auto",
              minHeight: "44px", // iPhone-optimized touch target
              minWidth: "44px",
              borderRadius: "12px",
              margin: "0 4px",
              // Enhanced glass effect for active state
              background: isActive 
                ? "rgba(251, 191, 36, 0.08)" 
                : "transparent",
              backdropFilter: isActive ? "blur(8px)" : "none",
              WebkitBackdropFilter: isActive ? "blur(8px)" : "none",
              border: isActive 
                ? "1px solid rgba(251, 191, 36, 0.2)" 
                : "1px solid transparent",
              // Enhanced tap highlight removal
              WebkitTapHighlightColor: "transparent",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          >
            {/* Enhanced Active Indicator with modern gradient */}
            {isActive && (
              <div 
                className="absolute top-0 left-1/2 rounded-b-full shadow-lg animate-fade-in"
                style={{
                  width: "48px",
                  height: "4px",
                  background: "linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)",
                  transform: "translate3d(-50%, 0, 0)",
                  boxShadow: "0 4px 12px rgba(251, 191, 36, 0.4), 0 2px 6px rgba(251, 191, 36, 0.2)",
                  willChange: "transform",
                  borderRadius: "0 0 6px 6px"
                }}
              />
            )}
            
            {/* Enhanced Icon Container with micro-interactions */}
            <div 
              className={`relative transition-all duration-250 ${isActive ? "scale-110" : "scale-100"}`}
              style={{ 
                transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                transform: isActive ? "translateZ(0)" : "none",
                filter: isActive ? "drop-shadow(0 0 8px rgba(251, 191, 36, 0.3))" : "none"
              }}
            >
              <tab.icon 
                size={26} 
                className={`transition-colors duration-250 ${
                  isActive ? "text-yellow-400" : "text-gray-400"
                }`} 
              />
              
              {/* Enhanced Active Glow Effect with pulsing animation */}
              {isActive && (
                <div 
                  className="absolute inset-0 rounded-full animate-ping-slow opacity-25"
                  style={{
                    background: "radial-gradient(circle, rgba(251, 191, 36, 0.6), transparent 70%)",
                    willChange: "opacity, transform",
                    filter: "blur(6px)"
                  }}
                />
              )}
              
              {/* Subtle background glow for active state */}
              {isActive && (
                <div 
                  className="absolute inset-0 rounded-full opacity-20"
                  style={{
                    background: "radial-gradient(circle, rgba(251, 191, 36, 0.4), transparent 60%)",
                    filter: "blur(12px)",
                    transform: "scale(1.5)"
                  }}
                />
              )}
            </div>
            
            {/* Enhanced Label with better typography */}
            <span
              className={`text-xs mt-2 font-semibold transition-all duration-250 ${
                isActive ? "opacity-100 text-yellow-400" : "opacity-75 text-gray-400"
              }`}
              style={{
                transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                letterSpacing: isActive ? "0.025em" : "0",
                fontWeight: isActive ? "600" : "500",
                textShadow: isActive ? "0 0 8px rgba(251, 191, 36, 0.3)" : "none",
                fontSize: "11px", // Slightly smaller for better proportions
                lineHeight: "1.2"
              }}
            >
              {tab.label}
            </span>
            
            {/* Ripple effect on touch */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                borderRadius: "12px",
                overflow: "hidden"
              }}
            >
              {/* This will be handled by the button-interactive class in CSS */}
            </div>
          </button>
        );
      })}
      
      {/* Enhanced bottom accent line */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-0.5 opacity-30"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.6), transparent)",
          marginLeft: "16px",
          marginRight: "16px"
        }}
      />
    </nav>
  );
};

export default React.memo(Navigation);