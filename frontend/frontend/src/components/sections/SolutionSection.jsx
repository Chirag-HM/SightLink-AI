import { motion } from 'framer-motion';
import { Eye, MapPin, Radio, Mic, Bus, Navigation, ShieldAlert, Users } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

const nodes = [
  { icon: Eye, label: 'AI Vision', color: '#00d4ff', angle: 0 },
  { icon: MapPin, label: 'GPS', color: '#22c55e', angle: 45 },
  { icon: Radio, label: 'Ultrasonic', color: '#f59e0b', angle: 90 },
  { icon: Mic, label: 'Voice AI', color: '#8b5cf6', angle: 135 },
  { icon: Bus, label: 'BMTC', color: '#3b82f6', angle: 180 },
  { icon: Navigation, label: 'Navigation', color: '#6366f1', angle: 225 },
  { icon: ShieldAlert, label: 'SOS', color: '#ef4444', angle: 270 },
  { icon: Users, label: 'Volunteers', color: '#a855f7', angle: 315 },
];

export default function SolutionSection() {
  const radius = 180;

  return (
    <section id="solution" className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent-cyan/[0.04] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-mono text-accent-cyan/70 tracking-widest uppercase mb-6">The Solution</span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            One intelligent companion.{' '}
            <span className="text-gradient">Every step.</span>
          </h2>
        </motion.div>

        {/* Ecosystem Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewportConfig}
          transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative w-full max-w-[500px] aspect-square mx-auto"
        >
          {/* Center Hub */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="w-28 h-28 rounded-2xl bg-dark-700/90 border border-accent-cyan/30 flex items-center justify-center shadow-glow-md z-20"
              animate={{ boxShadow: ['0 0 20px rgba(0,212,255,0.1)', '0 0 40px rgba(0,212,255,0.2)', '0 0 20px rgba(0,212,255,0.1)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="text-center">
                <Eye className="w-8 h-8 text-accent-cyan mx-auto mb-1" />
                <span className="text-[10px] font-display font-semibold text-white tracking-wider">SIGHTLINK</span>
                <span className="block text-[9px] font-mono text-accent-cyan">AI</span>
              </div>
            </motion.div>
          </div>

          {/* Orbit Rings */}
          <div className="absolute inset-[15%] border border-white/[0.04] rounded-full" />
          <div className="absolute inset-[5%] border border-white/[0.03] rounded-full" />

          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 500">
            {nodes.map((node, i) => {
              const x = 250 + radius * Math.cos((node.angle * Math.PI) / 180);
              const y = 250 + radius * Math.sin((node.angle * Math.PI) / 180);
              return (
                <motion.line
                  key={node.label}
                  x1="250" y1="250" x2={x} y2={y}
                  stroke={node.color}
                  strokeWidth="1"
                  strokeOpacity="0.15"
                  strokeDasharray="4 6"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node, i) => {
            const x = 50 + (radius / 250) * 50 * Math.cos((node.angle * Math.PI) / 180);
            const y = 50 + (radius / 250) * 50 * Math.sin((node.angle * Math.PI) / 180);

            return (
              <motion.div
                key={node.label}
                className="absolute z-10 flex flex-col items-center gap-1.5 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.08, duration: 0.5, type: 'spring', stiffness: 200 }}
              >
                <motion.div
                  className="w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110"
                  style={{
                    backgroundColor: `${node.color}10`,
                    border: `1px solid ${node.color}30`,
                  }}
                  whileHover={{ boxShadow: `0 0 20px ${node.color}30` }}
                >
                  <node.icon className="w-5 h-5" style={{ color: node.color }} />
                </motion.div>
                <span className="text-[10px] font-medium text-dark-200 whitespace-nowrap">{node.label}</span>
              </motion.div>
            );
          })}

          {/* Animated Data Pulses */}
          {nodes.map((node, i) => {
            const x = 50 + (radius / 250) * 50 * Math.cos((node.angle * Math.PI) / 180);
            const y = 50 + (radius / 250) * 50 * Math.sin((node.angle * Math.PI) / 180);
            return (
              <motion.div
                key={`pulse-${node.label}`}
                className="absolute w-2 h-2 rounded-full z-30"
                style={{
                  backgroundColor: node.color,
                  left: '50%',
                  top: '50%',
                }}
                animate={{
                  left: [`50%`, `${x}%`],
                  top: [`50%`, `${y}%`],
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.5,
                  repeat: Infinity,
                  repeatDelay: 3,
                  ease: 'easeInOut',
                }}
              />
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
