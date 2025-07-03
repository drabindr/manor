import React, { forwardRef, useImperativeHandle } from 'react';
import { UilLockOpenAlt } from '@iconscout/react-unicons';
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
    <div className="h-full flex flex-col">
      {/* Smart Locks Section */}
      <div className="px-4 mt-4 mb-4">
        <SeamSecurity />
      </div>

      {/* Event History with Who's Home - this contains the UserHomeStatusBoard */}
      <div className="flex-1 overflow-y-auto px-4">
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
