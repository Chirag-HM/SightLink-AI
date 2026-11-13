import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Navigation as NavIcon,
  MapPin,
  CheckCircle,
  Volume2,
  Search,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Square,
  RefreshCw,
  ShieldCheck,
  HandHelping,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import LiveAssistanceMap from '../components/LiveAssistanceMap';
import useStickGps from '../hooks/useStickGps';
import useVoiceAssistant, { speakText } from '../hooks/useVoiceAssistant';
import { useAssistant } from '../assistant/AssistantContext';
import {
  geocodeDestination,
  fetchWalkingRoute,
  formatDistanceMeters,
  formatDistanceSpoken,
} from '../assistant/navEngine';
import { assistantMsg } from '../assistant/i18n';
import { triggerHaptic } from '../utils/haptics';
import { assistantService } from '../services/api';

const DEFAULT_ORIGIN = {
  latitude: 12.9778,
  longitude: 77.5713,
  source: 'Majestic Reference',
};

const QUICK_DESTINATIONS = [
  { name: 'MG Road Metro Station', lat: 12.9756, lng: 77.6066 },
  { name: 'Majestic Bus Stand', lat: 12.9778, lng: 77.5713 },
  { name: 'Lalbagh Botanical Garden', lat: 12.9507, lng: 77.5848 },
  { name: 'Victoria Hospital Bengaluru', lat: 12.9634, lng: 77.5736 },
];

