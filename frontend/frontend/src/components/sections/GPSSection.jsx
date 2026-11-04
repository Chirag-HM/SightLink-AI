import { motion } from 'framer-motion';
import { MapPin, Satellite, Compass, Navigation } from 'lucide-react';
import { mockGPS } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';

export default function GPSSection() {
  return (
    <section className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-status-safe/[0.04] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block text-xs font-mono text-status-safe/70 tracking-widest uppercase mb-6">GPS + Live Location</span>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              Always know{' '}
              <span className="text-gradient-cyan">where you are.</span>
            </h2>
            <p className="text-dark-200 leading-relaxed mb-8 max-w-lg">
              The NEO-6M GPS module provides continuous satellite-based positioning with high accuracy, enabling real-time location sharing, navigation assistance, and emergency location services.
            </p>

            {/* GPS Stats */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Satellite, label: 'Satellites', value: `${mockGPS.satellites} locked` },
                { icon: Compass, label: 'Accuracy', value: `±${mockGPS.accuracy}m` },
                { icon: Navigation, label: 'Heading', value: `${mockGPS.heading}° NE` },
                { icon: MapPin, label: 'Altitude', value: `${mockGPS.altitude}m` },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="glass-card p-4"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <stat.icon className="w-4 h-4 text-status-safe/60 mb-2" />
                  <span className="text-[10px] text-dark-300 uppercase tracking-wider block">{stat.label}</span>
                  <span className="text-sm font-semibold text-white">{stat.value}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Map Visualization */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="relative aspect-square bg-dark-800 rounded-2xl overflow-hidden border border-white/[0.06] map-grid">
              {/* Roads */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400">
                <line x1="50" y1="200" x2="350" y2="200" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <line x1="200" y1="50" x2="200" y2="350" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <line x1="100" y1="100" x2="300" y2="300" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />

                {/* Route Path */}
                <motion.path
                  d="M 200 200 L 200 150 L 260 100 L 300 80"
                  fill="none"
                  stroke="#00d4ff"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, duration: 1.5 }}
                />
              </svg>

              {/* User Location Marker */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                {/* Accuracy Circle */}
                <motion.div
                  className="absolute -inset-8 rounded-full border border-accent-cyan/15 bg-accent-cyan/5"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                {/* Pulse Ring */}
                <motion.div
                  className="absolute -inset-4 rounded-full bg-accent-cyan/10 map-marker-pulse"
                />
                {/* Marker */}
                <div className="relative w-5 h-5 bg-accent-cyan rounded-full border-2 border-white shadow-glow-md">
                  <div className="absolute inset-0 rounded-full bg-accent-cyan animate-pulse" />
                </div>
                {/* Direction Arrow */}
                <motion.div
                  className="absolute -top-6 left-1/2 -translate-x-1/2"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Navigation className="w-4 h-4 text-accent-cyan rotate-[-45deg]" />
                </motion.div>
              </div>

              {/* GPS Data Overlay */}
              <div className="absolute top-4 left-4 glass-card px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-status-safe rounded-full animate-pulse" />
                  <span className="text-[10px] font-mono text-status-safe tracking-wider">GPS CONNECTED</span>
                </div>
                <div className="font-mono text-xs text-dark-200 space-y-0.5">
                  <div>{mockGPS.latitude.toFixed(4)}° N</div>
                  <div>{mockGPS.longitude.toFixed(4)}° E</div>
                </div>
              </div>

              {/* Speed */}
              <div className="absolute bottom-4 right-4 glass-card px-4 py-3">
                <span className="text-[10px] text-dark-300 block">Speed</span>
                <span className="text-lg font-display font-bold text-white">{mockGPS.speed}</span>
                <span className="text-xs text-dark-300 ml-1">m/s</span>
              </div>

              {/* Nearby markers */}
              {[
                { x: 70, y: 30, label: 'Bus Stop' },
                { x: 30, y: 75, label: 'Store' },
              ].map((marker) => (
                <div
                  key={marker.label}
                  className="absolute w-3 h-3 rounded-full bg-accent-violet/50 border border-accent-violet/30"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                >
                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[9px] text-dark-300 whitespace-nowrap">{marker.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
