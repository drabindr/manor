import React, {
  useContext,
  useMemo,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { useWidgetResumeRefresh } from './AppResumeHandler';
import { logger } from "./utils/Logger";
import {
  UilKeyholeCircle,
  UilLink,
  UilLinkBroken,
  UilLockOpenAlt,
  UilShieldCheck,
  UilHouseUser,
  UilBell,
  UilUsersAlt,
  UilCalendarAlt,
  UilHistory,
  UilSpinner,
} from "@iconscout/react-unicons";
import { EventContext } from "./EventContext";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { CognitoIdentityClient } from "@aws-sdk/client-cognito-identity";
import UserHomeStatusBoard from "./components/UserHomeStatusBoard";

// Loading skeleton component
const EventSkeleton = React.memo(() => (
  <div className="animate-pulse">
    <div className="bg-gray-800/40 rounded-lg border border-gray-700/30 mb-3">
      <div className="p-3 border-b border-gray-700/30">
        <div className="h-4 bg-gray-700/50 rounded w-32"></div>
      </div>
      <div className="p-3 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-700/50 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-700/50 rounded w-3/4"></div>
              <div className="h-2 bg-gray-700/30 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
));

type Event = {
  id: number;
  event: string;
  timestamp: string;
};

interface EventHistoryProps {
  darkModeStyles: {
    backgroundColor: string;
    color: string;
    borderColor: string;
    rowStyles?: {
      odd: React.CSSProperties;
      even: React.CSSProperties;
      hover: React.CSSProperties;
    };
  };
}

export type EventHistoryRef = {
  refresh: () => Promise<void>;
  refreshImmediate?: () => Promise<void>;
};

const REGION = "us-east-1";
const IDENTITY_POOL_ID = "us-east-1:35b377d0-baae-4ee6-b329-3d17e24fd55c";
const cognitoIdentityClient = new CognitoIdentityClient({ region: REGION });
const credentials = fromCognitoIdentityPool({
  client: cognitoIdentityClient,
  identityPoolId: IDENTITY_POOL_ID,
});
const dynamoDBClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: REGION,
    credentials,
  })
);

type UserHomeStatusType = {
  userId: string;
  homeId: string;
  state: string;
  displayName?: string;
};

// Helper function to format dates for grouping events by day
const formatDateForGrouping = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

