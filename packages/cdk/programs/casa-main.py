import RPi.GPIO as GPIO
import logging
from logging import handlers
import json
import os
import time
import websocket
import threading
import boto3
from datetime import datetime, timedelta
import pytz
import uuid

# Configuration Constants
HOME_ID = "720frontrd"  # Configurable home identifier
INSTANCE_ID = str(uuid.uuid4())[:8]  # Generate a unique ID for this instance

# GPIO Pin Definitions
PIN_DOOR = 4  # Door sensor
PIN_MOTION = 13  # Motion sensor
PIN_ZONE_3 = 26
PIN_ZONE_4 = 19  # Basement Window
PIN_ZONE_5 = 6   # Office Window
PIN_ZONE_6 = 27
PIN_ZONE_7 = 17  # Rear Window
PIN_ZONE_8 = 22  # Attic Door
PIN_SIREN = 23

# Set up GPIO
GPIO.setmode(GPIO.BCM)
GPIO.setup([PIN_DOOR, PIN_MOTION, PIN_ZONE_3, PIN_ZONE_4, PIN_ZONE_5,
            PIN_ZONE_6, PIN_ZONE_7, PIN_ZONE_8], GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.setup(PIN_SIREN, GPIO.OUT)

# Create the logs directory if it doesn't exist
logs_dir = "/tmp/logs"
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

# Configure logging
log_filename = os.path.join(logs_dir, "sensor-status.log")
logger = logging.getLogger("SensorLogger")
logger.setLevel(logging.INFO)
handler = logging.handlers.TimedRotatingFileHandler(
    log_filename, when="H", interval=1, backupCount=7*24
)
formatter = logging.Formatter('%(asctime)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# AWS Credentials and Setup
aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')
aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
region_name = 'us-east-1'
dynamodb = boto3.resource('dynamodb', aws_access_key_id=aws_access_key_id,
                          aws_secret_access_key=aws_secret_access_key, region_name=region_name)
event_logs_table = dynamodb.Table('EventLogs')

# Setup WebSocket
ws_url = 'wss://w42qpgs203.execute-api.us-east-1.amazonaws.com/prod'
MAX_RECONNECT_ATTEMPTS = 10
RECONNECT_EXPONENTIAL_BACKOFF = 2
RECONNECT_MIN_WAIT = 1  # Minimum wait time in seconds
ws = None
ws_connected_event = threading.Event()

system_mode = "Disarm"  # Disarm, Arm Stay, Arm Away
system_connected = False

# Variables for auto arm override logic
last_arm_was_auto = False
manual_override = False
manual_override_until = None
MANUAL_OVERRIDE_TTL_MINUTES = 30

def update_alarm_state_in_db():
    """Update the AlarmState table with the current system mode"""
    try:
        alarm_state_table = dynamodb.Table('AlarmState')
        alarm_state_item = {
            "id": HOME_ID,
            "mode": system_mode,
            "lastUpdated": datetime.utcnow().isoformat(),
            "instanceId": INSTANCE_ID,
            "connected": system_connected
        }
        alarm_state_table.put_item(Item=alarm_state_item)
        logger.info(f"Updated AlarmState in DB to {system_mode}, connected={system_connected}")
    except Exception as e:
        logger.error(f"Failed to update alarm state in DB: {e}")

def trigger_alarm():
    log_event("ALARM triggered")
    GPIO.output(PIN_SIREN, GPIO.HIGH)

def stop_alarm():
    GPIO.output(PIN_SIREN, GPIO.LOW)

def log_event(event_description):
    event_id = str(int(time.time() * 1000))
    event_time = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"
    ttl = int(time.time()) + 7 * 24 * 60 * 60  # TTL set to 7 days from now (in seconds)
    event_data = {
        "id": event_id,
        "event": event_description,
        "timestamp": event_time,
        "ttl": ttl,
        "homeId": HOME_ID  # Add home ID to the event
    }
    logger.info(json.dumps(event_data))
    logger.debug(f"log_event: ws={ws}, ws.sock={getattr(ws, 'sock', None)}, ws.sock.connected={getattr(getattr(ws, 'sock', None), 'connected', None)}")
    
    try:
        event_logs_table.put_item(Item=event_data)
    except Exception as e:
        logger.error(f"Failed to write event to DynamoDB: {e}")

    # Send the event to WebSocket if it's not a mode change or system event
    if event_description not in ["Arm Stay", "Arm Away", "Disarm"] and "System" not in event_description:
        ensure_websocket_connection()
        if ws and ws.sock and ws.sock.connected:
            try:
                ws.send(json.dumps(event_data))
                logger.info("Sent event to WebSocket")
            except Exception as e:
                logger.error(f"Failed to send event to WebSocket: {e}")

def on_open(wsapp):
    global system_connected
    system_connected = True
    ws_connected_event.set()
    update_alarm_state_in_db()

def on_message(wsapp, message):
    global system_mode, manual_override, manual_override_until, last_arm_was_auto
    logger.info(f"Message from server: {message}")
    try:
        message_data = json.loads(message)
        
        # Handle ping messages
        if "event" in message_data and message_data["event"] == "ping":
            pong_response = {
                "id": str(int(time.time() * 1000)),
                "event": "pong",
                "homeId": HOME_ID,
                "instanceId": INSTANCE_ID,
                "systemState": system_mode,
                "timestamp": datetime.utcnow().isoformat()
            }
            wsapp.send(json.dumps(pong_response))
            logger.info("Sent pong response to WebSocket")
            return
            
        # Handle command messages
        if "command" in message_data:
            command = message_data["command"]
            command_id = message_data.get("commandId", "unknown")
            
            logger.info(f"Received command: {command} with ID: {command_id}")
            
            if command in ["Arm Stay", "Arm Away", "Disarm"]:
                previous_mode = system_mode
                system_mode = command
                
                # Send command acknowledgment
                ack_response = {
                    "id": str(int(time.time() * 1000)),
                    "type": "command_ack",
                    "commandId": command_id,
                    "success": True,
                    "homeId": HOME_ID,
                    "state": system_mode,
                    "timestamp": datetime.utcnow().isoformat()
                }
                wsapp.send(json.dumps(ack_response))
                
                # Continue with the rest of the operations
                log_event(f"System mode changed to {system_mode}")
                
                # Handle overrides logic
                if system_mode in ["Arm Stay", "Arm Away"]:
                    manual_override = False
                    manual_override_until = None
                    last_arm_was_auto = False
                elif system_mode == "Disarm":
                    if last_arm_was_auto:
                        manual_override = True
                        manual_override_until = datetime.utcnow() + timedelta(minutes=MANUAL_OVERRIDE_TTL_MINUTES)
                        logger.info(f"Manual override set until {manual_override_until.isoformat()}")
                        last_arm_was_auto = False
                    else:
                        manual_override = False
                        manual_override_until = None

                if system_mode == "Disarm":
                    stop_alarm()
                
                # Update AlarmState in DB
                update_alarm_state_in_db()
            
            # Add support for GetSystemState command
            elif command == "GetSystemState":
                # Send current system state back to requestor
                state_response = {
                    "id": str(int(time.time() * 1000)),
                    "type": "command_ack",
                    "commandId": command_id,
                    "success": True,
                    "homeId": HOME_ID,
                    "state": system_mode,
                    "timestamp": datetime.utcnow().isoformat()
                }
                wsapp.send(json.dumps(state_response))
                logger.info(f"Responded to GetSystemState request with state: {system_mode}")
    except Exception as e:
        logger.error(f"Error parsing message data: {e}")

def on_error(wsapp, error):
    logger.error(f"WebSocket error: {error}")
    # Log more details if possible
    try:
        import traceback
        logger.error(f"WebSocket error traceback: {traceback.format_exc()}")
        logger.error(f"WebSocketApp object: {wsapp}")
        if hasattr(wsapp, 'sock'):
            logger.error(f"wsapp.sock: {wsapp.sock}, wsapp.sock.connected: {getattr(wsapp.sock, 'connected', None)}")
    except Exception as debug_e:
        logger.error(f"Error during error debugging: {debug_e}")

def on_close(wsapp, close_status_code, close_msg):
    global ws, system_connected
    ws = None
    system_connected = False
    logger.info(f"WebSocket closed with code: {close_status_code}, reason: {close_msg}")
    logger.debug(f"on_close wsapp: {wsapp}")
    logger.debug(f"on_close wsapp.sock: {getattr(wsapp, 'sock', None)}")
    logger.debug(f"on_close wsapp.sock.connected: {getattr(getattr(wsapp, 'sock', None), 'connected', None)}")
    ws_connected_event.clear()
    update_alarm_state_in_db()

def ensure_websocket_connection():
    global ws
    reconnect_attempts = 0
    while not ws_connected_event.is_set() and reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
        if ws is None or not ws.sock or not ws.sock.connected:
            try:
                logger.info(f"Attempting to connect to WebSocket... [Attempt {reconnect_attempts+1}/{MAX_RECONNECT_ATTEMPTS}]")
                logger.info(f"WebSocket URL: {ws_url}")
                ws = websocket.WebSocketApp(ws_url,
                                            on_open=on_open,
                                            on_message=on_message,
                                            on_error=on_error,
                                            on_close=on_close)
                thread = threading.Thread(target=ws.run_forever)
                thread.daemon = True
                thread.start()
                ws_connected_event.wait(10)  # Wait for connection to establish
                if ws_connected_event.is_set():
                    logger.info("WebSocket connection established.")
                    break
                else:
                    logger.warning("WebSocket connection not established after wait.")
            except Exception as e:
                logger.error(f"Failed to connect to WebSocket: {e}")
            finally:
                # Print out the current thread list for debugging
                import threading as th
                logger.debug(f"Active threads: {[t.name for t in th.enumerate()]}")

        else:
            logger.debug("WebSocket object exists and appears connected.")

        wait_time = RECONNECT_MIN_WAIT * (RECONNECT_EXPONENTIAL_BACKOFF ** reconnect_attempts)
        logger.info(f"Waiting {wait_time} seconds before next reconnect attempt.")
        time.sleep(wait_time)
        reconnect_attempts += 1

    if reconnect_attempts >= MAX_RECONNECT_ATTEMPTS:
        logger.error("Maximum WebSocket reconnection attempts reached.")
    # Log final state of ws object
    logger.debug(f"Final ws object: {ws}")
    if ws and hasattr(ws, 'sock'):
        logger.debug(f"ws.sock: {ws.sock}, ws.sock.connected: {getattr(ws.sock, 'connected', None)}")

def auto_arm_disarm():
    global system_mode, last_arm_was_auto, manual_override, manual_override_until

    # Check if manual override expired
    if manual_override and manual_override_until:
        if datetime.utcnow() > manual_override_until:
            # Override expired
            manual_override = False
            manual_override_until = None
            logger.info("Manual override expired, auto-arm allowed again.")

    # If override is active, skip auto-arm actions
    if manual_override:
        return

    utc_now = datetime.utcnow()
    est = pytz.timezone('US/Eastern')
    est_now = utc_now.astimezone(est)

    # Auto-arm if between 2:30AM and 5:00AM and currently disarmed
    if (est_now.hour > 2 or (est_now.hour == 2 and est_now.minute >= 30)) and (est_now.hour < 5 or (est_now.hour == 5 and est_now.minute < 30)):
        if system_mode == "Disarm":
            system_mode = "Arm Stay"
            log_event("System mode changed to Arm Stay (auto)")
            last_arm_was_auto = True
    # Auto-disarm at or after 5:30AM if currently arm stay and previously auto
    elif est_now.hour == 5 and est_now.minute >= 30:
        if system_mode == "Arm Stay":
            system_mode = "Disarm"
            log_event("System mode changed to Disarm (auto)")
            last_arm_was_auto = True

try:
    logger.info("Starting sensor monitoring...")
    time.sleep(5)  # Short delay before connecting
    ensure_websocket_connection()
    log_event(f"Connected from {HOME_ID}")

    # Initial state setup for zones
    pins = [PIN_DOOR, PIN_MOTION, PIN_ZONE_3, PIN_ZONE_4, PIN_ZONE_5, PIN_ZONE_6, PIN_ZONE_7, PIN_ZONE_8]
    zone_names = ["Front Door", "MOTION", "ZONE 3",
                  "Basement Window", "Office Window", "ZONE 6", "Rear Lower Windows", "Attic Door"]
    prev_states = [GPIO.input(pin) for pin in pins]

    while True:
        ensure_websocket_connection()
        auto_arm_disarm()
        for index, pin in enumerate(pins):
            current_state = GPIO.input(pin)
            if current_state != prev_states[index]:
                zone_name = zone_names[index]
                if zone_name != "MOTION":
                    log_event(f"{zone_name} {'opened' if current_state else 'closed'}")

                # Handle system modes for specific sensors
                if system_mode == "Arm Away" and current_state:
                    trigger_alarm()
                elif system_mode == "Arm Stay":
                    if current_state and zone_name != "MOTION":
                        trigger_alarm()

                prev_states[index] = current_state

        time.sleep(1)

except KeyboardInterrupt:
    logger.info("Script terminated by user")
finally:
    GPIO.cleanup()
    if ws:
        ws.close()
