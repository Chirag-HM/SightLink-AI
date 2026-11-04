import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Radio, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';
import { useInView } from '../../hooks/useAnimations';

const stages = [
  { distance: 2.8, status: 'safe', label: 'SAFE', color: '#22c55e', icon: ShieldCheck },
  { distance: 1.4, status: 'warning', label: 'CAUTION', color: '#f59e0b', icon: AlertTriangle },
  { distance: 0.6, status: 'danger', label: 'WARNING', color: '#ef4444', icon: XCircle },
];

export default function UltrasonicSection() {
  const [ref, isInView] = useInView({ once: true, threshold: 0.4 });
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const interval = setInterval(() => {
      setStageIndex(prev => (prev + 1) % stages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isInView]);

  const current = stages[stageIndex];
  const StatusIcon = current.icon;

  return (
    <section className="relative section-gap section-padding overflow-hidden" ref={ref}>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent-blue/[0.04] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
            className="relative flex items-center justify-center"
          >
            <div className="relative w-72 h-72">
              {/* Radar Rings */}
              {[1, 2, 3].map((ring) => (
                <motion.div
                  key={ring}
                  className="absolute rounded-full border transition-all duration-700"
                  style={{
                    inset: `${(3 - ring) * 25}%`,
                    borderColor: ring <= stageIndex + 1 ? `${current.color}30` : 'rgba(255,255,255,0.04)',
                    backgroundColor: ring <= stageIndex + 1 ? `${current.color}05` : 'transparent',
                  }}
                />
              ))}

              {/* Center Sensor */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center transition-all duration-700"
                  style={{
                    backgroundColor: `${current.color}10`,
                    border: `2px solid ${current.color}40`,
                    boxShadow: `0 0 30px ${current.color}20`,
                  }}
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <StatusIcon className="w-6 h-6 mb-1 transition-colors duration-300" style={{ color: current.color }} />
                  <span className="text-[10px] font-mono font-semibold tracking-wider transition-colors duration-300" style={{ color: current.color }}>
                    {current.label}
                  </span>
                </motion.div>
              </div>

              {/* Distance Display */}
              <motion.div
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 glass-card px-6 py-3 text-center"
                key={current.distance}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <span className="text-3xl font-display font-bold transition-colors duration-300" style={{ color: current.color }}>
                  {current.distance}
                </span>
                <span className="text-sm text-dark-300 ml-1">m</span>
              </motion.div>

              {/* Obstacle approaching indicator */}
              {stageIndex > 0 && (
                <motion.div
                  className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${current.color}20`, border: `1px solid ${current.color}30` }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: current.color }} />
                </motion.div>
              )}

              {/* Ultrasonic waves */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 300">
                {[0, 1, 2].map((wave) => (
                  <motion.path
                    key={wave}
                    d={`M 150 150 Q 150 ${80 - wave * 20} ${200 + wave * 30} ${80 - wave * 20}`}
                    fill="none"
                    stroke={current.color}
                    strokeWidth="1"
                    strokeOpacity="0.2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: [0, 1, 0] }}
                    transition={{ duration: 2, delay: wave * 0.3, repeat: Infinity }}
                  />
                ))}
              </svg>
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <span className="inline-block text-xs font-mono text-accent-cyan/70 tracking-widest uppercase mb-6">Ultrasonic Safety</span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              When AI sees it,{' '}
              <span className="text-gradient">ultrasonic confirms it.</span>
            </h2>
            <p className="text-dark-200 leading-relaxed mb-8 max-w-lg">
              The HC-SR04 ultrasonic sensor continuously measures the distance to nearby objects, providing a critical second layer of awareness. Combined with AI vision, it creates a comprehensive safety system that alerts users through haptic and audio feedback as obstacles approach.
            </p>

            {/* Status Indicators */}
            <div className="flex gap-4">
              {stages.map((stage, i) => (
                <div
                  key={stage.label}
                  className={`px-4 py-2 rounded-lg border transition-all duration-300 cursor-pointer ${
                    i === stageIndex ? 'opacity-100' : 'opacity-40'
                  }`}
                  style={{
                    borderColor: i === stageIndex ? `${stage.color}40` : 'rgba(255,255,255,0.06)',
                    backgroundColor: i === stageIndex ? `${stage.color}08` : 'transparent',
                  }}
                  onClick={() => setStageIndex(i)}
                >
                  <span className="text-xs font-mono font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                  <span className="block text-xs text-dark-300 mt-0.5">{stage.distance}m</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
