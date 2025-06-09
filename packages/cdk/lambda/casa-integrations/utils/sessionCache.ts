// sessionCache.ts - Hybrid cache for camera stream sessions (in-memory + DynamoDB)

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.SESSION_CACHE_TABLE || '';

// In-memory cache for fastest access
const memoryCache = new Map<string, CacheEntry>();

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
 * Clean up expired entries from in-memory cache
 */
function cleanupMemoryCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if ((now - entry.timestamp) > STREAM_CACHE_TTL_MS) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Get cached stream data for a session and device
 * Uses hybrid caching: memory first, then DynamoDB
 */
export async function getCachedStream(sessionId: string, deviceId: string): Promise<CachedStreamData | null> {
  const key = generateCacheKey(sessionId, deviceId);
  const now = Date.now();
  
  // Clean up expired memory cache entries
  cleanupMemoryCache();
  
  // First, check in-memory cache
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry && (now - memoryEntry.timestamp) <= STREAM_CACHE_TTL_MS) {
    console.log(`[Memory Cache Hit] Found cached stream for session ${sessionId}, device ${deviceId}`);
    return memoryEntry.data;
  }
  
  // If not in memory, check DynamoDB
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { cacheKey: key }
    }));
    
    if (!result.Item) {
      console.log(`[Cache Miss] No cached stream found for session ${sessionId}, device ${deviceId}`);
      return null;
    }
    
    const item = result.Item as CacheItem;
    
    // Check if item is expired (extra safety check beyond TTL)
    if (item.timestamp && (now - item.timestamp) > STREAM_CACHE_TTL_MS) {
      // Clean up expired item
      await dynamodb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { cacheKey: key }
      }));
      return null;
    }
    
    const cachedData: CachedStreamData = {
      answerSdp: item.answerSdp,
      mediaSessionId: item.mediaSessionId,
      expiresAt: item.expiresAt,
      timestamp: item.timestamp,
      deviceId: item.deviceId
    };
    
    // Update memory cache with data from DynamoDB
    memoryCache.set(key, {
      data: cachedData,
      timestamp: item.timestamp
    });
    
    console.log(`[DynamoDB Cache Hit] Found cached stream in DynamoDB for session ${sessionId}, device ${deviceId}, updated memory cache`);
    return cachedData;
    
  } catch (error) {
    console.error('Error getting cached stream from DynamoDB:', error);
    return null;
  }
}

/**
 * Cache stream data for a session and device
 * Stores in both memory and DynamoDB
 */
export async function setCachedStream(sessionId: string, deviceId: string, data: CachedStreamData): Promise<void> {
  const key = generateCacheKey(sessionId, deviceId);
  const now = Date.now();
  
  // Store in memory cache first (fastest access)
  memoryCache.set(key, {
    data: data,
    timestamp: now
  });
  
  // Then store in DynamoDB for persistence
  try {
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
    
    console.log(`[Cache Set] Stored stream data in both memory and DynamoDB for session ${sessionId}, device ${deviceId}`);
  } catch (error) {
    console.error('Error setting cached stream in DynamoDB:', error);
    // Don't throw error to avoid breaking the main flow
    // Memory cache is still set, so some benefit remains
  }
}

/**
 * Check if cached stream data exists for a session and device
 * Checks both memory and DynamoDB
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
 * Clears from both memory and DynamoDB
 */
export async function clearSessionCache(sessionId: string): Promise<void> {
  const prefix = `stream:${sessionId}:`;
  
  // Clear from memory cache
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
  
  // Clear from DynamoDB
  try {
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
    console.error('Error clearing session cache from DynamoDB:', error);
    // Don't throw error to avoid breaking the main flow
  }
}

/**
 * Get cache statistics for monitoring
 * Includes both memory and DynamoDB statistics
 */
export async function getCacheStats(): Promise<{ 
  totalEntries: number; 
  sessionCount: number; 
  memoryEntries: number; 
  dynamodbEntries: number; 
  memorySessions: number;
}> {
  // Get memory cache stats
  cleanupMemoryCache(); // Clean expired entries first
  const memoryEntries = memoryCache.size;
  const memorySessions = new Set<string>();
  
  for (const key of memoryCache.keys()) {
    const parts = key.split(':');
    if (parts.length >= 2) {
      memorySessions.add(parts[1]);
    }
  }
  
  // Get DynamoDB stats
  try {
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAME,
      Select: 'ALL_ATTRIBUTES'
    }));
    
    const items = scanResult.Items || [];
    const dynamodbSessions = new Set<string>();
    
    for (const item of items) {
      if (item.cacheKey && typeof item.cacheKey === 'string') {
        const parts = item.cacheKey.split(':');
        if (parts.length >= 2) {
          dynamodbSessions.add(parts[1]);
        }
      }
    }
    
    // Total unique sessions (union of memory and DynamoDB)
    const allSessions = new Set([...memorySessions, ...dynamodbSessions]);
    
    return {
      totalEntries: memoryEntries + items.length,
      sessionCount: allSessions.size,
      memoryEntries: memoryEntries,
      dynamodbEntries: items.length,
      memorySessions: memorySessions.size
    };
  } catch (error) {
    console.error('Error getting cache stats from DynamoDB:', error);
    return {
      totalEntries: memoryEntries,
      sessionCount: memorySessions.size,
      memoryEntries: memoryEntries,
      dynamodbEntries: 0,
      memorySessions: memorySessions.size
    };
  }
}