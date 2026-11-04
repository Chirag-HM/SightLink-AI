import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye, Radio, MapPin, Bus, Mic, ShieldCheck, Navigation, Clock,
  Activity, Battery, Wifi, ChevronRight, AlertTriangle, Volume2,
  Users, History, Settings, Bell, Search, BarChart3, Zap, ArrowUpRight
} from 'lucide-react';
import Navbar from '../components/Navbar';
import useStickGps from '../hooks/useStickGps';
import { mockDashboard, mockDetections, mockBuses, mockHistory } from '../utils/mockData';

const sidebarItems = [
  { icon: Activity, label: 'Overview', active: true },
  { icon: Eye, label: 'AI Vision', href: '/vision' },
  { icon: MapPin, label: 'Live Location', href: '/location' },
  { icon: Bus, label: 'BMTC Live', href: '/bmtc' },
  { icon: Navigation, label: 'Navigation', href: '/navigation' },
  { icon: Mic, label: 'Voice Assistant', href: '/voice' },
  { icon: ShieldCheck, label: 'SOS & Safety', href: '/safety' },
  { icon: Users, label: 'Volunteers', href: '/volunteers' },
  { icon: History, label: 'Activity Log', href: '/history' },
  { icon: Settings, label: 'Accessibility', href: '/accessibility' },
];

