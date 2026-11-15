#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <ESP8266WebServer.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>

// ================= WIFI =================
ESP8266WiFiMulti wifiMulti;
const char* WIFI_SSID = "CHIRUUU";
const char* WIFI_PASSWORD = "87654321";

// ================= GPS =================
#define GPS_RX D3
#define GPS_TX D4

SoftwareSerial GPS(GPS_RX, GPS_TX);
TinyGPSPlus gps;

// ================= ULTRASONIC =================
#define TRIG_PIN D1
#define ECHO_PIN D2

// ================= BUZZER =================
#define BUZZER_PIN D8

// ================= BUTTONS =================
#define BUS_BUTTON_PIN D5
#define AI_BUTTON_PIN  D6
#define SOS_BUTTON_PIN D7

// ================= OBSTACLE =================
#define OBSTACLE_DISTANCE 150.0

// ================= WEB SERVER =================
ESP8266WebServer server(80);

const char* DASHBOARD_ORIGIN = "http://localhost:5173";

// ================= VARIABLES =================
float distanceCM = 0;

// Button debounce state
const unsigned long BUTTON_DEBOUNCE_DELAY_MS = 50;

unsigned long lastBusDebounceTime = 0;
int lastBusReading = HIGH;
int currentBusButtonState = HIGH;
bool busButtonEvent = false;

unsigned long lastAIDebounceTime = 0;
int lastAIReading = HIGH;
int currentAIButtonState = HIGH;
bool aiButtonEvent = false;

unsigned long lastSOSDebounceTime = 0;
int lastSOSReading = HIGH;
int currentSOSButtonState = HIGH;
bool sosButtonEvent = false;

unsigned long lastSensorTime = 0;
unsigned long lastGPSDisplay = 0;

// ================= FUNCTION DECLARATIONS =================

void readUltrasonic();

void checkBusButton();
void checkAIButton();
void checkSOSButton();

void displayGPS();

void handleRoot();
void handleGPS();
void handleGPSOptions();

void handleButton();
void handleAIButton();
void handleSOSButton();

void handleStatus();

bool hasFreshGPSFix();


// =================================================
// CORS HEADERS
// =================================================

void addGPSHeaders() {

  server.sendHeader(
      "Access-Control-Allow-Origin",
      "*"
  );

  server.sendHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
  );

  server.sendHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
  );

  server.sendHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
  );
}


// =================================================
// GPS FIX
// =================================================

bool hasFreshGPSFix() {

  return gps.location.isValid() &&
         gps.location.age() < 5000;
}


// =================================================
// SETUP
// =================================================

void setup() {

  Serial.begin(115200);

  GPS.begin(9600);

  // ================= ULTRASONIC =================

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // ================= BUZZER =================

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // ================= BUTTONS =================

  pinMode(BUS_BUTTON_PIN, INPUT_PULLUP);

  pinMode(AI_BUTTON_PIN, INPUT_PULLUP);

  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP);

  // ================= START MESSAGE =================

  Serial.println();
  Serial.println("======================================");
  Serial.println("        SMART BLIND STICK");
  Serial.println("======================================");

  Serial.println();
  Serial.println("BUTTON CONFIGURATION");
  Serial.println("Bus Assistant : D5");
  Serial.println("AI Assistant  : D6");
  Serial.println("SOS Button    : D7");
  Serial.println("======================================");

  // ================= WIFI =================

  WiFi.mode(WIFI_STA);
  Serial.print("Connecting to WiFi (CHIRUUU)");

  WiFi.begin("CHIRUUU", "87654321");

  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nRetrying with realme GT 7 417E...");
    WiFi.begin("realme GT 7 417E", "Varun@2005");
    wifiAttempts = 0;
    while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) {
      delay(500);
      Serial.print(".");
      wifiAttempts++;
    }
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Connected!");
    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("ESP8266 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi Connection Failed. Starting SoftAP fallback...");
    WiFi.softAP("SmartStick-Setup", "12345678");
    Serial.print("SoftAP IP: ");
    Serial.println(WiFi.softAPIP());
  }

  // ================= WEB ROUTES =================

  server.on("/", handleRoot);
  server.on("/", HTTP_OPTIONS, handleGPSOptions);

  // GPS
  server.on("/gps", handleGPS);
  server.on("/gps", HTTP_OPTIONS, handleGPSOptions);

  // Bus button
  server.on("/button", handleButton);
  server.on("/button", HTTP_OPTIONS, handleGPSOptions);

  // AI button
  server.on("/ai-button", handleAIButton);
  server.on("/ai-button", HTTP_OPTIONS, handleGPSOptions);

  // SOS button
  server.on("/sos-button", handleSOSButton);
  server.on("/sos-button", HTTP_OPTIONS, handleGPSOptions);

  // Status
  server.on("/status", handleStatus);
  server.on("/status", HTTP_OPTIONS, handleGPSOptions);

  server.begin();

  Serial.println("Web server started.");

  Serial.println();
  Serial.println("Waiting for GPS fix...");
}


// =================================================
// LOOP
// =================================================

