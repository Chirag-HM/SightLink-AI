import requests
import sounddevice as sd
import numpy as np
import speech_recognition as sr
import pyttsx3
import wave
import re
import time
import os

# =====================================================
# SETTINGS
# =====================================================

# CHANGE THIS to your ESP8266 IP
ESP_IP = "10.235.17.89"

ESP_BUTTON_URL = f"http://{ESP_IP}/button"
ESP_GPS_URL = f"http://{ESP_IP}/gps"

# Your FastAPI server
FASTAPI_URL = "http://127.0.0.1:8000"

# Your laptop microphone
MIC_DEVICE = 1

SAMPLE_RATE = 16000
RECORD_SECONDS = 5

TEMP_AUDIO = "route_audio.wav"

# =====================================================
# TEXT TO SPEECH
# =====================================================

def speak(text):

    print()
    print("🔊 SPEAKER:")
    print(text)

    try:
        import pyttsx3

        tts = pyttsx3.init("sapi5")

        tts.setProperty("rate", 150)
        tts.setProperty("volume", 1.0)

        voices = tts.getProperty("voices")

        if voices:
            tts.setProperty("voice", voices[0].id)

        tts.say(str(text))
        tts.runAndWait()

        tts.stop()

        del tts

    except Exception as e:

        print("❌ TTS ERROR:", repr(e))

# =====================================================
# RECORD MICROPHONE
# =====================================================

def record_audio():

    print()
    print("🎤 Listening...")
    print("Say the bus route now.")

    try:

        audio = sd.rec(
            int(RECORD_SECONDS * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
            device=MIC_DEVICE
        )

        sd.wait()

        with wave.open(TEMP_AUDIO, "wb") as wf:

            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)

            wf.writeframes(audio.tobytes())

        print("Recording completed.")

        return True

    except Exception as e:

        print("Microphone error:", e)

        return False


# =====================================================
# SPEECH TO TEXT
# =====================================================

def recognize_route():

    if not record_audio():

        return None

    recognizer = sr.Recognizer()

    try:

        with sr.AudioFile(TEMP_AUDIO) as source:

            audio = recognizer.record(source)

        print("Converting speech to text...")

        text = recognizer.recognize_google(audio)

        print()
        print("🎤 YOU SAID:")
        print(text)

        return text

    except sr.UnknownValueError:

        print("Could not understand the route.")

        return None

    except sr.RequestError as e:

        print("Speech recognition error:", e)

        return None

    finally:

        # Delete temporary audio file
        if os.path.exists(TEMP_AUDIO):

            os.remove(TEMP_AUDIO)


# =====================================================
# CONVERT SPOKEN ROUTE
# =====================================================

def convert_route(text):

    if not text:

        return None

    text = text.lower().strip()

    # Handle common spoken numbers
    number_words = {

        "zero": "0",
        "one": "1",
        "two": "2",
        "three": "3",
        "four": "4",
        "five": "5",
        "six": "6",
        "seven": "7",
        "eight": "8",
        "nine": "9"

    }

    words = text.split()

    result = ""

    for word in words:

        word = word.strip(".,!?")

        if word in number_words:

            result += number_words[word]

        elif word.isdigit():

            result += word

        elif len(word) == 1 and word.isalpha():

            result += word.upper()

        else:

            # Extract letters/numbers
            cleaned = re.sub(
                r"[^a-zA-Z0-9]",
                "",
                word
            )

            if cleaned:

                result += cleaned.upper()

    return result if result else None


# =====================================================
# GET GPS FROM ESP8266
# =====================================================

def get_gps():
    try:
        print()
        print("📍 Getting GPS from ESP8266...")
        response = requests.get(ESP_GPS_URL, timeout=2.5)
        response.raise_for_status()
        data = response.json()
        print("GPS response:", data)
        if data.get("fix") and data.get("latitude") is not None and data.get("longitude") is not None:
            print()
            print("GPS FIX: YES")
            print("Latitude:", data.get("latitude"))
            print("Longitude:", data.get("longitude"))
            print("Satellites:", data.get("satellites"))
            return float(data.get("latitude")), float(data.get("longitude"))
    except Exception as e:
        print("ESP8266 GPS connection error / not reachable:", e)

    # Fallback to backend stick GPS or Bengaluru Majestic reference
    try:
        r = requests.get(f"{FASTAPI_URL}/api/stick/gps", timeout=2.0)
        if r.status_code == 200:
            d = r.json()
            if d.get("fix") and d.get("latitude") is not None and d.get("longitude") is not None:
                print("Using backend stick GPS:", d.get("latitude"), d.get("longitude"))
                return float(d.get("latitude")), float(d.get("longitude"))
    except Exception:
        pass

    print("Using default reference coordinates (Bengaluru Majestic: 12.9778, 77.5713)")
    return 12.9778, 77.5713


