#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <SoftwareSerial.h>
#include <TinyGPSPlus.h>

// ================= WIFI =================
const char* WIFI_SSID = "realme GT 7 417E";
const char* WIFI_PASSWORD = "Varun@2005";

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

// Bus button
bool lastBusButtonState = HIGH;
bool busButtonEvent = false;

// AI button
bool lastAIButtonState = HIGH;
bool aiButtonEvent = false;

// SOS button
bool lastSOSButtonState = HIGH;
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
      DASHBOARD_ORIGIN
  );

  server.sendHeader(
      "Access-Control-Allow-Methods",
      "GET, OPTIONS"
  );

  server.sendHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
  );

  server.sendHeader(
      "Cache-Control",
      "no-store"
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

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();

  Serial.println("WiFi Connected!");

  Serial.print("ESP8266 IP Address: ");
  Serial.println(WiFi.localIP());

  // ================= WEB ROUTES =================

  server.on("/", handleRoot);

  // GPS
  server.on("/gps", handleGPS);
  server.on(
      "/gps",
      HTTP_OPTIONS,
      handleGPSOptions
  );

  // Bus button
  server.on("/button", handleButton);

  // AI button
  server.on("/ai-button", handleAIButton);

  // SOS button
  server.on("/sos-button", handleSOSButton);

  // Status
  server.on("/status", handleStatus);

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

  unsigned long duration =
      pulseIn(ECHO_PIN, HIGH, 25000);

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

  bool currentButtonState =
      digitalRead(BUS_BUTTON_PIN);

  // Detect HIGH -> LOW
  if (lastBusButtonState == HIGH &&
      currentButtonState == LOW) {

    busButtonEvent = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("BUS ASSISTANT ACTIVATED");
    Serial.println("Waiting for laptop voice command...");
    Serial.println("Say a bus route such as 507");
    Serial.println("================================");
  }

  lastBusButtonState =
      currentButtonState;
}


// =================================================
// AI BUTTON - D6
// =================================================

void checkAIButton() {

  bool currentButtonState =
      digitalRead(AI_BUTTON_PIN);

  // Detect HIGH -> LOW
  if (lastAIButtonState == HIGH &&
      currentButtonState == LOW) {

    aiButtonEvent = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("AI ASSISTANT ACTIVATED");
    Serial.println("Waiting for voice command...");
    Serial.println("================================");
  }

  lastAIButtonState =
      currentButtonState;
}


// =================================================
// SOS BUTTON - D0
// =================================================

void checkSOSButton() {

  bool currentButtonState = digitalRead(SOS_BUTTON_PIN);

  // Button pressed
  if (currentButtonState == LOW &&
      lastSOSButtonState == HIGH) {

    sosButtonEvent = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("!!! SOS BUTTON PRESSED !!!");
    Serial.println("EMERGENCY MODE ACTIVATED");
    Serial.println("Getting GPS location...");
    Serial.println("================================");

    // Debounce
    delay(200);
  }

  lastSOSButtonState = currentButtonState;
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

  Serial.println("------------------------------");
}


// =================================================
// ROOT
// =================================================

void handleRoot() {

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

  // Bus
  json += ",\"bus_button\":";

  json +=
      busButtonEvent
          ? "true"
          : "false";

  // AI
  json += ",\"ai_button\":";

  json +=
      aiButtonEvent
          ? "true"
          : "false";

  // SOS
  json += ",\"sos_button\":";

  json +=
      sosButtonEvent
          ? "true"
          : "false";

  json += "}";

  server.send(
      200,
      "application/json",
      json
  );
}