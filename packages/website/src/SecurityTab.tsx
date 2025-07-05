import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { UilShieldCheck } from '@iconscout/react-unicons';
import SeamSecurity from './SeamSecurity';
import EventHistory from './EventHistory';
import metricsService from './services/MetricsService';

interface SecurityTabProps {
  // Add any props needed
}

const SecurityTab = forwardRef<any, SecurityTabProps>((props, ref) => {
  const eventHistoryRef = React.useRef<any>(null);
  
  // Performance tracking
  const loadStartTimeRef = useRef<number | null>(null);
  const hasRecordedLoadMetric = useRef(false);

  // Start performance tracking when component mounts
  useEffect(() => {
    loadStartTimeRef.current = performance.now ? performance.now() : Date.now();
    
    // Set a timeout to record completion after components have had time to load
    const loadTimer = setTimeout(() => {
      if (loadStartTimeRef.current && !hasRecordedLoadMetric.current) {
        const loadTime = (performance.now ? performance.now() : Date.now()) - loadStartTimeRef.current;
        hasRecordedLoadMetric.current = true;
        
        try {
          metricsService.recordSecurityLoadMetric(loadTime);
          console.debug(`[SecurityTab] Security card loaded in ${loadTime}ms`);
        } catch (error) {
          console.debug('Failed to record security card load metric:', error);
        }
      }
    }, 1000); // Give components 1 second to load

    return () => {
      clearTimeout(loadTimer);
    };
  }, []);

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (eventHistoryRef.current) {
        eventHistoryRef.current.refresh();
      }
    }
  }));

  return (
    <div className="h-full flex flex-col space-y-4 -ml-4 px-4">
      {/* Smart Locks Card */}
      <div className="bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-xl shadow-2xl overflow-hidden w-full relative">
        {/* Glass reflective overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent h-1/3 pointer-events-none"></div>
        
        {/* Card Header */}
        <div className="relative z-10 p-4 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/50 to-gray-900/50">
          <div className="flex items-center space-x-3">
            <div className="bg-gray-800/70 p-2 rounded-lg border border-gray-700/40 shadow-inner">
              <UilShieldCheck size={18} className="text-yellow-400" />
            </div>
            <div>
              <h3 className="text-gray-200 font-medium">Smart Locks</h3>
              <p className="text-gray-400 text-xs">Security & Access Control</p>
            </div>
          </div>
        </div>
        
        {/* Card Content */}
        <div className="relative z-10">
          <SeamSecurity />
        </div>
      </div>

      {/* Event History Card - Full width, scrollable content */}
      <div className="flex-1 min-h-0">
        <EventHistory 
          ref={eventHistoryRef}
          darkModeStyles={{
            backgroundColor: "transparent",
            color: "#f5f5f5",
            borderColor: "#444",
            rowStyles: {
              odd: { backgroundColor: "rgba(40, 40, 40, 0.8)" },
              even: { backgroundColor: "rgba(25, 25, 25, 0.8)" },
              hover: { backgroundColor: "rgba(60, 60, 60, 0.8)" },
            },
          }}
        />
      </div>
    </div>
  );
});

SecurityTab.displayName = 'SecurityTab';

export default SecurityTab;
