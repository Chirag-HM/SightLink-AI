import { Link } from 'react-router-dom';
import { HeartHandshake, ShieldCheck, ToggleRight, ArrowRight } from 'lucide-react';

export default function VolunteerCTASection() {
  return (
    <section
      id="volunteer-cta"
      aria-labelledby="volunteer-cta-heading"
      className="relative section-gap section-padding"
    >
      <div className="max-w-[1100px] mx-auto">
        <div
          className="glass-card p-8 md:p-14 border border-[#DCD2BF] text-center space-y-6 gsap-reveal"
          style={{
            background:
              'linear-gradient(145deg, rgba(255, 253, 248, 0.96) 0%, rgba(239, 232, 218, 0.92) 100%)',
          }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FBF3DF] border border-[#C59B42]/30 text-[#7D5B1C] text-xs font-mono uppercase tracking-wider mx-auto">
            <HeartHandshake className="w-4 h-4" aria-hidden="true" />
            Become a Verified Neighborhood Volunteer
          </div>

          <h2
            id="volunteer-cta-heading"
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-[#12231B] max-w-3xl mx-auto leading-tight"
          >
            Lend two minutes when you are nearby.
          </h2>

          <p className="text-[#354B40] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Your location is <strong className="text-[#12231B]">strictly private</strong> unless you switch to{' '}
            <strong className="text-[#065F46]">On duty</strong>. Verify once via ID or phone OTP to earn your verified badge and help neighbors cross busy junctions safely.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-[#4F6358] pt-1">
            <span className="inline-flex items-center gap-2">
              <ToggleRight className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
              Location shared only while On duty
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#8C6A23]" aria-hidden="true" />
              Verified Badge + Push Accept/Decline
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-4 pt-3">
            <Link
              to="/signup?role=volunteer"
              className="inline-flex items-center gap-2 px-8 py-4 min-h-[52px] rounded-full bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39] shadow-glow-sm transition-colors focus-visible-ring"
            >
              <span>Join as Verified Volunteer</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              to="/volunteers"
              className="inline-flex items-center gap-2 px-7 py-4 min-h-[52px] rounded-full border border-[#D7CEBC] bg-white/85 text-[#12231B] font-semibold text-sm hover:border-[#065F46]/45 hover:text-[#065F46] transition-colors focus-visible-ring"
            >
              <span>Open Volunteer Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

