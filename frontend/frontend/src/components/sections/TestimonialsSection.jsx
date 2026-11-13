import { Quote, ShieldCheck } from 'lucide-react';

const testimonials = [
  {
    quote:
      'Saying “help me cross the road” at Silk Board without pulling out a tiny keyboard gave me real independence. Hearing “Rahul is coming, 3 minutes away” kept me calm.',
    author: 'Karthik N.',
    role: 'Daily Commuter · Low Vision',
    badge: 'Voice Assistance User',
    tone: 'teal',
  },
  {
    quote:
      'I switch On duty only during my morning walk. Receiving a push notification with Accept and seeing our live route map makes helping a neighbor natural and safe.',
    author: 'Rahul V.',
    role: 'Verified Volunteer · Indiranagar',
    badge: 'ID & Phone Verified',
    tone: 'amber',
  },
  {
    quote:
      'Having explicit consent controls plus knowing immediately when my mother leaves our Home safe zone or triggers an assistance request means zero constant phone calls.',
    author: 'Lakshmi S.',
    role: 'Family Guardian · Bengaluru',
    badge: 'Family Tracking View',
    tone: 'teal',
  },
];

export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="relative section-gap section-padding"
    >
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 gsap-reveal">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-[#065F46]/20 bg-[#065F46]/10 text-[#065F46] mb-4">
            Community Voices
          </span>
          <h2
            id="testimonials-heading"
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-[#12231B]"
          >
            Designed with the people who rely on it daily.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((t) => (
            <figure
              key={t.author}
              className="gsap-stagger-card glass-card p-7 flex flex-col justify-between"
            >
              <div>
                <Quote
                  className={`w-7 h-7 mb-4 ${
                    t.tone === 'amber' ? 'text-[#8C6A23]/80' : 'text-[#065F46]/80'
                  }`}
                  aria-hidden="true"
                />
                <blockquote className="text-sm md:text-base text-[#354B40] leading-relaxed mb-6">
                  “{t.quote}”
                </blockquote>
              </div>

              <figcaption className="pt-4 border-t border-[#E3DCCB]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-display font-bold text-[#12231B] text-base">{t.author}</div>
                    <div className="text-xs text-[#4F6358]">{t.role}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono border ${
                      t.tone === 'amber'
                        ? 'border-[#C59B42]/30 bg-[#FBF3DF] text-[#7D5B1C]'
                        : 'border-[#065F46]/20 bg-[#065F46]/10 text-[#065F46]'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                    {t.badge}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