export default function NavigationPage() {
  const { location: stickGps } = useStickGps();
  const assistant = useAssistant();
  const nav = assistant.navigation;

  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [destInput, setDestInput] = useState('MG Road Metro Station');
  const [autoPlay, setAutoPlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const initLoadedRef = useRef(false);

  useEffect(() => {
    if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
      setOrigin({
        latitude: Number(stickGps.latitude),
        longitude: Number(stickGps.longitude),
        source: 'Smart Stick GPS',
      });
    }
  }, [stickGps]);

  const detectGpsOrigin = useCallback(() => {
    if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
      const next = {
        latitude: Number(stickGps.latitude),
        longitude: Number(stickGps.longitude),
        source: 'Smart Stick GPS',
      };
      setOrigin(next);
      return Promise.resolve(next);
    }
    return new Promise((resolve) => {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              source: 'Browser GPS',
            };
            setOrigin(next);
            resolve(next);
          },
          (err) => {
            setNotice(`GPS unavailable (${err.message}); using Majestic Bengaluru start reference.`);
            resolve(DEFAULT_ORIGIN);
          },
          { enableHighAccuracy: true, timeout: 4500 }
        );
      } else {
        setNotice('Geolocation unavailable; using Majestic Bengaluru start reference.');
        resolve(DEFAULT_ORIGIN);
      }
    });
  }, [stickGps]);

  const planRoute = useCallback(
    async (targetNameOrPreset, currentOriginOverride = null, { silent = false } = {}) => {
      const query = (typeof targetNameOrPreset === 'string' ? targetNameOrPreset : destInput).trim();
      if (!query) return;

      setLoading(true);
      setNotice('');
      const orig = currentOriginOverride || origin;

      try {
        // Check local Bengaluru quick presets first for zero-latency planning
        const preset = QUICK_DESTINATIONS.find(
          (p) => p.name.toLowerCase() === query.toLowerCase()
        );

        let chosen = preset
          ? {
              short_name: preset.name,
              display_name: preset.name,
              latitude: preset.lat,
              longitude: preset.lng,
            }
          : null;

        if (!chosen) {
          const geo = await geocodeDestination(query, {
            lat: orig.latitude,
            lng: orig.longitude,
            assistantApi: assistantService,
          });
          if (!geo.candidates || geo.candidates.length === 0) {
            setNotice(
              `Could not locate "${query}" via OpenStreetMap geocoding. Select a preset or verify network.`
            );
            if (!silent) speakText(`Could not locate ${query}. Please try a nearby landmark.`);
            setLoading(false);
            return;
          }
          if (geo.needsDisambiguation && geo.candidates.length > 1) {
            assistant.setPendingConfirmation({
              kind: 'nav_disambiguation',
              query,
              candidates: geo.candidates,
              candidateIndex: 0,
              origin: orig,
            });
            const prompt = `Did you mean ${geo.candidates[0].promptLabel}? Choose an option below or say yes or option 2.`;
            setNotice(prompt);
            if (!silent) assistant.speak(prompt);
            setLoading(false);
            return;
          }
          chosen = geo.candidates[0];
        }

        const route = await fetchWalkingRoute(
          { latitude: orig.latitude, longitude: orig.longitude },
          { latitude: chosen.latitude, longitude: chosen.longitude },
          {
            destName: chosen.short_name,
            lang: assistant.language,
            assistantApi: assistantService,
          }
        );

        await assistant.startNavigationSession({
          origin: orig,
          destination: {
            name: chosen.short_name,
            short_name: chosen.short_name,
            display_name: chosen.display_name,
            latitude: chosen.latitude,
            longitude: chosen.longitude,
            lat: chosen.latitude,
            lng: chosen.longitude,
          },
          steps: route.steps,
          polyline: route.polyline,
          distanceMeters: route.distanceMeters,
          durationSec: route.durationSec,
          provider: route.provider,
          fallback: route.fallback,
        });

        setAutoPlay(false);
        if (!silent) {
          triggerHaptic('confirm');
          const etaMin = Math.max(1, Math.round((route.durationSec || 60) / 60));
          const spoken = assistantMsg(assistant.language, route.fallback ? 'nav_started_offline' : 'nav_started', {
            place: chosen.short_name,
            dist: formatDistanceSpoken(route.distanceMeters, assistant.language),
            minutes: etaMin,
            firstStep: route.steps?.[0]?.spoken || '',
          });
          assistant.speak(spoken);
        }
      } finally {
        setLoading(false);
      }
    },
    [destInput, origin, assistant]
  );

  // Initialize default preview ONLY if no voice navigation session is already active
  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;
    if (nav?.steps?.length > 0 && (nav.active || nav.destination)) {
      setDestInput(nav.destination?.short_name || nav.destination?.name || 'Destination');
      return;
    }
    planRoute('MG Road Metro Station', DEFAULT_ORIGIN, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional user-controlled step-through playback (stops at arrival)
  const steps = nav.steps || [];
  const step = nav.currentStepIndex || 0;
  const destination = nav.destination || {
    name: 'MG Road Metro Station',
    short_name: 'MG Road Metro Station',
    latitude: 12.9756,
    longitude: 77.6066,
    lat: 12.9756,
    lng: 77.6066,
  };
  const trail = nav.polyline || [];
  const activeOrigin = nav.origin || origin;

  useEffect(() => {
    if (!autoPlay || steps.length === 0) return undefined;
    if (step >= steps.length - 1) {
      setAutoPlay(false);
      return undefined;
    }
    const timer = setInterval(() => {
      const next = Math.min(steps.length - 1, step + 1);
      assistant.selectNavStep(next);
      if (next >= steps.length - 1) setAutoPlay(false);
    }, 3500);
    return () => clearInterval(timer);
  }, [autoPlay, steps.length, step, assistant]);

  const { supported: voiceSupported, listening, startListening, stopListening } = useVoiceAssistant({
    continuous: false,
    onTranscript: (text, { isFinal }) => {
      if (isFinal && text) {
        setDestInput(text);
        planRoute(text);
      }
    },
  });

  const activeStepObj = steps[step] || null;
  const activeMapUserLoc = useMemo(() => {
    if (nav.active && nav.userPosition?.latitude && nav.userPosition?.longitude) {
      return {
        latitude: nav.userPosition.latitude,
        longitude: nav.userPosition.longitude,
        popupLabel: `Live Position (${activeStepObj?.label || 'Walking'})`,
      };
    }
    if (activeStepObj && Number.isFinite(activeStepObj.lat) && Number.isFinite(activeStepObj.lng)) {
      return {
        latitude: activeStepObj.lat,
        longitude: activeStepObj.lng,
        popupLabel: `Step ${step + 1}: ${activeStepObj.label}`,
      };
    }
    return {
      latitude: activeOrigin.latitude,
      longitude: activeOrigin.longitude,
      popupLabel: `Origin (${activeOrigin.source})`,
    };
  }, [nav.active, nav.userPosition, activeStepObj, step, activeOrigin]);

  const routeDistanceText = formatDistanceMeters(nav.distanceMeters || 0);
  const routeDurationText = nav.durationSec
    ? `${Math.max(1, Math.round(nav.durationSec / 60))} min walk`
    : '';

  const handleSimulateOffRoute = () => {
    const base = activeMapUserLoc;
    // Offset ~85m north so detectOffRoute (>45m) triggers live rerouting
    assistant.evaluateCoordinateUpdate(base.latitude + 0.00085, base.longitude + 0.00045);
  };

  return (
    <DashboardShell
      title="Walking Navigation"
      subtitle="Audio-first turn-by-turn walking guidance, live off-route recalculation & secondary high-contrast map"
      icon={NavIcon}
    >
      {/* Active Audio Guidance & Disambiguation Status Bar */}
      <div className="glass-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                nav.active
                  ? 'bg-[#065F46] text-white border-[#065F46]'
                  : nav.arrived
                  ? 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]'
                  : 'bg-[#F4EFE4] text-[#354B40] border-[#DCD2BF]'
              }`}
            >
              {nav.active
                ? 'LIVE AUDIO GUIDANCE ACTIVE'
                : nav.arrived
                ? 'ARRIVED AT DESTINATION'
                : 'ROUTE PREVIEW'}
            </span>
            {nav.familyShared && (
              <span className="px-2.5 py-1 rounded-full bg-[#ECF7F2] border border-[#065F46]/25 text-xs font-mono text-[#065F46] inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Shared on Family Timeline
              </span>
            )}
            {nav.rerouteCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-[#FBF3DF] border border-[#C59B42] text-xs font-mono text-[#7D5B1C]">
                Rerouted {nav.rerouteCount}×
              </span>
            )}
          </div>
          {activeStepObj && (
            <p className="text-sm font-semibold text-[#12231B]">
              Next Instruction: {activeStepObj.spoken}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => assistant.processTranscript('how far', { source: 'nav_ui' })}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#DCD2BF] hover:border-[#065F46] text-xs font-semibold text-[#12231B]"
          >
            How Far?
          </button>
          <button
            type="button"
            onClick={() => assistant.processTranscript('i need help', { source: 'nav_ui' })}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/45 text-xs font-bold text-[#7D5B1C] inline-flex items-center gap-1.5"
          >
            <HandHelping className="w-4 h-4" aria-hidden="true" />
            I Need Help
          </button>
          {nav.active && (
            <>
              <button
                type="button"
                onClick={handleSimulateOffRoute}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#DCD2BF] text-xs font-semibold text-[#354B40] inline-flex items-center gap-1.5"
                title="Test off-route detection & rerouting (+85m offset)"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Test Reroute
              </button>
              <button
                type="button"
                onClick={() => assistant.stopNavigationSession('cancelled')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 inline-flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                Stop Nav
              </button>
            </>
          )}
        </div>
      </div>

      {/* Disambiguation Multiple-Match Picker */}
      {assistant.pendingConfirmation?.kind === 'nav_disambiguation' && (
        <div
          role="region"
          aria-label="Multiple matching destinations found"
          className="glass-card border-2 border-[#065F46] p-5 mb-6 space-y-3"
        >
          <p className="text-sm font-bold text-[#065F46]">
            Multiple places match “{assistant.pendingConfirmation.query}”. Confirm your destination:
          </p>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {assistant.pendingConfirmation.candidates.map((cand, idx) => (
              <button
                key={`${cand.display_name}-${idx}`}
                type="button"
                onClick={() => assistant.processTranscript(`option ${idx + 1}`, { source: 'nav_ui' })}
                className="min-h-[48px] p-3.5 rounded-xl bg-white border border-[#DCD2BF] hover:border-[#065F46] text-left text-xs"
              >
                <span className="font-mono font-bold text-[#065F46] block">Option {idx + 1}</span>
                <span className="font-semibold text-[#12231B] block">{cand.promptLabel}</span>
                <span className="text-[#4F6358]">
                  {cand.distance_m != null ? `${cand.distance_m} m away` : cand.display_name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Route Planner Controls */}
      <div className="glass-card p-5 mb-6 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            planRoute();
          }}
          className="flex flex-col md:flex-row gap-3"
        >
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-[#D7CEBC]">
            <Search className="w-4 h-4 text-[#697D72] shrink-0" />
            <input
              type="text"
              aria-label="Destination address or landmark"
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
              placeholder="Enter destination (e.g. Indiranagar Metro, City Hospital...)"
              className="flex-1 bg-transparent outline-none text-sm text-[#12231B]"
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={() => (listening ? stopListening() : startListening())}
                aria-label={listening ? 'Stop voice destination input' : 'Speak destination'}
                className="p-1.5 rounded-lg hover:bg-[#F6F1E6] text-[#065F46]"
              >
                {listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={async () => {
              const gpsOrigin = await detectGpsOrigin();
              planRoute(destInput, gpsOrigin);
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F6F1E6] border border-[#DCD2BF] text-xs font-semibold text-[#12231B] hover:border-[#065F46] inline-flex items-center justify-center gap-1.5"
          >
            <LocateFixed className="w-4 h-4 text-[#065F46]" />
            <span>Use My GPS</span>
          </button>

          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <NavIcon className="w-4 h-4" />}
            <span>Plan Route</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_DESTINATIONS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setDestInput(preset.name);
                  planRoute(preset.name);
                }}
                className={`min-h-[38px] px-3 py-1 rounded-full text-xs border transition-colors ${
                  destination.name === preset.name
                    ? 'bg-[#065F46] border-[#065F46] text-white'
                    : 'bg-white border-[#D7CEBC] text-[#354B40] hover:border-[#065F46]/40'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono text-[#4F6358]">
            Start: {activeOrigin.source} ({activeOrigin.latitude.toFixed(4)}, {activeOrigin.longitude.toFixed(4)})
          </span>
        </div>

        {(notice || nav.notice) && (
          <p className="text-xs font-mono text-[#7D5B1C] bg-[#FBF3DF] border border-[#C59B42]/35 rounded-lg px-3 py-2">
            {notice || nav.notice}
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Route Steps & Controls */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display font-bold text-[#12231B] text-lg">
                {destination.short_name || destination.name}
              </h3>
              <span className="text-xs font-mono font-semibold text-[#065F46]">
                {routeDistanceText ? `${routeDistanceText} · ${routeDurationText}` : 'Ready'}
                {nav.distanceRemainingM ? ` · ${formatDistanceMeters(nav.distanceRemainingM)} remaining` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  assistant.selectNavStep(Math.max(0, step - 1));
                }}
                disabled={step === 0 || steps.length === 0}
                aria-label="Previous step"
                className="min-w-[40px] min-h-[40px] p-2 rounded-lg bg-white border border-[#D7CEBC] text-[#12231B] disabled:opacity-40 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setAutoPlay((p) => !p)}
                disabled={steps.length < 2}
                aria-label={autoPlay ? 'Pause voice guidance' : 'Play voice guidance'}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] text-xs font-bold flex items-center gap-1.5"
              >
                {autoPlay ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{autoPlay ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAutoPlay(false);
                  assistant.selectNavStep(Math.min(steps.length - 1, step + 1));
                }}
                disabled={step >= steps.length - 1 || steps.length === 0}
                aria-label="Next step"
                className="min-w-[40px] min-h-[40px] p-2 rounded-lg bg-white border border-[#D7CEBC] text-[#12231B] disabled:opacity-40 flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => activeStepObj?.spoken && assistant.speak(activeStepObj.spoken)}
                disabled={!activeStepObj}
                aria-label="Repeat spoken instruction"
                className="min-w-[40px] min-h-[40px] p-2 rounded-lg bg-[#065F46] text-white hover:bg-[#054D39] disabled:opacity-40 flex items-center justify-center"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-0 max-h-[520px] overflow-y-auto pr-1">
            {steps.map((r, i) => (
              <div key={`${r.label}-${i}`} className="relative">
                <motion.button
                  type="button"
                  onClick={() => {
                    setAutoPlay(false);
                    assistant.selectNavStep(i);
                  }}
                  className={`w-full text-left flex items-center gap-4 p-4 rounded-xl transition-all ${
                    i === step
                      ? 'bg-white border-2 border-[#065F46]/45 shadow-sm'
                      : i < step
                      ? 'bg-white/80 border border-[#DCD2BF]'
                      : 'opacity-65 hover:opacity-100 bg-[#FAF7F0]/60 border border-transparent hover:border-[#DCD2BF]'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      r.isDest && i === step
                        ? 'bg-[#065F46] border-2 border-[#065F46] text-white'
                        : i <= step
                        ? 'bg-[#ECF7F2] border-2 border-[#065F46]/40'
                        : 'bg-[#F6F1E6] border border-[#DCD2BF]'
                    }`}
                  >
                    {r.isDest ? (
                      <CheckCircle className={`w-5 h-5 ${i === step ? 'text-white' : 'text-[#065F46]'}`} />
                    ) : i === 0 ? (
                      <div className="w-3 h-3 bg-[#065F46] rounded-full" />
                    ) : (
                      <MapPin className={`w-4 h-4 ${i <= step ? 'text-[#065F46]' : 'text-[#697D72]'}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-[#12231B] block">{r.label}</span>
                    <span className="block text-xs text-[#4F6358] truncate">{r.sub}</span>
                  </div>
                  {i === step && (
                    <span className="ml-auto text-[10px] font-mono font-bold text-[#8C6A23] bg-[#FBF3DF] px-2 py-0.5 rounded-full border border-[#C59B42]/30 shrink-0">
                      STEP {i + 1}
                    </span>
                  )}
                </motion.button>
                {i < steps.length - 1 && (
                  <div className="ml-9 h-3">
                    <div className={`w-px h-full mx-auto ${i < step ? 'bg-[#065F46]/45' : 'bg-[#DCD2BF]'}`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* High-Contrast Interactive Leaflet Map (Secondary Visual UI) */}
        <div className="space-y-4">
          <LiveAssistanceMap
            userLocation={activeMapUserLoc}
            volunteerLocation={{
              latitude: destination.latitude ?? destination.lat,
              longitude: destination.longitude ?? destination.lng,
              name: destination.short_name || destination.name,
              popupLabel: `Destination: ${destination.short_name || destination.name}`,
            }}
            trail={trail}
            userLabel="Active Position"
            peerLegendLabel="Destination"
            heightClass="h-80 lg:h-[460px]"
            label="High-contrast walking navigation map"
          />

          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${activeOrigin.latitude},${activeOrigin.longitude}&destination=${destination.latitude ?? destination.lat},${destination.longitude ?? destination.lng}&travelmode=walking`}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card p-4 flex items-center justify-between text-xs font-semibold text-[#065F46] hover:bg-[#ECF7F2] transition-colors"
          >
            <span>Open Turn-by-Turn Walking Directions in Google Maps</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </DashboardShell>
  );
}
