// How to deploy:
// scp programs/hue.py drabindr@casaguard:/home/drabindr/ && ssh drabindr@casaguard 'sudo reboot'

import WebSocket from 'ws';
import { promisify } from 'util';

const WS_URL = 'wss://zt4cmsh5r8.execute-api.us-east-1.amazonaws.com/prod'; // WebSocket URL

// Promisified delay function for waiting for the response
const wait = promisify(setTimeout);

// Function to trigger the list_lights command over the WebSocket
export const listLights = async () => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    let isResponseReceived = false;

    // On WebSocket connection open, send the list_lights command
    ws.on('open', () => {
      console.log('Connected to WebSocket, sending list_lights command...');
      ws.send(JSON.stringify({ command: 'list_lights' }));
    });

    // Handle WebSocket messages (response from the WebSocket)
    ws.on('message', (message: string) => {
      console.log(`Received message from WebSocket: ${message}`);
      const parsedMessage = JSON.parse(message);

      // Ignore the first message if it's an empty list_lights response
      if (parsedMessage.data && Object.keys(parsedMessage.data).length === 0) {
        console.log('Ignoring initial empty list_lights response...');
        return;
      }

      // Check if we received the real lights data
      if (parsedMessage.data && Object.keys(parsedMessage.data).length > 0) {
        isResponseReceived = true;
        resolve(parsedMessage.data);  // Resolve with the lights data
        ws.close();
      }
    });

    // Handle WebSocket errors
    ws.on('error', (error: any) => {
      console.error(`WebSocket error: ${error}`);
      if (!isResponseReceived) {
        reject(new Error(`WebSocket error: ${error}`));
      }
      ws.close();
    });

    // Handle WebSocket close event
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      if (!isResponseReceived) {
        reject(new Error('WebSocket closed before a response was received'));
      }
    });

    // Set a timeout in case no response is received in 10 seconds
    wait(10000).then(() => {
      if (!isResponseReceived) {
        reject(new Error('No response from WebSocket in time'));
        ws.close();
      }
    });
  });
};

// Function to trigger a light (on/off) over the WebSocket
export const triggerLight = async (lightId: string, state: boolean) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    let isResponseReceived = false;

    // On WebSocket connection open, send the trigger command
    ws.on('open', () => {
      console.log('Connected to WebSocket, sending trigger command...');
      ws.send(
        JSON.stringify({
          command: 'trigger_light',
          data: {
            lightId,
            state,
          },
        })
      );
    });

    // Handle WebSocket messages (response from the WebSocket)
    ws.on('message', (message: string) => {
      console.log(`Received message from WebSocket: ${message}`);
      const parsedMessage = JSON.parse(message);

      // Check if the response contains the light_id and success for the trigger command
      if (parsedMessage.data && parsedMessage.data.light_id === lightId) {
        const { success, state } = parsedMessage.data;

        if (success) {
          isResponseReceived = true;
          resolve(parsedMessage.data);  // Resolve with the result of the trigger command
          ws.close();
        } else {
          reject(new Error(`Failed to trigger light ${lightId}`));
          ws.close();
        }
      }
    });

    // Handle WebSocket errors
    ws.on('error', (error: any) => {
      console.error(`WebSocket error: ${error}`);
      if (!isResponseReceived) {
        reject(new Error(`WebSocket error: ${error}`));
      }
      ws.close();
    });

    // Handle WebSocket close event
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      if (!isResponseReceived) {
        reject(new Error('WebSocket closed before a response was received'));
      }
    });

    // Set a timeout in case no response is received in 5 seconds
    setTimeout(() => {
      if (!isResponseReceived) {
        reject(new Error(`No response for light ${lightId} in time`));
        ws.close();
      }
    }, 5000); // Timeout after 5 seconds
  });
};