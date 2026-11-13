import { useEffect, useRef, useState } from "react";
import { visionService } from "../services/api";

const CAMERA_URL_KEY = "sightlink_camera_url";
const DEFAULT_CAMERA_URL =
  import.meta.env.VITE_ESP32_CAM_URL || "http://10.235.17.135/capture";

function readCameraUrl() {
  try {
    return window.localStorage.getItem(CAMERA_URL_KEY) || DEFAULT_CAMERA_URL;
  } catch {
    return DEFAULT_CAMERA_URL;
  }
}

function buildDirectFrame(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

export default function CameraFeed() {
  const [cameraUrl, setCameraUrl] = useState(readCameraUrl);
  const [useProxy, setUseProxy] = useState(false);
  const [imageUrl, setImageUrl] = useState(() => buildDirectFrame(readCameraUrl()));
  const [connected, setConnected] = useState(false);
  const timerRef = useRef(null);
  const proxyAvailableRef = useRef(false);

  useEffect(() => {
    visionService
      .getConfig()
      .then((cfg) => {
        if (cfg && typeof cfg === "object" && "camera_url" in cfg) {
          proxyAvailableRef.current = true;
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const handleUrlSync = () => {
      const next = readCameraUrl();
      setCameraUrl(next);
      setUseProxy(false);
      setImageUrl(buildDirectFrame(next));
    };
    window.addEventListener("storage", handleUrlSync);
    window.addEventListener("sightlink:camera-url-updated", handleUrlSync);
    return () => {
      window.removeEventListener("storage", handleUrlSync);
      window.removeEventListener("sightlink:camera-url-updated", handleUrlSync);
    };
  }, []);

  useEffect(() => {
    setImageUrl(
      useProxy ? visionService.getCaptureUrl(cameraUrl) : buildDirectFrame(cameraUrl)
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cameraUrl, useProxy]);

  const scheduleNextFrame = (isOk) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    let nextProxy = useProxy;
    if (!isOk && !useProxy && proxyAvailableRef.current) {
      nextProxy = true;
      setUseProxy(true);
    } else if (!isOk && useProxy) {
      nextProxy = false;
      setUseProxy(false);
    }
    timerRef.current = setTimeout(() => {
      setImageUrl(
        nextProxy ? visionService.getCaptureUrl(cameraUrl) : buildDirectFrame(cameraUrl)
      );
    }, isOk ? 400 : 5000);
  };

  return (
    <div className="relative w-full h-full bg-[#1E352B] overflow-hidden">
      {/* Camera Feed */}
      <img
        src={imageUrl}
        alt="ESP32-CAM Live Feed"
        className={`w-full h-full object-cover ${connected ? "" : "opacity-0"}`}
        onLoad={() => {
          setConnected(true);
          scheduleNextFrame(true);
        }}
        onError={() => {
          setConnected(false);
          scheduleNextFrame(false);
        }}
      />

      {/* Subtle vignette overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#12231B]/15 via-transparent to-[#12231B]/25" />

      {/* LIVE indicator */}
      <div className="absolute top-4 left-4 flex items-center gap-2 rounded-lg bg-[#FAF7F0]/95 border border-[#DCD2BF] px-3 py-2 shadow-sm">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connected ? "bg-[#065F46] animate-pulse" : "bg-[#9CA89E]"
          }`}
        />

        <span className="text-xs font-bold tracking-wide text-[#12231B]">
          {connected ? "LIVE" : "CAMERA OFFLINE"}
        </span>
      </div>

      {/* Resolution */}
      <div className="absolute top-4 left-24 rounded-lg bg-[#FAF7F0]/95 border border-[#DCD2BF] px-3 py-2 shadow-sm">
        <span className="text-xs font-medium text-[#354B40]">
          ESP32-CAM
        </span>
      </div>

      {/* Offline message */}
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="rounded-xl bg-[#FAF7F0]/95 border border-[#DCD2BF] px-6 py-5 text-center text-[#12231B] shadow-md max-w-xs">
            <div className="mb-1 text-base font-semibold">
              ESP32-CAM Offline
            </div>

            <div className="text-xs text-[#4F6358] break-all">
              Target: {cameraUrl}
            </div>
          </div>
        </div>
      )}

      {/* Camera label */}
      <div className="absolute bottom-4 left-4 rounded-lg bg-[#FAF7F0]/95 border border-[#DCD2BF] px-3 py-2 shadow-sm">
        <span className="text-xs font-medium text-[#12231B]">
          ESP32-CAM OV2640
        </span>
      </div>
    </div>
  );
}
