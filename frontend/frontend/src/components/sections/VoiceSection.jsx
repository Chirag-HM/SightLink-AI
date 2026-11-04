import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

const voiceCommands = [
  '"Which bus is nearby?"',
  '"Where am I?"',
  '"What is ahead?"',
  '"Call for help."',
];

export default function VoiceSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center section-padding overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-950 via-dark-900 to-dark-950" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-violet/[0.06] rounded-full blur-[200px] pointer-events-none" />

      <div className="relative z-10 text-center max-w-3xl mx-auto">
        {/* Label */}
        <motion.span
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportConfig}
          className="inline-block text-xs font-mono text-accent-violet/70 tracking-widest uppercase mb-8"
        >
          Voice AI Assistant
        </motion.span>

        {/* Mic Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="relative w-40 h-40 mx-auto mb-10"
        >
          {/* Pulse Rings */}
          {[1, 2, 3].map((ring) => (
            <motion.div
              key={ring}
              className="absolute inset-0 rounded-full border border-accent-violet/10"
              animate={{
                scale: [1, 1.3 + ring * 0.2, 1],
                opacity: [0.3, 0, 0.3],
              }}
              transition={{
                duration: 2.5,
                delay: ring * 0.4,
                repeat: Infinity,
              }}
            />
          ))}

          {/* Mic Button */}
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-accent-violet/20 to-accent-cyan/10 border border-accent-violet/30 flex items-center justify-center cursor-pointer shadow-glow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={{
              boxShadow: [
                '0 0 30px rgba(139,92,246,0.15)',
                '0 0 60px rgba(139,92,246,0.25)',
                '0 0 30px rgba(139,92,246,0.15)',
              ],
            }}
            transition={{ boxShadow: { duration: 3, repeat: Infinity } }}
          >
            <Mic className="w-12 h-12 text-accent-violet" />
          </motion.div>
        </motion.div>

        {/* Waveform */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportConfig}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-1 h-16 mb-10"
        >
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-gradient-to-t from-accent-violet to-accent-cyan"
              animate={{
                height: [8, 20 + Math.random() * 30, 8],
              }}
              transition={{
                duration: 1 + Math.random() * 0.5,
                delay: i * 0.05,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="font-display text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-12"
        >
          Just <span className="text-gradient">ask.</span>
        </motion.h2>

        {/* Voice Commands */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={viewportConfig}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap justify-center gap-3"
        >
          {voiceCommands.map((cmd, i) => (
            <motion.div
              key={cmd}
              className="px-5 py-3 glass-card text-sm text-dark-200 cursor-default hover:text-white hover:border-accent-violet/20 transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 + i * 0.1 }}
              whileHover={{ scale: 1.03 }}
            >
              {cmd}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