function StatusBadge({ status, children }) {
  const colors = {
    safe: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    danger: 'bg-red-500/15 text-red-400 border-red-500/30',
    active: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
    online: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${colors[status] || colors.active}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {children}
    </span>
  );
}

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { location: stickLocation, connection: gpsConnection } = useStickGps();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const quickStats = [
    {
      title: 'AI Vision',
      value: 'Person',
      subtext: '98% confidence',
      status: 'Active · 30 FPS',
      icon: Eye,
      color: '#00d4ff',
      bg: 'from-cyan-500/10 to-blue-500/5',
    },
    {
      title: 'Distance',
      value: '1.8m',
      subtext: 'Path clear',
      status: 'Safe Zone',
      icon: Radio,
      color: '#22c55e',
      bg: 'from-emerald-500/10 to-green-500/5',
    },
    {
      title: 'GPS Lock',
      value: stickLocation?.fix ? `${stickLocation.satellites} Sat` : '--',
      subtext: stickLocation?.fix && Number.isFinite(stickLocation.latitude)
        ? `${Math.abs(stickLocation.latitude).toFixed(6)}°${stickLocation.latitude >= 0 ? 'N' : 'S'}`
        : gpsConnection === 'connected' ? 'Waiting for GPS fix' : 'Smart stick offline',
      status: stickLocation?.fix ? 'Live from NEO-6M' : 'No GPS fix',
      icon: MapPin,
      color: '#3b82f6',
      bg: 'from-blue-500/10 to-indigo-500/5',
    },
    {
      title: 'BMTC Live',
      value: '507',
      subtext: '357m · Approaching',
      status: 'ETA 31s',
      icon: Bus,
      color: '#8b5cf6',
      bg: 'from-violet-500/10 to-purple-500/5',
    },
  ];

  return (
    <div className="min-h-screen bg-transparent text-white">
      <Navbar />

      <div className="flex pt-20">
        {/* Sidebar */}
        <aside className={`hidden lg:flex flex-col w-64 min-h-[calc(100vh-5rem)] bg-dark-900/60 backdrop-blur-xl border-r border-white/[0.06] p-4 sticky top-20 transition-all`}>
          <div className="flex items-center gap-2 px-3 py-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400">DEVICE ONLINE</span>
          </div>

          <nav className="flex flex-col gap-1 flex-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.href || '/dashboard'}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    item.active
                      ? 'bg-white/[0.06] text-white font-medium border border-white/[0.08]'
                      : 'text-dark-300 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Battery & Connection */}
          <div className="mt-auto p-3 rounded-xl bg-dark-800/50 border border-white/[0.04] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-dark-300">
                <Battery className="w-3.5 h-3.5" /> Battery
              </span>
              <span className="text-emerald-400 font-mono font-semibold">94%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-dark-300">
                <Wifi className="w-3.5 h-3.5" /> Signal
              </span>
              <span className="text-accent-cyan font-mono font-semibold">Strong</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-dark-300">
                <Clock className="w-3.5 h-3.5" /> Ping
              </span>
              <span className="text-white font-mono font-semibold">24ms</span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8 max-w-[1400px]">
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-white">
                Command Center
              </h1>
              <p className="text-sm text-dark-300 mt-1 font-mono">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Bengaluru, KA
              </p>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status="online">ALL SYSTEMS NORMAL</StatusBadge>
              <button className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-dark-200 hover:text-white transition-colors" aria-label="Notifications">
                <Bell className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {quickStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card p-5 group hover:border-white/20 transition-all duration-300 cursor-default"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: `${stat.color}12`, border: `1px solid ${stat.color}25` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: stat.color }} />
                    </div>
                    <span className="text-[10px] font-mono text-dark-400">{stat.title}</span>
                  </div>
                  <h3 className="font-display text-2xl font-bold text-white mb-0.5">{stat.value}</h3>
                  <p className="text-xs text-dark-300 mb-2">{stat.subtext}</p>
                  <div className="pt-2 border-t border-white/[0.04] text-[11px] font-mono" style={{ color: stat.color }}>
                    {stat.status}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* AI Vision Feed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="lg:col-span-2 glass-card p-6 border-white/[0.06]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-accent-cyan" />
                  <h3 className="font-display font-bold text-white">Live AI Vision</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-red-400">REC</span>
                </div>
              </div>

              {/* Camera Feed Area */}
              <div className="aspect-video bg-dark-800 rounded-xl border border-white/[0.04] relative overflow-hidden mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-dark-700 via-dark-800 to-dark-900">
                  {/* Scan Line */}
                  <motion.div
                    className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-cyan/30 to-transparent"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  />

                  {/* Detection boxes */}
                  {mockDetections.slice(0, 3).map((det) => (
                    <div
                      key={det.id}
                      className="absolute border-2 rounded"
                      style={{
                        borderColor: det.color,
                        left: `${det.x}%`,
                        top: `${det.y}%`,
                        width: `${det.w}%`,
                        height: `${det.h}%`,
                      }}
                    >
                      <span
                        className="absolute -top-5 left-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm"
                        style={{ backgroundColor: det.color, color: '#060612' }}
                      >
                        {det.label} {det.confidence}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Overlay Info */}
                <div className="absolute top-3 left-3 text-[10px] font-mono text-white/50">ESP32-CAM · 640×480 · YOLOv8n</div>
                <div className="absolute bottom-3 left-3 text-[10px] font-mono text-white/50">{mockDetections.length} objects · 30 FPS</div>
              </div>

              {/* Detection List */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {mockDetections.map((det) => (
                  <div key={det.id} className="p-2.5 rounded-lg bg-dark-800/50 border border-white/[0.04]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: det.color }} />
                      <span className="text-[10px] font-mono font-semibold" style={{ color: det.color }}>{det.label}</span>
                    </div>
                    <span className="text-xs text-dark-200">{det.confidence}% · {det.distance}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Voice Assistant */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-card p-5 border-white/[0.06]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Mic className="w-5 h-5 text-accent-violet" />
                  <h3 className="font-display font-bold text-white text-sm">Voice Assistant</h3>
                  <StatusBadge status="active">LISTENING</StatusBadge>
                </div>

                {/* Waveform */}
                <div className="flex items-center justify-center gap-0.5 h-10 mb-4">
                  {[...Array(16)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-1 rounded-full bg-gradient-to-t from-accent-violet to-accent-cyan"
                      animate={{ height: [4, 10 + Math.random() * 20, 4] }}
                      transition={{ duration: 0.8 + Math.random() * 0.4, delay: i * 0.03, repeat: Infinity }}
                    />
                  ))}
                </div>

                <div className="p-3 rounded-lg bg-dark-800/50 border border-white/[0.04]">
                  <span className="text-[10px] text-dark-400 block mb-1">Last Command</span>
                  <span className="text-xs text-white font-medium italic">"Which bus is nearby?"</span>
                </div>
              </motion.div>

              {/* BMTC Quick */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="glass-card p-5 border-white/[0.06]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Bus className="w-5 h-5 text-accent-blue" />
                    <h3 className="font-display font-bold text-white text-sm">Nearby Buses</h3>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                </div>

                <div className="space-y-2">
                  {mockBuses.slice(0, 3).map((bus) => (
                    <div key={bus.route} className="flex items-center justify-between p-2.5 rounded-lg bg-dark-800/50 border border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-display font-bold text-white">{bus.route}</span>
                        <span className={`text-[10px] font-mono ${bus.direction === 'Approaching' ? 'text-emerald-400' : 'text-dark-300'}`}>
                          {bus.direction}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-accent-cyan">{bus.distance}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Safety Status */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="glass-card p-5 border-white/[0.06]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-display font-bold text-white text-sm">Safety Mesh</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-dark-800/50 border border-white/[0.04] text-center">
                    <span className="text-lg font-display font-bold text-white">3</span>
                    <span className="block text-[10px] text-dark-300">Contacts</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-dark-800/50 border border-white/[0.04] text-center">
                    <span className="text-lg font-display font-bold text-white">4</span>
                    <span className="block text-[10px] text-dark-300">Volunteers</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Activity Log */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-6 glass-card p-6 border-white/[0.06]"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-accent-blue" />
                <h3 className="font-display font-bold text-white">Recent Activity</h3>
              </div>
              <Link to="/history" className="text-xs text-accent-cyan hover:text-white transition-colors flex items-center gap-1">
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {mockHistory.slice(0, 4).map((item) => (
                <div key={item.time + item.event} className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/30 border border-white/[0.03]">
                  <span className="text-xs font-mono font-bold text-accent-cyan bg-accent-cyan/10 px-2 py-1 rounded">{item.time}</span>
                  <span className="text-xs text-dark-200 truncate">{item.event}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
