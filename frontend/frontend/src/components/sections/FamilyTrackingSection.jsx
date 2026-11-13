import { Link } from 'react-router-dom';
import { QrCode, MapPin, Battery, ShieldAlert, Lock, ArrowRight } from 'lucide-react';

export default function FamilyTrackingSection() {
  return (
    <section
      id="family-tracking"
      aria-labelledby="family-tracking-heading"
      className="relative section-gap section-padding"
    >
      <div className="max-w-[1200px] mx-auto">
        <div className="glass-card p-6 sm:p-8 md:p-12 border border-[#DCD2BF] grid lg:grid-cols-12 gap-8 lg:gap-10 items-center gsap-reveal">
          <div className="lg:col-span-7 min-w-0 space-y-6">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-[#065F46]/20 bg-[#065F46]/10 text-[#065F46]">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              Consent-First Family Tracking
            </span>

            <h2
              id="family-tracking-heading"
              className="font-display text-3xl sm:text-4xl font-bold text-[#12231B] leading-tight"
            >
              Peace of mind for family.{' '}
              <span className="text-gradient">Total privacy control for you.</span>
            </h2>

            <p className="text-[#354B40] text-base md:text-lg leading-relaxed">
              Generate an invite code, shareable link, or scannable QR code only after giving explicit consent. Pause or stop sharing anytime—while a clear persistent indicator reminds you whenever live tracking is active.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 text-sm text-[#354B40]">
              <div className="p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#065F46] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="text-[#12231B] block">Read-Only Live Trail</strong>
                  <span className="text-xs text-[#4F6358]">Movement path, last seen timestamp & geofence status.</span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-start gap-3">
                <Battery className="w-5 h-5 text-[#8C6A23] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="text-[#12231B] block">Battery & Safe Zone Alerts</strong>
                  <span className="text-xs text-[#4F6358]">Push notifications when help begins, finishes, or user exits safe zone.</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                to="/contacts"
                className="inline-flex items-center gap-2 px-6 py-3.5 min-h-[48px] rounded-full bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39] shadow-glow-sm transition-colors focus-visible-ring"
              >
                <span>Manage Family Sharing & QR</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/family/track"
                className="inline-flex items-center gap-2 px-6 py-3.5 min-h-[48px] rounded-full border border-[#D7CEBC] bg-white/85 text-[#12231B] font-semibold text-sm hover:border-[#065F46]/45 hover:text-[#065F46] transition-colors focus-visible-ring"
              >
                <span>Open Family Live Map</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 min-w-0">
            <div className="rounded-2xl bg-[#EFE8DA]/90 border border-[#DCD2BF] p-6 space-y-5 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#065F46] animate-pulse" aria-hidden="true" />
                  <span className="text-xs font-mono font-semibold text-[#065F46]">
                    SHARING LOCATION · READ-ONLY VIEW
                  </span>
                </div>
                <QrCode className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
              </div>

              <div className="p-4 rounded-xl bg-white/90 border border-[#E2D9C8] space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#4F6358]">Last Seen</span>
                  <span className="text-[#12231B] font-semibold">Just now · Safe Zone Inside</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#4F6358]">Battery</span>
                  <span className="text-[#065F46] font-semibold">86%</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#4F6358]">Active Help Status</span>
                  <span className="text-[#8C6A23] font-semibold">Rahul accepted · 3 min away</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
                <p className="text-xs text-red-800">
                  Instant SOS banner & push notification synced to linked family members whenever triggered.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

