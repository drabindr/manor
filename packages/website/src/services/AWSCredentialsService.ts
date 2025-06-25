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
      // Simple dynamic import without over-engineering
      const { CognitoIdentityClient } = await import('@aws-sdk/client-cognito-identity');
      const { fromCognitoIdentityPool } = await import('@aws-sdk/credential-provider-cognito-identity');

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
