import { Mic, BellRing, UserCheck } from 'lucide-react';

const steps = [
  {
    step: '01',
    title: 'Speak',
    icon: Mic,
    tone: 'teal',
    summary:
      'Say “I need assistance”, “help me cross the road”, or “need help” — or press the oversized high-contrast button.',
    detail:
      'SightLink replies immediately by voice: “Looking for a volunteer nearby.” while reading live GPS from your smart stick or browser.',
  },
  {
    step: '02',
    title: 'Volunteer notified',
    icon: BellRing,
    tone: 'amber',
    summary:
      'Verified helpers within 500 meters receive instant WebSocket and Web Push notifications with Accept or Decline.',
    detail:
      'Every 60 seconds without acceptance, the search calmly widens from 500 m to 1 km, then 3 km, before alerting family and surfacing SOS.',
  },
  {
    step: '03',
    title: 'Help arrives',
    icon: UserCheck,
    tone: 'teal',
    summary:
      'Hear clear spoken updates such as “Rahul is coming, 3 minutes away” as live markers guide both people together.',
    detail:
      'Follow every milestone on a status timeline, cancel at any time, and rate your experience once assistance is complete.',
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="relative section-gap section-padding"
    >
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 gsap-reveal">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-[#065F46]/20 bg-[#065F46]/10 text-[#065F46] mb-4">
            How It Works
          </span>
          <h2
            id="how-it-works-heading"
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-[#12231B] leading-tight"
          >
            Three calm steps from voice to <span className="text-gradient">safe arrival.</span>
          </h2>
          <p className="text-[#354B40] text-base md:text-lg mt-4">
            Engineered for screen readers, zero-sight operation, and rapid neighborhood response.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((item) => {
            const Icon = item.icon;
            const isAmber = item.tone === 'amber';
            return (
              <article
                key={item.step}
                className="gsap-stagger-card glass-card p-7 md:p-8 flex flex-col justify-between transition-all duration-300"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
                        isAmber
                          ? 'bg-[#FBF3DF] border-[#C59B42]/25 text-[#8C6A23]'
                          : 'bg-[#065F46]/10 border-[#065F46]/20 text-[#065F46]'
                      }`}
                    >
                      <Icon className="w-7 h-7" aria-hidden="true" />
                    </div>
                    <span
                      className={`font-mono text-2xl font-bold ${
                        isAmber ? 'text-[#8C6A23]/75' : 'text-[#065F46]/75'
                      }`}
                    >
                      {item.step}
                    </span>
                  </div>

                  <h3 className="font-display text-2xl font-bold text-[#12231B] mb-3">{item.title}</h3>
                  <p className="text-sm md:text-base text-[#354B40] leading-relaxed mb-4">
                    {item.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E3DCCB]">
                  <p className="text-xs md:text-sm text-[#4F6358] leading-relaxed">{item.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

