#!/bin/bash

# Script to test the Apple login flow in Cognito
echo "Testing Apple login flow..."

# Generate a test URL for Apple login
USER_POOL_ID=$(grep REACT_APP_USER_POOL_ID .env.production | cut -d '=' -f2)
CLIENT_ID=$(grep REACT_APP_USER_POOL_CLIENT_ID .env.production | cut -d '=' -f2)
AUTH_DOMAIN=$(grep REACT_APP_AUTH_DOMAIN .env.production | cut -d '=' -f2)
REDIRECT_URI="https://720frontrd.mymanor.click/auth/callback"

# Construct the login URL
LOGIN_URL="https://${AUTH_DOMAIN}/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&identity_provider=SignInWithApple&scope=openid+email+profile"

echo "Apple login URL:"
echo "$LOGIN_URL"
echo ""
echo "Test this URL in your browser to verify the Apple login flow."
echo "After successful login, you should be redirected to your application without errors."
