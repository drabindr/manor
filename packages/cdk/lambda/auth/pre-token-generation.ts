export const handler = async (event: any) => {
  console.log('Pre-token generation event:', JSON.stringify(event, null, 2));
  
  // Initialize the response
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {},
      claimsToSuppress: [],
      groupOverrideDetails: null
    }
  };

  try {
    // For Apple Sign-In users, check if we need to provide fallback names
    if (event.callerContext && event.callerContext.clientId) {
      const provider = event.request.userAttributes['identities'] ? 
        JSON.parse(event.request.userAttributes['identities'])[0]?.providerName : null;
      
      if (provider === 'SignInWithApple') {
        console.log('Processing Apple Sign-In user');
        
        // Only provide fallbacks if the user truly doesn't have names
        // This handles the case where Apple didn't provide names on first login
        const currentGivenName = event.request.userAttributes.given_name;
        const currentFamilyName = event.request.userAttributes.family_name;
        
        if (!currentGivenName || currentGivenName.trim() === '') {
          const fallbackGivenName = event.request.userAttributes.name?.split(' ')[0] || 'User';
          event.response.claimsOverrideDetails.claimsToAddOrOverride.given_name = fallbackGivenName;
          console.log(`Added fallback given_name: ${fallbackGivenName}`);
        }
        
        if (!currentFamilyName || currentFamilyName.trim() === '') {
          const fallbackFamilyName = event.request.userAttributes.name?.split(' ').slice(1).join(' ') || 'Apple';
          event.response.claimsOverrideDetails.claimsToAddOrOverride.family_name = fallbackFamilyName;
          console.log(`Added fallback family_name: ${fallbackFamilyName}`);
        }
        
        // Ensure email is properly set
        if (event.request.userAttributes.email) {
          event.response.claimsOverrideDetails.claimsToAddOrOverride.email = 
            event.request.userAttributes.email;
        }
      }
    }

    // Add custom claims based on user attributes
    if (event.request.userAttributes['custom:role']) {
      event.response.claimsOverrideDetails.claimsToAddOrOverride['custom:role'] = 
        event.request.userAttributes['custom:role'];
    }

    if (event.request.userAttributes['custom:homeId']) {
      event.response.claimsOverrideDetails.claimsToAddOrOverride['custom:homeId'] = 
        event.request.userAttributes['custom:homeId'];
    }

    console.log('Pre-token generation completed successfully');
    return event;
  } catch (error) {
    console.error('Error in pre-token generation:', error);
    // Don't throw error, just log and continue
    return event;
  }
};
