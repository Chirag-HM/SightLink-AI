#!/usr/bin/env python3
"""
Triggers ESP32 reset via RTS/DTR using BLOCKING fd, then reads serial.
"""
import os, sys, time, termios, fcntl, struct, subprocess, signal

PORT = "/dev/cu.usbserial-A5069RR4"
BAUD = 115200
READ_SECONDS = 15

# macOS ioctl for modem control
TIOCMSET = 0x8004746D
TIOCMGET = 0x4004746E
TIOCM_RTS = 0x0004
TIOCM_DTR = 0x0002

# Open BLOCKING (no O_NONBLOCK)
fd = os.open(PORT, os.O_RDWR | os.O_NOCTTY)

# Configure with stty
subprocess.run(["stty", "-f", PORT, str(BAUD), "raw", "-echo",
                "cs8", "cread", "clocal", "-hupcl"], check=False)
time.sleep(0.2)

print("Triggering ESP32 reset via RTS/DTR...", flush=True)
try:
    # Standard esptool reset sequence
    buf = struct.pack('I', TIOCM_DTR)
    fcntl.ioctl(fd, TIOCMSET, buf)    # DTR=1 -> IO0 low (boot mode)
    time.sleep(0.05)
    buf = struct.pack('I', TIOCM_RTS)
    fcntl.ioctl(fd, TIOCMSET, buf)    # RTS=1 -> EN low (hold in reset)
    time.sleep(0.1)
    buf = struct.pack('I', 0)
    fcntl.ioctl(fd, TIOCMSET, buf)    # Release both -> chip starts booting
    print("Reset pulse sent!", flush=True)
except Exception as e:
    print(f"Reset via ioctl failed: {e}", flush=True)

print(f"Reading for {READ_SECONDS}s (blocking)...\n" + "-"*60, flush=True)

# Set a read timeout using signal
def timeout_handler(sig, frame):
    print("\n" + "-"*60 + "\nRead timeout reached.", flush=True)
    os.close(fd)
    sys.exit(0)

signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(READ_SECONDS)

buf = b""
try:
    while True:
        chunk = os.read(fd, 256)
        if chunk:
            buf += chunk
            sys.stdout.write(chunk.decode("utf-8", errors="replace"))
            sys.stdout.flush()
except (OSError, SystemExit):
    pass

print(f"\nTotal bytes: {len(buf)}", flush=True)
