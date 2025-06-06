# Development Authentication Bypass

This document explains how to use the authentication bypass feature for development and testing purposes.

## Overview

The authentication bypass feature allows developers and testers to skip the Apple Sign-In flow during development. This is particularly useful for:

- Automated testing and CI/CD pipelines
- Development without requiring Apple Sign-In credentials
- Quick testing of application features
- AI-driven testing tools that cannot navigate Apple Sign-In flows

## How to Enable

Set the following environment variable:

```bash
REACT_APP_BYPASS_AUTH_FOR_DEV=true
```

### Environment Files

#### For Development
Create or modify `.env.development`:
```bash
REACT_APP_BYPASS_AUTH_FOR_DEV=true
```

#### For Testing
Create or modify `.env.test`:
```bash
REACT_APP_BYPASS_AUTH_FOR_DEV=true
```

## What Happens When Enabled

When the bypass is enabled:

1. **Mock User Created**: A mock user is automatically created with admin privileges:
   - Email: `dev@manor.test`
   - Name: `Dev User`
   - Role: `admin` (for testing all features)
   - Home ID: `mock-home-id-123`

2. **Mock Tokens**: Mock authentication tokens are generated that never expire during the session

3. **Visual Indicators**: The login page shows a clear "DEV MODE" indicator

4. **Console Warnings**: Clear warnings are displayed in the browser console

## Security Considerations

⚠️ **IMPORTANT SECURITY NOTES:**

- This feature should **NEVER** be enabled in production
- The bypass only works when the environment variable is explicitly set to `true`
- Production builds should not include this environment variable
- The feature is designed to be fail-safe - if not explicitly enabled, normal authentication is used

## Testing Usage

### Manual Testing
1. Set `REACT_APP_BYPASS_AUTH_FOR_DEV=true` in your `.env.development` file
2. Start the development server: `npm run dev`
3. Navigate to the application - you'll see the "DEV MODE" indicator
4. Click the "Continue to App (Dev Mode)" button
5. You'll be automatically logged in as the mock user

### Automated Testing
```javascript
// Set environment variable before running tests
process.env.REACT_APP_BYPASS_AUTH_FOR_DEV = 'true';

// Your tests can now run without authentication barriers
```

### CI/CD Pipelines
```yaml
# Example GitHub Actions configuration
env:
  REACT_APP_BYPASS_AUTH_FOR_DEV: true
```

## Mock User Details

The mock user has the following properties:
- **Sub**: `dev-mock-user-12345`
- **Email**: `dev@manor.test`
- **Given Name**: `Dev`
- **Family Name**: `User`
- **Role**: `admin`
- **Home ID**: `mock-home-id-123`

This allows testing of all features including admin-only functionality.

## API Calls

When bypass mode is enabled:
- All API calls will include the mock access token
- The token is: `mock-access-token-for-dev`
- Backend services should be configured to accept this token in development environments

## Debugging

You can check the auth status in the browser console:
```javascript
// Check if auth service is available
window.authService.getTokenStatus()

// This will show bypass mode status and mock token information
```

## Disabling the Bypass

To disable the bypass:
1. Remove the environment variable, OR
2. Set `REACT_APP_BYPASS_AUTH_FOR_DEV=false`, OR
3. Leave the variable undefined

The application will immediately return to normal Apple Sign-In authentication.

## Troubleshooting

### Bypass Not Working
- Check that `REACT_APP_BYPASS_AUTH_FOR_DEV` is exactly `true` (case sensitive)
- Restart the development server after changing environment variables
- Clear browser localStorage and refresh

### Still Seeing Login Page
- Verify the environment variable is set correctly
- Check browser console for warnings about bypass mode
- Ensure you're not in production mode

### Mock Tokens Rejected by API
- Ensure your backend/API is configured to accept mock tokens in development
- Check that API endpoints are not enforcing real token validation in dev mode