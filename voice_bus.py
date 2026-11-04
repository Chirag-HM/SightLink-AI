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
ESP_IP = "10.173.66.89"

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

engine = pyttsx3.init()

engine.setProperty("rate", 160)
engine.setProperty("volume", 1.0)


def speak(text):

    print()
    print("🔊 SPEAKER:")
    print(text)

    engine.say(text)
    engine.runAndWait()


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

        response = requests.get(
            ESP_GPS_URL,
            timeout=5
        )

        response.raise_for_status()

        data = response.json()

        print("GPS response:")
        print(data)

        if not data.get("fix"):

            print("GPS has no satellite fix.")

            return None

        latitude = data.get("latitude")
        longitude = data.get("longitude")

        if latitude is None or longitude is None:

            return None

        print()
        print("GPS FIX: YES")
        print("Latitude:", latitude)
        print("Longitude:", longitude)
        print("Satellites:", data.get("satellites"))

        return latitude, longitude

    except requests.exceptions.RequestException as e:

        print("ESP8266 GPS connection error:")
        print(e)

        return None


# =====================================================
# CALL FASTAPI
# =====================================================

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
            timeout=20
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

def check_button():

    try:

        response = requests.get(
            ESP_BUTTON_URL,
            timeout=2
        )

        response.raise_for_status()

        data = response.json()

        return data.get("pressed", False)

    except Exception as e:

        print(
            "ESP8266 button connection error:",
            e
        )

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

    response = requests.get(
        ESP_BUTTON_URL,
        timeout=3
    )

    if response.status_code == 200:

        print("ESP8266 connection: OK")

except Exception:

    print("WARNING: ESP8266 is not reachable.")


speak(
    "Smart blind stick system started."
)

print()
print("Waiting for button press...")


# =====================================================
# MAIN LOOP
# =====================================================

while True:

    try:

        if check_button():

            print()
            print("======================================")
            print("BUTTON PRESSED")
            print("======================================")

            # Ask user for route
            speak(
                "Which bus route do you want?"
            )

            # Listen
            spoken_text = recognize_route()

            if not spoken_text:

                speak(
                    "I could not hear the bus route."
                )

                continue

            # Convert route
            route = convert_route(
                spoken_text
            )

            print()
            print("Detected route:", route)

            if not route:

                speak(
                    "I could not identify the bus route."
                )

                continue

            # Confirm route
            speak(
                f"Checking route {route}."
            )

            # Get GPS
            gps = get_gps()

            if not gps:

                speak(
                    "GPS location is not available."
                )

                continue

            latitude, longitude = gps

            # Query BMTC through FastAPI
            find_bus(
                route,
                latitude,
                longitude
            )

            print()
            print("======================================")
            print("Waiting for next button press...")
            print("======================================")

        time.sleep(0.3)

    except KeyboardInterrupt:

        print()
        print("Program stopped.")

        break

    except Exception as e:

        print()
        print("Unexpected error:")
        print(e)

        time.sleep(1)