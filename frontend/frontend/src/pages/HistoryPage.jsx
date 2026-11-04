import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  History, Eye, AlertTriangle, Mic, Bus, CircleDot,
  Navigation, MapPin, Calendar, Download, Filter, RefreshCw,
  Clock, ShieldAlert, ArrowUpRight
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { mockHistory } from '../utils/mockData';

const eventTypeStyles = {
  detection: {
    bg: 'bg-cyan-500/10 border-cyan-500/20 text-accent-cyan',
    icon: Eye,
    label: 'Vision',
  },
  warning: {
    bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    icon: AlertTriangle,
    label: 'Obstacle Alert',
  },
  voice: {
    bg: 'bg-violet-500/10 border-violet-500/20 text-accent-violet',
    icon: Mic,
    label: 'Voice Command',
  },
  bus: {
    bg: 'bg-blue-500/10 border-blue-500/20 text-accent-blue',
    icon: Bus,
    label: 'Transit Feed',
  },
  signal: {
    bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    icon: CircleDot,
    label: 'Traffic Signal',
  },
  navigation: {
    bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    icon: Navigation,
    label: 'Waypoint',
  },
  arrival: {
    bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    icon: MapPin,
    label: 'Destination',
  },
};

export default function HistoryPage() {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [dateRange, setDateRange] = useState('Today, Oct 22');

  const filteredHistory = selectedFilter === 'all'
    ? mockHistory
    : mockHistory.filter(item => item.type === selectedFilter);

  return (
    <DashboardShell
      title="Activity & Session History"
      subtitle="Complete chronological audit trail of telemetry, obstacle triggers, and audio alerts"
      icon={History}
    >
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Distance', value: '3.4 km', change: '+12% vs avg', color: '#00d4ff' },
          { label: 'Active Duration', value: '48 mins', change: '8 sessions', color: '#8b5cf6' },
          { label: 'Hazards Avoided', value: '14 alerts', change: '100% safe', color: '#22c55e' },
          { label: 'Buses Intercepted', value: '3 lines', change: '507, 335E, 500C', color: '#3b82f6' },
        ].map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card p-4"
          >
            <span className="text-[11px] font-mono text-dark-400 block mb-1">{metric.label}</span>
            <div className="text-xl md:text-2xl font-display font-bold text-white mb-0.5">{metric.value}</div>
            <span className="text-[10px] font-mono" style={{ color: metric.color }}>{metric.change}</span>
          </motion.div>
        ))}
      </div>

      {/* Filter and Action Header */}
      <div className="glass-card p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-dark-400 flex items-center gap-1.5 mr-1 font-mono">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {[
            { id: 'all', label: 'All Events' },
            { id: 'detection', label: 'Vision' },
            { id: 'warning', label: 'Obstacles' },
            { id: 'bus', label: 'BMTC' },
            { id: 'navigation', label: 'Routes' },
            { id: 'signal', label: 'Signals' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                selectedFilter === f.id
                  ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30 shadow-glow-sm'
                  : 'bg-dark-800/80 text-dark-300 hover:text-white border border-white/[0.04]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date and Export Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800/80 border border-white/[0.06] text-xs font-mono text-dark-200">
            <Calendar className="w-3.5 h-3.5 text-accent-cyan" />
            <span>{dateRange}</span>
          </div>

          <button
            onClick={() => alert('Log exported as encrypted JSON format.')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-white transition-all font-mono"
          >
            <Download className="w-3.5 h-3.5" />
            Export Log
          </button>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-cyan" />
            <h3 className="font-display font-semibold text-white text-base">Recorded Telemetry Stream</h3>
          </div>
          <span className="text-xs font-mono text-dark-400">
            {filteredHistory.length} events logged
          </span>
        </div>

        <div className="relative pl-6 md:pl-8 space-y-6 before:absolute before:left-3 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-accent-cyan/40 before:via-accent-violet/30 before:to-transparent">
          {filteredHistory.map((item, index) => {
            const style = eventTypeStyles[item.type] || eventTypeStyles.detection;
            const Icon = style.icon;

            return (
              <motion.div
                key={`${item.time}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="relative group"
              >
                {/* Node icon marker */}
                <div
                  className={`absolute -left-6 md:-left-8 top-1.5 w-6 h-6 md:w-7 md:h-7 rounded-full border flex items-center justify-center transform -translate-x-1/2 bg-dark-900 ${style.bg}`}
                >
                  <Icon className="w-3 md:w-3.5 h-3 md:h-3.5" />
                </div>

                {/* Event Card */}
                <div className="p-4 rounded-xl bg-dark-800/40 border border-white/[0.04] group-hover:border-white/10 group-hover:bg-dark-800/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-white/[0.05]">
                        {item.time}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${style.bg}`}>
                        {style.label}
                      </span>
                    </div>
                    <p className="text-sm text-dark-100 font-medium pt-1">
                      {item.event}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span className="text-[11px] font-mono text-dark-400">
                      Sensor: ESP32 + Ultrasonic
                    </span>
                    <button className="p-1.5 rounded-lg bg-white/[0.03] text-dark-400 group-hover:text-white transition-colors" title="Event details">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
