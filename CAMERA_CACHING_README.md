# Camera Stream Caching Implementation

## Overview

This implementation adds a server-side caching mechanism to prevent repeated calls to Google for camera streams. The system uses session-based caching that allows users within close time intervals to resume camera streams without making new API calls to Google.

## Architecture

### Backend Components

#### 1. Session Cache (`packages/cdk/lambda/casa-integrations/utils/sessionCache.ts`)

**Key Features:**
- **DynamoDB-backed persistent storage** for session cache data
- 5-minute TTL (Time To Live) for cached stream data with automatic cleanup
- Session-based cache keys: `stream:{sessionId}:{deviceId}`
- **Cold start resilience** - cache persists across Lambda instance restarts
- **Multi-instance sharing** - cache data shared between Lambda instances
- Error-resilient design - cache failures don't break main functionality
- Cache statistics and monitoring

**Core Functions:**
- `getCachedStream()` - Retrieve cached stream data (async)
- `setCachedStream()` - Store stream data in cache (async)
- `hasCachedStream()` - Check if valid cache exists (async)
- `clearSessionCache()` - Clear all cache for a session (async)

**DynamoDB Schema:**
- **Table Name**: `SessionCacheTable`
- **Partition Key**: `cacheKey` (string) - format: `stream:{sessionId}:{deviceId}`
- **TTL Attribute**: `ttl` (number) - Unix timestamp for automatic cleanup
- **Additional Attributes**: `answerSdp`, `mediaSessionId`, `expiresAt`, `timestamp`, `deviceId`

#### 2. Integration Handler Updates (`packages/cdk/lambda/casa-integrations/integrationHandler.ts`)

**Changes Made:**
- Added session ID extraction from `X-Session-ID` header
- Modified `executeGoogleDeviceCommand()` to use **async cache operations**
- Added caching for `GenerateWebRtcStream` commands only
- Updated CORS headers to allow `X-Session-ID` header
- Added cache hit/miss logging
- **Error handling** for cache operations to ensure main functionality continues

#### 3. CDK Infrastructure (`packages/cdk/lib/casa-integrations-cdk-stack.ts`)

**Added Components:**
- **SessionCacheTable** DynamoDB table with TTL configuration
- Lambda permissions for DynamoDB read/write operations
- Environment variable `SESSION_CACHE_TABLE` for table name
- Updated CORS configuration to include `X-Session-ID` header

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
- **Cold Start Resilience**: Cache persists across Lambda instance restarts
- **Multi-Instance Sharing**: Cache data shared between Lambda instances
- **Graceful Degradation**: Falls back to Google API on cache misses
- **Error Resilience**: Cache failures don't break main camera functionality

### Monitoring & Debugging
- **Cache Statistics**: Monitor cache hit/miss ratios
- **Session Tracking**: Track session lifetimes and device counts
- **Enhanced Logging**: Detailed logs for cache operations

## Configuration

### Cache TTL Settings
- **Backend Cache**: 5 minutes (`STREAM_CACHE_TTL_MS = 5 * 60 * 1000`)
- **Frontend Session**: 10 minutes (`SESSION_TTL = 10 * 60 * 1000`)
- **DynamoDB TTL**: Automatic cleanup via `ttl` attribute

### Session Management
- **Session Key**: `manor_camera_session` in localStorage
- **Session ID Format**: `{timestamp}-{random}` for uniqueness
- **Cache Storage**: DynamoDB table `SessionCacheTable`
- **Automatic Cleanup**: DynamoDB TTL handles expired entries

### Environment Variables
- `SESSION_CACHE_TABLE`: DynamoDB table name for cache storage
- `AWS_REGION`: AWS region for DynamoDB operations

## Security Considerations

1. **DynamoDB Security**: Cache data is stored in DynamoDB with proper IAM permissions
2. **Session Isolation**: Each session has isolated cache entries  
3. **TTL Enforcement**: Automatic expiration prevents stale data
4. **CORS Protection**: Only allowed headers are accepted
5. **Error Handling**: Cache failures are logged but don't expose sensitive data

## Future Enhancements

1. **~~Redis Integration~~**: ✅ **COMPLETED** - Replaced in-memory cache with DynamoDB for persistence
2. **Cache Warming**: Pre-populate cache for frequently used cameras
3. **Analytics**: Track cache performance metrics via CloudWatch
4. **Adaptive TTL**: Adjust cache duration based on usage patterns
5. **Cache Prefetching**: Intelligently pre-fetch streams for likely next access

## Testing

The implementation includes comprehensive validation:
- All builds pass successfully (frontend + backend)
- Cache operations tested for correctness
- Session management validated
- Error handling verified for edge cases