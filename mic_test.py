import sounddevice as sd

print("Recording for 5 seconds...")
print("Speak into your laptop microphone.")

audio = sd.rec(
    int(5 * 16000),
    samplerate=16000,
    channels=1,
    dtype="int16",
    device=1
)

sd.wait()

print("Recording completed!")
print("Microphone is working.")