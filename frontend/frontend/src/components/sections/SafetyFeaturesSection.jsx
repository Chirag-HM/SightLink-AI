import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Radar,
  Ban,
  Eye,
  Bus,
  Siren,
  ArrowUpRight,
} from 'lucide-react';

const safetyPillars = [
  {
    icon: ShieldCheck,
    title: 'Verified Volunteers Only',
    desc: 'Volunteer onboarding enforces Government/Community ID or phone OTP checks and displays clear verified badges before any handoff.',
    link: '/signup?role=volunteer',
    cta: 'Verification Flow',
    tone: 'teal',
  },
  {
    icon: Radar,
    title: '60s Progressive Escalation',
    desc: 'Starts tightly at 500 m for rapid foot arrival. Automatically expands at 60 s intervals to 1 km, then 3 km, then alerts family & SOS.',
    link: '/assist',
    cta: 'Open Request Hub',
    tone: 'amber',
  },
  {
    icon: Ban,
    title: 'Anti-Abuse & Instant Blocking',
    desc: 'Sliding-window rate limits prevent request flooding, while both parties can report and block abusive accounts permanently.',
    link: '/safety',
    cta: 'Safety Controls',
    tone: 'teal',
  },
  {
    icon: Siren,
    title: 'Audible SOS & Siren Mesh',
    desc: 'Integrates directly with the existing hardware/web SOS siren and emergency phone directory when immediate danger arises.',
    link: '/safety',
    cta: 'Open SOS Center',
    tone: 'amber',
  },
  {
    icon: Eye,
    title: 'ESP32-CAM & Ultrasonic Sense',
    desc: 'Connects seamlessly with the YOLOv8 hazard detector and ESP8266 smart stick ultrasonic & NEO-6M GPS telemetry.',
    link: '/vision',
    cta: 'Live AI Vision',
    tone: 'teal',
  },
  {
    icon: Bus,
    title: 'Live BMTC Bus Radar',
    desc: 'Real-time bus arrival distance, approach heading, and spoken audio readouts for daily independent transit.',
    link: '/bmtc',
    cta: 'Track BMTC Buses',
    tone: 'amber',
  },
];

export default function SafetyFeaturesSection() {
  return (
    <section
      id="safety-features"
      aria-labelledby="safety-features-heading"
      className="relative section-gap section-padding"
    >
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 gsap-reveal">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-[#C59B42]/30 bg-[#FBF3DF] text-[#7D5B1C] mb-4">
            Safety Architecture
          </span>
          <h2
            id="safety-features-heading"
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-[#12231B]"
          >
            Built for trust at every intersection.
          </h2>
          <p className="text-[#354B40] text-base md:text-lg mt-4">
            Combining human community safeguards with our existing smart-stick hardware and BMTC transit intelligence.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {safetyPillars.map((item) => {
            const Icon = item.icon;
            const isAmber = item.tone === 'amber';
            return (
              <div
                key={item.title}
                className="gsap-stagger-card glass-card p-6 md:p-7 flex flex-col justify-between transition-all duration-300"
              >
                <div>
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border ${
                      isAmber
                        ? 'bg-[#FBF3DF] border-[#C59B42]/25 text-[#8C6A23]'
                        : 'bg-[#065F46]/10 border-[#065F46]/20 text-[#065F46]'
                    }`}
                  >
                    <Icon className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#12231B] mb-2.5">{item.title}</h3>
                  <p className="text-sm text-[#354B40] leading-relaxed mb-5">{item.desc}</p>
                </div>

                <Link
                  to={item.link}
                  className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold py-2 min-h-[40px] ${
                    isAmber ? 'text-[#8C6A23] hover:text-[#6B4E15]' : 'text-[#065F46] hover:text-[#044432]'
                  }`}
                >
                  <span>{item.cta}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

