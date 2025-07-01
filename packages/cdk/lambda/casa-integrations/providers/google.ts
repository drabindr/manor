// googleIntegration.ts

import axios from 'axios';
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';

// Create an SSM client
const ssmClient = new SSMClient({});

// Function to retrieve a parameter from AWS SSM Parameter Store
async function getParameter(
  name: string,
  withDecryption: boolean = false
): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: withDecryption,
  });

  const response = await ssmClient.send(command);
  return response.Parameter?.Value || '';
}

// Function to store a parameter in AWS SSM Parameter Store
async function putParameter(
  name: string,
  value: string,
  type: 'String' | 'SecureString' = 'SecureString'
): Promise<void> {
  const command = new PutParameterCommand({
    Name: name,
    Value: value,
    Type: type,
    Overwrite: true,
  });

  await ssmClient.send(command);
}

// Function to initiate the OAuth2 flow
export async function initiateOAuth2Flow(): Promise<string> {
  const clientId = await getParameter('/google/clientId');
  const redirectUri = await getParameter('/google/redirectUri');

  const scope = 'https://www.googleapis.com/auth/sdm.service';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(
    scope
  )}&access_type=offline&prompt=consent`;

  return authUrl;
}

// Function to handle the OAuth2 callback and exchange code for tokens
export async function handleOAuth2Callback(code: string): Promise<void> {
  const clientId = await getParameter('/google/clientId');
  const clientSecret = await getParameter('/google/clientSecret');
  const redirectUri = await getParameter('/google/redirectUri');

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', redirectUri);

  try {
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const refreshToken = response.data.refresh_token;

    if (refreshToken) {
      // Store the new refresh token securely
      await putParameter('/google/refreshToken', refreshToken);
    } else {
      throw new Error('No refresh token received');
    }
  } catch (error: any) {
    console.error(
      'Error exchanging authorization code:',
      error.response?.data || error.message
    );
    throw new Error('Failed to exchange authorization code');
  }
}

// Function to get an access token using the refresh token
async function getAccessToken(): Promise<string> {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getParameter('/google/clientId'),
    getParameter('/google/clientSecret'),
    getParameter('/google/refreshToken', true),
  ]);

  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  try {
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data.access_token;
  } catch (error: any) {
    console.error(
      'Error obtaining access token:',
      error.response?.data || error.message
    );

    if (error.response?.data?.error === 'invalid_grant') {
      // Handle invalid_grant error
      throw new Error('Refresh token expired or revoked. Re-authorization required.');
    }

    throw new Error('Failed to obtain access token');
  }
}

// Function to list all Google Nest devices
export async function listDevices(): Promise<any> {
  const accessToken = await getAccessToken();

  // Retrieve the project ID from SSM Parameter Store
  const projectId = await getParameter('/google/projectId');
  const url = `https://smartdevicemanagement.googleapis.com/v1/enterprises/${projectId}/devices`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    return response.data.devices;
  } catch (error: any) {
    console.error(
      'Error retrieving device list:',
      error.response?.data || error.message
    );
    throw new Error('Failed to retrieve devices');
  }
}

// Function to get device settings (for thermostats and cameras)
export async function getDeviceSettings(deviceId: string): Promise<any> {
  const accessToken = await getAccessToken();

  const url = `https://smartdevicemanagement.googleapis.com/v1/${deviceId}`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    return response.data;
  } catch (error: any) {
    console.error(
      'Error retrieving device settings:',
      error.response?.data || error.message
    );
    throw new Error('Failed to retrieve device settings');
  }
}

// Function to execute device commands (for thermostats and cameras)
export async function executeDeviceCommand(
  deviceId: string,
  command: string,
  params: any
): Promise<any> {
  const accessToken = await getAccessToken();

  const url = `https://smartdevicemanagement.googleapis.com/v1/${deviceId}:executeCommand`;

  const commandPayload = {
    command: command,
    params: params,
  };

  try {
    const response = await axios.post(url, commandPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error: any) {
    console.error(
      'Error executing device command:',
      error.response?.data || error.message
    );
    throw new Error('Failed to execute device command');
  }
}
