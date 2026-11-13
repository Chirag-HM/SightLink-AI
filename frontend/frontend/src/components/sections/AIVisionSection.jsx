import { motion, useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { Camera, Volume2, Cpu, Zap } from 'lucide-react';
import { mockDetections } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';

export default function AIVisionSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [activeDetections, setActiveDetections] = useState([]);
  const [showVoice, setShowVoice] = useState(false);

  useEffect(() => {
    if (!isInView) return;
    const timers = mockDetections.map((det, i) =>
      setTimeout(() => {
        setActiveDetections(prev => [...prev, det]);
        if (i === mockDetections.length - 1) {
          setTimeout(() => setShowVoice(true), 500);
        }
      }, 600 + i * 400)
    );
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  return (
    <section id="ai-vision" ref={ref} className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-cyan/[0.04] rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-xs font-mono text-accent-cyan/70 tracking-widest uppercase mb-6">AI Vision System</span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Your surroundings,{' '}
            <span className="text-gradient">understood by AI.</span>
          </h2>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          {/* Camera Feed Simulation */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-3 relative"
          >
            <div className="relative aspect-[4/3] bg-dark-800 rounded-2xl overflow-hidden border border-white/[0.06]">
              {/* Simulated Camera View */}
              <div className="absolute inset-0 bg-gradient-to-br from-dark-700 via-dark-800 to-dark-900">
                {/* Scan Line */}
                <motion.div
                  className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent-cyan/30 to-transparent"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                />

                {/* Simulated Scene Elements */}
                <div className="absolute inset-0 flex items-end justify-center pb-8">
                  {/* Person silhouette */}
                  <div className="relative w-20 h-40 opacity-20">
                    <div className="w-10 h-10 bg-dark-400 rounded-full mx-auto" />
                    <div className="w-16 h-24 bg-dark-400 rounded-lg mx-auto mt-1" />
                    <div className="w-6 h-12 bg-dark-400 rounded mx-auto mt-0.5" />
                  </div>
                  {/* Chair silhouette */}
                  <div className="absolute right-[20%] bottom-[25%] w-14 h-14 opacity-15">
                    <div className="w-14 h-8 bg-dark-400 rounded" />
                    <div className="w-14 h-10 bg-dark-400 rounded mt-0.5" />
                  </div>
                </div>

                {/* Detection Bounding Boxes */}
                {activeDetections.map((det) => (
                  <motion.div
                    key={det.id}
                    className="detection-box absolute"
                    style={{
                      borderColor: det.color,
                      left: `${det.x}%`,
                      top: `${det.y}%`,
                      width: `${det.w}%`,
                      height: `${det.h}%`,
                    }}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <div
                      className="label"
                      style={{ backgroundColor: det.color, color: '#0b1233' }}
                    >
                      {det.label} {det.confidence}%
                    </div>
                    {/* Corner markers */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: det.color }} />
                    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: det.color }} />
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: det.color }} />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: det.color }} />
                  </motion.div>
                ))}
              </div>

              {/* Camera Overlay */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono text-white/60">ESP32-CAM LIVE</span>
              </div>
              <div className="absolute top-4 right-4 text-[10px] font-mono text-white/40">
                30 FPS · 640×480
              </div>
              <div className="absolute bottom-4 left-4 text-[10px] font-mono text-white/40">
                YOLOv8n · {activeDetections.length} detections
              </div>

              {/* Voice Notification */}
              {showVoice && (
                <motion.div
                  initial={{ opacity: 0, y: 20, x: 20 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  className="absolute bottom-4 right-4 glass-card px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
                    <Volume2 className="w-4 h-4 text-accent-cyan" />
                  </div>
                  <div>
                    <span className="text-[10px] text-dark-300 block">Voice Output</span>
                    <span className="text-xs text-white font-medium">"Person detected ahead."</span>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Tech Specs */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="lg:col-span-2 flex flex-col gap-4"
          >
            {[
              { icon: Camera, label: 'ESP32-CAM', desc: 'OV2640 camera module with Wi-Fi streaming and real-time video capture', stat: '30 FPS' },
              { icon: Cpu, label: 'YOLOv8', desc: 'State-of-the-art object detection model with nano variant for edge inference', stat: '80+ objects' },
              { icon: Zap, label: 'Real-time Inference', desc: 'Sub-100ms detection latency with GPU-accelerated Python backend', stat: '<100ms' },
              { icon: Volume2, label: 'Voice Feedback', desc: 'Text-to-speech announces detected objects with position and distance', stat: 'Instant' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                className="glass-card p-5 group hover:shadow-glow-sm transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center shrink-0 group-hover:bg-accent-cyan/15 transition-colors">
                    <item.icon className="w-4 h-4 text-accent-cyan" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-semibold text-white">{item.label}</h4>
                      <span className="text-xs font-mono text-accent-cyan/70">{item.stat}</span>
                    </div>
                    <p className="text-xs text-dark-300 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
