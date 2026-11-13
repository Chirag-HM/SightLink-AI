import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, MapPin, ShieldCheck, Navigation, ArrowRight, Volume2, Video } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useVoiceAssistant, { speakText } from '../../hooks/useVoiceAssistant';
import StaticHeroOrbFallback from '../three/StaticHeroOrbFallback';

const HeroOrbScene = lazy(() => import('../three/HeroOrbScene'));

const floatingRouteNodes = [
  {
    id: 'node-voice',
    badge: 'VOICE TRIGGER',
    title: '“I need assistance”',
    sub: 'Hands-free Web Speech activation',
    icon: Volume2,
    tone: 'teal',
    positionClass: 'top-[2%] right-[0%]',
  },
  {
    id: 'node-radius',
    badge: '500 M SCAN',
    title: '3 Verified Volunteers',
    sub: 'Auto-widens 500 m → 1 km → 3 km',
    icon: MapPin,
    tone: 'amber',
    positionClass: 'bottom-[4%] right-[0%]',
  },
  {
    id: 'node-family',
    badge: 'LIVE GUARDIAN',
    title: 'Safe Zone + Battery',
    sub: 'Consent-first family tracking',
    icon: ShieldCheck,
    tone: 'teal',
    positionClass: 'top-[2%] left-[0%]',
  },
  {
    id: 'node-eta',
    badge: 'ROUTE GUIDANCE',
    title: '“Rahul is coming, 3 min”',
    sub: 'Real-time audio + live dual map',
    icon: Navigation,
    tone: 'amber',
    positionClass: 'bottom-[4%] left-[0%]',
  },
];

