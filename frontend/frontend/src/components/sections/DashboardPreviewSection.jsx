import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Eye, Radio, MapPin, Bus, Mic, ShieldCheck, ArrowUpRight, Sparkles, Activity } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

export default function DashboardPreviewSection() {
  const previewCards = [
    {
      title: 'AI Vision Engine',
      value: 'Person detected',
      subtext: '98% confidence score',
      status: 'Active · 30 FPS',
      icon: Eye,
      color: '#00d4ff',
      badge: 'YOLOv8n',
    },
    {
      title: 'Ultrasonic Distance',
      value: '1.8 m',
      subtext: 'Path unobstructed',
      status: 'Safe Zone',
      icon: Radio,
      color: '#22c55e',
      badge: 'HC-SR04',
    },
    {
      title: 'GPS Satellite Lock',
      value: 'Connected',
      subtext: '12.9716° N, 77.5946° E',
      status: '12 Satellites (±4.2m)',
      icon: MapPin,
      color: '#3b82f6',
      badge: 'NEO-6M',
    },
    {
      title: 'BMTC Live Transit',
      value: 'Route 507',
      subtext: '357 m away · Approaching',
      status: 'ETA: 31 sec',
      icon: Bus,
      color: '#8b5cf6',
      badge: 'Live Chalo',
    },
    {
      title: 'Voice Assistant',
      value: 'Listening...',
      subtext: '"Which bus is nearby?"',
      status: 'Ready for Prompt',
      icon: Mic,
      color: '#a855f7',
      badge: 'Dual Mic Array',
    },
    {
      title: 'Safety Mesh',
      value: 'Protected',
      subtext: '3 Contacts · 4 Volunteers',
      status: 'All Systems Normal',
      icon: ShieldCheck,
      color: '#00d4ff',
      badge: 'Encrypted LORa',
    },
  ];

  return (
    <section id="dashboard-preview" className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-cyan/[0.04] rounded-full blur-[200px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-accent-cyan/20 bg-accent-cyan/5 text-accent-cyan mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Real-time Telemetry
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white leading-tight">
              Live Dashboard <span className="text-gradient">Interface.</span>
            </h2>
            <p className="text-dark-200 text-base mt-2 max-w-lg">
              Unified command center rendering real-time device health, sensor streams, and transit intelligence.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-r from-accent-cyan to-accent-blue text-dark-900 font-semibold text-sm hover:opacity-95 transition-all shadow-glow-sm w-fit magnetic-btn"
          >
            Launch Full Dashboard
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Dashboard Shell Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="rounded-3xl bg-dark-900/90 border border-white/[0.08] p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl"
        >
          {/* Top Control Bar */}
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/[0.06] flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-xs font-mono text-dark-300 ml-2">device://sightlink-stick-rev2a</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>ONLINE · 94% BATT</span>
              </div>
              <span className="text-xs font-mono text-dark-300">Ping: 24ms</span>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {previewCards.map((card, idx) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="glass-card p-5 relative group hover:border-white/20 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
                      style={{ backgroundColor: `${card.color}15`, border: `1px solid ${card.color}30` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: card.color }} />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-800 text-dark-300 border border-white/[0.04]">
                      {card.badge}
                    </span>
                  </div>

                  <span className="text-xs text-dark-300 block mb-1">{card.title}</span>
                  <h4 className="font-display text-2xl font-bold text-white mb-1 tracking-tight">{card.value}</h4>
                  <p className="text-xs text-dark-200 mb-3">{card.subtext}</p>

                  <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
                    <span className="text-dark-300">STATUS</span>
                    <span style={{ color: card.color }} className="font-semibold">
                      {card.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
