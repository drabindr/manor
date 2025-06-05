import { APIGatewayProxyHandler } from "aws-lambda";
import { CognitoIdentityServiceProvider, DynamoDB } from "aws-sdk";

const cognito = new CognitoIdentityServiceProvider({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = new DynamoDB.DocumentClient({ region: process.env.AWS_REGION || 'us-east-1' });

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const USER_HOME_STATES_TABLE = process.env.USER_HOME_STATES_TABLE || '';

// Define default headers to include CORS
const defaultHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
};

interface UserProfile {
  userId: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

/**
 * Handler to fetch user profiles for users within the same home
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('UserProfiles request:', JSON.stringify(event, null, 2));

  // Handle OPTIONS requests for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: '',
    };
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { homeId, userIds } = requestBody;

    if (!homeId) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({ error: 'homeId is required' }),
      };
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({ error: 'userIds array is required' }),
      };
    }

    // Limit the number of users that can be requested at once
    if (userIds.length > 50) {
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({ error: 'Maximum 50 userIds allowed per request' }),
      };
    }

    // Verify all requested users belong to the specified home
    const homeUsers = await verifyUsersInHome(homeId, userIds);
    if (homeUsers.length === 0) {
      return {
        statusCode: 200,
        headers: defaultHeaders,
        body: JSON.stringify({ profiles: [] }),
      };
    }

    // Fetch user profiles from Cognito and local display names
    const profiles = await fetchUserProfiles(homeUsers);

    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ profiles }),
    };

  } catch (error) {
    console.error('Error fetching user profiles:', error);
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

/**
 * Verify that all requested users belong to the specified home
 */
async function verifyUsersInHome(homeId: string, userIds: string[]): Promise<{ userId: string; displayName?: string }[]> {
  try {
    const validUsers: { userId: string; displayName?: string }[] = [];

    // Query for each user to check if they belong to the home
    for (const userId of userIds) {
      try {
        const result = await dynamodb.query({
          TableName: USER_HOME_STATES_TABLE,
          KeyConditionExpression: 'userId = :userId AND homeId = :homeId',
          ExpressionAttributeValues: {
            ':userId': userId,
            ':homeId': homeId,
          },
          ProjectionExpression: 'userId, displayName'
        }).promise();

        if (result.Items && result.Items.length > 0) {
          validUsers.push({
            userId: userId,
            displayName: result.Items[0].displayName
          });
        }
      } catch (error) {
        console.error(`Error checking user ${userId} in home ${homeId}:`, error);
        // Continue with other users if one fails
      }
    }

    return validUsers;
  } catch (error) {
    console.error('Error verifying users in home:', error);
    return [];
  }
}

/**
 * Fetch user profiles from Cognito User Pool
 */
async function fetchUserProfiles(homeUsers: { userId: string; displayName?: string }[]): Promise<UserProfile[]> {
  const profiles: UserProfile[] = [];

  for (const homeUser of homeUsers) {
    try {
      // Try to get user data from Cognito
      const cognitoResult = await cognito.adminGetUser({
        UserPoolId: USER_POOL_ID,
        Username: homeUser.userId,
      }).promise();

      // Extract user attributes
      const attributes = cognitoResult.UserAttributes || [];
      const attributeMap: Record<string, string> = {};
      
      attributes.forEach((attr: any) => {
        if (attr.Name && attr.Value) {
          attributeMap[attr.Name] = attr.Value;
        }
      });

      const profile: UserProfile = {
        userId: homeUser.userId,
        displayName: homeUser.displayName,
        givenName: attributeMap['given_name'],
        familyName: attributeMap['family_name'],
        email: attributeMap['email'],
      };

      profiles.push(profile);

    } catch (error) {
      console.error(`Error fetching Cognito profile for user ${homeUser.userId}:`, error);
      
      // If Cognito lookup fails, return profile with just local data
      profiles.push({
        userId: homeUser.userId,
        displayName: homeUser.displayName,
      });
    }
  }

  return profiles;
}