import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Navigation, MapPin, ArrowDown, CheckCircle } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

export default function NavigationSection() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    { label: 'Current Location', sublabel: 'Majestic Bus Stand', active: true },
    { label: 'Heading North', sublabel: 'Seshadri Road · 200m', active: step >= 1 },
    { label: 'Turn Right', sublabel: 'MG Road · 450m', active: step >= 2 },
    { label: 'Destination', sublabel: 'MG Road Metro', active: step >= 3, isDest: true },
  ];

  return (
    <section className="relative section-gap section-padding overflow-hidden">
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-accent-indigo/[0.04] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Navigation Route Visual */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="flex flex-col gap-0 max-w-sm mx-auto lg:mx-0">
              {steps.map((s, i) => (
                <div key={s.label} className="relative">
                  <motion.div
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-500 ${
                      s.active ? 'bg-white/[0.03] border border-white/[0.06]' : 'opacity-40'
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: s.active ? 1 : 0.4, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                      s.isDest && s.active
                        ? 'bg-status-safe/15 border-2 border-status-safe/40'
                        : s.active
                          ? 'bg-accent-cyan/10 border-2 border-accent-cyan/30'
                          : 'bg-dark-700 border border-white/[0.06]'
                    }`}>
                      {s.isDest && s.active ? (
                        <CheckCircle className="w-5 h-5 text-status-safe" />
                      ) : i === 0 ? (
                        <div className="w-3 h-3 bg-accent-cyan rounded-full" />
                      ) : (
                        <MapPin className="w-4 h-4 text-dark-300" />
                      )}
                    </div>
                    <div>
                      <span className={`text-sm font-semibold ${s.active ? 'text-white' : 'text-dark-400'}`}>{s.label}</span>
                      <span className={`block text-xs ${s.active ? 'text-dark-300' : 'text-dark-400'}`}>{s.sublabel}</span>
                    </div>
                  </motion.div>

                  {/* Connecting line */}
                  {i < steps.length - 1 && (
                    <div className="ml-9 h-6 flex items-center">
                      <motion.div
                        className="w-0.5 h-full mx-auto transition-colors duration-500"
                        style={{ backgroundColor: steps[i + 1].active ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Destination Alert */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 glass-card p-4 border-status-safe/20 max-w-sm mx-auto lg:mx-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-status-safe/10 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-status-safe" />
                  </div>
                  <span className="text-sm text-status-safe font-medium">"You are approaching your destination."</span>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <span className="inline-block text-xs font-mono text-accent-indigo/70 tracking-widest uppercase mb-6">Navigation</span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Step-by-step guidance.{' '}
              <span className="text-gradient">Voice-powered.</span>
            </h2>
            <p className="text-dark-200 leading-relaxed max-w-lg">
              Set a destination and receive real-time voice-guided navigation with turn-by-turn directions. The system alerts you when you're approaching your destination, ensuring you never miss your stop.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
