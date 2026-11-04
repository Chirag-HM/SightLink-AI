import Navbar from '../components/Navbar';
import HeroSection from '../components/sections/HeroSection';
import ProblemSection from '../components/sections/ProblemSection';
import SolutionSection from '../components/sections/SolutionSection';
import AIVisionSection from '../components/sections/AIVisionSection';
import ObjectAwarenessSection from '../components/sections/ObjectAwarenessSection';
import UltrasonicSection from '../components/sections/UltrasonicSection';
import GPSSection from '../components/sections/GPSSection';
import BMTCSection from '../components/sections/BMTCSection';
import VoiceSection from '../components/sections/VoiceSection';
import NavigationSection from '../components/sections/NavigationSection';
import TrafficSignalSection from '../components/sections/TrafficSignalSection';
import SOSSection from '../components/sections/SOSSection';
import VolunteerSection from '../components/sections/VolunteerSection';
import TrustedContactsSection from '../components/sections/TrustedContactsSection';
import ArchitectureSection from '../components/sections/ArchitectureSection';
import DashboardPreviewSection from '../components/sections/DashboardPreviewSection';
import AccessibilitySection from '../components/sections/AccessibilitySection';
import HistorySection from '../components/sections/HistorySection';
import FinalCTASection from '../components/sections/FinalCTASection';
import Footer from '../components/Footer';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-transparent text-white">
      {/* Floating Global Navbar */}
      <Navbar />

      <main>
        {/* 1. Cinematic Hero */}
        <HeroSection />

        {/* 2. Problem Statement */}
        <ProblemSection />

        {/* 3. Integrated Solution Ecosystem */}
        <SolutionSection />

        {/* 4. AI Computer Vision Feed */}
        <AIVisionSection />

        {/* 5. Horizontal Object Recognition Awareness */}
        <ObjectAwarenessSection />

        {/* 6. Ultrasonic Distance & Hazard Warning */}
        <UltrasonicSection />

        {/* 7. GPS & Live Positioning */}
        <GPSSection />

        {/* 8. BMTC Transit Integration */}
        <BMTCSection />

        {/* 9. Voice AI Assistant */}
        <VoiceSection />

        {/* 10. Navigation & Wayfinding */}
        <NavigationSection />

        {/* 11. Traffic Signal Optical Recognition */}
        <TrafficSignalSection />

        {/* 12. SOS & Emergency Mesh */}
        <SOSSection />

        {/* 13. Verified Volunteer Proximity Network */}
        <VolunteerSection />

        {/* 14. Trusted Family Contacts */}
        <TrustedContactsSection />

        {/* 15. Technical System Architecture */}
        <ArchitectureSection />

        {/* 16. Live Dashboard Preview */}
        <DashboardPreviewSection />

        {/* 17. Inclusive Accessibility Architecture */}
        <AccessibilitySection />

        {/* 18. Activity & Telemetry History Timeline */}
        <HistorySection />

        {/* 19. Final Cinematic CTA */}
        <FinalCTASection />
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
}
