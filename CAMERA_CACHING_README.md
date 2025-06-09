# Camera Stream Caching Implementation

## Overview

This implementation adds a server-side caching mechanism to prevent repeated calls to Google for camera streams. The system uses session-based caching that allows users within close time intervals to resume camera streams without making new API calls to Google.

## Architecture

### Backend Components

#### 1. Session Cache (`packages/cdk/lambda/casa-integrations/utils/sessionCache.ts`)

**Key Features:**
- In-memory cache storage using JavaScript Map
- 5-minute TTL (Time To Live) for cached stream data
- Session-based cache keys: `stream:{sessionId}:{deviceId}`
- Automatic cleanup of expired entries
- Cache statistics and monitoring

**Core Functions:**
- `getCachedStream()` - Retrieve cached stream data
- `setCachedStream()` - Store stream data in cache
- `hasCachedStream()` - Check if valid cache exists
- `clearSessionCache()` - Clear all cache for a session

#### 2. Integration Handler Updates (`packages/cdk/lambda/casa-integrations/integrationHandler.ts`)

**Changes Made:**
- Added session ID extraction from `X-Session-ID` header
- Modified `executeGoogleDeviceCommand()` to check cache before calling Google API
- Added caching for `GenerateWebRtcStream` commands only
- Updated CORS headers to allow `X-Session-ID` header
- Added cache hit/miss logging

### Frontend Components

#### 1. Session Service (`packages/website/src/services/SessionService.ts`)

**Key Features:**
- Singleton pattern for global session management
- 10-minute session TTL (longer than backend cache for better UX)
- Persistent storage using localStorage
- Device-specific media session tracking
- Automatic session generation and renewal

**Core Functions:**
- `getSessionId()` - Get or create session ID
- `setDeviceMediaSession()` - Store media session for device
- `getDeviceMediaSession()` - Retrieve media session for device
- `refreshSession()` - Extend session lifetime

#### 2. Camera Card Updates (`packages/website/src/CameraCard.tsx`)

**Changes Made:**
- Integrated SessionService for session management
- Added `X-Session-ID` header to all API requests
- Enhanced loading messages to indicate cache status
- Added logic to check for cached media sessions before generating new streams
- Improved session expiration handling

## Caching Flow

### First Time Access (Cache Miss)

1. User opens camera page
2. Frontend generates new session ID and stores in localStorage
3. Frontend sends request with session ID header
4. Backend checks cache - no data found
5. Backend calls Google API to generate stream
6. Backend caches the response with session+device key
7. Frontend stores media session ID locally
8. Camera stream displays

### Subsequent Access (Cache Hit)

1. User refreshes page or opens camera again (within 5 minutes)
2. Frontend loads existing session ID from localStorage
3. Frontend sends request with session ID header
4. Backend checks cache - finds valid cached data
5. Backend returns cached stream data immediately (no Google API call)
6. Camera stream displays faster

### Session Expiration Handling

1. If Google media session expires (404/410 response):
   - Frontend clears cached media session for device
   - Backend cache entry becomes stale
   - Next request triggers new Google API call

2. If backend cache expires (>5 minutes):
   - Cache entry is automatically removed
   - Next request triggers new Google API call

3. If frontend session expires (>10 minutes):
   - New session ID is generated
   - New backend cache entries will be created

## Benefits

### Performance Improvements
- **Faster Load Times**: Cache hits return instantly vs Google API calls
- **Reduced Latency**: No network round-trip to Google for cached data
- **Better User Experience**: Enhanced loading indicators show cache status

### Reliability Improvements
- **Reduced API Rate Limiting**: Fewer calls to Google's API
- **Session Persistence**: Camera streams survive page refreshes
- **Graceful Degradation**: Falls back to Google API on cache misses

### Monitoring & Debugging
- **Cache Statistics**: Monitor cache hit/miss ratios
- **Session Tracking**: Track session lifetimes and device counts
- **Enhanced Logging**: Detailed logs for cache operations

## Configuration

### Cache TTL Settings
- **Backend Cache**: 5 minutes (`STREAM_CACHE_TTL_MS = 5 * 60 * 1000`)
- **Frontend Session**: 10 minutes (`SESSION_TTL = 10 * 60 * 1000`)

### Session Management
- **Session Key**: `manor_camera_session` in localStorage
- **Session ID Format**: `{timestamp}-{random}` for uniqueness
- **Automatic Cleanup**: Expired entries removed periodically

## Security Considerations

1. **In-Memory Only**: Cache data is not persisted to disk
2. **Session Isolation**: Each session has isolated cache entries  
3. **TTL Enforcement**: Automatic expiration prevents stale data
4. **CORS Protection**: Only allowed headers are accepted

## Future Enhancements

1. **Redis Integration**: Replace in-memory cache with Redis for scaling
2. **Cache Warming**: Pre-populate cache for frequently used cameras
3. **Analytics**: Track cache performance metrics
4. **Adaptive TTL**: Adjust cache duration based on usage patterns

## Testing

The implementation includes comprehensive validation:
- All builds pass successfully (frontend + backend)
- Cache operations tested for correctness
- Session management validated
- Error handling verified for edge cases