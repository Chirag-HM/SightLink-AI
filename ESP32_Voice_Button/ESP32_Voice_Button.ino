/*
 * SightLink AI — ESP32 Hands-Free Voice Assistant Hardware Button
 * ------------------------------------------------------------------
 * Features:
 *   - Hardware button on GPIO 13 (active-LOW with internal INPUT_PULLUP)
 *   - 50 ms software debounce
 *   - Single press (< 3.0 s)  -> WebSocket "single_press" (starts listening or cancels active action)
 *   - Long press  (>= 3.0 s)  -> WebSocket "long_press"  (triggers Emergency SOS immediately on press hold)
 *   - Auto-reconnecting WebSocket client to SightLink FastAPI backend (/ws/hardware)
 *   - LED (GPIO 2) + optional piezo buzzer (GPIO 14) confirmation cues
 *
 * Libraries required (Arduino Library Manager):
 *   1. WebSockets by Markus Sattler (WebSocketsClient.h)
 *   2. Built-in ESP32 WiFi.h
 */

#include <WiFi.h>
#include <WebSocketsClient.h>

// ==================== USER CONFIGURATION (FILL IN YOUR NETWORK) ====================
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";

// Host IP / domain of your SightLink backend (e.g. "192.168.1.50" on LAN)
const char* BACKEND_HOST    = "192.168.1.50";
const uint16_t BACKEND_PORT = 8000;
const char* DEVICE_ID       = "esp32-voice-button";

// Optional: set if HARDWARE_BUTTON_TOKEN is configured in backend .env (leave empty "" if unset)
const char* HARDWARE_TOKEN  = "";
// Optional: SightLink User UUID if you want long-press SOS to dispatch even with no browser open
const char* LINKED_USER_ID  = "";

// ==================== HARDWARE PINS & TIMING ====================
const int BUTTON_PIN        = 13;     // Tactile push button -> GPIO 13 and GND
const int STATUS_LED_PIN    = 2;      // ESP32 onboard blue LED
const int BUZZER_PIN        = 14;     // Optional passive/active buzzer (3.3V transistor/direct piezo)

const unsigned long DEBOUNCE_MS      = 50;
const unsigned long LONG_PRESS_MS    = 3000;
const unsigned long HEARTBEAT_MS     = 15000;

// ==================== STATE ====================
WebSocketsClient webSocket;
bool wsConnected = false;

int rawReading = HIGH;
int lastStableState = HIGH;
unsigned long lastDebounceTime = 0;

bool buttonHeld = false;
bool longPressFired = false;
unsigned long pressStartTime = 0;
unsigned long lastHeartbeatAt = 0;

void beepCue(int count, int durationMs, int gapMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(STATUS_LED_PIN, LOW);
    if (i < count - 1) delay(gapMs);
  }
  if (wsConnected) {
    digitalWrite(STATUS_LED_PIN, HIGH);
  }
}

void sendButtonEvent(const char* action) {
  String payload = "{\"action\":\"";
  payload += action;
  payload += "\",\"device_id\":\"";
  payload += DEVICE_ID;
  payload += "\",\"source\":\"esp32_ws\"";
  if (strlen(LINKED_USER_ID) > 0) {
    payload += ",\"user_id\":\"";
    payload += LINKED_USER_ID;
    payload += "\"";
  }
  payload += "}";

  Serial.print("[WS] Sending button event: ");
  Serial.println(payload);

  if (wsConnected) {
    webSocket.sendTXT(payload);
  } else {
    Serial.println("[WS] Not connected yet — queued reconnect in progress.");
  }
}

void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      digitalWrite(STATUS_LED_PIN, LOW);
      Serial.println("[WS] Disconnected from SightLink backend");
      break;

    case WStype_CONNECTED:
      wsConnected = true;
      digitalWrite(STATUS_LED_PIN, HIGH);
      Serial.printf("[WS] Connected to SightLink backend: %s\n", payload);
      beepCue(1, 60, 0);
      break;

    case WStype_TEXT:
      Serial.printf("[WS] Server message: %s\n", payload);
      break;

    default:
      break;
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting to WiFi '%s'", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected! ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection timed out; will retry.");
  }
}

void setupWebSocket() {
  String path = String("/ws/hardware?device_id=") + DEVICE_ID;
  if (strlen(HARDWARE_TOKEN) > 0) {
    path += "&token=";
    path += HARDWARE_TOKEN;
  }
  if (strlen(LINKED_USER_ID) > 0) {
    path += "&user_id=";
    path += LINKED_USER_ID;
  }

  webSocket.begin(BACKEND_HOST, BACKEND_PORT, path);
  webSocket.onEvent(onWebSocketEvent);
  webSocket.setReconnectInterval(3000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void handleButton() {
  int reading = digitalRead(BUTTON_PIN);
  unsigned long now = millis();

  if (reading != rawReading) {
    lastDebounceTime = now;
    rawReading = reading;
  }

  if ((now - lastDebounceTime) >= DEBOUNCE_MS) {
    if (reading != lastStableState) {
      lastStableState = reading;

      if (lastStableState == LOW) {
        // Button pressed down
        buttonHeld = true;
        longPressFired = false;
        pressStartTime = now;
      } else {
        // Button released
        if (buttonHeld && !longPressFired) {
          unsigned long heldMs = now - pressStartTime;
          if (heldMs >= DEBOUNCE_MS) {
            Serial.printf("[BTN] Single press detected (%lu ms)\n", heldMs);
            beepCue(1, 50, 0);
            sendButtonEvent("single_press");
          }
        }
        buttonHeld = false;
        longPressFired = false;
      }
    }
  }

  // Trigger 3-second long press immediately while held (no wait for release)
  if (buttonHeld && !longPressFired && (now - pressStartTime) >= LONG_PRESS_MS) {
    longPressFired = true;
    Serial.println("[BTN] LONG PRESS >= 3s DETECTED — DIRECT EMERGENCY SOS!");
    beepCue(3, 120, 80);
    sendButtonEvent("long_press");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  connectWiFi();
  setupWebSocket();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  webSocket.loop();
  handleButton();

  unsigned long now = millis();
  if (wsConnected && (now - lastHeartbeatAt) >= HEARTBEAT_MS) {
    lastHeartbeatAt = now;
    webSocket.sendTXT("ping");
  }
}

