import { motion } from 'framer-motion';
import { useRef } from 'react';
import { User, Car, Armchair, Table2, Wine, Laptop, DoorOpen, TrafficCone } from 'lucide-react';
import { objectCategories } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';

const iconMap = { User, Car, Armchair, Table2, Wine, Laptop, DoorOpen, TrafficCone };

export default function ObjectAwarenessSection() {
  const scrollRef = useRef(null);

  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.7 }}
          className="section-padding mb-12"
        >
          <span className="inline-block text-xs font-mono text-accent-violet/70 tracking-widest uppercase mb-4">Object Recognition</span>
          <h3 className="font-display text-3xl md:text-4xl font-bold text-white">
            80+ detectable objects.{' '}
            <span className="text-dark-300">Identified in real time.</span>
          </h3>
        </motion.div>

        {/* Horizontal Scroll Cards */}
        <div ref={scrollRef} className="horizontal-scroll gap-5 px-6 md:px-12 lg:px-20 xl:px-32 pb-4">
          {objectCategories.map((obj, i) => {
            const Icon = iconMap[obj.icon] || User;
            return (
              <motion.div
                key={obj.name}
                className="glass-card p-6 w-[200px] md:w-[220px] group hover:shadow-glow-sm transition-all duration-300 cursor-default"
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
              >
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${obj.color}10`, border: `1px solid ${obj.color}25` }}
                >
                  <Icon className="w-5 h-5" style={{ color: obj.color }} />
                </div>

                {/* Label */}
                <h4 className="font-display text-base font-semibold text-white mb-2">{obj.name}</h4>

                {/* Confidence Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-dark-300 uppercase tracking-wider">Confidence</span>
                    <span className="text-xs font-mono font-semibold" style={{ color: obj.color }}>
                      {obj.confidence}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-dark-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: obj.color }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${obj.confidence}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.08, duration: 0.8 }}
                    />
                  </div>
                </div>

                {/* Position */}
                <span className="text-xs text-dark-300 font-mono">{obj.position}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
