import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { Eye, Radar, MapPin, Radio, Bus, AlertTriangle, Navigation, Mic } from 'lucide-react';
import { useMousePosition } from '../../hooks/useAnimations';

const floatingCards = [
  { label: 'PERSON', value: '98% confidence', x: 8, y: 15, color: '#00d4ff', delay: 0 },
  { label: 'BUS 500C', value: '412 m away', x: 72, y: 12, color: '#8b5cf6', delay: 0.2 },
  { label: 'OBSTACLE', value: '1.8 m ahead', x: 78, y: 55, color: '#f59e0b', delay: 0.4 },
  { label: 'GPS', value: 'Connected', x: 5, y: 60, color: '#22c55e', delay: 0.6 },
];

const trustBadges = [
  { icon: Eye, label: 'AI Vision' },
  { icon: MapPin, label: 'GPS Tracking' },
  { icon: Navigation, label: 'Voice Navigation' },
  { icon: Radio, label: 'Emergency SOS' },
];

export default function HeroSection() {
  const sectionRef = useRef(null);
  const mouse = useMousePosition();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <section
      ref={sectionRef}
      id="home"
      className="relative min-h-screen flex items-center justify-center overflow-hidden hero-bg"
    >
      {/* Ambient Glows */}
      <div className="hero-glow bg-accent-cyan/20" style={{ top: '10%', left: '20%' }} />
      <div className="hero-glow bg-accent-violet/15" style={{ top: '30%', right: '10%' }} />
      <div className="hero-glow bg-accent-blue/10" style={{ bottom: '10%', left: '50%', transform: 'translateX(-50%)' }} />

      {/* Noise Overlay */}
      <div className="noise absolute inset-0 pointer-events-none" />

      <motion.div style={{ y, opacity, scale }} className="relative z-10 w-full max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16 pt-24 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center min-h-[80vh]">
          {/* Left: Text Content */}
          <div className="flex flex-col gap-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent-cyan/20 bg-accent-cyan/5 w-fit"
            >
              <span className="w-2 h-2 bg-accent-cyan rounded-full animate-pulse-soft" />
              <span className="text-xs font-medium text-accent-cyan tracking-wider uppercase">AI-Powered Assistive Mobility</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold leading-[0.95] tracking-tight"
            >
              <span className="text-white">See the world.</span>
              <br />
              <span className="text-gradient">Hear the way.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
              className="text-lg md:text-xl text-dark-200 max-w-lg leading-relaxed"
            >
              An <span className="text-white font-medium">AI</span>-powered smart <span className="text-white font-medium">mobility</span> companion designed to help people move with confidence, awareness, and <span className="text-white font-medium">independence</span>.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="#solution"
                className="group relative px-8 py-4 bg-gradient-to-r from-accent-cyan to-accent-blue rounded-full font-semibold text-dark-900 text-sm overflow-hidden magnetic-btn focus-visible-ring"
              >
                <span className="relative z-10">Explore the System</span>
                <div className="absolute inset-0 bg-gradient-to-r from-accent-blue to-accent-violet opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </a>
              <a
                href="#dashboard-preview"
                className="px-8 py-4 border border-white/10 rounded-full font-semibold text-white text-sm hover:border-white/20 hover:bg-white/[0.03] transition-all duration-300 magnetic-btn focus-visible-ring"
              >
                Launch Live Demo
              </a>
            </motion.div>

            {/* Trust Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0, duration: 0.8 }}
              className="flex flex-wrap gap-6 mt-4"
            >
              {trustBadges.map((badge, i) => (
                <div key={badge.label} className="flex items-center gap-2 text-dark-300">
                  <badge.icon className="w-4 h-4 text-accent-cyan/60" />
                  <span className="text-xs font-medium tracking-wide">{badge.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Smart Stick Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative w-full aspect-square max-w-[600px] mx-auto lg:mx-0"
          >
            {/* Central Visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Radar Rings */}
              {[1, 2, 3].map((ring) => (
                <motion.div
                  key={ring}
                  className="absolute rounded-full border border-accent-cyan/10"
                  style={{
                    width: `${ring * 30 + 10}%`,
                    height: `${ring * 30 + 10}%`,
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 + ring * 0.2, duration: 0.8 }}
                />
              ))}

              {/* Radar Scan */}
              <motion.div
                className="absolute w-[70%] h-[70%] rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0, 212, 255, 0.08) 30deg, transparent 60deg)',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              />

              {/* Center Stick Icon */}
              <motion.div
                className="relative z-20 w-24 h-24 rounded-2xl bg-dark-700/80 border border-accent-cyan/20 flex items-center justify-center shadow-glow-md"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="text-center">
                  <Eye className="w-8 h-8 text-accent-cyan mx-auto mb-1" />
                  <span className="text-[10px] font-mono text-accent-cyan/70 tracking-wider">ACTIVE</span>
                </div>
              </motion.div>

              {/* Connection Lines */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400">
                {[
                  { x1: 200, y1: 200, x2: 80, y2: 80 },
                  { x1: 200, y1: 200, x2: 330, y2: 70 },
                  { x1: 200, y1: 200, x2: 340, y2: 250 },
                  { x1: 200, y1: 200, x2: 60, y2: 270 },
                ].map((line, i) => (
                  <motion.line
                    key={i}
                    x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                    stroke="url(#lineGrad)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.3 }}
                    transition={{ delay: 1.2 + i * 0.15, duration: 0.8 }}
                  />
                ))}
                <defs>
                  <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.2" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Floating Cards */}
            {floatingCards.map((card, i) => (
              <motion.div
                key={card.label}
                className="absolute glass-card px-4 py-3 z-30"
                style={{
                  left: `${card.x}%`,
                  top: `${card.y}%`,
                  transform: `translate(${(mouse.x - window.innerWidth / 2) * 0.01}px, ${(mouse.y - window.innerHeight / 2) * 0.01}px)`,
                }}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }}
                transition={{
                  opacity: { delay: 1.0 + card.delay, duration: 0.5 },
                  scale: { delay: 1.0 + card.delay, duration: 0.5 },
                  y: { delay: 1.5 + card.delay, duration: 3 + i * 0.5, repeat: Infinity, ease: 'easeInOut' },
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: card.color }} />
                  <span className="text-[11px] font-mono font-semibold tracking-wider" style={{ color: card.color }}>
                    {card.label}
                  </span>
                </div>
                <span className="text-xs text-dark-200">{card.value}</span>
              </motion.div>
            ))}

            {/* Animated Data Points */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-accent-cyan/40"
                style={{
                  left: `${20 + Math.random() * 60}%`,
                  top: `${20 + Math.random() * 60}%`,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-xs text-dark-300 tracking-widest uppercase">Scroll to explore</span>
        <motion.div
          className="w-5 h-8 border border-white/10 rounded-full flex justify-center pt-1.5"
          initial={{ opacity: 0.5 }}
        >
          <motion.div
            className="w-1 h-2 bg-accent-cyan/60 rounded-full"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