void loop() {

  // ================= GPS =================

  while (GPS.available()) {
    gps.encode(GPS.read());
    yield();
  }

  // ================= WEB SERVER =================

  server.handleClient();

  // ================= ULTRASONIC =================

  if (millis() - lastSensorTime >= 100) {
    lastSensorTime = millis();
    readUltrasonic();
  }

  // ================= BUTTONS =================

  checkBusButton();
  checkAIButton();
  checkSOSButton();

  // ================= GPS DISPLAY =================

  if (millis() - lastGPSDisplay >= 2000) {
    lastGPSDisplay = millis();
    displayGPS();
  }

  // Yield to ESP8266 background WiFi stack
  delay(1);
}


// =================================================
// ULTRASONIC
// =================================================

void readUltrasonic() {

  digitalWrite(TRIG_PIN, LOW);

  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);

  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  // 18ms timeout covers up to ~300 cm (well beyond 150 cm obstacle trigger)
  unsigned long duration =
      pulseIn(ECHO_PIN, HIGH, 18000);

  if (duration == 0) {

    distanceCM = 999;

    digitalWrite(BUZZER_PIN, LOW);

    return;
  }

  distanceCM =
      duration * 0.0343 / 2.0;

  // Obstacle detected
  if (distanceCM <= OBSTACLE_DISTANCE &&
      distanceCM >= 2) {

    digitalWrite(BUZZER_PIN, HIGH);

  } else {

    digitalWrite(BUZZER_PIN, LOW);
  }
}


// =================================================
// BUS BUTTON - D5
// =================================================

void checkBusButton() {
  int reading = digitalRead(BUS_BUTTON_PIN);
  if (reading != lastBusReading) {
    lastBusDebounceTime = millis();
  }
  if ((millis() - lastBusDebounceTime) > BUTTON_DEBOUNCE_DELAY_MS) {
    if (reading != currentBusButtonState) {
      currentBusButtonState = reading;
      // Active LOW: button pressed connects pin to GND
      if (currentBusButtonState == LOW) {
        busButtonEvent = true;
        Serial.println();
        Serial.println("================================");
        Serial.println("BUS ASSISTANT ACTIVATED (D5)");
        Serial.println("================================");
      }
    }
  }
  lastBusReading = reading;
}


// =================================================
// AI BUTTON - D6
// =================================================

void checkAIButton() {
  int reading = digitalRead(AI_BUTTON_PIN);
  if (reading != lastAIReading) {
    lastAIDebounceTime = millis();
  }
  if ((millis() - lastAIDebounceTime) > BUTTON_DEBOUNCE_DELAY_MS) {
    if (reading != currentAIButtonState) {
      currentAIButtonState = reading;
      // Active LOW: button pressed connects pin to GND
      if (currentAIButtonState == LOW) {
        aiButtonEvent = true;
        Serial.println();
        Serial.println("================================");
        Serial.println("AI ASSISTANT ACTIVATED (D6)");
        Serial.println("================================");
      }
    }
  }
  lastAIReading = reading;
}


// =================================================
// SOS BUTTON - D7
// =================================================

void checkSOSButton() {
  int reading = digitalRead(SOS_BUTTON_PIN);
  if (reading != lastSOSReading) {
    lastSOSDebounceTime = millis();
  }
  if ((millis() - lastSOSDebounceTime) > BUTTON_DEBOUNCE_DELAY_MS) {
    if (reading != currentSOSButtonState) {
      currentSOSButtonState = reading;
      // Active LOW: button pressed connects pin to GND
      if (currentSOSButtonState == LOW) {
        sosButtonEvent = true;
        Serial.println();
        Serial.println("================================");
        Serial.println("!!! SOS BUTTON PRESSED (D7) !!!");
        Serial.println("================================");
      }
    }
  }
  lastSOSReading = reading;
}


// =================================================
// DISPLAY GPS
// =================================================

void displayGPS() {

  Serial.println();
  Serial.println("--------- GPS STATUS ---------");

  if (hasFreshGPSFix()) {

    Serial.println("GPS FIX: YES");

    Serial.print("Latitude: ");
    Serial.println(
        gps.location.lat(),
        6
    );

    Serial.print("Longitude: ");
    Serial.println(
        gps.location.lng(),
        6
    );

    Serial.print("Satellites: ");

    if (gps.satellites.isValid()) {

      Serial.println(
          gps.satellites.value()
      );

    } else {

      Serial.println("Unknown");
    }

  } else {

    Serial.println("GPS FIX: NO");

    Serial.println(
        "Waiting for satellite fix..."
    );
  }

  Serial.print("Obstacle Distance: ");

  Serial.print(distanceCM);

  Serial.println(" cm");

  Serial.print("WiFi IP: ");
  Serial.println(WiFi.localIP());

  Serial.println("------------------------------");
}


// =================================================
// ROOT
// =================================================

void handleRoot() {

  addGPSHeaders();

  String message;

  message +=
      "Smart Blind Stick ESP8266\n";

  message +=
      "GPS: /gps\n";

  message +=
      "Bus Button: /button\n";

  message +=
      "AI Button: /ai-button\n";

  message +=
      "SOS Button: /sos-button\n";

  message +=
      "Status: /status\n";

  server.send(
      200,
      "text/plain",
      message
  );
}


