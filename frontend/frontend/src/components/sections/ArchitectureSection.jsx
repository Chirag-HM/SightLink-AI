import { motion } from 'framer-motion';
import { Cpu, Wifi, Radio, Server, Eye, Layers, Database, ArrowRight, Activity, Terminal } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

const visionPipeline = [
  { step: '01', title: 'ESP32-CAM', desc: 'OV2640 30FPS JPEG Capture', icon: Eye, color: '#00d4ff' },
  { step: '02', title: 'Wi-Fi Streaming', desc: 'RTSP / HTTP WebSocket stream', icon: Wifi, color: '#3b82f6' },
  { step: '03', title: 'Python AI Engine', desc: 'PyTorch / OpenCV pre-process', icon: Terminal, color: '#8b5cf6' },
  { step: '04', title: 'YOLOv8 Inference', desc: 'Real-time Object Tensor Weights', icon: Cpu, color: '#a855f7' },
  { step: '05', title: 'FastAPI Backend', desc: 'Async REST & Socket Pipelines', icon: Server, color: '#00d4ff' },
  { step: '06', title: 'BMTC / Chalo API', desc: 'Live Bengaluru Transit Feeds', icon: Database, color: '#3b82f6' },
  { step: '07', title: 'React Dashboard', desc: 'Framer Motion & WebSockets', icon: Activity, color: '#22c55e' },
];

const sensorPipeline = [
  { title: 'ESP8266 NodeMCU', desc: 'Low-latency Microcontroller Hub', tech: 'I2C / UART / GPIO' },
  { title: 'NEO-6M GPS Module', desc: 'NMEA String Parsing @ 1Hz', tech: 'UART Serial' },
  { title: 'HC-SR04 Ultrasonic', desc: '40kHz Ultrasound Echo Distance', tech: 'GPIO Trigger / Echo' },
  { title: 'Physical SOS Tactile', desc: 'Interrupt-driven Debounced Input', tech: 'Active-Low GPIO' },
  { title: 'Speech Synthesis / Mic', desc: 'I2S Audio DAC & Voice Recog', tech: 'PCM Voice Buffer' },
];

export default function ArchitectureSection() {
  return (
    <section id="architecture" className="relative section-gap section-padding overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-accent-blue/05 rounded-full blur-[220px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-accent-cyan/20 bg-accent-cyan/5 text-accent-cyan mb-4">
            <Layers className="w-3.5 h-3.5" />
            Engineering Specification
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Inside the{' '}
            <span className="text-gradient">intelligence.</span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-2xl mx-auto">
            A distributed dual-core edge architecture combining ESP32 high-bandwidth video inference with ESP8266 real-time deterministic sensor fusion.
          </p>
        </motion.div>

        {/* Primary Pipeline: Vision & AI Stream */}
        <div className="mb-14">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-cyan" />
              Primary AI Inference Pipeline
            </h3>
            <span className="text-xs font-mono text-accent-cyan">Sub-100ms End-to-End Latency</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {visionPipeline.map((node, i) => {
              const Icon = node.icon;
              return (
                <motion.div
                  key={node.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewportConfig}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  className="glass-card p-4 relative group hover:border-accent-cyan/40 transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono text-dark-400 font-bold">{node.step}</span>
                      <Icon className="w-4 h-4 text-accent-cyan group-hover:scale-110 transition-transform" />
                    </div>
                    <h4 className="font-semibold text-xs text-white mb-1">{node.title}</h4>
                    <p className="text-[10px] text-dark-300 leading-normal">{node.desc}</p>
                  </div>

                  {i < visionPipeline.length - 1 && (
                    <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-20">
                      <div className="w-4 h-4 rounded-full bg-dark-900 border border-white/10 flex items-center justify-center">
                        <ArrowRight className="w-2.5 h-2.5 text-accent-cyan" />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Secondary Pipeline: ESP8266 Sensor Subsystem */}
        <div className="p-8 rounded-3xl glass-card border-white/[0.08]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
            <div>
              <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-violet" />
                Deterministic Sensor & Telemetry Core (ESP8266)
              </h3>
              <p className="text-xs text-dark-300 mt-1">Autonomous hardware loop operating independently of server connectivity</p>
            </div>
            <span className="text-xs font-mono text-dark-300 px-3 py-1 rounded-full bg-dark-800 border border-white/10">
              FreeRTOS / Non-OS SDK
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {sensorPipeline.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportConfig}
                transition={{ delay: 0.2 + idx * 0.08, duration: 0.5 }}
                className="p-4 rounded-2xl bg-dark-900/80 border border-white/[0.04] flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-mono text-accent-violet font-semibold block mb-1">
                    {item.tech}
                  </span>
                  <h4 className="text-sm font-semibold text-white mb-1">{item.title}</h4>
                  <p className="text-xs text-dark-300">{item.desc}</p>
                </div>
                <div className="mt-4 pt-2 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="text-[9px] font-mono text-emerald-400">ACTIVE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
