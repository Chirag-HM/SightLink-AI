import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, MapPin, Clock, ShieldCheck, CheckCircle, Radio } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { mockVolunteers } from '../utils/mockData';

export default function VolunteersPage() {
  const [selected, setSelected] = useState(mockVolunteers[0]);

  return (
    <DashboardShell title="Volunteer Network" subtitle="Community-verified assistance within walking distance" icon={Users}>
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Map */}
        <div className="aspect-square lg:aspect-auto lg:min-h-[500px] bg-dark-800 rounded-2xl border border-white/[0.06] relative overflow-hidden map-grid">
          {/* Radar sweep */}
          <motion.div className="absolute inset-0 origin-center pointer-events-none" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(168,85,247,0.06) 30deg, transparent 60deg)' }} animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />

          {/* User */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <div className="w-5 h-5 bg-accent-cyan rounded-full border-2 border-white shadow-glow-md" />
            <motion.div className="absolute -inset-3 rounded-full border border-accent-cyan/30" animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ duration: 2, repeat: Infinity }} />
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 text-[9px] font-mono text-accent-cyan whitespace-nowrap bg-dark-900/90 px-2 py-0.5 rounded border border-accent-cyan/20">YOU</span>
          </div>

          {/* Volunteer nodes */}
          {mockVolunteers.map((v) => (
            <button key={v.id} onClick={() => setSelected(v)} className="absolute z-30 -translate-x-1/2 -translate-y-1/2 group focus:outline-none" style={{ left: `${v.coords.x}%`, top: `${v.coords.y}%` }}>
              <div className={`w-4 h-4 rounded-full transition-all ${v.id === selected.id ? 'bg-accent-purple ring-4 ring-accent-purple/30 scale-125' : v.available ? 'bg-emerald-400 group-hover:scale-110' : 'bg-dark-400'}`} />
              {v.available && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
              <span className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[8px] font-mono whitespace-nowrap ${v.id === selected.id ? 'text-accent-purple font-bold' : 'text-dark-300'}`}>{v.distance}</span>
            </button>
          ))}

          <div className="absolute top-4 left-4 glass-card px-3 py-2 backdrop-blur-md flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-accent-purple animate-pulse" />
            <span className="text-[10px] font-mono text-dark-200"><strong className="text-white">{mockVolunteers.filter(v => v.available).length}</strong> Available</span>
          </div>
        </div>

        {/* Selected Volunteer */}
        <div className="space-y-6">
          <div className="glass-card p-8 border-accent-purple/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-accent-purple/15 border border-accent-purple/30 flex items-center justify-center">
                  <Users className="w-6 h-6 text-accent-purple" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-white">{selected.name}</h3>
                  <div className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-accent-cyan" /><span className="text-[10px] text-accent-cyan">Verified</span></div>
                </div>
              </div>
              <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full ${selected.available ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-dark-700 text-dark-400'}`}>
                {selected.available ? 'AVAILABLE' : 'BUSY'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-dark-900/80 border border-white/[0.05]">
                <MapPin className="w-4 h-4 text-dark-400 mb-1" />
                <span className="text-[10px] text-dark-300 block">Distance</span>
                <span className="font-display text-xl font-bold text-white">{selected.distance}</span>
              </div>
              <div className="p-4 rounded-xl bg-dark-900/80 border border-white/[0.05]">
                <Clock className="w-4 h-4 text-dark-400 mb-1" />
                <span className="text-[10px] text-dark-300 block">Response</span>
                <span className="font-display text-xl font-bold text-accent-purple">{selected.responseTime}</span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-xs text-dark-200"><CheckCircle className="w-4 h-4 text-emerald-400" /> Background verified & mobility trained</div>
              <div className="flex items-center gap-2 text-xs text-dark-200"><CheckCircle className="w-4 h-4 text-emerald-400" /> Randomized pairing code for safe handoff</div>
            </div>

            <button disabled={!selected.available} className="w-full py-3.5 rounded-full bg-gradient-to-r from-accent-purple to-accent-indigo text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              Request Assistance
            </button>
          </div>

          {/* All volunteers list */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-3">All Volunteers</h3>
            <div className="space-y-2">
              {mockVolunteers.map((v) => (
                <button key={v.id} onClick={() => setSelected(v)} className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${v.id === selected.id ? 'bg-white/[0.06] border border-white/20' : 'bg-dark-800/30 border border-transparent hover:border-white/[0.06]'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${v.available ? 'bg-emerald-400' : 'bg-dark-400'}`} />
                    <span className="text-xs text-white">{v.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-dark-300">{v.distance}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