// =================================================
// GPS API
// =================================================

void handleGPS() {

  String json = "{";

  json += "\"fix\":";

  json +=
      hasFreshGPSFix()
          ? "true"
          : "false";

  json += ",\"latitude\":";

  if (hasFreshGPSFix()) {

    json += String(
        gps.location.lat(),
        6
    );

  } else {

    json += "null";
  }

  json += ",\"longitude\":";

  if (hasFreshGPSFix()) {

    json += String(
        gps.location.lng(),
        6
    );

  } else {

    json += "null";
  }

  json += ",\"satellites\":";

  if (gps.satellites.isValid()) {

    json += String(
        gps.satellites.value()
    );

  } else {

    json += "0";
  }

  json += ",\"altitude_m\":";

  json +=
      gps.altitude.isValid()
          ? String(
              gps.altitude.meters(),
              1
            )
          : "null";

  json += ",\"speed_mps\":";

  json +=
      gps.speed.isValid()
          ? String(
              gps.speed.mps(),
              2
            )
          : "null";

  json += ",\"heading_degrees\":";

  json +=
      gps.course.isValid()
          ? String(
              gps.course.deg(),
              1
            )
          : "null";

  json += ",\"hdop\":";

  json +=
      gps.hdop.isValid()
          ? String(
              gps.hdop.hdop(),
              1
            )
          : "null";

  json += ",\"location_age_ms\":";

  json +=
      gps.location.isValid()
          ? String(
              gps.location.age()
            )
          : "null";

  json += "}";

  addGPSHeaders();

  server.send(
      200,
      "application/json",
      json
  );
}


// =================================================
// GPS OPTIONS
// =================================================

void handleGPSOptions() {

  addGPSHeaders();

  server.send(
      204,
      "text/plain",
      ""
  );
}


// =================================================
// BUS BUTTON API
// /button
// =================================================

void handleButton() {

  addGPSHeaders();

  String json = "{";

  json += "\"pressed\":";

  json +=
      busButtonEvent
          ? "true"
          : "false";

  json += "}";

  // Clear after laptop reads it
  busButtonEvent = false;

  server.send(
      200,
      "application/json",
      json
  );
}


// =================================================
// AI BUTTON API
// /ai-button
// =================================================

void handleAIButton() {

  addGPSHeaders();

  String json = "{";

  json += "\"pressed\":";

  json +=
      aiButtonEvent
          ? "true"
          : "false";

  json += "}";

  // Clear after laptop reads it
  aiButtonEvent = false;

  server.send(
      200,
      "application/json",
      json
  );
}


// =================================================
// SOS BUTTON API
// /sos-button
// =================================================

void handleSOSButton() {

  addGPSHeaders();

  String json = "{";

  json += "\"pressed\":";

  json +=
      sosButtonEvent
          ? "true"
          : "false";

  json += ",\"gps_fix\":";

  json +=
      hasFreshGPSFix()
          ? "true"
          : "false";

  json += ",\"latitude\":";

  if (hasFreshGPSFix()) {

    json += String(
        gps.location.lat(),
        6
    );

  } else {

    json += "null";
  }

  json += ",\"longitude\":";

  if (hasFreshGPSFix()) {

    json += String(
        gps.location.lng(),
        6
    );

  } else {

    json += "null";
  }

  json += "}";

  // Clear after laptop reads it
  sosButtonEvent = false;

  server.send(
      200,
      "application/json",
      json
  );
}


// =================================================
// STATUS API
// =================================================

void handleStatus() {

  addGPSHeaders();

  String json = "{";

  // GPS
  json += "\"gps_fix\":";

  json +=
      gps.location.isValid()
          ? "true"
          : "false";

  json += ",\"latitude\":";

  if (gps.location.isValid()) {

    json += String(
        gps.location.lat(),
        6
    );

  } else {

    json += "null";
  }

  json += ",\"longitude\":";

  if (gps.location.isValid()) {

    json += String(
        gps.location.lng(),
        6
    );

  } else {

    json += "null";
  }

  // Satellites
  json += ",\"satellites\":";

  if (gps.satellites.isValid()) {

    json += String(
        gps.satellites.value()
    );

  } else {

    json += "0";
  }

  // Ultrasonic
  json += ",\"distance_cm\":";
  json += String(
      distanceCM,
      1
  );

  // Read and consume button events atomically so subsequent polls don't double-trigger
  bool busNow = busButtonEvent;
  bool aiNow = aiButtonEvent;
  bool sosNow = sosButtonEvent;
  busButtonEvent = false;
  aiButtonEvent = false;
  sosButtonEvent = false;

  // Bus
  json += ",\"bus_button\":";
  json += busNow ? "true" : "false";

  // AI
  json += ",\"ai_button\":";
  json += aiNow ? "true" : "false";

  // SOS
  json += ",\"sos_button\":";
  json += sosNow ? "true" : "false";

  json += "}";

  server.send(
      200,
      "application/json",
      json
  );
}