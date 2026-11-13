# ESP32 Hands-Free Voice Assistant Button — Wiring & Setup

This sketch connects a single tactile button on an **ESP32** directly to the SightLink AI WebSocket hardware channel (`/ws/hardware`).

## Pinout & Wiring

| Component | ESP32 Pin | Wiring Note |
| :--- | :--- | :--- |
| Tactile Push Button (Pin A) | **GPIO 13** | Uses internal `INPUT_PULLUP` (no external resistor required) |
| Tactile Push Button (Pin B) | **GND** | Pressing pulls GPIO 13 `LOW` |
| Status LED (Onboard) | **GPIO 2** | Solid HIGH when WebSocket is connected to SightLink |
| Optional Buzzer (+) | **GPIO 14** | Active-HIGH 3.3V piezo/transistor buzzer for press confirmation |
| Optional Buzzer (-) | **GND** | Common ground |

```text
          ESP32 DevKit
       +----------------+
       |        GPIO 13 |----[ Tactile Button ]---- GND
       |        GPIO 14 |----[ (+) Buzzer (-) ]---- GND
       |        GPIO 2  |----( Onboard Status LED )
       +----------------+
```

## Button Gestures

1. **Single press (< 3 seconds)**: Starts voice listening (`Listening...`) with a short beep and haptic vibration; pressing again while listening, speaking, acting, or during the SOS countdown cancels immediately.
2. **Long press (>= 3 seconds)**: Fires **Emergency SOS immediately** (skips the 5-second voice countdown, emits triple buzzer beep). If `LINKED_USER_ID` is set in the sketch, SOS is dispatched even if no browser window is currently open.

## Arduino IDE Setup

1. Install **WebSockets** by *Markus Sattler* via **Tools -> Manage Libraries**.
2. Open [`ESP32_Voice_Button.ino`](./ESP32_Voice_Button.ino).
3. Update `WIFI_SSID`, `WIFI_PASSWORD`, and `BACKEND_HOST` (your laptop/server LAN IP where Uvicorn listens on port `8000`).
4. Flash to any ESP32 DevKit (`115200` baud).

## ESP8266 Smart Blind Stick Compatibility

If you already run [`Smart_Blind_Stick/src/main.cpp`](../Smart_Blind_Stick/src/main.cpp) on an ESP8266 (`AI_BUTTON_PIN = D6`), you can forward its `/ai-button` or `/sos-button` events straight to SightLink's HTTP bridge:

```bash
POST http://localhost:8000/api/hardware/button-event
Content-Type: application/json

{"action": "single_press", "device_id": "esp8266-stick", "source": "esp8266_bridge"}
```

