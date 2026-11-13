#include "esp_camera.h"
#include "soc/rtc_cntl_reg.h"
#include "soc/soc.h"
#include <Arduino.h>
#include <WebServer.h>
#include <WiFi.h>

// ── Wi-Fi credentials ────────────────────────────────────────────────────────
const char *ssid = "CHIRUUU";
const char *password = "87654321";

// ── AI Thinker ESP32-CAM pin mapping ────────────────────────────────────────
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

WebServer server(80);
bool serverStarted = false;
bool cameraOk = false;

// ── / — browser live view (polls /capture every second via JS) ───────────────
void handleRoot() {
  if (!cameraOk) {
    server.send(
        200, "text/html",
        "<!DOCTYPE html><html><head>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>ESP32-CAM</title></head>"
        "<body style='font-family:sans-serif;padding:20px;text-align:center'>"
        "<h2>ESP32-CAM Online</h2>"
        "<p style='color:crimson'>Camera sensor failed. Check ribbon cable.</p>"
        "</body></html>");
    return;
  }

  server.send(
      200, "text/html",
      "<!DOCTYPE html><html><head>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>ESP32-CAM Live</title>"
      "<style>"
      "body{margin:0;background:#111;display:flex;flex-direction:column;"
      "align-items:center;justify-content:center;min-height:100vh;color:#eee;"
      "font-family:sans-serif;}"
      "img{max-width:100%;max-height:80vh;border:2px solid "
      "#444;border-radius:8px;}"
      "</style></head><body>"
      "<h2>&#127909; ESP32-CAM Live</h2>"
      "<img id='c' src='/capture'>"
      "<p style='font-size:.8em;color:#777;margin-top:8px'>"
      "Snapshot: <a href='/capture' style='color:#88f'>/capture</a></p>"
      "<script>"
      "setInterval(()=>{"
      "let i=document.getElementById('c');"
      "i.src='/capture?t='+Date.now();"
      "},500);" // refresh every 500ms
      "</script>"
      "</body></html>");
}

// ── /capture — single JPEG (used by browser refresh AND Python) ──────────────
void handleCapture() {
  if (!cameraOk) {
    server.send(503, "text/plain", "Camera not initialized");
    return;
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (fb == nullptr) {
    Serial.println("ERROR: Frame capture failed");
    server.send(500, "text/plain", "Capture failed");
    return;
  }

  // Send using server.send_P for robustness
  WiFiClient client = server.client();
  client.printf("HTTP/1.1 200 OK\r\n"
                "Content-Type: image/jpeg\r\n"
                "Content-Length: %u\r\n"
                "Cache-Control: no-store, no-cache\r\n"
                "Access-Control-Allow-Origin: *\r\n"
                "Connection: close\r\n\r\n",
                static_cast<unsigned int>(fb->len));
  size_t sent = client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);

  if (sent != fb->len) {
    Serial.printf("WARN: sent %u of %u bytes\n", sent, fb->len);
  }
}

// ── Camera init
// ───────────────────────────────────────────────────────────────
bool initializeCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 10000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    Serial.println("CAMERA: PSRAM found — QVGA mode");
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
} else {
    Serial.println("CAMERA: No PSRAM — QVGA mode");
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&config);
  Serial.printf("CAMERA INIT: 0x%x %s\n", (unsigned int)err,
                err == ESP_OK ? "OK" : "FAILED");
  return err == ESP_OK;
}

// ── Wi-Fi with AP fallback
// ────────────────────────────────────────────────────
bool connectWiFi() {
  Serial.println("\nWIFI: scanning...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) {
    Serial.printf("  [%d] %s (%d dBm)%s\n", i + 1, WiFi.SSID(i).c_str(),
                  WiFi.RSSI(i), WiFi.SSID(i) == ssid ? " <-- TARGET" : "");
  }
  WiFi.scanDelete();
  delay(200);

  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.begin(ssid, password);
  Serial.printf("WIFI: connecting to '%s' ", ssid);

  for (int i = 0; i < 60; i++) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWIFI: connected!");
      Serial.printf(">>> Browser  : http://%s/\n",
                    WiFi.localIP().toString().c_str());
      Serial.printf(">>> Snapshot : http://%s/capture\n",
                    WiFi.localIP().toString().c_str());
      Serial.printf(">>> Python   : python3 object_detection.py --ip %s\n",
                    WiFi.localIP().toString().c_str());
      return true;
    }
    delay(500);
    Serial.print(".");
  }

  // AP fallback
  Serial.println("\nWIFI timeout — starting AP...");
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);
  WiFi.softAP("ESP32-CAM-AP", "12345678");
  Serial.printf("AP: 'ESP32-CAM-AP' pw:'12345678'\n");
  Serial.printf(">>> Connect MacBook to that Wi-Fi then:\n");
  Serial.printf(">>> python3 object_detection.py --ip %s\n",
                WiFi.softAPIP().toString().c_str());
  return true;
}

// ── setup
// ─────────────────────────────────────────────────────────────────────
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=========================================");
  Serial.println("   ESP32-CAM  AI BLIND STICK  v2.1     ");
  Serial.println("=========================================");

  cameraOk = initializeCamera();
  connectWiFi();

  server.on("/", HTTP_GET, handleRoot);
  server.on("/capture", HTTP_GET, handleCapture);
  server.begin();
  serverStarted = true;

  Serial.println("SERVER: ready\n=========================================\n");
}

// ── loop
// ──────────────────────────────────────────────────────────────────────
void loop() {
  if (serverStarted)
    server.handleClient();
  delay(2);
}