def find_bus(route, latitude, longitude):

    url = f"{FASTAPI_URL}/voice-bus/{route}"

    params = {

        "latitude": latitude,
        "longitude": longitude

    }

    print()
    print("======================================")
    print("       BMTC BUS REQUEST")
    print("======================================")

    print("Route:", route)
    print("Latitude:", latitude)
    print("Longitude:", longitude)

    try:

        response = requests.get(
            url,
            params=params,
            timeout=60
        )

        print()
        print("FastAPI status:", response.status_code)

        data = response.json()

        print("FastAPI response:")
        print(data)

        message = data.get(
            "message",
            "No bus information available."
        )

        speak(message)

    except requests.exceptions.ConnectionError:

        print()
        print("Could not connect to FastAPI.")

        speak(
            "I cannot connect to the bus tracking server."
        )

    except requests.exceptions.Timeout:

        print()
        print("FastAPI request timed out.")

        speak(
            "The bus tracking server took too long to respond."
        )

    except Exception as e:

        print()
        print("FastAPI error:")
        print(e)

        speak(
            "There was an error getting bus information."
        )


# =====================================================
# CHECK ESP8266 BUTTON
# =====================================================

_last_btn_err_time = 0

def check_button():
    global _last_btn_err_time
    try:
        response = requests.get(ESP_BUTTON_URL, timeout=1.0)
        response.raise_for_status()
        data = response.json()
        return data.get("pressed", False)
    except Exception as e:
        now = time.time()
        if now - _last_btn_err_time > 20:
            print("ESP8266 button connection error (polling in background):", e)
            print("💡 TIP: You can press [SPACE] or [ENTER] in this terminal to simulate hardware button press!")
            _last_btn_err_time = now
        return False


# =====================================================
# MAIN PROGRAM
# =====================================================

print()
print("==========================================")
print("       SMART BLIND STICK SYSTEM")
print("==========================================")

print()
print("ESP8266 IP:", ESP_IP)
print("FastAPI:", FASTAPI_URL)
print("Microphone device:", MIC_DEVICE)

print()
print("Testing ESP8266 connection...")

try:
    response = requests.get(ESP_BUTTON_URL, timeout=2)
    if response.status_code == 200:
        print("ESP8266 connection: OK")
except Exception:
    print("WARNING: ESP8266 is not reachable. Keyboard simulation [SPACE/ENTER] enabled.")

speak("Smart blind stick system started.")

print()
print("Waiting for hardware button press (or press SPACE/ENTER in this terminal)...")

import msvcrt

while True:
    try:
        button_triggered = False
        if msvcrt.kbhit():
            key = msvcrt.getch()
            if key in (b' ', b'\r', b'\n', b'b', b'B'):
                print("\n======================================")
                print("[KEYBOARD SIMULATION] BUTTON PRESSED")
                print("======================================")
                button_triggered = True

        if not button_triggered and check_button():
            print()
            print("======================================")
            print("HARDWARE BUTTON PRESSED")
            print("======================================")
            button_triggered = True

        if button_triggered:
            speak("Which bus route do you want?")
            spoken_text = recognize_route()

            if not spoken_text:
                speak("I could not hear the bus route.")
                continue

            route = convert_route(spoken_text)
            print("\nDetected route:", route)

            if not route:
                speak("I could not identify the bus route.")
                continue

            speak("Checking route " + str(route) + ".")
            latitude, longitude = get_gps()

            find_bus(route, latitude, longitude)

            print()
            print("======================================")
            print("Waiting for next button press...")
            print("======================================")

        time.sleep(0.15)

    except KeyboardInterrupt:
        print("\nProgram stopped.")
        break
    except Exception as e:
        print("\nUnexpected error:", e)
        time.sleep(1)
