import { motion } from 'framer-motion';
import { Eye, AlertTriangle, Mic, Bus, CircleDot, Navigation, MapPin, History } from 'lucide-react';
import { mockHistory } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';

const iconMap = {
  Eye,
  AlertTriangle,
  Mic,
  Bus,
  CircleDot,
  Navigation,
  MapPin,
};

const badgeColors = {
  detection: { bg: 'rgba(0, 212, 255, 0.15)', text: '#00d4ff', border: 'rgba(0, 212, 255, 0.3)' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  voice: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.3)' },
  bus: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  signal: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
  navigation: { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' },
  arrival: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.4)' },
};

export default function HistorySection() {
  return (
    <section id="history" className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-1/2 right-10 w-[500px] h-[500px] bg-accent-blue/05 rounded-full blur-[180px] pointer-events-none" />

      <div className="relative z-10 max-w-[900px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-accent-blue/30 bg-accent-blue/5 text-accent-blue mb-4">
            <History className="w-3.5 h-3.5" />
            Session Telemetry & Audit
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight">
            Journey Activity <span className="text-gradient">Timeline.</span>
          </h2>
          <p className="text-dark-200 text-base mt-3 max-w-xl mx-auto">
            Granular timestamped log of neural detections, transit queries, and orientation milestones for review and family peace of mind.
          </p>
        </motion.div>

        {/* Vertical Timeline */}
        <div className="relative pl-6 md:pl-10 border-l border-white/10 space-y-8 my-8 ml-4 md:ml-12">
          {mockHistory.map((item, idx) => {
            const Icon = iconMap[item.icon] || Eye;
            const style = badgeColors[item.type] || badgeColors.detection;

            return (
              <motion.div
                key={item.time + item.event}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={viewportConfig}
                transition={{ delay: idx * 0.08, duration: 0.5 }}
                className="relative group"
              >
                {/* Node on the line */}
                <div
                  className="absolute -left-[31px] md:-left-[47px] top-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-125"
                  style={{ backgroundColor: style.bg, border: `2px solid ${style.border}` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: style.text }} />
                </div>

                {/* Content Card */}
                <div className="glass-card p-5 border-white/[0.05] group-hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-accent-cyan bg-accent-cyan/10 px-2.5 py-1 rounded-md">
                      {item.time}
                    </span>
                    <span className="text-sm font-medium text-white">{item.event}</span>
                  </div>

                  <span
                    className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full w-fit"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {item.type}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
