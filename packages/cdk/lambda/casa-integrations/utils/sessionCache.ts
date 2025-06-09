// sessionCache.ts - DynamoDB-backed cache for camera stream sessions

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.SESSION_CACHE_TABLE || '';

export interface CachedStreamData {
  answerSdp: string;
  mediaSessionId: string;
  expiresAt: string;
  timestamp: number;
  deviceId: string;
}

export interface CacheEntry {
  data: CachedStreamData;
  timestamp: number;
}

// DynamoDB item structure
interface CacheItem {
  cacheKey: string;
  answerSdp: string;
  mediaSessionId: string;
  expiresAt: string; // Original Google API expiresAt format
  timestamp: number;
  deviceId: string;
  ttl: number; // Unix timestamp for DynamoDB TTL
}

// Cache TTL in milliseconds (5 minutes)
const STREAM_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate a cache key from session ID and device ID
 */
function generateCacheKey(sessionId: string, deviceId: string): string {
  return `stream:${sessionId}:${deviceId}`;
}

/**
 * Get cached stream data for a session and device
 */
export async function getCachedStream(sessionId: string, deviceId: string): Promise<CachedStreamData | null> {
  try {
    const key = generateCacheKey(sessionId, deviceId);
    
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { cacheKey: key }
    }));
    
    if (!result.Item) {
      return null;
    }
    
    const item = result.Item as CacheItem;
    
    // Check if item is expired (extra safety check beyond TTL)
    const now = Date.now();
    if (item.timestamp && (now - item.timestamp) > STREAM_CACHE_TTL_MS) {
      // Clean up expired item
      await dynamodb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { cacheKey: key }
      }));
      return null;
    }
    
    return {
      answerSdp: item.answerSdp,
      mediaSessionId: item.mediaSessionId,
      expiresAt: item.expiresAt,
      timestamp: item.timestamp,
      deviceId: item.deviceId
    };
  } catch (error) {
    console.error('Error getting cached stream:', error);
    return null;
  }
}

/**
 * Cache stream data for a session and device
 */
export async function setCachedStream(sessionId: string, deviceId: string, data: CachedStreamData): Promise<void> {
  try {
    const key = generateCacheKey(sessionId, deviceId);
    const now = Date.now();
    const ttl = Math.floor((now + STREAM_CACHE_TTL_MS) / 1000); // Convert to Unix timestamp
    
    const item: CacheItem = {
      cacheKey: key,
      answerSdp: data.answerSdp,
      mediaSessionId: data.mediaSessionId,
      expiresAt: data.expiresAt, // Store original string format
      timestamp: now,
      deviceId: data.deviceId,
      ttl: ttl // TTL timestamp for DynamoDB
    };
    
    await dynamodb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item
    }));
  } catch (error) {
    console.error('Error setting cached stream:', error);
    // Don't throw error to avoid breaking the main flow
  }
}

/**
 * Check if cached stream data exists for a session and device
 */
export async function hasCachedStream(sessionId: string, deviceId: string): Promise<boolean> {
  try {
    const cachedData = await getCachedStream(sessionId, deviceId);
    return cachedData !== null;
  } catch (error) {
    console.error('Error checking cached stream:', error);
    return false;
  }
}

/**
 * Clear all cached streams for a specific session
 */
export async function clearSessionCache(sessionId: string): Promise<void> {
  try {
    // Since we can't do a query on a non-key attribute efficiently,
    // we'll scan for items with the session prefix and delete them
    const prefix = `stream:${sessionId}:`;
    
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(cacheKey, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': prefix
      }
    }));
    
    if (scanResult.Items && scanResult.Items.length > 0) {
      // Delete each item
      const deletePromises = scanResult.Items.map(item => 
        dynamodb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { cacheKey: item.cacheKey }
        }))
      );
      
      await Promise.all(deletePromises);
    }
  } catch (error) {
    console.error('Error clearing session cache:', error);
    // Don't throw error to avoid breaking the main flow
  }
}

/**
 * Get cache statistics for monitoring
 */
export async function getCacheStats(): Promise<{ totalEntries: number; sessionCount: number }> {
  try {
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAME,
      Select: 'ALL_ATTRIBUTES'
    }));
    
    const items = scanResult.Items || [];
    const sessions = new Set<string>();
    
    for (const item of items) {
      if (item.cacheKey && typeof item.cacheKey === 'string') {
        const parts = item.cacheKey.split(':');
        if (parts.length >= 2) {
          sessions.add(parts[1]);
        }
      }
    }
    
    return {
      totalEntries: items.length,
      sessionCount: sessions.size
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      totalEntries: 0,
      sessionCount: 0
    };
  }
}