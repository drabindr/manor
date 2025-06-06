# Quick Start - Development Auth Bypass

For developers and testers who need to bypass Apple Sign-In:

## Enable Bypass Mode

```bash
# Set environment variable
export REACT_APP_BYPASS_AUTH_FOR_DEV=true

# Start development server
npm run dev
```

## What You'll See

1. **Login page shows "DEV MODE: Auth Bypass Enabled" warning**
2. **Button changes to "Continue to App (Dev Mode)"**
3. **Console shows bypass warnings**
4. **Automatically logged in as admin user**

## Mock User Details

- Email: `dev@manor.test`
- Name: `Dev User`  
- Role: `admin` (can test all features)
- Never expires during session

## Disable Bypass

```bash
# Remove or set to false
export REACT_APP_BYPASS_AUTH_FOR_DEV=false
# or
unset REACT_APP_BYPASS_AUTH_FOR_DEV
```

See [DEV_AUTH_BYPASS.md](DEV_AUTH_BYPASS.md) for complete documentation.