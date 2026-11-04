import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, PhoneCall, Share2, Users, BellRing, Check, Radio, Volume2, VolumeX } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';
import { sosSiren } from '../../utils/sosSound';

export default function SOSSection() {
  const [sosTriggered, setSosTriggered] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    return () => {
      sosSiren.stopSiren();
    };
  }, []);

  const handleTriggerSOS = () => {
    setSosTriggered(true);
    if (soundEnabled) {
      sosSiren.startSiren(0.35);
    }
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setActiveStep(step);
      if (soundEnabled) {
        sosSiren.playStepChime(880 + step * 100);
      }
      if (step >= 4) {
        clearInterval(interval);
      }
    }, 900);
  };

  const handleReset = () => {
    setSosTriggered(false);
    setActiveStep(0);
    sosSiren.stopSiren();
  };

  const actionSteps = [
    { icon: Share2, title: 'Pinpoint GPS Broadcast', desc: 'Precise coordinates (12.9716° N, 77.5946° E) sent over cellular & LoRa' },
    { icon: BellRing, title: 'Emergency SMS & Call', desc: 'Instant priority push notification to 3 registered guardians' },
    { icon: Users, title: 'Nearby Volunteer Dispatch', desc: 'Encrypted request pinged to 4 verified volunteers within 1.5 km' },
    { icon: PhoneCall, title: 'Emergency Relay Connected', desc: 'Audio call channel bridged directly with local first responder dispatch' },
  ];

  return (
    <section id="sos" className="relative section-gap section-padding overflow-hidden">
      {/* Restrained red emergency pulse radial aura */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[220px] pointer-events-none transition-all duration-1000 ${
          sosTriggered ? 'w-[850px] h-[850px] bg-red-600/15' : 'w-[550px] h-[550px] bg-red-900/05'
        }`}
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
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-red-500/20 bg-red-500/05 text-red-400 mb-4">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Safety Mesh Architecture
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            When every{' '}
            <span className="bg-gradient-to-r from-red-400 via-rose-300 to-amber-300 bg-clip-text text-transparent">
              second matters.
            </span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-2xl mx-auto">
            A single push-and-hold triggers a coordinated, multi-channel response network. Designed for high tactile clarity in high-stress moments.
          </p>
        </motion.div>

        {/* Interactive SOS Core */}
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left: Button Interactive Area */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
            className="lg:col-span-5 flex flex-col items-center justify-center"
          >
            <div className="relative flex items-center justify-center w-72 h-72">
              {/* Emergency Radii Wave */}
              {sosTriggered && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border border-red-500/30"
                    animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border border-red-500/20"
                    animate={{ scale: [1, 2.3], opacity: [0.6, 0] }}
                    transition={{ duration: 2, delay: 0.6, repeat: Infinity, ease: 'easeOut' }}
                  />
                </>
              )}

              {/* Central Physical Button */}
              <button
                onClick={sosTriggered ? handleReset : handleTriggerSOS}
                className={`relative z-20 w-44 h-44 rounded-full flex flex-col items-center justify-center p-4 transition-all duration-500 shadow-2xl focus:outline-none focus:ring-4 focus:ring-red-500/30 group ${
                  sosTriggered
                    ? 'bg-gradient-to-b from-red-600 to-red-800 text-white shadow-[0_0_60px_rgba(239,68,68,0.5)]'
                    : 'bg-dark-800 hover:bg-dark-700 border-2 border-red-500/40 hover:border-red-500/70 text-red-400'
                }`}
                aria-label={sosTriggered ? 'Reset Emergency Alert' : 'Trigger SOS Alert'}
              >
                <AlertCircle className={`w-12 h-12 mb-2 transition-transform duration-300 ${sosTriggered ? 'scale-110 text-white' : 'group-hover:scale-110 text-red-400'}`} />
                <span className="font-display font-black text-2xl tracking-wider uppercase text-white">
                  {sosTriggered ? 'ACTIVE' : 'SOS'}
                </span>
                <span className="text-[11px] font-mono tracking-widest mt-1 opacity-80 text-white">
                  {sosTriggered ? 'TAP TO RESET' : 'TAP TO TEST'}
                </span>
              </button>
            </div>

            <p className="text-xs font-mono text-dark-300 mt-4 text-center">
              Physical Stick Button: Hold 3 seconds to trigger silently
            </p>
          </motion.div>

          {/* Right: Orchestrated Response Pipeline */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-7 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-xl font-bold text-white">Automated Emergency Workflow</h3>
              <span className={`text-xs font-mono px-3 py-1 rounded-full ${sosTriggered ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-dark-800 text-dark-300'}`}>
                {sosTriggered ? 'PROTOCOL RUNNING' : 'STANDBY READY'}
              </span>
            </div>

            {actionSteps.map((step, idx) => {
              const Icon = step.icon;
              const isCompleted = sosTriggered && activeStep > idx;
              const isCurrent = sosTriggered && activeStep === idx + 1;

              return (
                <div
                  key={step.title}
                  className={`p-4 md:p-5 rounded-2xl border transition-all duration-500 flex items-start gap-4 ${
                    isCompleted
                      ? 'bg-red-950/20 border-red-500/40 text-white'
                      : isCurrent
                        ? 'bg-red-900/15 border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.15)] text-white'
                        : 'bg-dark-900/60 border-white/[0.05] text-dark-200 opacity-60'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isCompleted
                        ? 'bg-red-500 text-white'
                        : isCurrent
                          ? 'bg-red-500/20 border border-red-500 text-red-400 animate-pulse'
                          : 'bg-dark-800 text-dark-300'
                    }`}
                  >
                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-base text-white">{step.title}</h4>
                      <span className="text-[11px] font-mono text-dark-300">
                        {isCompleted ? 'CONFIRMED' : isCurrent ? 'DISPATCHING...' : `STEP 0${idx + 1}`}
                      </span>
                    </div>
                    <p className="text-xs text-dark-200 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}

            {/* Link to Safety Page */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  if (!next && sosTriggered) sosSiren.stopSiren();
                  else if (next && sosTriggered) sosSiren.startSiren(0.35);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                  soundEnabled
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-dark-800 text-dark-400 border-white/10'
                }`}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                Siren Sound: {soundEnabled ? 'Enabled' : 'Muted'}
              </button>

              <Link
                to="/safety"
                className="text-xs font-mono text-accent-cyan hover:text-white flex items-center gap-1.5 transition-colors"
              >
                Configure Parents, Police & Firefighter Numbers →
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
