import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Camera,
  Cpu,
  Volume2,
  Maximize2,
} from 'lucide-react';

import DashboardShell from '../components/DashboardShell';
import { mockDetections } from '../utils/mockData';

const CAMERA_URL = 'http://10.235.17.135/capture';

export default function VisionPage() {
  // Detection state
  const [detections, setDetections] = useState(mockDetections);

  // Camera state
  const [isStreaming, setIsStreaming] = useState(true);
  const [cameraFrame, setCameraFrame] = useState(
    `${CAMERA_URL}?t=${Date.now()}`
  );

  // Selected detection
  const [selectedDetection, setSelectedDetection] = useState(null);

  // Camera connection status
  const [cameraConnected, setCameraConnected] = useState(true);

  // --------------------------------------------------
  // Simulate detection updates
  // --------------------------------------------------
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setDetections((prev) =>
        prev.map((d) => ({
          ...d,
          confidence: Math.min(
            99,
            Math.max(
              75,
              d.confidence +
                Math.floor(Math.random() * 5 - 2)
            )
          ),
        }))
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // --------------------------------------------------
  // Refresh ESP32-CAM frame
  // --------------------------------------------------
  useEffect(() => {
    if (!isStreaming) return;

    const cameraInterval = setInterval(() => {
      setCameraFrame(
        `${CAMERA_URL}?t=${Date.now()}`
      );
    }, 500);

    return () => clearInterval(cameraInterval);
  }, [isStreaming]);

  // --------------------------------------------------
  // Fullscreen camera
  // --------------------------------------------------
  const handleFullscreen = () => {
    const cameraElement =
      document.getElementById('esp32-camera-feed');

    if (cameraElement?.requestFullscreen) {
      cameraElement.requestFullscreen();
    }
  };

  return (
    <DashboardShell
      title="AI Vision"
      subtitle="ESP32-CAM + YOLOv8 real-time object detection"
      icon={Eye}
    >
      <div className="grid lg:grid-cols-3 gap-6">

        {/* ==================================================
            MAIN CAMERA SECTION
        ================================================== */}
        <div className="lg:col-span-2">

          <div className="glass-card p-1 border-white/[0.08] relative overflow-hidden rounded-2xl">

            {/* ------------------------------------------------
                Stream Controls
            ------------------------------------------------ */}
            <div className="absolute top-4 left-4 z-30 flex items-center gap-2">

              {/* LIVE STATUS */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-900/90 border border-white/10 backdrop-blur-md">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isStreaming && cameraConnected
                      ? 'bg-red-500 animate-pulse'
                      : 'bg-dark-400'
                  }`}
                />

                <span className="text-[10px] font-mono text-white">
                  {isStreaming && cameraConnected
                    ? 'LIVE'
                    : 'OFFLINE'}
                </span>
              </div>

              {/* CAMERA INFO */}
              <span className="px-2 py-1 rounded bg-dark-900/90 border border-white/10 text-[10px] font-mono text-dark-200 backdrop-blur-md">
                ESP32-CAM · 640×480
              </span>
            </div>

            {/* ------------------------------------------------
                Camera Buttons
            ------------------------------------------------ */}
            <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5">

              {/* Pause / Resume */}
              <button
                onClick={() =>
                  setIsStreaming((prev) => !prev)
                }
                className="p-2 rounded-lg bg-dark-900/90 border border-white/10 text-dark-200 hover:text-white transition-colors backdrop-blur-md"
                aria-label="Toggle streaming"
              >
                <Camera className="w-4 h-4" />
              </button>

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                className="p-2 rounded-lg bg-dark-900/90 border border-white/10 text-dark-200 hover:text-white transition-colors backdrop-blur-md"
                aria-label="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* ==================================================
                REAL ESP32-CAM FEED
            ================================================== */}
            <div
              id="esp32-camera-feed"
              className="aspect-video bg-dark-800 rounded-xl relative overflow-hidden"
            >

              {isStreaming ? (
                <img
                  src={cameraFrame}
                  alt="ESP32-CAM Live Feed"
                  className="absolute inset-0 w-full h-full object-cover"
                  onLoad={() =>
                    setCameraConnected(true)
                  }
                  onError={() =>
                    setCameraConnected(false)
                  }
                />
              ) : (
                /* Camera Paused */
                <div className="absolute inset-0 bg-dark-900 flex items-center justify-center">
                  <div className="text-center">

                    <Camera className="w-10 h-10 text-dark-400 mx-auto mb-3" />

                    <p className="text-sm text-dark-300">
                      Camera Paused
                    </p>

                  </div>
                </div>
              )}

              {/* ------------------------------------------------
                  Dark overlay
              ------------------------------------------------ */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none" />

              {/* ------------------------------------------------
                  Scan line
              ------------------------------------------------ */}
              {isStreaming && cameraConnected && (
                <motion.div
                  className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/60 to-transparent z-10"
                  animate={{
                    top: ['0%', '100%', '0%'],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              )}

              {/* ------------------------------------------------
                  YOLO Detection Boxes
              ------------------------------------------------ */}
              {isStreaming &&
                cameraConnected &&
                detections.map((det) => (
                  <motion.div
                    key={det.id}
                    className={`absolute border-2 rounded cursor-pointer z-20 transition-all ${
                      selectedDetection?.id === det.id
                        ? 'border-white shadow-lg'
                        : ''
                    }`}
                    style={{
                      borderColor:
                        selectedDetection?.id === det.id
                          ? '#ffffff'
                          : det.color,

                      left: `${det.x}%`,
                      top: `${det.y}%`,
                      width: `${det.w}%`,
                      height: `${det.h}%`,
                    }}
                    onClick={() =>
                      setSelectedDetection(det)
                    }
                    animate={{
                      opacity: [0.8, 1, 0.8],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                    }}
                  >
                    {/* Detection Label */}
                    <span
                      className="absolute -top-5 left-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                      style={{
                        backgroundColor: det.color,
                        color: '#060612',
                      }}
                    >
                      {det.label} {det.confidence}%
                    </span>
                  </motion.div>
                ))}

              {/* ------------------------------------------------
                  Camera Offline Message
              ------------------------------------------------ */}
              {isStreaming && !cameraConnected && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="text-center bg-black/70 backdrop-blur-md rounded-xl px-6 py-5">

                    <Camera className="w-8 h-8 text-dark-300 mx-auto mb-3" />

                    <p className="text-sm font-semibold text-white">
                      Camera Offline
                    </p>

                    <p className="text-xs text-dark-300 mt-1">
                      Checking ESP32-CAM connection...
                    </p>

                  </div>
                </div>
              )}

              {/* ------------------------------------------------
                  Bottom information
              ------------------------------------------------ */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-30">

                <span className="text-[10px] font-mono text-white/70 bg-black/50 px-2 py-1 rounded">
                  YOLOv8n inference · {detections.length} objects
                </span>

                <span className="text-[10px] font-mono text-white/70 bg-black/50 px-2 py-1 rounded">
                  ESP32-CAM OV2640
                </span>

              </div>

            </div>
          </div>

          {/* ==================================================
              VOICE FEEDBACK
          ================================================== */}
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              delay: 0.3,
            }}
            className="mt-4 glass-card p-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4 text-accent-cyan" />
            </div>

            <div className="flex-1">
              <span className="text-[10px] text-dark-300 block">
                Last Voice Announcement
              </span>

              <span className="text-sm text-white italic">
                "Person detected ahead at 2.4 meters."
              </span>
            </div>
          </motion.div>

        </div>

        {/* ==================================================
            RIGHT SIDEBAR
        ================================================== */}
        <div className="space-y-4">

          {/* ------------------------------------------------
              Model Configuration
          ------------------------------------------------ */}
          <div className="glass-card p-5">

            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-accent-cyan" />

              <h3 className="text-sm font-semibold text-white">
                Model Configuration
              </h3>
            </div>

            <div className="space-y-2 text-xs">

              {[
                ['Architecture', 'YOLOv8n (Nano)'],
                ['Input Size', '640 × 480'],
                ['Confidence Threshold', '0.45'],
                ['NMS Threshold', '0.50'],
                ['Backend', 'PyTorch GPU'],
                ['Inference Latency', '~82ms'],
              ].map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-1.5 border-b border-white/[0.03]"
                >
                  <span className="text-dark-300">
                    {key}
                  </span>

                  <span className="text-white font-mono">
                    {value}
                  </span>
                </div>
              ))}

            </div>
          </div>

          {/* ------------------------------------------------
              Detection List
          ------------------------------------------------ */}
          <div className="glass-card p-5">

            <h3 className="text-sm font-semibold text-white mb-4">
              Active Detections
            </h3>

            <div className="space-y-2">

              {detections.map((det) => (
                <button
                  key={det.id}
                  onClick={() =>
                    setSelectedDetection(det)
                  }
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${
                    selectedDetection?.id === det.id
                      ? 'bg-white/[0.06] border border-white/20'
                      : 'bg-dark-800/30 border border-transparent hover:border-white/[0.06]'
                  }`}
                >

                  <div className="flex items-center gap-3">

                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: det.color,
                      }}
                    />

                    <div>
                      <span className="text-xs font-semibold text-white block">
                        {det.label}
                      </span>

                      <span className="text-[10px] text-dark-300">
                        {det.position} · {det.distance}
                      </span>
                    </div>

                  </div>

                  <span
                    className="text-xs font-mono font-bold"
                    style={{
                      color: det.color,
                    }}
                  >
                    {det.confidence}%
                  </span>

                </button>
              ))}

            </div>
          </div>

        </div>
      </div>
    </DashboardShell>
  );
}