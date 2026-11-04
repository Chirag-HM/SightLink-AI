import sounddevice as sd
import numpy as np
import speech_recognition as sr
import wave

SAMPLE_RATE = 16000
DURATION = 5
MIC_DEVICE = 1

print("======================================")
print("       SPEECH RECOGNITION TEST")
print("======================================")

print()
print("Speak a bus route, for example:")
print("401A")
print("305")
print("500K")
print()

print("Listening for 5 seconds...")

audio = sd.rec(
    int(DURATION * SAMPLE_RATE),
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="int16",
    device=MIC_DEVICE
)

sd.wait()

print("Recording completed.")

# Save temporary WAV file
with wave.open("speech_test.wav", "wb") as wf:

    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(SAMPLE_RATE)
    wf.writeframes(audio.tobytes())

print("Converting speech to text...")

recognizer = sr.Recognizer()

with sr.AudioFile("speech_test.wav") as source:

    recorded_audio = recognizer.record(source)

try:

    text = recognizer.recognize_google(recorded_audio)

    print()
    print("======================================")
    print("YOU SAID:")
    print(text)
    print("======================================")

except sr.UnknownValueError:

    print()
    print("Could not understand what you said.")

except sr.RequestError as e:

    print()
    print("Speech recognition service error:")
    print(e)