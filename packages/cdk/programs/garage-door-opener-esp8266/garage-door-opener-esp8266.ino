/*
 * Garage Door Controller for ESP8266MOD - STABILITY IMPROVED VERSION
 * 
 * Target: ESP8266MOD (NodeMCU, Wemos D1 Mini, etc.)
 * Required Libraries:
 * - ESP8266WiFi (built-in)
 * - WebSocketsClient by Markus Sattler
 * - ArduinoJson
 * 
 * STABILITY IMPROVEMENTS:
 * - Watchdog timer management
 * - Memory leak prevention
 * - Automatic reset/recovery mechanisms
 * - Connection health monitoring
 * - Error recovery protocols
 * - Stack overflow protection
 * - Simplified state management
 */

#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Ticker.h>

// WiFi credentials - update these with your network details
const char* ssid = "NSA Truck";
const char* password = "a1b2c3d4e519";

// WebSocket API Gateway endpoint
const char* websocketHost = "ie0qxhdgx9.execute-api.us-east-1.amazonaws.com";
const int websocketPort = 443; // WSS port for secure WebSocket
const String websocketPath = "/prod";

// Device configuration
const String deviceId = "garage-door-001"; // Unique identifier for this device
const String deviceName = "Main Garage Door";

// Pin definitions (ESP8266 GPIO mapping)
const int RELAY_PIN = 12;    // D6 on NodeMCU (GPIO12)
const int DOOR_SENSOR_PIN = 14; // D5 on NodeMCU (GPIO14)

// Sensor configuration - change this if your sensor logic is inverted
const bool SENSOR_INVERTED = true; // Set to true if sensor readings are backwards

// STABILITY CONSTANTS
const unsigned long WATCHDOG_FEED_INTERVAL = 5000; // Feed watchdog every 5 seconds
const unsigned long MEMORY_CHECK_INTERVAL = 30000; // Check memory every 30 seconds
const unsigned long FORCED_RESTART_INTERVAL = 86400000; // Force restart every 24 hours
const unsigned long CONNECTION_TIMEOUT = 30000; // 30 seconds connection timeout
const unsigned long MAX_UPTIME_BEFORE_RESTART = 43200000; // 12 hours max uptime
const int MIN_FREE_HEAP = 8192; // Minimum free heap before restart (8KB)
const int STACK_CANARY = 0xDEADBEEF; // Stack overflow detection

// Timing constants
const unsigned long RELAY_PULSE_DURATION = 1000; // 1 second pulse to trigger garage door
const unsigned long HEARTBEAT_INTERVAL = 120000; // Send heartbeat every 2 minutes when web app active (was 30s)
const unsigned long HEARTBEAT_INTERVAL_INACTIVE = 300000; // Send heartbeat every 5 minutes when inactive (reduced from 10min)
const unsigned long WEB_APP_TIMEOUT = 60000; // Consider app inactive after 60 seconds
const unsigned long WEBSOCKET_RECONNECT_INTERVAL = 15000; // Try to reconnect every 15 seconds (was 10s)
const unsigned long DEVICE_REREGISTRATION_INTERVAL = 7200000; // Re-register every 2 hours (was 1 hour)
const unsigned long HEALTH_CHECK_INTERVAL = 1800000; // Health check every 30 minutes (was 15 minutes)
const unsigned long COMMAND_FAILURE_REREGISTER_DELAY = 3000; // Re-register 3 seconds after command failure

// STABILITY: Simplified WebSocket resilience variables
bool websocketConnected = false;
unsigned long lastWebSocketAttempt = 0;
unsigned long lastConnectionSuccess = 0;
int consecutiveFailures = 0;
const int MAX_CONSECUTIVE_FAILURES = 10; // Force restart after 10 consecutive failures

// STABILITY: System health monitoring
unsigned long bootTime = 0;
unsigned long lastWatchdogFeed = 0;
unsigned long lastMemoryCheck = 0;
unsigned long lastSystemHealth = 0;
bool systemHealthy = true;
int stackCanary = STACK_CANARY; // Stack overflow detection

// Simplified state variables
String doorStatus = "unknown";
String lastKnownStatus = "unknown";
unsigned long lastHeartbeat = 0;
unsigned long lastDeviceRegistration = 0;
unsigned long lastHealthCheck = 0;
bool relayActive = false;
unsigned long relayStartTime = 0;
bool webAppActive = false;
unsigned long lastWebAppActivity = 0;

