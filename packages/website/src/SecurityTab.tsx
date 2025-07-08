import React, { forwardRef, useImperativeHandle } from 'react';
import { UilShieldCheck } from '@iconscout/react-unicons';
import SeamSecurity from './SeamSecurity';
import EventHistory from './EventHistory';

interface SecurityTabProps {
  // Add any props needed
}

const SecurityTab = forwardRef<any, SecurityTabProps>((props, ref) => {
  const eventHistoryRef = React.useRef<any>(null);

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (eventHistoryRef.current) {
        eventHistoryRef.current.refresh();
      }
    }
  }));

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Smart Locks - Direct display without card wrapper, with consistent margins */}
      <div className="w-full px-4">
        <SeamSecurity />
      </div>

      {/* Event History Card - Full width, scrollable content with enhanced visual appeal */}
      <div className="flex-1 min-h-0 px-4">
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
