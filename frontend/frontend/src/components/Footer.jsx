import { Eye, ArrowUp, Github, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navLinks = [
    { label: 'Platform', href: '/#solution' },
    { label: 'Technology', href: '/#architecture' },
    { label: 'Accessibility', href: '/#accessibility' },
    { label: 'Safety Mesh', href: '/#sos' },
    { label: 'Transit Integration', href: '/#bmtc' },
    { label: 'Interactive Dashboard', href: '/dashboard' },
  ];

  return (
    <footer className="relative bg-dark-950/70 backdrop-blur-xl border-t border-white/[0.06] pt-20 pb-12 section-padding overflow-hidden">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-16 border-b border-white/[0.06]">
          {/* Brand info */}
          <div className="md:col-span-6 space-y-4">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent-cyan/20 border border-accent-cyan/30 flex items-center justify-center">
                <Eye className="w-4 h-4 text-accent-cyan" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-white">
                SIGHTLINK <span className="text-gradient">AI</span>
              </span>
            </Link>

            <p className="text-dark-300 text-sm max-w-sm leading-relaxed">
              AI-powered mobility for a more accessible world. Transforming independent navigation through edge neural networks and multi-sensor spatial awareness.
            </p>

            <div className="pt-2 text-xs font-mono text-dark-400">
              Bangalore Urban Mobility • Autonomous Assistive Systems
            </div>
          </div>

          {/* Quick links */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-widest text-white font-semibold">
              Ecosystem
            </h4>
            <ul className="space-y-2 text-sm text-dark-300">
              {navLinks.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    className="hover:text-white transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Technology highlights */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-widest text-white font-semibold">
              Hardware & AI Stack
            </h4>
            <ul className="space-y-1.5 text-xs font-mono text-dark-300">
              <li>• ESP32-CAM Dual-Core</li>
              <li>• ESP8266 Microcontroller</li>
              <li>• YOLOv8 Nano PyTorch</li>
              <li>• FastAPI WebSocket Bus</li>
              <li>• BMTC Real-Time GTFS</li>
              <li>• HC-SR04 + NEO-6M GPS</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-dark-400">
          <div>
            Built with{' '}
            <span className="text-white">ESP32 • ESP8266 • YOLOv8 • FastAPI • AI</span>
          </div>

          <div className="flex items-center gap-6">
            <span>© {new Date().getFullYear()} SIGHTLINK AI. All rights reserved.</span>
            <button
              onClick={scrollToTop}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-dark-200 hover:text-white transition-colors"
              aria-label="Back to top"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
