import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import HeroSection from '../components/sections/HeroSection';
import HowItWorksSection from '../components/sections/HowItWorksSection';
import SafetyFeaturesSection from '../components/sections/SafetyFeaturesSection';
import FamilyTrackingSection from '../components/sections/FamilyTrackingSection';
import VolunteerCTASection from '../components/sections/VolunteerCTASection';
import TestimonialsSection from '../components/sections/TestimonialsSection';
import Footer from '../components/Footer';

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const containerRef = useRef(null);
  const { reducedMotion } = useAuth();

  useEffect(() => {
    if (reducedMotion || !containerRef.current) return undefined;

    const ctx = gsap.context(() => {
      gsap.utils.toArray('.gsap-reveal').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.75,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 86%',
              once: true,
            },
          }
        );
      });

      gsap.utils.toArray('.gsap-stagger-card').forEach((card, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 24 },
          {
            opacity: 1,
            y: 0,
            duration: 0.65,
            delay: (i % 3) * 0.08,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 88%',
              once: true,
            },
          }
        );
      });
    }, containerRef);

    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <div ref={containerRef} className="relative min-h-screen bg-transparent text-[#12231B] overflow-x-hidden">
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        <HeroSection />
        <HowItWorksSection />
        <SafetyFeaturesSection />
        <FamilyTrackingSection />
        <VolunteerCTASection />
        <TestimonialsSection />
      </main>

      <Footer />
    </div>
  );
}
