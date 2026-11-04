import { useEffect, useState } from "react";

const CAMERA_URL = "http://10.235.17.135/capture";

export default function CameraFeed() {
  const [imageUrl, setImageUrl] = useState(
    `${CAMERA_URL}?t=${Date.now()}`
  );
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const updateFrame = () => {
      setImageUrl(`${CAMERA_URL}?t=${Date.now()}`);
    };

    const interval = setInterval(updateFrame, 300);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-full bg-[#080914] overflow-hidden">
      {/* Camera Feed */}
      <img
        src={imageUrl}
        alt="ESP32-CAM Live Feed"
        className="w-full h-full object-cover"
        onLoad={() => setConnected(true)}
        onError={() => setConnected(false)}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 via-transparent to-black/30" />

      {/* LIVE indicator */}
      <div className="absolute top-4 left-4 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 shadow-lg">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connected ? "bg-red-500 animate-pulse" : "bg-gray-400"
          }`}
        />

        <span className="text-xs font-bold tracking-wide text-gray-800">
          {connected ? "LIVE" : "CAMERA OFFLINE"}
        </span>
      </div>

      {/* Resolution */}
      <div className="absolute top-4 left-24 rounded-lg bg-white/90 px-3 py-2">
        <span className="text-xs font-medium text-gray-700">
          ESP32-CAM
        </span>
      </div>

      {/* Offline message */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-black/70 px-6 py-5 text-center text-white">
            <div className="mb-2 text-lg font-semibold">
              Camera Connection Lost
            </div>

            <div className="text-sm text-gray-300">
              Checking ESP32-CAM...
            </div>
          </div>
        </div>
      )}

      {/* Camera label */}
      <div className="absolute bottom-4 left-4 rounded-lg bg-black/60 px-3 py-2">
        <span className="text-xs font-medium text-white">
          ESP32-CAM OV2640
        </span>
      </div>
    </div>
  );
}
```