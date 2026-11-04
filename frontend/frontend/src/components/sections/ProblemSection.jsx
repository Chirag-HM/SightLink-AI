import { motion } from 'framer-motion';
import { AlertTriangle, Bus, ShieldAlert } from 'lucide-react';
import { fadeInUp, staggerContainer, viewportConfig } from '../../utils/animations';

const problems = [
  {
    icon: AlertTriangle,
    title: 'Unseen obstacles',
    description: 'Objects and obstacles can appear unexpectedly, creating dangerous situations for those who cannot see them.',
    color: '#f59e0b',
  },
  {
    icon: Bus,
    title: 'Uncertain mobility',
    description: 'Finding buses and navigating unfamiliar places can be difficult without real-time visual information.',
    color: '#3b82f6',
  },
  {
    icon: ShieldAlert,
    title: 'Emergency situations',
    description: 'Getting immediate assistance should be simple, not a complex process requiring multiple steps.',
    color: '#ef4444',
  },
];

export default function ProblemSection() {
  return (
    <section className="relative section-gap section-padding overflow-hidden">
      {/* Background Accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-violet/5 rounded-full blur-[200px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-xs font-mono text-accent-cyan/70 tracking-widest uppercase mb-6">The Challenge</span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl mx-auto">
            Moving through the world shouldn't require{' '}
            <span className="text-gradient">guessing.</span>
          </h2>
        </motion.div>

        {/* Problem Cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid md:grid-cols-3 gap-6 lg:gap-8"
        >
          {problems.map((problem, i) => (
            <motion.div
              key={problem.title}
              variants={fadeInUp}
              className="group relative glass-card p-8 md:p-10 hover:shadow-card-hover transition-all duration-500"
            >
              {/* Icon */}
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: `${problem.color}10`, border: `1px solid ${problem.color}20` }}
              >
                <problem.icon className="w-6 h-6" style={{ color: problem.color }} />
              </div>

              {/* Content */}
              <h3 className="font-display text-xl font-semibold text-white mb-3">
                {problem.title}
              </h3>
              <p className="text-dark-200 leading-relaxed text-sm">
                {problem.description}
              </p>

              {/* Number */}
              <span className="absolute top-8 right-8 text-6xl font-display font-bold text-white/[0.03]">
                {String(i + 1).padStart(2, '0')}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