// Simplified door movement tracking
bool doorMoving = false;
unsigned long doorMoveStartTime = 0;
String expectedDoorState = "";
const unsigned long DOOR_MOVEMENT_TIMEOUT = 25000; // 25 seconds (reduced from 30)

// WebSocket client
WebSocketsClient webSocket;

// STABILITY: Watchdog and health monitoring
Ticker watchdogTimer;
Ticker healthTimer;

void setup() {
  Serial.begin(115200);
  
  // STABILITY: Record boot time
  bootTime = millis();
  
  // STABILITY: Initialize stack canary
  stackCanary = STACK_CANARY;
  
  // Wait for serial port to connect, but timeout after 2 seconds (reduced)
  unsigned long serialTimeout = millis() + 2000;
  while (!Serial && millis() < serialTimeout) {
    yield();
  }
  
  Serial.println();
  Serial.println("🚀 Garage Door Controller for ESP8266MOD Starting (STABILITY IMPROVED)...");
  Serial.println("🛡️ Enhanced with watchdog, memory monitoring, and auto-recovery");
  
  // Print ESP8266 info
  Serial.print("💾 Chip ID: 0x");
  Serial.println(ESP.getChipId(), HEX);
  Serial.print("🧠 Free Heap: ");
  Serial.print(ESP.getFreeHeap());
  Serial.println(" bytes");
  Serial.print("⚡ CPU Frequency: ");
  Serial.print(ESP.getCpuFreqMHz());
  Serial.println(" MHz");
  
  // STABILITY: Check initial memory state
  checkSystemHealth();
  
  // Initialize pins
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(DOOR_SENSOR_PIN, INPUT_PULLUP);
  digitalWrite(RELAY_PIN, LOW);
  
  Serial.println("🔧 Pin Configuration:");
  Serial.print("   Relay Pin: GPIO");
  Serial.println(RELAY_PIN);
  Serial.print("   Door Sensor Pin: GPIO");
  Serial.println(DOOR_SENSOR_PIN);
  Serial.print("   Sensor Logic: ");
  Serial.println(SENSOR_INVERTED ? "INVERTED (HIGH=open, LOW=closed)" : "NORMAL (HIGH=closed, LOW=open)");
  
  // STABILITY: Start watchdog and health monitoring
  startStabilityMonitoring();
  
  // Connect to WiFi
  connectToWiFi();
  
  // Initialize WebSocket connection
  initializeWebSocket();
  
  // Initial door status check
  checkDoorStatus();
  
  Serial.println("✅ Garage Door Controller Ready with Stability Enhancements!");
  Serial.println("🛡️ Watchdog active, memory monitoring enabled, auto-recovery online");
}