export default function HeroSection() {
  const navigate = useNavigate();
  const { reducedMotion } = useAuth();
  const [pulseTimestamp, setPulseTimestamp] = useState(0);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [voiceFeedback, setVoiceFeedback] = useState('');

  const handleVoiceTrigger = useCallback(
    (trigger) => {
      setPulseTimestamp(Date.now());
      setVoiceFeedback(`Heard "${trigger.transcript}". Looking for a volunteer nearby.`);
      speakText('Looking for a volunteer nearby.');
      setTimeout(() => {
        navigate(`/assist?autostart=1&type=${encodeURIComponent(trigger.type)}`);
      }, 950);
    },
    [navigate]
  );

  const handleLiveAssistVoiceTrigger = useCallback(
    (trigger) => {
      setPulseTimestamp(Date.now());
      setVoiceFeedback(`Heard "${trigger.transcript}". Connecting you to a volunteer.`);
      speakText('Connecting you to a volunteer.');
      setTimeout(() => {
        navigate('/live-assist?autostart=1');
      }, 950);
    },
    [navigate]
  );

  const { supported, listening, transcript, micLevel, startListening, stopListening } =
    useVoiceAssistant({
      continuous: false,
      onHelpTrigger: handleVoiceTrigger,
      onLiveAssistTrigger: handleLiveAssistVoiceTrigger,
    });

  useEffect(() => {
    if (reducedMotion) return undefined;
    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 18;
      const ny = (e.clientY / window.innerHeight - 0.5) * 14;
      setParallax({ x: nx, y: ny });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reducedMotion]);

  const simulateSoundWavePulse = () => {
    setPulseTimestamp(Date.now());
    if (listening) {
      stopListening();
      return;
    }
    if (supported) {
      startListening();
    } else {
      navigate('/assist');
    }
  };

  return (
    <section
      id="home"
      aria-label="SightLink Hero"
      className="relative min-h-screen w-full flex items-center overflow-hidden hero-bg pt-20 pb-16"
    >
      {/* Interactive 3D Sound-Wave Orb & Route Mesh Scene (lazy-loaded with static fallback) */}
      <Suspense fallback={<StaticHeroOrbFallback isPulsing={pulseTimestamp > 0} />}>
        <HeroOrbScene
          micLevel={micLevel}
          pulseTimestamp={pulseTimestamp}
          reducedMotion={reducedMotion}
        />
      </Suspense>

      {/* Gentle ivory scrim: calm contrast over orb on mobile/tablet, soft left-column mist on desktop */}
      <div
        className="absolute inset-0 pointer-events-none z-[2] lg:hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(250, 247, 240, 0.84) 0%, rgba(250, 247, 240, 0.68) 54%, rgba(243, 237, 224, 0.82) 100%)',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none z-[2] hidden lg:block"
        style={{
          background:
            'linear-gradient(90deg, rgba(250, 247, 240, 0.90) 0%, rgba(250, 247, 240, 0.56) 44%, rgba(250, 247, 240, 0.0) 76%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-5 md:px-10 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center min-h-[78vh]">
          {/* Left Column: Calm Editorial Copy + Single Clear CTA */}
          <div className="lg:col-span-6 min-w-0 space-y-6 sm:space-y-7">
            <div className="inline-flex items-center gap-2.5 max-w-full px-3.5 sm:px-4 py-2 rounded-full bg-[#FBF3DF]/90 border border-[#C59B42]/30 text-[11px] sm:text-xs font-mono uppercase tracking-wider text-[#7D5B1C] shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#065F46] animate-pulse shrink-0" aria-hidden="true" />
              <span className="leading-snug">Voice-First Community & Family Safety Mesh</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.03] text-[#12231B]">
              Move calmly.{' '}
              <span className="text-gradient block mt-1">Trusted help is one breath away.</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-[#354B40] max-w-xl leading-relaxed">
              Say{' '}
              <strong className="text-[#065F46] font-semibold">“I need assistance”</strong> or tap once to summon verified volunteers within 500 meters, hear turn-by-turn guidance, and keep loved ones informed in real time.
            </p>

            {/* Interactive Mic Orb Listener Status Pill (subtle voice companion trigger) */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => navigate('/assist?autostart=1')}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 min-h-[56px] rounded-full bg-[#065F46] text-white font-bold text-base md:text-lg shadow-glow-md hover:bg-[#054D39] transition-all magnetic-btn focus-visible-ring"
              >
                <span>Get help now</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/live-assist?autostart=1')}
                className="inline-flex items-center gap-2 px-5 py-3.5 min-h-[56px] rounded-full bg-[#FBF3DF] border border-[#C59B42]/50 text-[#7D5B1C] font-semibold text-sm hover:bg-[#F5E7C3] transition-all focus-visible-ring shadow-sm"
              >
                <Video className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                <span>Eyes on Demand</span>
              </button>

              <button
                type="button"
                onClick={simulateSoundWavePulse}
                aria-pressed={listening}
                aria-label={listening ? 'Stop listening for assistance phrase' : 'Activate microphone to say I need assistance or I need eyes'}
                className={`inline-flex items-center gap-2.5 px-5 py-3.5 min-h-[56px] rounded-full border text-sm font-semibold transition-all focus-visible-ring ${
                  listening
                    ? 'border-[#C59B42]/50 text-[#7D5B1C] bg-[#FBF3DF] shadow-sm'
                    : 'bg-white/90 border-[#D7CEBC] text-[#12231B] hover:border-[#065F46]/40 hover:text-[#065F46] shadow-sm'
                }`}
              >
                {listening ? <Mic className="w-4 h-4 animate-pulse text-[#8C6A23]" /> : <MicOff className="w-4 h-4 text-[#065F46]" />}
                <span>{listening ? 'Listening… say “I need assistance”' : 'Voice trigger mic'}</span>
              </button>
            </div>

            {/* Live Accessible Voice Transcript / Status Region */}
            <div
              role="status"
              aria-live="polite"
              className="min-h-[28px] text-sm font-mono font-medium text-[#065F46]"
            >
              {voiceFeedback
                ? voiceFeedback
                : listening && transcript
                ? `Heard: "${transcript}"`
                : listening
                ? 'Listening for “I need assistance”, “help me cross the road”, or “need help”…'
                : ''}
            </div>

            {/* Calm Reassurance Indicators */}
            <div className="grid grid-cols-3 gap-4 max-w-lg pt-3 border-t border-[#DCD2BF] text-xs">
              <div>
                <span className="font-mono text-[#8C6A23] block font-semibold">500 m → 3 km</span>
                <span className="text-[#4F6358]">Auto-widening radius</span>
              </div>
              <div>
                <span className="font-mono text-[#065F46] block font-semibold">ID / Phone</span>
                <span className="text-[#4F6358]">Verified helpers</span>
              </div>
              <div>
                <span className="font-mono text-[#12231B] block font-semibold">Consent-First</span>
                <span className="text-[#4F6358]">Family live trail</span>
              </div>
            </div>
          </div>

          {/* Right Column: Floating Glass Route / Map Nodes over Interactive 3D Orb */}
          <div className="lg:col-span-6 relative min-h-[340px] lg:min-h-[540px] hidden sm:block">
            {floatingRouteNodes.map((node, idx) => {
              const Icon = node.icon;
              const depth = idx % 2 === 0 ? 1 : -0.8;
              return (
                <div
                  key={node.id}
                  style={{
                    transform: reducedMotion
                      ? 'none'
                      : `translate3d(${(parallax.x * depth).toFixed(1)}px, ${(parallax.y * depth).toFixed(1)}px, 0)`,
                  }}
                  className={`absolute ${node.positionClass} glass-card px-4 py-3.5 max-w-[235px] transition-transform duration-200 ease-out`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        node.tone === 'amber' ? 'bg-[#C59B42]' : 'bg-[#065F46]'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-[10px] font-mono font-semibold tracking-wider ${
                        node.tone === 'amber' ? 'text-[#8C6A23]' : 'text-[#065F46]'
                      }`}
                    >
                      {node.badge}
                    </span>
                    <Icon
                      className={`w-3.5 h-3.5 ml-auto ${
                        node.tone === 'amber' ? 'text-[#8C6A23]' : 'text-[#065F46]'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-sm font-semibold text-[#12231B]">{node.title}</p>
                  <p className="text-xs text-[#4F6358] mt-0.5">{node.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
