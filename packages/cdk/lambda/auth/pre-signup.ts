export const handler = async (event: any) => {
  console.log('Pre-signup event:', JSON.stringify(event, null, 2));
  
  try {
    // Get allowed Apple Sign-In email addresses from environment variable
    const allowedAppleEmailsStr = process.env.ALLOWED_APPLE_EMAILS || '';
    const allowedAppleEmails = allowedAppleEmailsStr
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0);
    
    console.log('Allowed Apple emails:', allowedAppleEmails);

    // Auto-confirm users from trusted identity providers
    if (event.triggerSource === 'PreSignUp_ExternalProvider') {
      console.log('Auto-confirming external provider user');
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = true;
    }

    // For Apple Sign-In, ensure required attributes are always present
    // Detect Apple users by username pattern (SignInWithApple_xxxxx)
    const isAppleUser = event.userName && event.userName.startsWith('SignInWithApple_');

    if (isAppleUser) {
      console.log('Processing Apple Sign-In pre-signup');
      
      // Check if the Apple user's email is in the allowed list
      const userEmail = event.request.userAttributes.email;
      if (!userEmail || !allowedAppleEmails.includes(userEmail.toLowerCase())) {
        console.log(`Apple Sign-In denied for email: ${userEmail}`);
        throw new Error(`Access denied. Only specific users are allowed to sign in with Apple.`);
      }
      
      console.log(`Apple Sign-In approved for email: ${userEmail}`);
      
      // Apple may or may not provide name information depending on user choice
      // If names are missing or empty, provide defaults to satisfy Cognito's required attributes
      if (!event.request.userAttributes.given_name || 
          event.request.userAttributes.given_name.trim() === '') {
        event.request.userAttributes.given_name = 'User';
        console.log('Set default given_name: User');
      }
      
      if (!event.request.userAttributes.family_name ||
          event.request.userAttributes.family_name.trim() === '') {
        event.request.userAttributes.family_name = 'Apple';
        console.log('Set default family_name: Apple');
      }
      
      console.log('Apple user attributes after processing:', {
        email: event.request.userAttributes.email,
        given_name: event.request.userAttributes.given_name,
        family_name: event.request.userAttributes.family_name
      });
    }

    console.log('Pre-signup completed successfully');
    return event;
  } catch (error) {
    console.error('Error in pre-signup:', error);
    // Re-throw the error to deny access
    throw error;
  }
};