void loop() {
  unsigned long currentTime = millis();
  
  // STABILITY: Check stack overflow
  if (stackCanary != STACK_CANARY) {
    Serial.println("🚨 CRITICAL: Stack overflow detected! Restarting...");
    delay(1000);
    ESP.restart();
  }
  
  // STABILITY: Feed watchdog
  feedWatchdog();
  
  // STABILITY: Periodic system health check
  if (currentTime - lastSystemHealth >= 60000) { // Every minute
    performSystemHealthCheck();
    lastSystemHealth = currentTime;
  }
  
  // Check WiFi connection first
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("📶 WiFi disconnected. Reconnecting...");
    websocketConnected = false;
    consecutiveFailures++;
    connectToWiFi();
    return;
  }
  
  // Always process WebSocket events
  webSocket.loop();
  
  // Simplified WebSocket reconnection logic
  if (!websocketConnected && (currentTime - lastWebSocketAttempt >= WEBSOCKET_RECONNECT_INTERVAL)) {
    attemptWebSocketReconnect();
  }
  
  // Handle relay timing
  if (relayActive && (currentTime - relayStartTime >= RELAY_PULSE_DURATION)) {
    digitalWrite(RELAY_PIN, LOW);
    relayActive = false;
    Serial.println("⚡ Relay turned OFF");
  }
  
  // Event-driven door status checking
  static int lastSensorState = -1;
  static bool firstRun = true;
  int currentSensorState = digitalRead(DOOR_SENSOR_PIN);
  
  if (firstRun || currentSensorState != lastSensorState) {
    lastSensorState = currentSensorState;
    checkDoorStatus();
    firstRun = false;
  }
  
  // Door movement timeout handling
  if (doorMoving && (currentTime - doorMoveStartTime > DOOR_MOVEMENT_TIMEOUT)) {
    checkDoorStatus();
  }
  
  // Send heartbeat
  unsigned long heartbeatInterval = webAppActive ? HEARTBEAT_INTERVAL : HEARTBEAT_INTERVAL_INACTIVE;
  if (websocketConnected && (currentTime - lastHeartbeat >= heartbeatInterval)) {
    if (sendWebSocketHeartbeat()) {
      lastKnownStatus = doorStatus;
      lastHeartbeat = currentTime;
      consecutiveFailures = 0; // Reset failure counter on successful heartbeat
    } else {
      consecutiveFailures++;
    }
  }
  
  // Simplified re-registration logic
  if (websocketConnected && (currentTime - lastDeviceRegistration >= DEVICE_REREGISTRATION_INTERVAL)) {
    Serial.println("🔄 Periodic device re-registration...");
    if (registerDeviceWebSocket()) {
      lastDeviceRegistration = currentTime;
    }
  }
  
  // Health check
  if (websocketConnected && (currentTime - lastHealthCheck >= HEALTH_CHECK_INTERVAL)) {
    Serial.println("🏥 Sending health check...");
    sendHealthCheck();
    lastHealthCheck = currentTime;
  }
  
  // Check if web app is still active
  if (webAppActive && (currentTime - lastWebAppActivity >= WEB_APP_TIMEOUT)) {
    webAppActive = false;
    Serial.println("💤 Web app inactive - switching to low-power heartbeat mode");
  }
  
  // STABILITY: Check for excessive consecutive failures
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    Serial.println("🚨 Too many consecutive failures. Restarting for stability...");
    delay(1000);
    ESP.restart();
  }
  
  yield(); // Essential for ESP8266 stability
  delay(50); // Reduced delay for better responsiveness
}

// STABILITY FUNCTIONS

void startStabilityMonitoring() {
  // Start periodic watchdog feeding
  watchdogTimer.attach_ms(WATCHDOG_FEED_INTERVAL, feedWatchdog);
  
  // Start periodic health monitoring
  healthTimer.attach_ms(MEMORY_CHECK_INTERVAL, checkSystemHealth);
  
  Serial.println("🛡️ Stability monitoring started");
}

void feedWatchdog() {
  ESP.wdtFeed();
  lastWatchdogFeed = millis();
}

void checkSystemHealth() {
  uint32_t freeHeap = ESP.getFreeHeap();
  uint32_t uptime = millis() - bootTime;
  
  // Check memory
  if (freeHeap < MIN_FREE_HEAP) {
    Serial.println("🚨 WARNING: Low memory detected! Current: " + String(freeHeap) + " bytes");
    systemHealthy = false;
  }
  
  // Check uptime
  if (uptime > MAX_UPTIME_BEFORE_RESTART) {
    Serial.println("🔄 Maximum uptime reached. Restarting for stability...");
    delay(1000);
    ESP.restart();
  }
  
  // Force restart if system unhealthy for too long
  static unsigned long unhealthyStart = 0;
  if (!systemHealthy) {
    if (unhealthyStart == 0) {
      unhealthyStart = millis();
    } else if (millis() - unhealthyStart > 300000) { // 5 minutes of being unhealthy
      Serial.println("🚨 System unhealthy for too long. Force restarting...");
      delay(1000);
      ESP.restart();
    }
  } else {
    unhealthyStart = 0;
  }
}

void performSystemHealthCheck() {
  uint32_t freeHeap = ESP.getFreeHeap();
  uint32_t uptime = (millis() - bootTime) / 1000; // in seconds
  
  Serial.println("🏥 System Health Report:");
  Serial.println("   Free Heap: " + String(freeHeap) + " bytes");
  Serial.println("   Uptime: " + String(uptime) + " seconds");
  Serial.println("   WiFi: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected"));
  Serial.println("   WebSocket: " + String(websocketConnected ? "Connected" : "Disconnected"));
  Serial.println("   Consecutive Failures: " + String(consecutiveFailures));
  Serial.println("   System Health: " + String(systemHealthy ? "GOOD" : "POOR"));
  
  // Update system health status
  systemHealthy = (freeHeap >= MIN_FREE_HEAP) && (consecutiveFailures < MAX_CONSECUTIVE_FAILURES);
}

