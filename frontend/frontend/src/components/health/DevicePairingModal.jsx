import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, ShieldCheck, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { healthService } from '../../services/api';

export default function DevicePairingModal({ isOpen, onClose, onDeviceLinked }) {
  const [pairingCode, setPairingCode] = useState(null);
  const [timeLeft, setTimeLeft] = useState(600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pairedDevice, setPairedDevice] = useState(null);

  const fetchPairCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await healthService.generatePairCode();
      if (res && res.pairing_code) {
        setPairingCode(res.pairing_code);
        setTimeLeft(res.expires_in_seconds || 600);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate pairing code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPairCode();
      setPairedDevice(null);
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!pairingCode || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingCode, timeLeft]);

  // Poll for paired device detection
  useEffect(() => {
    if (!isOpen || !pairingCode || pairedDevice) return;
    const poller = setInterval(async () => {
      try {
        const devices = await healthService.getDevices();
        if (Array.isArray(devices) && devices.length > 0) {
          const newest = devices[0];
          setPairedDevice(newest);
          onDeviceLinked?.(newest);
        }
      } catch {
        // silent
      }
    }, 3000);
    return () => clearInterval(poller);
  }, [isOpen, pairingCode, pairedDevice, onDeviceLinked]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-lg rounded-2xl bg-[#FAF7F0] border border-[#DCD2BF] p-6 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pair-modal-title"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-[#718096] hover:text-[#12231B] hover:bg-[#EFE8DA]"
            aria-label="Close device pairing modal"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-[#065F46]/10 border border-[#065F46]/20 flex items-center justify-center text-[#065F46]">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 id="pair-modal-title" className="text-lg font-display font-bold text-[#12231B]">
                Connect Android Health Device
              </h2>
              <p className="text-xs text-[#718096]">
                Sync Health Connect data from your phone & smartwatches
              </p>
            </div>
          </div>

          {pairedDevice ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#065F46]/10 border border-[#065F46]/30 flex items-center justify-center text-[#065F46]">
                <CheckCircle2 className="w-10 h-10 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-[#065F46]">
                  Device Successfully Linked!
                </h3>
                <p className="text-sm text-[#4A5568] mt-1">
                  Connected: <strong className="text-[#12231B]">{pairedDevice.device_name}</strong>
                </p>
                <p className="text-xs text-[#718096] mt-2">
                  Health records will now automatically sync in the background.
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2.5 rounded-xl bg-[#065F46] text-white font-medium text-sm hover:bg-[#064E3B] transition-colors"
              >
                Go to Health Dashboard
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Instructions steps */}
              <div className="rounded-xl bg-[#EFE8DA]/60 p-4 border border-[#E5DEC9] space-y-2 text-xs text-[#354B40]">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#065F46] text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                  <span>Open the <strong>SightLink Companion</strong> app on your Android phone.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#065F46] text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                  <span>Set server target to <code>http://10.0.2.2:8000</code> (emulator) or your local IP.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#065F46] text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                  <span>Enter the 6-digit code below and tap <strong>Pair With Website</strong>.</span>
                </div>
              </div>

              {/* Code Display */}
              <div className="text-center py-4 bg-[#FFFFFF] rounded-2xl border border-[#DCD2BF] shadow-inner">
                <span className="text-xs font-mono text-[#718096] uppercase tracking-wider block mb-1">
                  Your 6-Digit Pairing Code
                </span>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#065F46]" />
                  </div>
                ) : (
                  <div className="font-mono text-4xl font-black tracking-widest text-[#065F46] select-all">
                    {pairingCode || '------'}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#718096]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Expires in: <strong className="font-mono text-[#12231B]">{formattedTime}</strong>
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={fetchPairCode}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#065F46] hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Generate new code
                </button>

                <div className="flex items-center gap-1.5 text-xs text-[#718096]">
                  <ShieldCheck className="w-4 h-4 text-[#065F46]" />
                  <span>Authorized access only</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

