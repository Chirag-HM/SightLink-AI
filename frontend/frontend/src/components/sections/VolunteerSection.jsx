import { motion } from 'framer-motion';
import { useState } from 'react';
import { Users, HeartHandshake, ShieldCheck, Clock, MapPin, Radio, CheckCircle } from 'lucide-react';
import { mockVolunteers } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';

export default function VolunteerSection() {
  const [selectedVolunteer, setSelectedVolunteer] = useState(mockVolunteers[0]);

  return (
    <section id="volunteers" className="relative section-gap section-padding overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 w-[600px] h-[600px] bg-accent-purple/10 rounded-full blur-[180px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-accent-purple/30 bg-accent-purple/5 text-accent-purple mb-4">
            <HeartHandshake className="w-3.5 h-3.5" />
            Decentralized Community Network
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Help can be{' '}
            <span className="text-gradient">closer than you think.</span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-2xl mx-auto">
            Verified local community volunteers receive proximity-based guidance alerts when requested, offering physical accompaniment for bus boarding, street crossings, or complex junctions.
          </p>
        </motion.div>

        {/* Map & Card Grid */}
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Futuristic Regional Map Canvas */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
            className="lg:col-span-7 relative"
          >
            <div className="aspect-[4/3] rounded-3xl bg-dark-800/80 border border-white/[0.08] relative overflow-hidden map-grid p-6 shadow-2xl">
              {/* Radar Sweep Effect */}
              <motion.div
                className="absolute inset-0 origin-center pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(168, 85, 247, 0.08) 35deg, transparent 70deg)',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              />

              {/* Central User Location */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-accent-cyan flex items-center justify-center shadow-[0_0_20px_#00d4ff]">
                    <div className="w-2.5 h-2.5 rounded-full bg-dark-900" />
                  </div>
                  <motion.div
                    className="absolute -inset-3 rounded-full border border-accent-cyan/40"
                    animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity }}
                  />
                </div>
                <div className="mt-2 px-2.5 py-1 rounded-md bg-dark-900/90 border border-accent-cyan/30 text-[10px] font-mono font-semibold text-accent-cyan whitespace-nowrap">
                  YOU · MG Road
                </div>
              </div>

              {/* Connecting SVG Lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {mockVolunteers.map((vol) => (
                  <motion.line
                    key={vol.id}
                    x1="50"
                    y1="50"
                    x2={vol.coords.x}
                    y2={vol.coords.y}
                    stroke={vol.id === selectedVolunteer.id ? '#a855f7' : 'rgba(255,255,255,0.1)'}
                    strokeWidth={vol.id === selectedVolunteer.id ? '0.6' : '0.3'}
                    strokeDasharray="2 2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5 }}
                  />
                ))}
              </svg>

              {/* Volunteer Nodes */}
              {mockVolunteers.map((vol) => {
                const isSelected = vol.id === selectedVolunteer.id;
                return (
                  <button
                    key={vol.id}
                    onClick={() => setSelectedVolunteer(vol)}
                    className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
                    style={{ left: `${vol.coords.x}%`, top: `${vol.coords.y}%` }}
                  >
                    <div className="relative">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                          isSelected
                            ? 'bg-accent-purple ring-4 ring-accent-purple/30 scale-125'
                            : vol.available
                              ? 'bg-emerald-400 group-hover:scale-110'
                              : 'bg-dark-400'
                        }`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-dark-900" />
                      </div>
                      {vol.available && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                    </div>
                    <div
                      className={`mt-1.5 px-2 py-0.5 rounded text-[9px] font-mono whitespace-nowrap transition-all ${
                        isSelected
                          ? 'bg-accent-purple text-dark-950 font-bold'
                          : 'bg-dark-900/80 text-dark-200 border border-white/10'
                      }`}
                    >
                      {vol.name} · {vol.distance}
                    </div>
                  </button>
                );
              })}

              {/* Status Header Overlay */}
              <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-dark-900/90 border border-white/10 backdrop-blur-md">
                <Radio className="w-3.5 h-3.5 text-accent-purple animate-pulse" />
                <span className="text-xs font-mono text-dark-200">
                  <strong className="text-white">3 Active</strong> Volunteers within 2km
                </span>
              </div>
            </div>
          </motion.div>

          {/* Volunteer Selected Info Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-5 flex flex-col gap-4"
          >
            <div className="glass-card p-6 md:p-8 border-accent-purple/20 relative overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent-purple/15 border border-accent-purple/30 flex items-center justify-center">
                    <Users className="w-6 h-6 text-accent-purple" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-bold text-white">{selectedVolunteer.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent-cyan" />
                      <span className="text-xs text-accent-cyan font-medium">Identity Verified Volunteer</span>
                    </div>
                  </div>
                </div>

                <span
                  className={`text-xs font-mono px-2.5 py-1 rounded-full ${
                    selectedVolunteer.available
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-dark-700 text-dark-300'
                  }`}
                >
                  {selectedVolunteer.available ? 'AVAILABLE' : 'BUSY'}
                </span>
              </div>

              {/* Highlight Metrics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-dark-900/80 border border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-dark-300 text-xs mb-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Distance</span>
                  </div>
                  <span className="font-display text-2xl font-bold text-white">{selectedVolunteer.distance}</span>
                </div>

                <div className="p-4 rounded-xl bg-dark-900/80 border border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-dark-300 text-xs mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Response Est.</span>
                  </div>
                  <span className="font-display text-2xl font-bold text-accent-purple">
                    {selectedVolunteer.responseTime}
                  </span>
                </div>
              </div>

              {/* Security & Action */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-xs text-dark-200">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Background screened & trained in mobility assistance</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-dark-200">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>One-time randomized pairing code for safe physical handoff</span>
                </div>
              </div>

              <button
                disabled={!selectedVolunteer.available}
                className="w-full py-3.5 rounded-full bg-gradient-to-r from-accent-purple to-accent-indigo text-white font-semibold text-sm hover:opacity-90 transition-all shadow-glow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Request Assistance from {selectedVolunteer.name}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
