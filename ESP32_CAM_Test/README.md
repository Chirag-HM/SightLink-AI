# AI Smart Blind Stick — ESP32-CAM + Python Object Detection

A college project that combines an **ESP32-CAM** live video stream with **YOLOv8** object detection running on a **MacBook**, announcing detected objects through the Mac's speakers using the `say` command.

---

## Hardware Used

| Hardware | Role |
|----------|------|
| AI Thinker ESP32-CAM | Streams live video over Wi-Fi |
| ESP32-CAM-MB USB programmer | Uploads firmware via USB |
| ESP8266 + HC-SR04 + GPS | Existing blind stick (unchanged) |
| MacBook Air (macOS) | Runs YOLOv8 detection + voice |

---

## Project Structure

```
ESP32_CAM_Test/
├── platformio.ini          # PlatformIO board config
├── src/
│   └── main.cpp            # ESP32-CAM firmware (camera + Wi-Fi + MJPEG server)
├── object_detection.py     # Python AI detection + voice app
├── requirements.txt        # Python dependencies
└── README.md               # This file
```

---

## Stage 1 — Flash the ESP32-CAM Firmware

### First-time wiring (if using bare ESP32-CAM without MB board)
Connect GPIO 0 → GND before powering on to enter flash mode.
The ESP32-CAM-MB board does this automatically — no wires needed.

### Build & Upload
```bash
cd "/Users/preethammp/bmtc blind/ESP32_CAM_Test"
~/.platformio/penv/bin/pio run -t upload
```

### Read Serial Monitor (get the IP address)
```bash
stty -f /dev/cu.usbserial-A5069RR4 115200 raw -echo && cat /dev/cu.usbserial-A5069RR4
```
Look for these lines:
```
>>> Browser live view : http://10.66.252.135
>>> Python stream URL : http://10.66.252.135/stream
```

Press **Ctrl+C** to stop the monitor.

---

## Stage 2 — Install Python Dependencies

```bash
pip3 install -r requirements.txt
```

---

## Stage 3 — Run Object Detection

```bash
# Replace IP with the one from serial monitor
python3 object_detection.py --url http://10.66.252.135/stream
```

### Options
```
--url     ESP32-CAM stream URL   (default: http://10.66.252.135/stream)
--model   YOLO model file        (default: yolov8n.pt  — fastest)
--conf    Confidence threshold   (default: 0.45)
--skip    Detect every Nth frame (default: 2)
--no-voice  Start with voice off
```

### Keyboard Controls (in the OpenCV window)
| Key | Action |
|-----|--------|
| Q | Quit |
| V | Toggle voice on/off |
| S | Show/hide help overlay |
| R | Reconnect to stream |

---

## Endpoints

| URL | Description |
|-----|-------------|
| `http://<IP>/` | Browser live view |
| `http://<IP>/stream` | MJPEG stream (for Python) |
| `http://<IP>/capture` | Single JPEG snapshot |

---

## Detected & Announced Objects

The app announces these COCO classes (edit `ANNOUNCED_CLASSES` in `object_detection.py` to customise):

`person, bicycle, car, motorcycle, bus, truck, chair, couch, dining table, bottle, cup, dog, cat, backpack, traffic light, stop sign, laptop, cell phone, book, clock`

---

## Troubleshooting

### Camera not connecting to Wi-Fi
- Enable phone hotspot **Maximize Compatibility** (2.4 GHz mode)
- Check SSID/password in `src/main.cpp` lines 9–10
- Watch serial monitor — it prints Wi-Fi status and found networks

### Python: "Connection failed"
- Make sure MacBook is on the **same Wi-Fi** as the ESP32-CAM
- Verify IP in serial monitor output
- Try opening `http://<IP>/` in browser first

### Upload fails / port busy
```bash
# Kill any process holding the port
lsof | grep usbserial
kill <PID>
```

### No sound / voice not working
```bash
say "test"   # Should speak on Mac speakers
```

---

## Existing Blind Stick (ESP8266) — No Changes Needed

The ESP8266 stick handles:
- HC-SR04 ultrasonic distance measurement
- Buzzer alerts for obstacles
- GPS coordinate reading

It runs **independently** on a separate USB port. The ESP32-CAM system adds visual AI detection on top of that. Both systems are independent and do not affect each other.

---

## College Demo Checklist

- [ ] Phone hotspot `CHIRUUU` is ON with Maximize Compatibility
- [ ] ESP32-CAM powered via USB
- [ ] Serial monitor shows IP address
- [ ] Browser opens `http://<IP>/` and shows live feed
- [ ] Run `python3 object_detection.py --url http://<IP>/stream`
- [ ] Walk in front of camera — "Person detected" announced
- [ ] Show bounding boxes with confidence scores on screen
- [ ] Demonstrate `V` key to toggle voice, `Q` to quit
- [ ] ESP8266 blind stick buzzes when hand comes near ultrasonic sensor
