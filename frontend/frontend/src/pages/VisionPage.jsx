import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Camera,
  Cpu,
  Volume2,
  Maximize2,
  RefreshCw,
  Wifi,
  Search,
  Video,
  VideoOff,
  AlertCircle,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { speakText } from '../hooks/useVoiceAssistant';
import { visionService } from '../services/api';

const CAMERA_URL_KEY = 'sightlink_camera_url';
const DEFAULT_CAMERA_URL =
  import.meta.env.VITE_ESP32_CAM_URL || 'http://10.235.17.135/capture';

function getInitialCameraUrl() {
  try {
    return window.localStorage.getItem(CAMERA_URL_KEY) || DEFAULT_CAMERA_URL;
  } catch {
    return DEFAULT_CAMERA_URL;
  }
}

export default function VisionPage() {
  const [cameraUrl, setCameraUrl] = useState(getInitialCameraUrl);
  const [urlInput, setUrlInput] = useState(getInitialCameraUrl);
  const [urlError, setUrlError] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  const [backendVisionReady, setBackendVisionReady] = useState(false);

  const [detections, setDetections] = useState([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [cameraFrame, setCameraFrame] = useState(() => {
    const initial = getInitialCameraUrl();
    const sep = initial.includes('?') ? '&' : '?';
    return `${initial}${sep}t=${Date.now()}`;
  });
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [lastAnnouncement, setLastAnnouncement] = useState(
    'Connect an ESP32-CAM capture URL on your local Wi-Fi or AP mode (192.168.4.1).'
  );
  const [detectorStatus, setDetectorStatus] = useState('Standby (awaiting live camera or YOLO endpoint)');
  const [scanning, setScanning] = useState(false);
  const [discoveryInfo, setDiscoveryInfo] = useState(null);

  // Explicit optional local PC webcam fallback (never fakes ESP32-CAM state)
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState('');
  const webcamVideoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const frameTimerRef = useRef(null);
  const useProxyRef = useRef(useProxy);
  const backendVisionReadyRef = useRef(backendVisionReady);
  useProxyRef.current = useProxy;
  backendVisionReadyRef.current = backendVisionReady;

  const buildFrameSrc = useCallback((targetUrl, proxyEnabled) => {
    if (proxyEnabled) {
      return visionService.getCaptureUrl(targetUrl);
    }
    const sep = targetUrl.includes('?') ? '&' : '?';
    return `${targetUrl}${sep}t=${Date.now()}`;
  }, []);

  const scheduleNextFrame = useCallback(
    (isOk) => {
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
      if (!isStreaming || webcamActive) return;
      frameTimerRef.current = setTimeout(() => {
        setCameraFrame(buildFrameSrc(cameraUrl, useProxy));
      }, isOk ? 400 : 5000);
    },
    [isStreaming, webcamActive, cameraUrl, useProxy, buildFrameSrc]
  );

  useEffect(() => {
    if (!isStreaming || webcamActive) {
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
      return undefined;
    }
    setCameraFrame(buildFrameSrc(cameraUrl, useProxy));
    return () => {
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
    };
  }, [isStreaming, webcamActive, cameraUrl, useProxy, buildFrameSrc]);

  const applyCameraUrl = useCallback(
    (cleanUrl, nextProxy = useProxyRef.current) => {
      try {
        window.localStorage.setItem(CAMERA_URL_KEY, cleanUrl);
        window.dispatchEvent(new Event('sightlink:camera-url-updated'));
      } catch {
        // ignore storage errors
      }
      setCameraUrl(cleanUrl);
      setUrlInput(cleanUrl);
      setCameraFrame(buildFrameSrc(cleanUrl, nextProxy));
      if (backendVisionReadyRef.current) {
        visionService.setConfig(cleanUrl, false).catch(() => null);
      }
    },
    [buildFrameSrc]
  );

  const handleScanNetwork = useCallback(
    async ({ silent = false } = {}) => {
      setScanning(true);
      setUrlError('');
      try {
        const res = await visionService.discover(true);
        if (!res || typeof res !== 'object' || !('found' in res)) {
          throw new Error(
            'Backend discovery endpoint returned an unexpected response. Restart FastAPI on port 8000.'
          );
        }
        backendVisionReadyRef.current = true;
        setBackendVisionReady(true);
        setDiscoveryInfo(res);
        if (res.found && res.camera_url) {
          applyCameraUrl(res.camera_url);
          setCameraConnected(true);
          setLastAnnouncement(`ESP32-CAM connected automatically at ${res.camera_url}.`);
          if (!silent) speakText('ESP32 camera connected.');
        } else if (res.message) {
          setCameraConnected(false);
          setLastAnnouncement(res.message);
        }
      } catch (err) {
        if (!silent) {
          setUrlError(
            err?.message ||
              'Backend discovery unreachable. Restart FastAPI on port 8000 or enter http://192.168.4.1/capture directly.'
          );
        }
      } finally {
        setScanning(false);
      }
    },
    [applyCameraUrl]
  );

  // Sync saved camera URL or discover on first visit
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await visionService.getConfig();
        if (!cancelled && cfg && typeof cfg === 'object' && 'camera_url' in cfg) {
          backendVisionReadyRef.current = true;
          setBackendVisionReady(true);
          if (cfg.camera_connected && cfg.camera_url) {
            applyCameraUrl(cfg.camera_url);
            setCameraConnected(true);
            return;
          }
        }
      } catch {
        // backend may still need restart; direct LAN URLs still work
      }
      if (!cancelled) {
        await handleScanNetwork({ silent: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCameraUrl, handleScanNetwork]);

  const pollBackendDetector = useCallback(async () => {
    try {
      const data = await visionService.getDetections();
      if (data && typeof data === 'object' && data.connected && Array.isArray(data.detections)) {
        setDetections(data.detections);
        setDetectorStatus(`Connected (${data.detections.length} objects reported)`);
        if (data.detections.length > 0) {
          const top = data.detections[0];
          const msg = `${top.label} detected${top.position ? ` ${top.position.toLowerCase()}` : ''}${
            top.distance ? ` at ${top.distance}` : ''
          }.`;
          setLastAnnouncement(msg);
        }
      } else if (data && typeof data === 'object' && Array.isArray(data.detections)) {
        setDetections([]);
        setDetectorStatus('Standby — awaiting ESP32-CAM / YOLO detections');
      } else {
        setDetectorStatus('Standby — run object_detection.py (or restart port 8000 backend)');
      }
    } catch {
      setDetectorStatus('Backend YOLO detector offline — live camera snapshot mode');
    }
  }, []);

  useEffect(() => {
    if (!isStreaming || !cameraConnected) return undefined;
    pollBackendDetector();
    const tid = setInterval(pollBackendDetector, 2000);
    return () => clearInterval(tid);
  }, [isStreaming, cameraConnected, pollBackendDetector]);

  // Clean up local webcam stream on unmount or toggle off
  const stopWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }
    setWebcamActive(false);
  }, []);

  useEffect(() => () => stopWebcam(), [stopWebcam]);

  const handleToggleWebcam = async () => {
    setWebcamError('');
    if (webcamActive) {
      stopWebcam();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Browser webcam API is unavailable on this origin.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      webcamStreamRef.current = stream;
      setWebcamActive(true);
      setTimeout(() => {
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      setWebcamError(err?.message || 'Camera permission denied or no PC webcam found.');
    }
  };

  const handleSaveCameraUrl = async (e) => {
    e.preventDefault();
    setUrlError('');
    try {
      const raw = urlInput.trim();
      const parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Use an http:// or https:// camera URL.');
      }
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/capture';
      }
      const clean = parsed.toString();
      stopWebcam();
      applyCameraUrl(clean);
      if (backendVisionReady) {
        const cfg = await visionService.setConfig(clean, true).catch(() => null);
        if (cfg?.camera_connected) {
          setCameraConnected(true);
          setLastAnnouncement(`Connected to ESP32-CAM at ${clean}.`);
        } else if (cfg?.last_error) {
          setCameraConnected(false);
          setUrlError(`Could not reach ${clean}: ${cfg.last_error}`);
        }
      }
    } catch (err) {
      setUrlError(err?.message || 'Enter a valid ESP32-CAM snapshot URL.');
    }
  };

  const handleFullscreen = () => {
    const cameraElement = document.getElementById('esp32-camera-feed');
    if (cameraElement?.requestFullscreen) {
      cameraElement.requestFullscreen();
    }
  };

  const handleSelectDetection = (det) => {
    setSelectedDetection(det);
    const msg = `${det.label} detected${det.position ? ` ${det.position.toLowerCase()}` : ''}${
      det.distance ? ` at ${det.distance}` : ''
    }.`;
    setLastAnnouncement(msg);
    speakText(msg);
  };

  return (
    <DashboardShell
      title="AI Vision"
      subtitle="ESP32-CAM live snapshot viewer, LAN auto-discovery & YOLOv8 obstacle readout"
      icon={Eye}
    >
      {/* Camera URL Configurator & Discovery */}
      <div className="mb-6 glass-card p-4 space-y-3">
        <form onSubmit={handleSaveCameraUrl} className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex-1">
            <span className="block text-xs text-[#4F6358] mb-1.5">
              ESP32-CAM Snapshot URL (LAN IP or AP <code>192.168.4.1/capture</code>)
            </span>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://192.168.4.1/capture or http://10.x.x.x/capture"
              className="w-full rounded-lg bg-white border border-[#D7CEBC] px-3 py-2 text-sm text-[#12231B] outline-none focus:border-[#065F46]"
              aria-label="ESP32-CAM snapshot URL"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-[#065F46] hover:bg-[#054D39] px-5 py-2.5 text-xs font-bold text-white transition-colors"
          >
            Connect Camera
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={() => handleScanNetwork({ silent: false })}
            className="rounded-lg bg-[#FBF3DF] hover:bg-[#F3E5C2] border border-[#C59B42]/45 px-4 py-2.5 text-xs font-bold text-[#7D5B1C] inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Search className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning LAN...' : 'Scan Network'}
          </button>
          <button
            type="button"
            onClick={() => {
              stopWebcam();
              applyCameraUrl('http://192.168.4.1/capture');
            }}
            className="rounded-lg bg-[#F6F1E6] hover:bg-[#EBE3D3] border border-[#DCD2BF] px-3.5 py-2.5 text-xs font-semibold text-[#12231B]"
          >
            Use AP Mode (192.168.4.1)
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4F6358]">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useProxy}
                disabled={!backendVisionReady}
                onChange={(e) => setUseProxy(e.target.checked)}
                className="rounded border-[#D7CEBC] text-[#065F46] focus:ring-[#065F46] disabled:opacity-50"
              />
              <span>
                Proxy snapshots via SightLink backend
                {!backendVisionReady ? ' (restart port 8000 to enable)' : ''}
              </span>
            </label>
            <button
              type="button"
              onClick={pollBackendDetector}
              className="inline-flex items-center gap-1 text-[#065F46] font-semibold hover:underline"
            >
              <RefreshCw className="w-3 h-3" /> Refresh YOLO API
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleWebcam}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F6F1E6] border border-[#DCD2BF] text-[#12231B] font-semibold hover:border-[#065F46]/40"
          >
            {webcamActive ? <VideoOff className="w-3.5 h-3.5 text-red-700" /> : <Video className="w-3.5 h-3.5 text-[#065F46]" />}
            {webcamActive ? 'Stop PC Webcam Fallback' : 'Test PC Webcam (Fallback)'}
          </button>
        </div>

        {urlError && (
          <p className="text-xs text-red-700 font-medium" role="alert">
            {urlError}
          </p>
        )}
        {webcamError && (
          <p className="text-xs text-red-700 font-medium" role="alert">
            {webcamError}
          </p>
        )}
      </div>

      {/* Hardware Wi-Fi / AP Discovery Alert when ESP32-CAM AP is detected nearby */}
      {!cameraConnected && !webcamActive && discoveryInfo?.ap_detected && (
        <div
          className="mb-6 rounded-2xl bg-[#FBF3DF] border border-[#C59B42]/50 p-4 flex items-start gap-3 text-[#12231B]"
          role="status"
        >
          <Wifi className="w-5 h-5 text-[#8C6A23] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs leading-relaxed">
            <p className="font-bold text-[#7D5B1C]">
              ESP32-CAM Detected Nearby in AP Hotspot Mode ({discoveryInfo.ap_ssid || 'ESP32-CAM-AP'})
            </p>
            <p className="text-[#354B40]">
              Your PC is currently connected to <strong>{discoveryInfo.pc_wifi_ssid || 'another Wi-Fi'}</strong>, while the ESP32-CAM firmware could not find its configured hotspot and fell back to creating <strong>{discoveryInfo.ap_ssid || 'ESP32-CAM-AP'}</strong>.
            </p>
            <ul className="list-disc pl-4 text-[#354B40] space-y-0.5">
              <li>
                <strong>Option A (Keep Internet + LAN):</strong>{' '}
                {discoveryInfo?.firmware_needs_upload && discoveryInfo?.source_ssid ? (
                  <>
                    Note: <code>src/main.cpp</code> was updated to <code>{discoveryInfo.source_ssid}</code>, but the
                    ESP32-CAM firmware hasn&apos;t been re-uploaded over USB yet. Flash the firmware (or turn on the
                    previously flashed hotspot), power-cycle, and click <strong>Scan Network</strong>.
                  </>
                ) : (
                  <>
                    Turn on the 2.4 GHz Wi-Fi hotspot configured in your ESP32-CAM firmware
                    {discoveryInfo?.source_ssid ? (
                      <>
                        {' '}
                        (<code>{discoveryInfo.source_ssid}</code>)
                      </>
                    ) : null}
                    , power-cycle the ESP32-CAM, and click <strong>Scan Network</strong>.
                  </>
                )}
              </li>
              <li>
                <strong>Option B (Direct Camera Stream):</strong> Connect this PC’s Wi-Fi to <strong>{discoveryInfo.ap_ssid || 'ESP32-CAM-AP'}</strong> (password <code>12345678</code>) and click <strong>Use AP Mode (192.168.4.1)</strong>.
              </li>
            </ul>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Camera Panel */}
        <div className="lg:col-span-2">
          <div className="glass-card p-1.5 relative overflow-hidden rounded-2xl">
            <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF7F0]/95 border border-[#DCD2BF] backdrop-blur-md shadow-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    webcamActive || (isStreaming && cameraConnected)
                      ? 'bg-[#065F46] animate-pulse'
                      : 'bg-[#9CA89E]'
                  }`}
                />
                <span className="text-[10px] font-mono font-semibold text-[#12231B]">
                  {webcamActive
                    ? 'PC WEBCAM FALLBACK'
                    : !isStreaming
                    ? 'PAUSED'
                    : cameraConnected
                    ? 'ESP32-CAM LIVE'
                    : 'ESP32-CAM OFFLINE'}
                </span>
              </div>

              <span className="px-2.5 py-1 rounded bg-[#FAF7F0]/95 border border-[#DCD2BF] text-[10px] font-mono text-[#354B40] backdrop-blur-md shadow-sm">
                {webcamActive ? 'Local Webcam Preview' : 'ESP32-CAM · QVGA/VGA'}
              </span>
            </div>

            <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5">
              {!webcamActive && (
                <button
                  type="button"
                  onClick={() => setIsStreaming((prev) => !prev)}
                  className="p-2 rounded-lg bg-[#FAF7F0]/95 border border-[#DCD2BF] text-[#354B40] hover:text-[#065F46] transition-colors backdrop-blur-md shadow-sm"
                  aria-label={isStreaming ? 'Pause camera stream' : 'Resume camera stream'}
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleFullscreen}
                className="p-2 rounded-lg bg-[#FAF7F0]/95 border border-[#DCD2BF] text-[#354B40] hover:text-[#065F46] transition-colors backdrop-blur-md shadow-sm"
                aria-label="Fullscreen camera view"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            <div
              id="esp32-camera-feed"
              className="aspect-video bg-[#1E352B] rounded-xl relative overflow-hidden"
            >
              {webcamActive ? (
                <video
                  ref={webcamVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : isStreaming ? (
                <img
                  src={cameraFrame}
                  alt="ESP32-CAM Live Feed"
                  className={`absolute inset-0 w-full h-full object-cover ${cameraConnected ? '' : 'opacity-0'}`}
                  onLoad={() => {
                    setCameraConnected(true);
                    scheduleNextFrame(true);
                  }}
                  onError={() => {
                    setCameraConnected(false);
                    scheduleNextFrame(false);
                  }}
                />
              ) : (
                <div className="absolute inset-0 bg-[#EFEAD9] flex items-center justify-center">
                  <div className="text-center">
                    <Camera className="w-10 h-10 text-[#065F46]/60 mx-auto mb-3" />
                    <p className="text-sm font-medium text-[#12231B]">Camera Feed Paused</p>
                  </div>
                </div>
              )}

              {!webcamActive && isStreaming && cameraConnected && (
                <motion.div
                  className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E6CB8F] to-transparent z-10"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                />
              )}

              {!webcamActive &&
                isStreaming &&
                cameraConnected &&
                detections.map((det, idx) => (
                  <div
                    key={det.id ?? idx}
                    className={`absolute border-2 rounded cursor-pointer z-20 ${
                      selectedDetection?.id === det.id ? 'border-white shadow-lg' : ''
                    }`}
                    style={{
                      borderColor: selectedDetection?.id === det.id ? '#ffffff' : det.color || '#065F46',
                      left: `${det.x ?? 10}%`,
                      top: `${det.y ?? 10}%`,
                      width: `${det.w ?? 20}%`,
                      height: `${det.h ?? 30}%`,
                    }}
                    onClick={() => handleSelectDetection(det)}
                  >
                    <span
                      className="absolute -top-5 left-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap text-white"
                      style={{ backgroundColor: det.color || '#065F46' }}
                    >
                      {det.label} {det.confidence != null ? `${det.confidence}%` : ''}
                    </span>
                  </div>
                ))}

              {!webcamActive && isStreaming && !cameraConnected && (
                <div className="absolute inset-0 flex items-center justify-center z-20 p-4">
                  <div className="text-center bg-[#FAF7F0]/95 border border-[#DCD2BF] backdrop-blur-md rounded-xl px-6 py-5 shadow-md max-w-md space-y-2">
                    <AlertCircle className="w-8 h-8 text-[#8C6A23] mx-auto" />
                    <p className="text-sm font-semibold text-[#12231B]">ESP32-CAM Not Reachable Yet</p>
                    <p className="text-xs text-[#4F6358] font-mono break-all">
                      Target: {cameraUrl}
                    </p>
                    {discoveryInfo?.message && (
                      <p className="text-xs text-[#354B40] leading-relaxed">
                        {discoveryInfo.message}
                      </p>
                    )}
                    <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCameraFrame(buildFrameSrc(cameraUrl, useProxy))}
                        className="px-4 py-1.5 rounded-lg bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39]"
                      >
                        Retry Snapshot
                      </button>
                      <button
                        type="button"
                        disabled={scanning}
                        onClick={() => handleScanNetwork({ silent: false })}
                        className="px-4 py-1.5 rounded-lg bg-[#FBF3DF] border border-[#C59B42]/45 text-[#7D5B1C] text-xs font-bold hover:bg-[#F3E5C2]"
                      >
                        {scanning ? 'Scanning...' : 'Scan Network'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-30">
                <span className="text-[10px] font-mono font-medium text-[#12231B] bg-[#FAF7F0]/95 border border-[#DCD2BF] px-2.5 py-1 rounded shadow-sm">
                  {webcamActive
                    ? 'PC Webcam test preview active (ESP32-CAM offline)'
                    : `${detections.length} live detections reported`}
                </span>
                <span className="text-[10px] font-mono font-medium text-[#12231B] bg-[#FAF7F0]/95 border border-[#DCD2BF] px-2.5 py-1 rounded shadow-sm">
                  {webcamActive ? 'Browser getUserMedia' : 'ESP32-CAM OV2640'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 glass-card p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#ECF7F2] border border-[#065F46]/20 flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4 text-[#065F46]" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-[#4F6358] block">Voice &amp; Discovery Status</span>
                <span className="text-sm text-[#12231B] italic break-words">“{lastAnnouncement}”</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => speakText(lastAnnouncement)}
              className="px-3.5 py-2 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] shrink-0"
            >
              Speak
            </button>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-[#065F46]" />
              <h3 className="text-sm font-semibold text-[#12231B]">Pipeline Status</h3>
            </div>

            <div className="space-y-2 text-xs">
              {[
                ['ESP32-CAM Link', cameraConnected ? 'Connected' : 'Offline'],
                ['Transport Mode', webcamActive ? 'PC Webcam Fallback' : useProxy ? 'Backend Proxy' : 'Direct LAN'],
                ['PC Wi-Fi SSID', discoveryInfo?.pc_wifi_ssid || 'Unknown'],
                ['AP Broadcast', discoveryInfo?.ap_detected ? `${discoveryInfo.ap_ssid} Ready` : 'None detected'],
                ['YOLO API', detectorStatus],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-2 py-1.5 border-b border-[#E2D9C8]">
                  <span className="text-[#4F6358] shrink-0">{key}</span>
                  <span className="text-[#12231B] font-mono font-semibold text-right truncate max-w-[180px]" title={String(value)}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-[#12231B] mb-4">Active Detections</h3>

            {detections.length === 0 ? (
              <p className="text-xs text-[#4F6358] leading-relaxed">
                No live detections received yet. Run <code>python object_detection.py</code> once your ESP32-CAM is reachable on Wi-Fi to stream YOLOv8 boxes into the website.
              </p>
            ) : (
              <div className="space-y-2">
                {detections.map((det, idx) => (
                  <button
                    key={det.id ?? idx}
                    type="button"
                    onClick={() => handleSelectDetection(det)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left border ${
                      selectedDetection?.id === det.id
                        ? 'bg-[#ECF7F2] border-[#065F46]/40'
                        : 'bg-[#F6F1E6] border-[#E2D9C8] hover:border-[#065F46]/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: det.color || '#065F46' }}
                      />
                      <div>
                        <span className="text-xs font-semibold text-[#12231B] block">{det.label}</span>
                        <span className="text-[10px] text-[#4F6358]">
                          {det.position || 'Frame'} {det.distance ? `· ${det.distance}` : ''}
                        </span>
                      </div>
                    </div>
                    {det.confidence != null && (
                      <span className="text-xs font-mono font-bold" style={{ color: det.color || '#065F46' }}>
                        {det.confidence}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
