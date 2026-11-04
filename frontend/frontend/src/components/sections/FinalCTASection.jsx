import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Zap } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

export default function FinalCTASection() {
  return (
    <section className="relative min-h-[75vh] flex items-center justify-center section-padding py-32 overflow-hidden bg-gradient-to-b from-transparent via-dark-900/30 to-transparent">
      {/* Subtle Animated Light Waves Background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1100px] h-[550px] rounded-full blur-[160px] opacity-25"
          style={{
            background: 'radial-gradient(ellipse at center, #00d4ff 0%, #8b5cf6 40%, transparent 70%)',
          }}
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.2, 0.35, 0.2],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Ambient Grid Accent */}
        <div className="absolute inset-0 map-grid opacity-20" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Glow badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono uppercase tracking-widest text-accent-cyan mb-8"
        >
          <Sparkles className="w-3.5 h-3.5" />
          The Next Generation of Independence
        </motion.div>

        {/* Big Editorial Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tight leading-[0.95] mb-8"
        >
          Move with <br />
          <span className="text-gradient">confidence.</span>
        </motion.h2>

        {/* Supporting Poetry */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg md:text-2xl text-dark-200 font-normal leading-relaxed max-w-2xl mx-auto mb-12 space-y-1"
        >
          <p className="text-white font-medium">AI that sees. Technology that listens.</p>
          <p className="text-dark-300">A system designed to help you navigate freely and independently.</p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            to="/dashboard"
            className="px-8 py-4 rounded-full bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet text-dark-950 font-bold text-sm hover:shadow-glow-lg transition-all transform hover:scale-105 flex items-center gap-2 magnetic-btn"
          >
            <Zap className="w-4 h-4 fill-current" />
            Launch Dashboard
          </Link>

          <a
            href="#architecture"
            className="px-8 py-4 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 font-medium text-sm transition-all flex items-center gap-2 hover:border-white/30"
          >
            Explore the Technology
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
