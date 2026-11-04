import requests
import subprocess
import sys
import time

ESP8266_IP = "10.235.17.89"

print("======================================")
print(" SMART BLIND STICK AI BUTTON LISTENER")
print("======================================")
print("ESP8266:", ESP8266_IP)
print("Waiting for D6 AI button...")
print()


last_state = False
ai_running = False


def start_ai_assistant():
    global ai_running

    if ai_running:
        print("AI Assistant is already running.")
        return

    print()
    print("======================================")
    print("🤖 AI BUTTON PRESSED")
    print("Starting AI Assistant...")
    print("======================================")

    process = subprocess.Popen([
        sys.executable,
        "ai_assistant.py"
    ])

    ai_running = True

    print("AI Assistant started.")
    print("Process ID:", process.pid)


while True:

    try:
        response = requests.get(
            f"http://{ESP8266_IP}/status",
            timeout=2
        )

        data = response.json()

        ai_pressed = bool(data.get("ai_button", False))

        # Detect new button press
        if ai_pressed and not last_state:
            start_ai_assistant()

        last_state = ai_pressed

        time.sleep(0.2)

    except requests.exceptions.RequestException:
        print("ESP8266 not reachable...")

        last_state = False
        time.sleep(1)

    except Exception as e:
        print("Error:", e)
        time.sleep(1)