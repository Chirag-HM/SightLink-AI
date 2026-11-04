import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Navigation as NavIcon, MapPin, CheckCircle, ArrowDown, Volume2 } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';

export default function NavigationPage() {
  const [step, setStep] = useState(0);
  const route = [
    { label: 'Current Location', sub: 'Majestic Bus Stand', active: true },
    { label: 'Head North 200m', sub: 'Seshadri Road', active: false },
    { label: 'Turn Right', sub: 'MG Road · 450m', active: false },
    { label: 'Continue Straight', sub: 'Trinity Circle · 300m', active: false },
    { label: 'Destination', sub: 'MG Road Metro Station', active: false, isDest: true },
  ];

  useEffect(() => {
    const timer = setInterval(() => setStep(prev => (prev + 1) % route.length), 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <DashboardShell title="Navigation" subtitle="Voice-guided turn-by-turn directions" icon={NavIcon}>
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Route Steps */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display font-bold text-white text-lg">Active Route</h3>
            <span className="text-xs font-mono text-accent-cyan">Majestic → MG Road Metro</span>
          </div>

          <div className="space-y-0">
            {route.map((r, i) => (
              <div key={r.label} className="relative">
                <motion.div
                  className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-500 ${
                    i <= step ? 'bg-white/[0.03] border border-white/[0.08]' : 'opacity-35'
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: i <= step ? 1 : 0.35, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    r.isDest && i <= step ? 'bg-emerald-500/15 border-2 border-emerald-500/40' :
                    i <= step ? 'bg-accent-cyan/10 border-2 border-accent-cyan/30' : 'bg-dark-700 border border-white/[0.06]'
                  }`}>
                    {r.isDest && i <= step ? <CheckCircle className="w-5 h-5 text-emerald-400" /> :
                     i === 0 ? <div className="w-3 h-3 bg-accent-cyan rounded-full" /> :
                     <MapPin className="w-4 h-4 text-dark-300" />}
                  </div>
                  <div>
                    <span className={`text-sm font-semibold ${i <= step ? 'text-white' : 'text-dark-400'}`}>{r.label}</span>
                    <span className={`block text-xs ${i <= step ? 'text-dark-300' : 'text-dark-500'}`}>{r.sub}</span>
                  </div>
                  {i === step && <span className="ml-auto text-[10px] font-mono text-accent-cyan animate-pulse">NOW</span>}
                </motion.div>
                {i < route.length - 1 && <div className="ml-9 h-4"><div className={`w-px h-full mx-auto ${i < step ? 'bg-accent-cyan/30' : 'bg-white/[0.06]'}`} /></div>}
              </div>
            ))}
          </div>

          {step === route.length - 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-6 glass-card p-4 border-emerald-500/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-sm text-emerald-400 font-medium">"You have arrived at your destination."</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Map View */}
        <div className="aspect-square lg:aspect-auto bg-dark-800 rounded-2xl border border-white/[0.06] relative overflow-hidden map-grid">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 500">
            <motion.path d="M 200 400 L 200 300 L 200 200 L 300 150 L 300 80" fill="none" stroke="#00d4ff" strokeWidth="3" strokeDasharray="6 4" initial={{ pathLength: 0 }} animate={{ pathLength: (step + 1) / route.length }} transition={{ duration: 1 }} />
            {/* Waypoints */}
            {[{ x: 200, y: 400 }, { x: 200, y: 300 }, { x: 200, y: 200 }, { x: 300, y: 150 }, { x: 300, y: 80 }].map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i <= step ? 6 : 4} fill={i <= step ? '#00d4ff' : '#383858'} stroke={i <= step ? '#fff' : 'none'} strokeWidth="2" />
            ))}
          </svg>
          <div className="absolute top-4 left-4 glass-card px-3 py-2 backdrop-blur-md">
            <span className="text-[10px] font-mono text-accent-cyan">STEP {step + 1} / {route.length}</span>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
