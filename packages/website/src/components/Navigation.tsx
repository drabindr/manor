import React, { useCallback, useEffect, useRef } from 'react';
import { IconComponentType } from '@iconscout/react-unicons/dist/types/icons';

interface Tab {
  id: string;
  label: string;
  icon: IconComponentType;
}

interface NavigationProps {
  tabs: Tab[];
  activeTab: string;
  setActiveTab: (tabId: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ tabs, activeTab, setActiveTab }) => {
  const navRef = useRef<HTMLElement>(null);

  // Create optimized tab button handler with useCallback
  const handleTabChange = useCallback((tabId: string) => {
    if (activeTab !== tabId) {
      setActiveTab(tabId);
    }
  }, [activeTab, setActiveTab]);
  
  // Ensure navigation stays visible on iOS
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const ensureVisibility = () => {
      nav.style.transform = 'translateZ(0)';
      nav.style.visibility = 'visible';
      nav.style.display = 'flex';
    };

    // Call immediately
    ensureVisibility();

    // Set up intersection observer to ensure visibility
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            ensureVisibility();
          }
        });
      },
      { threshold: 1.0 }
    );

    observer.observe(nav);

    // Cleanup
    return () => observer.disconnect();
  }, []);
  
  return (
    <nav
      ref={navRef}
      className="fixed bottom-0 w-full border-t border-gray-800/50 flex justify-around z-40"
      style={{
        background: "linear-gradient(to bottom, rgba(25,25,25,0.95), rgba(15,15,15,0.95))",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        paddingTop: "10px",
        // iOS optimizations
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
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            aria-label={`${tab.label} tab`}
            aria-selected={isActive}
            className={`relative flex flex-col items-center justify-center py-2 px-3 flex-1 transition-all ${
              isActive ? "text-yellow-400" : "text-gray-500 hover:text-gray-300"
            }`}
            onClick={() => handleTabChange(tab.id)}
            style={{
              // Reduce animation duration for better performance
              transitionDuration: "200ms",
              // Use hardware acceleration only when needed
              transform: isActive ? "translateZ(0)" : "none",
              willChange: isActive ? "transform, opacity" : "auto"
            }}
          >
            {isActive && (
              <div 
                className="absolute top-0 left-1/2 w-12 h-1 rounded-b-full bg-gradient-to-r from-yellow-500 to-yellow-300 shadow-lg shadow-yellow-500/20"
                style={{
                  transform: "translate3d(-50%, 0, 0)",
                  willChange: "transform"
                }}
              />
            )}
            <div 
              className={`relative ${isActive ? "scale-110" : ""}`}
              style={{ 
                transition: "transform 200ms ease",
                transform: isActive ? "translateZ(0)" : "none"
              }}
            >
              <tab.icon size={24} />
              {isActive && (
                <div 
                  className="absolute inset-0 rounded-full animate-ping-slow opacity-30 bg-yellow-400 blur-sm"
                  style={{
                    willChange: "opacity, transform"
                  }}
                />
              )}
            </div>
            <span
              className={`text-xs mt-1.5 font-medium ${
                isActive ? "opacity-100" : "opacity-80"
              }`}
              style={{
                transition: "opacity 200ms ease"
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default React.memo(Navigation);