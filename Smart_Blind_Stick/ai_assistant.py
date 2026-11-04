import sounddevice as sd
import speech_recognition as sr
import pyttsx3
import wave
import tempfile
import os
import time

MIC_DEVICE = 1
SAMPLE_RATE = 16000
RECORD_SECONDS = 5

recognizer = sr.Recognizer()
engine = pyttsx3.init()


def speak(text):
    print("AI:", text)
    engine.say(text)
    engine.runAndWait()


def record_audio():
    print("\n🎤 Listening...")

    try:
        audio = sd.rec(
            int(RECORD_SECONDS * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",
            device=MIC_DEVICE
        )

        sd.wait()

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".wav",
            delete=False
        )

        temp_file.close()

        with wave.open(temp_file.name, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(audio.tobytes())

        return temp_file.name

    except Exception as e:
        print("Microphone error:", e)
        return None


def listen():
    filename = record_audio()

    if not filename:
        return None

    try:
        with sr.AudioFile(filename) as source:
            audio = recognizer.record(source)

        print("🔄 Processing voice...")

        text = recognizer.recognize_google(audio)

        print("YOU:", text)

        return text.lower()

    except sr.UnknownValueError:
        print("❌ Could not understand the voice.")
        return None

    except sr.RequestError as e:
        print("❌ Speech recognition error:", e)
        return None

    finally:
        if os.path.exists(filename):
            os.remove(filename)


def main():

    print("======================================")
    print("   SMART BLIND STICK AI ASSISTANT")
    print("======================================")
    print("Microphone : Device 1")
    print("Status     : READY")
    print("======================================")

    speak("AI assistant is ready.")

    while True:

        command = listen()

        if not command:
            continue

        if "exit" in command or "stop assistant" in command:
            speak("AI assistant stopped.")
            break

        elif "hello" in command:
            speak("Hello. How can I help you?")

        elif "who are you" in command:
            speak("I am your Smart Blind Stick AI assistant.")

        elif "time" in command:
            current_time = time.strftime("%I:%M %p")
            speak("The current time is " + current_time)

        else:
            speak(
                "I heard " + command +
                ". AI processing will be connected next."
            )


if __name__ == "__main__":
    main()