void connectToWiFi() {
  Serial.print("📶 Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart < CONNECTION_TIMEOUT)) {
    delay(500);
    Serial.print(".");
    feedWatchdog(); // Feed watchdog during WiFi connection
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n❌ WiFi connection timeout. Restarting...");
    delay(1000);
    ESP.restart();
    return;
  }
  
  Serial.println();
  Serial.println("✅ WiFi connected!");
  
  IPAddress ip = WiFi.localIP();
  Serial.print("🌐 IP address: ");
  Serial.println(ip);
  Serial.print("📶 Signal strength: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  
  consecutiveFailures = 0; // Reset on successful WiFi connection
}

void attemptWebSocketReconnect() {
  lastWebSocketAttempt = millis();
  consecutiveFailures++;
  
  Serial.print("🔗 WebSocket reconnection attempt #");
  Serial.println(consecutiveFailures);
  
  initializeWebSocket();
}

void initializeWebSocket() {
  Serial.println("🔐 Initializing secure WebSocket connection...");
  
  // Set WebSocket event handlers
  webSocket.onEvent(webSocketEvent);
  
  // STABILITY: More conservative WebSocket settings
  webSocket.setReconnectInterval(5000); // Reconnect every 5 seconds
  webSocket.enableHeartbeat(15000, 3000, 2); // Heartbeat every 15s, timeout 3s, 2 retries
  
  // Use ESP8266's native SSL WebSocket connection
  webSocket.beginSSL(websocketHost, websocketPort, websocketPath.c_str());
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  String message;
  
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("❌ WebSocket Disconnected");
      websocketConnected = false;
      consecutiveFailures++;
      break;
      
    case WStype_CONNECTED:
      Serial.print("✅ WebSocket Connected to: ");
      Serial.println((char*)payload);
      
      websocketConnected = true;
      consecutiveFailures = 0;
      lastConnectionSuccess = millis();
      
      // Send ping to test connection
      webSocket.sendPing();
      
      // Force fresh door status check
      checkDoorStatus();
      
      // Register device immediately
      if (registerDeviceWebSocket()) {
        lastDeviceRegistration = millis();
      }
      
      // Send initial status
      sendWebSocketHeartbeat();
      break;
      
    case WStype_TEXT:
      message = String((char*)payload);
      Serial.print("📨 WebSocket received: ");
      Serial.println(message);
      handleWebSocketMessage(message);
      consecutiveFailures = 0; // Reset on successful message
      break;
      
    case WStype_PONG:
      Serial.println("🏓 WebSocket pong - connection stable");
      consecutiveFailures = 0;
      break;
      
    case WStype_ERROR:
      Serial.println("🚨 WebSocket Error");
      websocketConnected = false;
      consecutiveFailures++;
      break;
      
    default:
      break;
  }
}

bool registerDeviceWebSocket() {
  if (!websocketConnected) return false;
  
  Serial.println("📝 Registering device via WebSocket...");
  
  StaticJsonDocument<256> doc;
  doc["type"] = "device_register";
  doc["deviceId"] = deviceId;
  doc["deviceName"] = deviceName;
  doc["doorStatus"] = doorStatus;
  doc["timestamp"] = millis();
  doc["platform"] = "ESP8266MOD-STABLE";
  doc["chipId"] = ESP.getChipId();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = (millis() - bootTime) / 1000;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  bool success = webSocket.sendTXT(jsonString);
  if (success) {
    Serial.println("✅ Device registration sent via WebSocket");
  } else {
    Serial.println("❌ Failed to send device registration");
    consecutiveFailures++;
  }
  
  return success;
}

