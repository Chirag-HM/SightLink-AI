import { motion } from 'framer-motion';
import { useState } from 'react';
import { Accessibility, Eye, Volume2, Type, Sliders, Contrast, Sparkles, Check } from 'lucide-react';
import { viewportConfig } from '../../utils/animations';

export default function AccessibilitySection() {
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [voiceFirst, setVoiceFirst] = useState(true);

  const features = [
    {
      icon: Type,
      title: 'Scalable Editorial Typography',
      desc: 'Tested dynamic text sizing exceeding WCAG 2.2 AAA legibility benchmarks.',
    },
    {
      icon: Contrast,
      title: 'High-Contrast Chromatics',
      desc: 'Optimized minimum 7:1 contrast ratio modes for users with low-vision or photophobia.',
    },
    {
      icon: Volume2,
      title: 'Voice-First Acoustic Interface',
      desc: 'Every UI action triggers spatial binaural voice announcements and haptic feedback.',
    },
    {
      icon: Sliders,
      title: 'Motion Sensitivity & ARIA',
      desc: 'Full system honors prefers-reduced-motion with exhaustive semantic screen reader trees.',
    },
  ];

  return (
    <section id="accessibility" className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-accent-cyan/05 rounded-full blur-[180px] pointer-events-none" />

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
            <Accessibility className="w-3.5 h-3.5" />
            Inclusive By Design
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Technology should{' '}
            <span className="text-gradient">adapt to people.</span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-2xl mx-auto">
            Engineered from ground zero alongside visually impaired users, orientation and mobility specialists, and assistive tech researchers.
          </p>
        </motion.div>

        {/* Interactive Accessibility Playground */}
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Left: 4 Pillars */}
          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
            {features.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewportConfig}
                  transition={{ delay: i * 0.1, duration: 0.6 }}
                  className="glass-card p-6 border-white/[0.06] hover:border-accent-cyan/30 transition-all duration-300"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-accent-cyan" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-white mb-2">{feat.title}</h3>
                  <p className="text-xs text-dark-200 leading-relaxed">{feat.desc}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Right: Interactive Switcher Sandbox */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.8 }}
            className="lg:col-span-5"
          >
            <div className={`p-6 md:p-8 rounded-3xl border transition-all duration-500 shadow-2xl ${
              highContrast
                ? 'bg-black border-yellow-400 text-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.2)]'
                : 'glass-card border-white/10'
            }`}>
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/[0.08]">
                <h4 className="font-display font-bold text-lg text-white">Live Assistive Toggles</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-800 text-accent-cyan">
                  PREVIEW
                </span>
              </div>

              {/* Toggles */}
              <div className="space-y-4 mb-6">
                <button
                  onClick={() => setHighContrast(!highContrast)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    highContrast
                      ? 'bg-yellow-400/10 border-yellow-400 text-yellow-300'
                      : 'bg-dark-900 border-white/[0.06] text-white hover:border-white/20'
                  }`}
                >
                  <span className="text-sm font-medium">Ultra High Contrast Mode</span>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    highContrast ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-dark-400'
                  }`}>
                    {highContrast && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>

                <button
                  onClick={() => setLargeText(!largeText)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    largeText
                      ? 'bg-accent-cyan/15 border-accent-cyan text-accent-cyan'
                      : 'bg-dark-900 border-white/[0.06] text-white hover:border-white/20'
                  }`}
                >
                  <span className="text-sm font-medium">Super-Sized Editorial Typography</span>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    largeText ? 'bg-accent-cyan border-accent-cyan text-black' : 'border-dark-400'
                  }`}>
                    {largeText && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>

                <button
                  onClick={() => setVoiceFirst(!voiceFirst)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    voiceFirst
                      ? 'bg-accent-purple/15 border-accent-purple text-accent-purple'
                      : 'bg-dark-900 border-white/[0.06] text-white hover:border-white/20'
                  }`}
                >
                  <span className="text-sm font-medium">Auto-Acoustic Screen Prompts</span>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    voiceFirst ? 'bg-accent-purple border-accent-purple text-black' : 'border-dark-400'
                  }`}>
                    {voiceFirst && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              </div>

              {/* Live Render Output preview */}
              <div className="p-4 rounded-2xl bg-dark-950 border border-white/[0.04]">
                <span className="text-[10px] font-mono text-dark-300 block mb-1">SAMPLE UI CARD</span>
                <p className={`${largeText ? 'text-lg font-bold' : 'text-sm font-medium'} ${highContrast ? 'text-yellow-300' : 'text-white'}`}>
                  "Bus 507 approaching in 31 seconds at Platform 3."
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
