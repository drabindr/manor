import websocket
import json
import requests
import time
import logging
from logging import handlers
import threading
import os

# Set up logging
logs_dir = "/tmp/logs"
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

log_filename = os.path.join(logs_dir, "hue.log")
logger = logging.getLogger("HueLogger")
logger.setLevel(logging.INFO)
handler = logging.handlers.TimedRotatingFileHandler(
    log_filename, when="H", interval=1, backupCount=7 * 24
)
formatter = logging.Formatter('%(asctime)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# Philips Hue Bridge IP and credentials
PHILIPS_HUE_BRIDGE_IP = "192.168.86.115"
PHILIPS_HUE_USER = "t3SH1fzd1zG6tY5hqygvxFprZkQs1FfFatJwoG-L"

# WebSocket URL (from your WebSocket API)
WS_URL = "wss://zt4cmsh5r8.execute-api.us-east-1.amazonaws.com/prod"

# Function to list lights from the Philips Hue Bridge
def list_lights():
    try:
        url = f"http://{PHILIPS_HUE_BRIDGE_IP}/api/{PHILIPS_HUE_USER}/lights"
        response = requests.get(url)
        if response.status_code == 200:
            logger.info("Successfully retrieved lights")
            return response.json()
        else:
            logger.error(f"Failed to retrieve lights: {response.status_code} - {response.content}")
            return {"error": "Failed to retrieve lights"}
    except Exception as e:
        logger.error(f"Error while fetching lights: {e}")
        return {"error": str(e)}

# Function to toggle (trigger) light on or off
def trigger_light(light_id, state):
    try:
        url = f"http://{PHILIPS_HUE_BRIDGE_IP}/api/{PHILIPS_HUE_USER}/lights/{light_id}/state"
        payload = {"on": state}
        response = requests.put(url, json=payload)
        if response.status_code == 200:
            logger.info(f"Successfully set light {light_id} to {'on' if state else 'off'}")
            return {"success": True, "light_id": light_id, "state": state}
        else:
            logger.error(f"Failed to set light {light_id}: {response.status_code} - {response.content}")
            return {"error": "Failed to set light state"}
    except Exception as e:
        logger.error(f"Error while triggering light: {e}")
        return {"error": str(e)}

# WebSocket event handlers
def on_message(ws, message):
    logger.info(f"Received message: {message}")
    try:
        data = json.loads(message)

        # Handle the "list_lights" command
        if data.get("command") == "list_lights":
            lights = list_lights()

            # Send the result back to the WebSocket
            ws.send(json.dumps({
                "response": "list_lights",
                "data": lights
            }))

        # Handle the "trigger_light" command
        elif data.get("command") == "trigger_light":
            # Access data fields under the "data" key
            light_data = data.get("data", {})
            light_id = light_data.get("lightId")
            state = light_data.get("state")

            if light_id is not None and state is not None:
                result = trigger_light(light_id, state)

                # Send the result back to the WebSocket
                ws.send(json.dumps({
                    "response": "trigger_light_response",
                    "data": result
                }))
            else:
                logger.error("Invalid lightId or state received")
                ws.send(json.dumps({
                    "response": "trigger_light_response",
                    "error": "Invalid lightId or state"
                }))
    except Exception as e:
        logger.error(f"Error processing message: {e}")

def on_open(ws):
    logger.info("WebSocket connection opened")

def on_error(ws, error):
    logger.error(f"WebSocket error: {error}")

def on_close(ws, close_status_code, close_msg):
    logger.info(f"WebSocket closed: {close_status_code} - {close_msg}")
    # No recursive call here

# Start the WebSocket client with reconnection logic
def run_websocket_client():
    while True:
        try:
            ws = websocket.WebSocketApp(
                WS_URL,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            ws.run_forever()
        except Exception as e:
            logger.error(f"Exception in WebSocket connection: {e}")
        logger.info("WebSocket connection closed, reconnecting in 5 seconds")
        time.sleep(5)

if __name__ == "__main__":
    logger.info("Starting WebSocket client for Philips Hue control")
    run_websocket_client()