// Helper function to format times for display
const formatTimeForDisplay = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const EventHistory = forwardRef<EventHistoryRef, EventHistoryProps>(
  ({ darkModeStyles }, ref) => {
    const { events, fetchEvents, homeId } = useContext(EventContext);
    const [userHomeStatuses, setUserHomeStatuses] = useState<UserHomeStatusType[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingStatuses, setIsLoadingStatuses] = useState(true);
    const [statusError, setStatusError] = useState<string | null>(null);
    
    // Pagination state for better performance with large event lists
    const [currentPage, setCurrentPage] = useState(1);
    const [eventsPerPage] = useState(50); // Show 50 events per page
    
    // Debouncing ref to prevent excessive refresh calls
    const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const fetchUserHomeStatuses = useCallback(async () => {
      setIsLoadingStatuses(true);
      setStatusError(null);
      try {
        logger.debug(`Fetching user home statuses for home: ${homeId}...`);
        
        // Make sure to explicitly request all attributes including displayName
        const command = new ScanCommand({
          TableName: "UserHomeStates2",
          FilterExpression: "homeId = :homeId",
          ExpressionAttributeValues: {
            ":homeId": homeId,
          },
          // Add projection expression to ensure we get all needed attributes
          ProjectionExpression: "userId, homeId, #state, displayName",
          ExpressionAttributeNames: {
            "#state": "state" // 'state' is a reserved word in DynamoDB
          }
        });
        
        const data = await dynamoDBClient.send(command);
        const items = data.Items || [];
        logger.debug("Fetched user home statuses:", items);
        
        // Map the results to ensure displayName is properly handled
        const statusesWithNames = items.map((item: any) => ({
          userId: item.userId,
          homeId: item.homeId,
          state: item.state,
          displayName: item.displayName || undefined // Explicitly handle displayName
        }));
        
        // Compare with current state to prevent unnecessary re-renders
        setUserHomeStatuses(prevStatuses => {
          // Check if the new data is actually different from current state
          if (prevStatuses.length !== statusesWithNames.length) {
            logger.debug("User home status count changed, updating UI");
            return statusesWithNames as UserHomeStatusType[];
          }
          
          // Compare each status to see if any have changed
          const hasChanges = statusesWithNames.some((newStatus, index) => {
            const prevStatus = prevStatuses.find(p => p.userId === newStatus.userId);
            if (!prevStatus) return true; // New user
            
            return (
              prevStatus.state !== newStatus.state ||
              prevStatus.displayName !== newStatus.displayName ||
              prevStatus.homeId !== newStatus.homeId
            );
          });
          
          if (hasChanges) {
            logger.debug("User home status data changed, updating UI");
            return statusesWithNames as UserHomeStatusType[];
          } else {
            logger.debug("User home status data unchanged, skipping UI update");
            return prevStatuses;
          }
        });

        if (items.length === 0) {
          logger.warn(`No user home statuses found for homeId: ${homeId}`);
        }
      } catch (error) {
        logger.error("Error fetching user home statuses:", error);
        setStatusError(
          `Failed to load user statuses: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        setUserHomeStatuses([]);
      } finally {
        setIsLoadingStatuses(false);
      }
    }, [homeId]);

    const refreshData = useCallback(async () => {
      logger.debug("Refreshing Event History data...");
      setIsRefreshing(true);
      try {
        await Promise.all([fetchUserHomeStatuses(), fetchEvents()]);
        logger.debug("Event History data refreshed.");
      } catch (error) {
        logger.error("Error refreshing data:", error);
      } finally {
        setIsRefreshing(false);
      }
    }, [fetchUserHomeStatuses, fetchEvents]);

    // Debounced refresh function to prevent excessive calls
    const debouncedRefreshData = useCallback(async () => {
      // Clear existing timeout if any
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Set new timeout
      return new Promise<void>((resolve) => {
        refreshTimeoutRef.current = setTimeout(async () => {
          await refreshData();
          resolve();
        }, 500); // 500ms debounce delay
      });
    }, [refreshData]);

    // Register widget for app resume refresh
    useWidgetResumeRefresh('event-history', refreshData);

    // Clean up timeout on unmount
    useEffect(() => {
      return () => {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
      };
    }, []);

    // Call refreshData on mount and when homeId changes
    useEffect(() => {
      refreshData();
    }, [refreshData, homeId]);

    // Expose refresh method via ref
    useImperativeHandle(
      ref,
      () => ({
        refresh: debouncedRefreshData, // Use debounced version to prevent excessive refreshing
        refreshImmediate: refreshData, // Keep immediate version for when needed
      }),
      [debouncedRefreshData, refreshData]
    );

    const collapseEvents = useCallback((allEvents: Event[]): Event[] => {
      const collapsed: Event[] = [];
      const reversed = [...allEvents].reverse();

      for (let i = 0; i < reversed.length; i++) {
        const currentEvent = reversed[i];
        const nextEvent = reversed[i + 1];
        if (nextEvent) {
          const currentTime = new Date(currentEvent.timestamp).getTime();
          const nextTime = new Date(nextEvent.timestamp).getTime();
          const timeDiff = Math.abs(currentTime - nextTime);

          if (timeDiff <= 30000) {
            const eventNameCurrent = currentEvent.event
              .replace(" opened", "")
              .replace(" closed", "");
            const eventNameNext = nextEvent.event
              .replace(" opened", "")
              .replace(" closed", "");

            const currentAction = currentEvent.event.endsWith("opened")
              ? "opened"
              : currentEvent.event.endsWith("closed")
              ? "closed"
              : "";
            const nextAction = nextEvent.event.endsWith("opened")
              ? "opened"
              : nextEvent.event.endsWith("closed")
              ? "closed"
              : "";

            const isPair =
              eventNameCurrent === eventNameNext &&
              currentAction === "opened" &&
              nextAction === "closed";

            if (isPair) {
              const collapsedEvent: Event = {
                id: currentEvent.id,
                event: `${eventNameCurrent} opened and closed`,
                timestamp: currentEvent.timestamp,
              };
              collapsed.push(collapsedEvent);
              i++;
              continue;
            } else {
              collapsed.push(currentEvent);
            }
          } else {
            collapsed.push(currentEvent);
          }
        } else {
          collapsed.push(currentEvent);
        }
      }

      return collapsed.reverse();
    }, []); // Empty dependency array since it doesn't depend on any values

    const collapsedEvents = useMemo(() => collapseEvents(events), [events, collapseEvents]);

    // Group events by day with pagination
    const eventsByDay = useMemo(() => {
      const grouped: Record<string, Event[]> = {};

      collapsedEvents.forEach((event) => {
        const eventDate = new Date(event.timestamp);
        const dateKey = formatDateForGrouping(eventDate);

        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }

        grouped[dateKey].push(event);
      });

      return grouped;
    }, [collapsedEvents]);

    // Paginate events for better performance
    const paginatedEventsByDay = useMemo(() => {
      const allDays = Object.keys(eventsByDay).sort((a, b) => {
        // Sort by date descending (newest first)
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB.getTime() - dateA.getTime();
      });

      const startIndex = (currentPage - 1) * eventsPerPage;
      const endIndex = startIndex + eventsPerPage;
      
      let eventCount = 0;
      const result: Record<string, Event[]> = {};
      
      for (const day of allDays) {
        const dayEvents = eventsByDay[day];
        const remainingCapacity = eventsPerPage - (eventCount % eventsPerPage);
        
        if (eventCount >= startIndex && eventCount < endIndex) {
          result[day] = dayEvents.slice(0, Math.min(dayEvents.length, remainingCapacity));
        } else if (eventCount < startIndex && eventCount + dayEvents.length > startIndex) {
          const skipCount = startIndex - eventCount;
          const takeCount = Math.min(dayEvents.length - skipCount, remainingCapacity);
          result[day] = dayEvents.slice(skipCount, skipCount + takeCount);
        }
        
        eventCount += dayEvents.length;
        
        if (eventCount >= endIndex) break;
      }
      
      return result;
    }, [eventsByDay, currentPage, eventsPerPage]);

    const getEventIcon = (eventName: string): JSX.Element | null => {
      if (eventName.includes("ALARM triggered")) {
        return <UilBell className="mr-2" color="#f44336" size="24" />;
      } else if (eventName.includes("System mode changed to Disarm")) {
        return <UilLockOpenAlt className="mr-2" color="#9c27b0" size="24" />;
      } else if (eventName.includes("opened and closed")) {
        return <UilKeyholeCircle className="mr-2" color="#4caf50" size="24" />;
      } else if (eventName.includes("opened")) {
        return <UilLinkBroken className="mr-2" color="#f44336" size="24" />;
      } else if (eventName.includes("closed")) {
        return <UilLink className="mr-2" color="#2196f3" size="24" />;
      } else if (eventName.includes("System mode changed to Arm Stay")) {
        return <UilHouseUser className="mr-2" color="#3f51b5" size="24" />;
      } else if (eventName.includes("System mode changed to Arm Away")) {
        return <UilShieldCheck className="mr-2" color="#ff9800" size="24" />;
      } else {
        return null;
      }
    };

    // Sort days in reverse chronological order (most recent first)
    const sortedDays = useMemo(() => {
      return Object.keys(paginatedEventsByDay).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateB.getTime() - dateA.getTime();
      });
    }, [paginatedEventsByDay]);

    // Count total events
    const totalEvents = useMemo(() => {
      return Object.values(eventsByDay).reduce(
        (sum, dayEvents) => sum + dayEvents.length,
        0
      );
    }, [eventsByDay]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalEvents / eventsPerPage);
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    // Add a handler for display name updates
    const handleDisplayNameUpdate = (userId: string, newDisplayName: string) => {
      logger.debug("Display name updated", userId, newDisplayName);
      // Update the local state with the new display name
      setUserHomeStatuses(prevStatuses => 
        prevStatuses.map(status => 
          status.userId === userId 
            ? { ...status, displayName: newDisplayName } 
            : status
        )
      );
    };

    // Render loading indicator for User Home Status section
    const renderUserHomeStatusContent = () => {
      return (
        <UserHomeStatusBoard
          userHomeStatuses={userHomeStatuses}
          homeId={homeId}
          isLoading={isLoadingStatuses}
          error={statusError}
          onDisplayNameUpdate={handleDisplayNameUpdate}
        />
      );
    };

    return (
      <div className="w-full h-full flex flex-col space-y-4 mt-2">
        {/* Title bar with subtle glass effect */}
        <div className="mx-4 flex items-center justify-between bg-gray-900 rounded-xl p-3 border border-gray-800/40 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="bg-gray-800 p-2 rounded-lg">
              <UilHistory className="text-blue-400" size={22} />
            </div>
            <h2 className="text-gray-200 font-medium">Security History</h2>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-xs text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full border border-gray-700/30">
              {totalEvents} events
            </div>
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="bg-gray-800 hover:bg-gray-700 text-blue-400 p-2 rounded-lg transition-all duration-200 border border-gray-700/30 flex items-center justify-center
                        min-h-[48px] min-w-[48px] touch-manipulation transform tap-highlight-transparent active:scale-95"
              style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* USER HOME STATUS */}
        <div className="mx-4 mb-4">
          {renderUserHomeStatusContent()}
        </div>

        {/* EVENT HISTORY CARD */}
        <div className="mx-4 mb-4 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden border border-gray-700/50 transition-all duration-200 flex-grow">
          {/* Card Title */}
          <div className="flex justify-between items-center p-3 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/50 to-gray-900/50">
            <div className="flex items-center space-x-2">
              <div className="bg-gray-800/70 p-1.5 rounded-lg border border-gray-700/40 shadow-inner">
                <UilShieldCheck size={16} className="text-blue-400" />
              </div>
              <span className="text-gray-300 text-sm font-medium">
                Event Timeline
              </span>
            </div>
          </div>

          {/* Events Table - Grouped by Day */}
          <div
            className="overflow-y-auto rounded-b-xl"
            style={{ maxHeight: "calc(100vh - 380px)" }}
          >
            {sortedDays.map((day) => (
              <div key={day} className="mb-2">
                {/* Date Header with improved styling */}
                <div className="flex items-center py-2 px-3 bg-gradient-to-r from-blue-900/20 to-blue-800/10 border-y border-blue-900/30">
                  <UilCalendarAlt className="mr-2 text-blue-400" size={16} />
                  <span className="text-blue-300 text-xs font-medium">
                    {day}
                  </span>
                </div>

                {/* Events for this day with enhanced styling */}
                <div className="w-full">
                  <div className="w-full overflow-x-auto">
                    <table className="min-w-full table-auto border-collapse">
                      <tbody>
                        {paginatedEventsByDay[day].map((event: Event, index: number) => (
                          <tr
                            key={event.id || index}
                            className={`border-b border-gray-800/30 transition-colors duration-300 hover:bg-gray-700/30 ${
                              index % 2 === 0
                                ? "bg-gray-800/40"
                                : "bg-gray-800/20"
                            }`}
                          >
                            <td className="px-3 py-2 w-full">
                              <div className="flex items-center">
                                <div className="p-1 rounded-lg bg-gray-800/70 mr-2 border border-gray-700/30 shadow-inner">
                                  {getEventIcon(event.event)}
                                </div>
                                <span className="text-gray-200 text-sm">
                                  {event.event}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-400 text-right whitespace-nowrap text-xs">
                              {formatTimeForDisplay(new Date(event.timestamp))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}

            {/* Show skeleton loading during initial load or refresh */}
            {(isRefreshing && sortedDays.length === 0) && (
              <div className="mx-4">
                <EventSkeleton />
                <EventSkeleton />
              </div>
            )}

            {sortedDays.length === 0 && !isRefreshing && (
              <div className="text-center py-12 text-gray-400">
                <div className="bg-gray-800/80 rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center border border-gray-700/30">
                  <UilHistory size={32} className="text-gray-500" />
                </div>
                <p className="text-sm">No events to display</p>
                <p className="text-xs text-gray-500 mt-1">
                  Events will appear here as they occur
                </p>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mx-4 mt-4 flex items-center justify-between bg-gray-800/50 rounded-lg p-3 border border-gray-700/30">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={!hasPrevPage}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors duration-200 
                            min-h-[48px] touch-manipulation transform tap-highlight-transparent active:scale-95 ${
                    hasPrevPage
                      ? 'bg-gray-700/80 hover:bg-gray-600/80 text-gray-200 border-gray-600/50'
                      : 'bg-gray-800/50 text-gray-500 border-gray-700/30 cursor-not-allowed'
                  }`}
                  style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-sm">Previous</span>
                </button>

                <div className="flex items-center space-x-2 text-gray-300">
                  <span className="text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({totalEvents} total events)
                  </span>
                </div>

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={!hasNextPage}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors duration-200
                            min-h-[48px] touch-manipulation transform tap-highlight-transparent active:scale-95 ${
                    hasNextPage
                      ? 'bg-gray-700/80 hover:bg-gray-600/80 text-gray-200 border-gray-600/50'
                      : 'bg-gray-800/50 text-gray-500 border-gray-700/30 cursor-not-allowed'
                  }`}
                  style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                >
                  <span className="text-sm">Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default EventHistory;
