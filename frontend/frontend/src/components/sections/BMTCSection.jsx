import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Bus, MapPin, Clock, ArrowRight, Mic, Volume2 } from 'lucide-react';
import { mockBuses } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';
import { useInView } from '../../hooks/useAnimations';

const voiceConversation = [
  { type: 'system', text: 'Which bus route do you want?' },
  { type: 'user', text: '507' },
  { type: 'ai', text: 'Bus 507 is 357 meters away and approaching. Estimated arrival: 31 seconds.' },
];

export default function BMTCSection() {
  const [ref, isInView] = useInView({ once: true, threshold: 0.3 });
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [activeBus, setActiveBus] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    voiceConversation.forEach((msg, i) => {
      setTimeout(() => {
        setVisibleMessages(prev => [...prev, msg]);
      }, 1000 + i * 1200);
    });
  }, [isInView]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBus(prev => (prev + 1) % mockBuses.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="bmtc" ref={ref} className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-accent-blue/[0.04] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-mono text-accent-blue/70 tracking-widest uppercase mb-6">BMTC Live Tracking</span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Your bus shouldn't be a{' '}
            <span className="text-gradient">mystery.</span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-xl mx-auto">
            Ask for a route. The system finds the nearest live bus and speaks the result.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Bus Tracker */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {/* Live Badge */}
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-red-400 tracking-wider">LIVE BMTC</span>
            </div>

            {/* Bus Cards */}
            <div className="flex flex-col gap-3">
              {mockBuses.map((bus, i) => (
                <motion.div
                  key={bus.route}
                  className={`glass-card p-5 cursor-pointer transition-all duration-300 ${
                    i === activeBus ? 'border-accent-blue/30 shadow-glow-sm' : ''
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  onClick={() => setActiveBus(i)}
                  whileHover={{ x: 4 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        i === activeBus ? 'bg-accent-blue/15 border border-accent-blue/30' : 'bg-dark-700 border border-white/[0.06]'
                      }`}>
                        <Bus className={`w-5 h-5 ${i === activeBus ? 'text-accent-blue' : 'text-dark-300'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-lg font-bold text-white">BUS {bus.route}</span>
                          {bus.direction === 'Approaching' && (
                            <span className="px-2 py-0.5 rounded-full bg-status-safe/10 text-status-safe text-[10px] font-semibold">
                              {bus.direction}
                            </span>
                          )}
                          {bus.direction === 'Moving away' && (
                            <span className="px-2 py-0.5 rounded-full bg-status-warning/10 text-status-warning text-[10px] font-semibold">
                              {bus.direction}
                            </span>
                          )}
                          {bus.direction === 'Stationary' && (
                            <span className="px-2 py-0.5 rounded-full bg-dark-400/30 text-dark-200 text-[10px] font-semibold">
                              {bus.direction}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-dark-300 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {bus.distance} away
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-dark-300 uppercase tracking-wider">ETA</span>
                      <span className="block text-sm font-mono font-semibold text-accent-cyan">{bus.eta}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Route visualization */}
            <motion.div
              className="mt-6 relative h-2 bg-dark-700 rounded-full overflow-hidden"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.8 }}
            >
              <motion.div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-accent-cyan to-accent-blue rounded-full"
                animate={{ width: ['20%', '80%', '20%'] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent-cyan rounded-full shadow-glow-sm"
                animate={{ left: ['18%', '78%', '18%'] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </motion.div>

          {/* Voice Interaction */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="glass-card p-6 md:p-8 h-full">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
                <div className="w-10 h-10 rounded-xl bg-accent-violet/10 border border-accent-violet/20 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-accent-violet" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Voice Interaction</h4>
                  <span className="text-xs text-dark-300">Ask for bus routes naturally</span>
                </div>
              </div>

              {/* Chat Bubbles */}
              <div className="flex flex-col gap-4 min-h-[200px]">
                {visibleMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                      msg.type === 'user'
                        ? 'bg-accent-blue/15 border border-accent-blue/20 text-white rounded-br-md'
                        : msg.type === 'ai'
                          ? 'bg-accent-cyan/10 border border-accent-cyan/20 text-white rounded-bl-md'
                          : 'bg-dark-700/50 border border-white/[0.06] text-dark-200 rounded-bl-md'
                    }`}>
                      {msg.type === 'ai' && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Volume2 className="w-3 h-3 text-accent-cyan" />
                          <span className="text-[10px] text-accent-cyan/70">AI Response</span>
                        </div>
                      )}
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Voice Wave */}
              <div className="flex items-center justify-center gap-1 h-12 mt-4">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="voice-wave-bar" />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
