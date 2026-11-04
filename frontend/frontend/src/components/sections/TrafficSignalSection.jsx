import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { TrafficCone, Volume2, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';
import { useInView } from '../../hooks/useAnimations';

const signals = [
  { state: 'RED', label: 'Stop & Wait', color: '#ef4444', confidence: 97, voice: 'Red signal detected. Please wait at the crossing.', safeToCross: false },
  { state: 'YELLOW', label: 'Caution / Changing', color: '#f59e0b', confidence: 94, voice: 'Signal transitioning. Prepare to cross.', safeToCross: false },
  { state: 'GREEN', label: 'Walk / Safe to Cross', color: '#22c55e', confidence: 99, voice: 'Green signal. Crosswalk is clear to navigate.', safeToCross: true },
];

export default function TrafficSignalSection() {
  const [ref, isInView] = useInView({ once: true, threshold: 0.3 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  useEffect(() => {
    if (!isInView) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % signals.length;
        setIsAudioPlaying(true);
        setTimeout(() => setIsAudioPlaying(false), 2400);
        return next;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [isInView]);

  const active = signals[currentIndex];

  return (
    <section ref={ref} className="relative section-gap section-padding overflow-hidden">
      {/* Background glow matching active state */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[200px] pointer-events-none transition-all duration-1000 opacity-15"
        style={{ backgroundColor: active.color }}
      />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-accent-cyan/20 bg-accent-cyan/5 text-accent-cyan mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Computer Vision Intelligence
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Traffic Signal Recognition.{' '}
            <span className="text-gradient">Instant Clarity.</span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-2xl mx-auto">
            Camera-based neural models instantly segment active light phases, crosswalk lanes, and pedestrian countdown timers with real-time audio guidance.
          </p>
        </motion.div>

        {/* Visual Box */}
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Signal Physical Display */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
            className="lg:col-span-5 flex justify-center"
          >
            <div className="relative p-6 rounded-3xl bg-dark-800/90 border border-white/[0.08] shadow-2xl flex flex-col items-center">
              {/* Traffic Light Housing */}
              <div className="w-32 bg-dark-950 p-4 rounded-3xl border border-white/10 shadow-inner flex flex-col items-center gap-4">
                {/* RED */}
                <div
                  className={`w-20 h-20 rounded-full transition-all duration-700 flex items-center justify-center relative ${
                    active.state === 'RED'
                      ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.8)] scale-105'
                      : 'bg-red-950/40 border border-red-900/30'
                  }`}
                >
                  {active.state === 'RED' && (
                    <motion.div
                      layoutId="signal-glow"
                      className="absolute inset-0 rounded-full bg-red-400/30 animate-ping"
                    />
                  )}
                  <span className={`text-[11px] font-mono font-bold ${active.state === 'RED' ? 'text-white' : 'text-red-800/60'}`}>
                    STOP
                  </span>
                </div>

                {/* YELLOW */}
                <div
                  className={`w-20 h-20 rounded-full transition-all duration-700 flex items-center justify-center relative ${
                    active.state === 'YELLOW'
                      ? 'bg-amber-400 shadow-[0_0_40px_rgba(245,158,11,0.8)] scale-105'
                      : 'bg-amber-950/30 border border-amber-900/30'
                  }`}
                >
                  <span className={`text-[11px] font-mono font-bold ${active.state === 'YELLOW' ? 'text-dark-900' : 'text-amber-800/60'}`}>
                    WAIT
                  </span>
                </div>

                {/* GREEN */}
                <div
                  className={`w-20 h-20 rounded-full transition-all duration-700 flex items-center justify-center relative ${
                    active.state === 'GREEN'
                      ? 'bg-emerald-400 shadow-[0_0_45px_rgba(34,197,94,0.8)] scale-105'
                      : 'bg-emerald-950/30 border border-emerald-900/30'
                  }`}
                >
                  {active.state === 'GREEN' && (
                    <motion.div
                      layoutId="signal-glow"
                      className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping"
                    />
                  )}
                  <span className={`text-[11px] font-mono font-bold ${active.state === 'GREEN' ? 'text-dark-900' : 'text-emerald-800/60'}`}>
                    WALK
                  </span>
                </div>
              </div>

              {/* Status pill */}
              <div className="mt-5 px-4 py-1.5 rounded-full bg-dark-900 border border-white/10 text-xs font-mono text-dark-200">
                Phase ID: <span className="text-white font-semibold">SIG-BLR-094</span>
              </div>
            </div>
          </motion.div>

          {/* AI Inference & Voice Guidance Feedback */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-7 flex flex-col gap-5"
          >
            {/* Live Inference Card */}
            <div className="glass-card p-6 md:p-8 relative overflow-hidden border-white/[0.08]">
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-500"
                    style={{ backgroundColor: `${active.color}15`, border: `1px solid ${active.color}35` }}
                  >
                    <TrafficCone className="w-5 h-5 transition-colors duration-500" style={{ color: active.color }} />
                  </div>
                  <div>
                    <span className="text-xs font-mono uppercase tracking-widest text-dark-300">YOLOv8 Detection</span>
                    <h4 className="text-lg font-bold text-white">Pedestrian Crossing State</h4>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[11px] text-dark-300 block">CONFIDENCE</span>
                  <span className="text-base font-bold" style={{ color: active.color }}>
                    {active.confidence}%
                  </span>
                </div>
              </div>

              {/* Signal Status Details */}
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-dark-900/60 border border-white/[0.04]">
                  <span className="text-xs text-dark-300 block mb-1">Detected Phase</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: active.color }} />
                    <span className="text-lg font-display font-bold text-white tracking-wide">{active.state}</span>
                  </div>
                  <span className="text-xs text-dark-200 mt-1 block">{active.label}</span>
                </div>

                <div className="p-4 rounded-xl bg-dark-900/60 border border-white/[0.04]">
                  <span className="text-xs text-dark-300 block mb-1">Safety Advisory</span>
                  <div className="flex items-center gap-2">
                    {active.safeToCross ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-amber-400" />
                    )}
                    <span className={`text-sm font-semibold ${active.safeToCross ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {active.safeToCross ? 'Safe to Step Out' : 'Remain on Curb'}
                    </span>
                  </div>
                  <span className="text-xs text-dark-300 mt-1 block">Crosswalk distance: 3.2m</span>
                </div>
              </div>

              {/* Voice Prompt Box */}
              <div className="p-4 rounded-xl bg-accent-cyan/5 border border-accent-cyan/20 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-accent-cyan/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Volume2 className={`w-4 h-4 text-accent-cyan ${isAudioPlaying ? 'animate-bounce' : ''}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-accent-cyan uppercase tracking-wider font-semibold">
                      Spoken Haptic Audio
                    </span>
                    <span className="text-[10px] text-dark-300">ESP32 Audio DAC</span>
                  </div>
                  <p className="text-sm font-medium text-white italic">
                    "{active.voice}"
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-dark-300 font-mono">Test State:</span>
              {signals.map((sig, idx) => (
                <button
                  key={sig.state}
                  onClick={() => setCurrentIndex(idx)}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-medium transition-all duration-300 ${
                    idx === currentIndex
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'text-dark-300 hover:text-white bg-dark-900 border border-white/[0.04]'
                  }`}
                >
                  {sig.state}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
