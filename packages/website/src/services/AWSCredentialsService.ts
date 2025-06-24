import type { AuthTokens, AuthConfig } from './AuthService';

// Separate service for AWS credentials to avoid circular dependencies
export class AWSCredentialsService {
  private static instance: AWSCredentialsService | null = null;

  static getInstance(): AWSCredentialsService {
    if (!AWSCredentialsService.instance) {
      AWSCredentialsService.instance = new AWSCredentialsService();
    }
    return AWSCredentialsService.instance;
  }

  async getCredentials(config: AuthConfig, tokens: AuthTokens) {
    if (!tokens) {
      throw new Error('User not authenticated');
    }

    try {
      // Load modules with controlled timing - sequentially to avoid race conditions
      const cognitoModule = await import('@aws-sdk/client-cognito-identity');
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
      const credentialModule = await import('@aws-sdk/credential-provider-cognito-identity');

      const { CognitoIdentityClient } = cognitoModule;
      const { fromCognitoIdentityPool } = credentialModule;

      const credentials = fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region: config.region }),
        identityPoolId: config.identityPoolId,
        logins: {
          [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: tokens.idToken,
        },
      });

      return credentials;
    } catch (error) {
      console.error('Error getting AWS credentials:', error);
      throw error;
    }
  }
}
