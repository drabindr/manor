// sessionCache.ts - In-memory cache for camera stream sessions

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

// In-memory cache storage
const streamCache = new Map<string, CacheEntry>();

// Cache TTL in milliseconds (5 minutes)
const STREAM_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Generate a cache key from session ID and device ID
 */
function generateCacheKey(sessionId: string, deviceId: string): string {
  return `stream:${sessionId}:${deviceId}`;
}

/**
 * Check if a cache entry is expired
 */
function isExpired(entry: CacheEntry): boolean {
  const now = Date.now();
  return (now - entry.timestamp) > STREAM_CACHE_TTL_MS;
}

/**
 * Get cached stream data for a session and device
 */
export function getCachedStream(sessionId: string, deviceId: string): CachedStreamData | null {
  const key = generateCacheKey(sessionId, deviceId);
  const entry = streamCache.get(key);
  
  if (!entry) {
    return null;
  }
  
  if (isExpired(entry)) {
    streamCache.delete(key);
    return null;
  }
  
  return entry.data;
}

/**
 * Cache stream data for a session and device
 */
export function setCachedStream(sessionId: string, deviceId: string, data: CachedStreamData): void {
  const key = generateCacheKey(sessionId, deviceId);
  const entry: CacheEntry = {
    data,
    timestamp: Date.now()
  };
  
  streamCache.set(key, entry);
  
  // Clean up expired entries periodically
  cleanupExpiredEntries();
}

/**
 * Check if cached stream data exists for a session and device
 */
export function hasCachedStream(sessionId: string, deviceId: string): boolean {
  const key = generateCacheKey(sessionId, deviceId);
  const entry = streamCache.get(key);
  
  if (!entry) {
    return false;
  }
  
  if (isExpired(entry)) {
    streamCache.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Remove expired entries from cache
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  
  for (const [key, entry] of streamCache.entries()) {
    if ((now - entry.timestamp) > STREAM_CACHE_TTL_MS) {
      streamCache.delete(key);
    }
  }
}

/**
 * Clear all cached streams for a specific session
 */
export function clearSessionCache(sessionId: string): void {
  for (const [key] of streamCache.entries()) {
    if (key.startsWith(`stream:${sessionId}:`)) {
      streamCache.delete(key);
    }
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): { totalEntries: number; sessionCount: number } {
  const sessions = new Set<string>();
  
  for (const key of streamCache.keys()) {
    const parts = key.split(':');
    if (parts.length >= 2) {
      sessions.add(parts[1]);
    }
  }
  
  return {
    totalEntries: streamCache.size,
    sessionCount: sessions.size
  };
}