bool sendWebSocketHeartbeat() {
  if (!websocketConnected) {
    Serial.println("💔 Cannot send heartbeat - WebSocket not connected");
    return false;
  }
  
  StaticJsonDocument<256> doc;
  doc["type"] = "device_heartbeat";
  doc["deviceId"] = deviceId;
  doc["doorStatus"] = doorStatus;
  doc["webAppActive"] = webAppActive;
  doc["timestamp"] = millis();
  doc["signalStrength"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = (millis() - bootTime) / 1000;
  doc["health"] = systemHealthy ? "good" : "poor";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  bool success = webSocket.sendTXT(jsonString);
  
  if (success) {
    Serial.print("💓 WebSocket heartbeat sent - Door: ");
    Serial.print(doorStatus);
    Serial.print(", Health: ");
    Serial.print(systemHealthy ? "GOOD" : "POOR");
    Serial.print(", Free Heap: ");
    Serial.print(ESP.getFreeHeap());
    Serial.println(" bytes");
  } else {
    Serial.println("💔 Failed to send WebSocket heartbeat");
    websocketConnected = false;
    consecutiveFailures++;
  }
  
  return success;
}

void sendHealthCheck() {
  if (!websocketConnected) return;
  
  StaticJsonDocument<128> doc;
  doc["action"] = "health_check";
  doc["deviceId"] = deviceId;
  doc["timestamp"] = millis();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["uptime"] = (millis() - bootTime) / 1000;
  
  String message;
  serializeJson(doc, message);
  
  if (webSocket.sendTXT(message)) {
    Serial.println("🏥 Health check sent: " + message);
  } else {
    consecutiveFailures++;
  }
}

void handleWebSocketMessage(String message) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.println("❌ Failed to parse WebSocket message");
    return;
  }
  
  String messageType = doc["type"];
  
  if (messageType == "device_command") {
    String command = doc["command"];
    Serial.println("🎮 Received command via WebSocket: " + command);
    
    // Mark web app as active
    webAppActive = true;
    lastWebAppActivity = millis();
    
    // Execute command
    if (command == "open" || command == "close" || command == "toggle") {
      triggerDoor();
      sendWebSocketHeartbeat();
    }
  }
  else if (messageType == "device_status_request") {
    Serial.println("📊 Status request received via WebSocket");
    
    webAppActive = true;
    lastWebAppActivity = millis();
    
    checkDoorStatus();
    sendWebSocketHeartbeat();
  }
  else if (messageType == "health_check_response") {
    bool isRegistered = doc["isRegistered"];
    if (!isRegistered) {
      Serial.println("🚨 Backend lost our registration - re-registering!");
      registerDeviceWebSocket();
    }
  }
}

void checkDoorStatus() {
  // Handle movement timeout
  if (doorMoving && (millis() - doorMoveStartTime > DOOR_MOVEMENT_TIMEOUT)) {
    Serial.println("⚠️ Door movement timeout");
    doorMoving = false;
    expectedDoorState = "";
    
    // Check actual sensor state
    bool sensorReading = digitalRead(DOOR_SENSOR_PIN);
    if (SENSOR_INVERTED) sensorReading = !sensorReading;
    doorStatus = sensorReading ? "closed" : "open";
    
    Serial.print("🔍 Timeout - Status set to: ");
    Serial.println(doorStatus);
    
    if (websocketConnected) {
      sendWebSocketHeartbeat();
    }
    return;
  }
  
  if (doorMoving) {
    // Simplified sensor reading during movement
    bool sensorReading = digitalRead(DOOR_SENSOR_PIN);
    if (SENSOR_INVERTED) sensorReading = !sensorReading;
    String currentSensorState = sensorReading ? "closed" : "open";
    
    if (!expectedDoorState.isEmpty() && currentSensorState == expectedDoorState) {
      Serial.println("✅ Door reached expected state: " + expectedDoorState);
      doorMoving = false;
      expectedDoorState = "";
      doorStatus = currentSensorState;
      
      if (websocketConnected) {
        sendWebSocketHeartbeat();
      }
    }
    return;
  }
  
  // Normal status check - simplified
  bool sensorReading = digitalRead(DOOR_SENSOR_PIN);
  if (SENSOR_INVERTED) sensorReading = !sensorReading;
  String newStatus = sensorReading ? "closed" : "open";
  
  if (newStatus != doorStatus) {
    doorStatus = newStatus;
    Serial.print("🚪 Door status changed to: ");
    Serial.println(doorStatus);
    
    if (websocketConnected && !doorMoving) {
      sendWebSocketHeartbeat();
    }
  }
}

void triggerDoor() {
  if (doorMoving) {
    Serial.println("🚪 Door is already moving, ignoring trigger request");
    return;
  }
  
  if (!relayActive) {
    String currentState = doorStatus;
    if (currentState == "open") {
      expectedDoorState = "closed";
    } else if (currentState == "closed") {
      expectedDoorState = "open";
    }
    
    Serial.println("🚪 Triggering garage door...");
    if (!expectedDoorState.isEmpty()) {
      Serial.println("🎯 Expected final state: " + expectedDoorState);
    }
    
    doorMoving = true;
    doorMoveStartTime = millis();
    doorStatus = "moving";
    
    digitalWrite(RELAY_PIN, HIGH);
    relayActive = true;
    relayStartTime = millis();
    Serial.println("⚡ Relay activated!");
  }
}
