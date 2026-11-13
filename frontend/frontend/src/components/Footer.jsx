import { Eye, ArrowUp, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const quickLinks = [
    { label: 'Get Help Now', to: '/assist' },
    { label: 'Volunteer Portal', to: '/volunteers' },
    { label: 'Family Sharing', to: '/contacts' },
    { label: 'Read-Only Family Tracker', to: '/family/track' },
    { label: 'Command Dashboard', to: '/dashboard' },
    { label: 'Accessibility Settings', to: '/accessibility' },
  ];

  return (
    <footer className="relative bg-[#EFE8DA]/90 backdrop-blur-xl border-t border-[#DCD2BF] pt-16 pb-10 section-padding overflow-hidden">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-[#DCD2BF]">
          <div className="md:col-span-6 space-y-4">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#065F46]/10 border border-[#065F46]/25 flex items-center justify-center">
                <Eye className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-[#12231B]">
                SIGHTLINK <span className="text-[#065F46]">AI</span>
              </span>
            </Link>

            <p className="text-[#354B40] text-sm max-w-md leading-relaxed">
              Calm, voice-first assistive mobility combining live smart-stick sensors, nearby verified volunteers, consent-controlled family tracking, and BMTC transit awareness.
            </p>

            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#065F46] bg-[#065F46]/10 border border-[#065F46]/20 px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              WCAG AA Accessible · Voice-First · Privacy Preserving
            </div>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-widest text-[#8C6A23] font-semibold">
              Care & Mobility
            </h4>
            <ul className="space-y-2.5 text-sm text-[#354B40]">
              {quickLinks.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="hover:text-[#065F46] transition-colors inline-block py-0.5 font-medium"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-widest text-[#8C6A23] font-semibold">
              Platform Modules
            </h4>
            <ul className="space-y-2 text-xs font-mono text-[#354B40]">
              <li>• Web Speech Voice Triggers</li>
              <li>• Haversine Progressive Radius</li>
              <li>• WebSocket + Web Push Actions</li>
              <li>• Geofenced Family Live Map</li>
              <li>• ESP8266 + ESP32-CAM Telemetry</li>
              <li>• BMTC Real-Time Transit</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#4F6358]">
          <div>
            SightLink AI Assistive Ecosystem · Accessible Voice-First Mobility
          </div>
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} SightLink AI</span>
            <button
              type="button"
              onClick={scrollToTop}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/85 border border-[#DCD2BF] hover:border-[#065F46]/35 hover:bg-white text-[#12231B] transition-colors"
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
