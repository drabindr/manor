// In ./src/EventContext.tsx

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { logger } from './utils/Logger';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

// AWS Configuration
const REGION = 'us-east-1';
const IDENTITY_POOL_ID = 'us-east-1:35b377d0-baae-4ee6-b329-3d17e24fd55c';

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

type Event = {
  id: number;
  event: string;
  timestamp: string;
  homeId?: string;
};

type EventContextType = {
  events: Event[];
  addEvent: (newEvent: Event) => void;
  fetchEvents: () => Promise<void>;
  homeId: string;
  setHomeId: (id: string) => void;
};

export const EventContext = createContext<EventContextType>({
  events: [],
  addEvent: () => {},
  fetchEvents: async () => {},
  homeId: '720frontrd', // Default home ID
  setHomeId: () => {},
});

interface EventProviderProps {
  children: React.ReactNode;
}

export const EventProvider: React.FC<EventProviderProps> = ({ children }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [homeId, setHomeId] = useState<string>('720frontrd'); // Default to 720 Front Rd

  const fetchEvents = useCallback(async () => {
    try {
      logger.debug(`Fetching events for home: ${homeId}...`);
      
      // Use Query instead of Scan to filter by homeId using the GSI
      const command = new QueryCommand({
        TableName: 'EventLogs',
        IndexName: 'HomeIdIndex',
        KeyConditionExpression: 'homeId = :homeId',
        ExpressionAttributeValues: {
          ':homeId': homeId,
        },
        ScanIndexForward: false, // descending order by sort key (timestamp)
        Limit: 250,
      });

      const data = await dynamoDBClient.send(command);
      const items = data.Items || [];

      const fetchedEvents: Event[] = items.map((item: any) => ({
        id: item.id,
        event: item.event,
        timestamp: convertUTCtoEST(item.timestamp),
        homeId: item.homeId,
      }));

      logger.debug("Fetched events:", fetchedEvents);
      setEvents(fetchedEvents);
    } catch (error) {
      logger.error('Error fetching events from DynamoDB:', error);
    }
  }, [homeId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents, homeId]);

  // Convert UTC to EST (copy the function from your old code)
  const convertUTCtoEST = (utcDateStr: string): string => {
    try {
      const utcDate = new Date(utcDateStr);
      if (isNaN(utcDate.getTime())) {
        throw new Error('Invalid Date');
      }
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      const estDate = new Intl.DateTimeFormat('en-US', options).format(utcDate);
      return estDate.replace(',', '');
    } catch (error) {
      logger.error('Failed to convert UTC to EST:', error);
      return utcDateStr; // Return original if conversion fails
    }
  };

  const addEvent = (newEvent: Event) => {
    setEvents((prevEvents) => {
      const isDuplicate = prevEvents.some(
        (event) => event.id === newEvent.id
      );
      if (!isDuplicate) {
        const updatedEvents = [newEvent, ...prevEvents]
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, 100);
        return updatedEvents;
      } else {
        return prevEvents;
      }
    });
  };

  return (
    <EventContext.Provider value={{ events, addEvent, fetchEvents, homeId, setHomeId }}>
      {children}
    </EventContext.Provider>
  );
};
