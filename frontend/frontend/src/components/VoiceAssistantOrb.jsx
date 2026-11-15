import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic,
  Radio,
  Volume2,
  VolumeX,
  Trash2,
  ChevronUp,
  ChevronDown,
  Send,
  AlertTriangle,
  Wifi,
  WifiOff,
  RotateCcw,
  Cpu,
  HelpCircle,
  History,
  Navigation,
  Bus,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAssistant } from '../assistant/AssistantContext';
import { getQuickCommandsForLang } from '../assistant/i18n';
import { primeSharedAudioContext } from '../hooks/useVoiceAssistant';

const STATE_BADGE_STYLES = {
  Idle: 'bg-[#F4EFE4] text-[#354B40] border-[#DCD2BF]',
  Listening: 'bg-[#065F46] text-white border-[#065F46]',
  Thinking: 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]',
  Acting: 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]',
};

export default function VoiceAssistantOrb() {
  const { reducedMotion } = useAuth();
  const {
    assistantState,
    micActive,
    micLevel,
    language,
    languages,
    setLanguage,
    interimTranscript,
    lastHeard,
    lastSpoken,
    ariaAnnouncement,
    isOnline,
    offlineOutboxCount,
    drawerOpen,
    setDrawerOpen,
    sosCountdown,
    sosActive,
    sosFallbacks,
    pendingConfirmation,
    navigation,
    busResult,
    commandLog,
    hardwareConnected,
    triggerTalkButton,
    handleButtonAction,
    simulateHardwarePress,
    processTranscript,
    silenceSpeech,
    cancelSosCountdown,
    stopSosAlert,
    flushQueuedActions,
    deleteHistory,
  } = useAssistant();

  const [typedInput, setTypedInput] = useState('');
  const [activeTab, setActiveTab] = useState('commands'); // 'commands' | 'history'
  const [hapticFlash, setHapticFlash] = useState(false);
  const talkBtnRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const didLongPressRef = useRef(false);

  // Stop stray press-hold timer on unmount & flash visual pulse on haptic feedback
  useEffect(() => {
    const onHaptic = () => {
      setHapticFlash(true);
      setTimeout(() => setHapticFlash(false), 320);
    };
    window.addEventListener('sightlink:haptic-pulse', onHaptic);
    return () => {
      window.removeEventListener('sightlink:haptic-pulse', onHaptic);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const quickCommands = getQuickCommandsForLang(language);

  const handleTalkPointerDown = () => {
    primeSharedAudioContext();
    didLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      handleButtonAction('long_press', { source: 'ui_long_press' });
    }, 3000);
  };

  const handleTalkPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTalkClick = () => {
    primeSharedAudioContext();
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    triggerTalkButton();
  };

  const handleTypedSubmit = async (e) => {
    e.preventDefault();
    primeSharedAudioContext();
    const val = typedInput.trim();
    if (!val) return;
    setTypedInput('');
    await processTranscript(val, { source: 'keyboard' });
  };

  const orbScale = reducedMotion ? 1 : micActive ? 1 + Math.min(0.24, micLevel * 0.28) : 1;
  const orbGlowStyle = reducedMotion
    ? {}
    : {
        transform: `scale(${orbScale.toFixed(3)})`,
        boxShadow:
          sosCountdown != null || sosActive
            ? '0 0 0 8px rgba(220, 38, 38, 0.25), 0 8px 24px rgba(220, 38, 38, 0.35)'
            : micActive
            ? `0 0 ${Math.round(14 + micLevel * 28)}px rgba(6, 95, 70, ${0.35 + micLevel * 0.45})`
            : '0 6px 20px rgba(6, 95, 70, 0.18)',
      };

  return (
    <>
      {/* Accessible Screen Reader Live Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Assistant status: {assistantState}. {micActive ? 'Microphone on.' : ''} {ariaAnnouncement}
      </div>
      {sosCountdown != null && (
        <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
          Emergency SOS in {sosCountdown} seconds. Press Cancel or say cancel to stop.
        </div>
      )}

      {/* Fixed Bottom-Left Accessible Dock (keeps bottom-right clear for SharingStatusBanner) */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2.5 max-w-[calc(100vw-2rem)]">
        {/* Emergency SOS 5s Cancellable Banner */}
        {(sosCountdown != null || sosActive) && (
          <div
            role="alert"
            className="w-full sm:w-[390px] rounded-2xl bg-red-700 text-white border-2 border-red-200 shadow-2xl p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>
                  {sosCountdown != null
                    ? `Emergency SOS in ${sosCountdown}s`
                    : 'EMERGENCY SOS ACTIVE'}
                </span>
              </div>
              {sosCountdown != null ? (
                <button
                  type="button"
                  onClick={() => {
                    cancelSosCountdown();
                    processTranscript('cancel', { source: 'ui_cancel_sos' });
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white text-red-800 font-bold text-xs hover:bg-red-50 focus-visible-ring"
                >
                  Cancel SOS
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopSosAlert}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white text-red-800 font-bold text-xs hover:bg-red-50 focus-visible-ring"
                >
                  Resolve SOS
                </button>
              )}
            </div>

            {sosFallbacks && (
              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                <a
                  href={sosFallbacks.sms_fallback_url}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-red-900/60 border border-white/30 text-white font-semibold inline-flex items-center gap-1"
                >
                  SMS Fallback
                </a>
                <a
                  href={sosFallbacks.whatsapp_fallback_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-red-900/60 border border-white/30 text-white font-semibold inline-flex items-center gap-1"
                >
                  WhatsApp Fallback
                </a>
              </div>
            )}
          </div>
        )}

        {/* Disambiguation / Confirmation Quick Prompt */}
        {pendingConfirmation && (
          <div
            role="region"
            aria-label="Voice confirmation options"
            className="w-full sm:w-[390px] glass-card border-2 border-[#065F46]/45 p-3.5 space-y-2 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#065F46] uppercase">
                {pendingConfirmation.kind === 'nav_disambiguation'
                  ? 'Confirm Destination'
                  : 'Transit Fallback Option'}
              </span>
              <button
                type="button"
                onClick={() => processTranscript('cancel', { source: 'ui_confirm' })}
                className="text-xs font-semibold text-red-700 hover:underline px-2 py-1"
              >
                Cancel
              </button>
            </div>
            {pendingConfirmation.kind === 'nav_disambiguation' && (
              <div className="space-y-1.5">
                {pendingConfirmation.candidates.slice(0, 3).map((cand, idx) => (
                  <button
                    key={`${cand.display_name}-${idx}`}
                    type="button"
                    onClick={() => processTranscript(`option ${idx + 1}`, { source: 'ui_confirm' })}
                    className="w-full text-left min-h-[44px] px-3 py-2 rounded-xl bg-white border border-[#DCD2BF] hover:border-[#065F46] text-xs font-medium text-[#12231B]"
                  >
                    <span className="font-mono font-bold text-[#065F46] mr-1.5">Option {idx + 1}:</span>
                    {cand.promptLabel}
                    {cand.distance_m != null ? ` (${cand.distance_m}m)` : ''}
                  </button>
                ))}
              </div>
            )}
            {pendingConfirmation.kind === 'bus_no_data' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => processTranscript('navigate to nearest bus stop', { source: 'ui_confirm' })}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-[#065F46] text-white text-xs font-semibold"
                >
                  Walk to Nearest Stop
                </button>
                <button
                  type="button"
                  onClick={() => processTranscript('volunteer assistance', { source: 'ui_confirm' })}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-[#F6F1E6] border border-[#C59B42]/45 text-[#12231B] text-xs font-semibold"
                >
                  Request Volunteer
                </button>
              </div>
            )}
          </div>
        )}

        {/* Expandable Glassmorphic Voice Assistant Panel */}
        {drawerOpen && (
          <section
            id="sightlink-assistant-panel"
            aria-label="SightLink Voice Assistant Console"
            className="w-[calc(100vw-2rem)] sm:w-[420px] max-h-[72vh] overflow-y-auto glass-card border border-[#065F46]/25 p-4 space-y-3.5 shadow-2xl"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E2D9C8]">
              <div>
                <h2 className="font-display font-bold text-sm text-[#12231B] flex items-center gap-2">
                  <span>Hands-Free Assistant</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      STATE_BADGE_STYLES[assistantState] || STATE_BADGE_STYLES.Idle
                    }`}
                  >
                    {assistantState}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-mono text-[#4F6358]">
                  <span className="inline-flex items-center gap-1">
                    {isOnline ? (
                      <Wifi className="w-3 h-3 text-[#065F46]" aria-hidden="true" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-red-700" aria-hidden="true" />
                    )}
                    {isOnline ? 'Online' : 'Offline Mode'}
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Cpu
                      className={`w-3 h-3 ${hardwareConnected ? 'text-[#065F46]' : 'text-[#697D72]'}`}
                      aria-hidden="true"
                    />
                    {hardwareConnected ? 'Hardware Button Connected' : 'Stick Button Ready'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Minimize voice assistant panel"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#F6F1E6] border border-[#DCD2BF] text-[#12231B] flex items-center justify-center hover:border-[#065F46]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Voice Language Selector */}
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="assistant-lang-select" className="text-xs font-semibold text-[#354B40]">
                Language
              </label>
              <select
                id="assistant-lang-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#D7CEBC] text-xs font-medium text-[#12231B]"
              >
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Navigation / Bus Quick Status */}
            {navigation?.active && (
              <div className="p-3 rounded-xl bg-[#ECF7F2] border border-[#065F46]/30 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#065F46]">
                  <span className="flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                    Walking to {navigation.destination?.short_name}
                  </span>
                  <span>{navigation.distanceRemainingM}m left</span>
                </div>
                <p className="text-xs text-[#12231B]">
                  {navigation.steps?.[navigation.currentStepIndex]?.label || 'Following route'}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => processTranscript('how far', { source: 'ui_nav' })}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white border border-[#065F46]/30 text-[11px] font-semibold text-[#065F46]"
                  >
                    How Far
                  </button>
                  <button
                    type="button"
                    onClick={() => processTranscript('repeat', { source: 'ui_nav' })}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white border border-[#065F46]/30 text-[11px] font-semibold text-[#065F46]"
                  >
                    Repeat Turn
                  </button>
                  <button
                    type="button"
                    onClick={() => processTranscript('stop navigation', { source: 'ui_nav' })}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-[11px] font-semibold text-red-700"
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}

            {busResult && (
              <div className="p-3 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/40 text-xs text-[#12231B] flex items-start gap-2.5">
                <Bus className="w-4 h-4 text-[#8C6A23] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-bold text-[#12231B] truncate">
                      {busResult.type === 'stop_explorer_menu'
                        ? 'BMTC Stop Explorer'
                        : busResult.type === 'route_stops' || busResult.stops
                        ? `Stop Explorer: Route ${busResult.route_number || ''}`
                        : busResult.type === 'trip_planner_menu'
                        ? 'BMTC Trip Planner'
                        : busResult.source && busResult.destination
                        ? `Trip: ${busResult.source} → ${busResult.destination}`
                        : busResult.route_number
                        ? `Route ${busResult.route_number}`
                        : 'BMTC Transit'}
                    </span>
                    <Link
                      to={
                        busResult.type === 'trip_planner_menu'
                          ? '/bmtc?tab=planner'
                          : busResult.type === 'trip_plan'
                          ? `/bmtc?tab=planner&source=${encodeURIComponent(busResult.source || '')}&destination=${encodeURIComponent(busResult.destination || '')}`
                          : busResult.type === 'stop_explorer_menu'
                          ? '/bmtc?tab=stops'
                          : busResult.type === 'route_stops' || busResult.stops
                          ? `/bmtc?tab=stops&route=${encodeURIComponent(busResult.route_number || '')}`
                          : '/bmtc'
                      }
                      onClick={() => setDrawerOpen(false)}
                      className="text-[10px] font-mono font-semibold text-[#065F46] hover:underline shrink-0"
                    >
                      {busResult.type?.includes('stop') ? 'Open Explorer →' : 'Open Planner →'}
                    </Link>
                  </div>
                  <p className="text-xs text-[#354B40] leading-snug">
                    {busResult.spoken_summary || busResult.message || 'Transit info loaded.'}
                  </p>

                  {/* Trip Planner Result Routes */}
                  {Array.isArray(busResult.routes) && busResult.routes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {busResult.routes.slice(0, 3).map((r, idx) => (
                        <span
                          key={`${r.route_number}-${idx}`}
                          className="px-1.5 py-0.5 rounded bg-white/80 border border-[#C59B42]/30 text-[10px] font-mono font-semibold text-[#7D5B1C]"
                        >
                          Bus {r.route_number} ({r.stops_count} stops · {r.estimated_time_mins || 45}m · ₹{r.fare_ordinary_inr})
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stop Explorer Result Stops */}
                  {Array.isArray(busResult.stops) && busResult.stops.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-white/80 border border-[#065F46]/30 text-[#065F46] font-bold">
                          {busResult.total_stops || busResult.stops.length} Stops
                        </span>
                        {busResult.fare_ordinary_inr != null && (
                          <span className="px-1.5 py-0.5 rounded bg-white/80 border border-[#C59B42]/30 text-[#7D5B1C]">
                            ₹{busResult.fare_ordinary_inr} Ordinary
                          </span>
                        )}
                        {busResult.fare_vajra_ac_inr != null && (
                          <span className="px-1.5 py-0.5 rounded bg-white/80 border border-[#065F46]/20 text-[#065F46]">
                            ₹{busResult.fare_vajra_ac_inr} Vajra AC
                          </span>
                        )}
                      </div>
                      {busResult.nearest_user_stop && (
                        <p className="text-[11px] text-[#065F46] font-medium">
                          📍 Nearest stop to you: <strong>{busResult.nearest_user_stop.name}</strong> (~{busResult.nearest_user_stop.distance_m}m away)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Trip Planner Quick Suggestions when opened via voice without parameters */}
                  {busResult.type === 'trip_planner_menu' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {['Hebbal to Silk Board', 'Majestic to Whitefield', 'KBS to Electronic City'].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => processTranscript(`bus from ${suggestion}`, { source: 'ui_quick' })}
                          className="px-2 py-0.5 rounded-full bg-white/80 border border-[#C59B42]/40 text-[10px] font-semibold text-[#7D5B1C] hover:border-[#065F46]"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Stop Explorer Quick Suggestions when opened via voice without parameters */}
                  {busResult.type === 'stop_explorer_menu' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {['500D', '335E', '400', '401', '365'].map((route) => (
                        <button
                          key={route}
                          type="button"
                          onClick={() => processTranscript(`stops for route ${route}`, { source: 'ui_quick' })}
                          className="px-2 py-0.5 rounded-full bg-white/80 border border-[#065F46]/40 text-[10px] font-semibold text-[#065F46] hover:bg-[#ECF7F2]"
                        >
                          Route {route} Stops
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Offline Outbox Notice */}
            {offlineOutboxCount > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-2 text-xs text-amber-900">
                <span>{offlineOutboxCount} offline request(s) queued</span>
                {isOnline && (
                  <button
                    type="button"
                    onClick={flushQueuedActions}
                    className="px-2.5 py-1 rounded-lg bg-amber-800 text-white font-semibold"
                  >
                    Send Now
                  </button>
                )}
              </div>
            )}

            {/* Large Captions (Heard & Said) */}
            <div className="p-3.5 rounded-xl bg-white border border-[#DCD2BF] space-y-2">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#697D72] block">
                  Heard
                </span>
                <p className="text-sm font-semibold text-[#12231B]">
                  {interimTranscript
                    ? `“${interimTranscript}…”`
                    : lastHeard
                    ? `“${lastHeard}”`
                    : 'Press Talk or your hardware button to speak'}
                </p>
              </div>
              <div className="pt-2 border-t border-[#EFE8DA]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#065F46] inline-flex items-center gap-1">
                    <Volume2 className="w-3 h-3" aria-hidden="true" />
                    Assistant Said
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => processTranscript('repeat', { source: 'ui_caption' })}
                      aria-label="Repeat last response"
                      className="p-1.5 rounded-lg hover:bg-[#F6F1E6] text-[#065F46]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={silenceSpeech}
                      aria-label="Stop speech output"
                      className="p-1.5 rounded-lg hover:bg-[#F6F1E6] text-[#4F6358]"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[#12231B] mt-0.5">
                  {lastSpoken || 'Ready for voice commands.'}
                </p>
              </div>
            </div>

            {/* Typed Fallback Command Bar */}
            <form onSubmit={handleTypedSubmit} className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Type a voice assistant command"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder="Type command (e.g. Check bus 400)..."
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#D7CEBC] text-xs text-[#12231B]"
              />
              <button
                type="submit"
                aria-label="Run command"
                className="min-w-[44px] min-h-[44px] px-3.5 rounded-xl bg-[#065F46] text-white hover:bg-[#054D39] flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {/* Hardware Button Test Simulator */}
            <div className="p-2.5 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#4F6358] block">
                Hardware Button Actions (ESP8266 Stick / Bench Test)
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => simulateHardwarePress('bus_assistant')}
                  className="min-h-[40px] px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 hover:border-[#065F46] text-[11px] font-bold text-[#065F46]"
                  title="Physical Button 1 (D5): Live Bus Route Query"
                >
                  🚌 Bus (D5)
                </button>
                <button
                  type="button"
                  onClick={() => simulateHardwarePress('single_press')}
                  className="min-h-[40px] px-2 py-1.5 rounded-lg bg-white border border-[#DCD2BF] hover:border-[#065F46] text-[11px] font-semibold text-[#12231B]"
                  title="Physical Button 2 (D6): AI Voice Assistant"
                >
                  🎙️ AI (D6)
                </button>
                <button
                  type="button"
                  onClick={() => simulateHardwarePress('long_press')}
                  className="min-h-[40px] px-2 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-[11px] font-bold"
                  title="Physical Button 3 (D7): Emergency SOS"
                >
                  🚨 SOS (D7)
                </button>
                <button
                  type="button"
                  onClick={() => simulateHardwarePress('cancel')}
                  className="min-h-[40px] px-2 py-1.5 rounded-lg bg-white border border-[#DCD2BF] hover:border-[#C59B42] text-[11px] font-semibold text-[#7D5B1C]"
                  title="Cancel active speech or alert"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Tabs: Command Cheat Sheet vs Command History */}
            <div className="flex items-center justify-between gap-2 border-b border-[#E2D9C8] pb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('commands')}
                  className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                    activeTab === 'commands'
                      ? 'bg-[#065F46] text-white'
                      : 'bg-[#F6F1E6] text-[#354B40]'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Commands
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                    activeTab === 'history'
                      ? 'bg-[#065F46] text-white'
                      : 'bg-[#F6F1E6] text-[#354B40]'
                  }`}
                >
                  <History className="w-3.5 h-3.5" /> Log ({commandLog.length})
                </button>
              </div>

              {activeTab === 'history' && commandLog.length > 0 && (
                <button
                  type="button"
                  onClick={deleteHistory}
                  className="min-h-[38px] px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete History
                </button>
              )}
            </div>

            {activeTab === 'commands' ? (
              <div className="flex flex-wrap gap-1.5">
                {quickCommands.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => processTranscript(phrase, { source: 'cheatsheet' })}
                    className="min-h-[38px] px-2.5 py-1 rounded-full bg-white border border-[#D7CEBC] hover:border-[#065F46] text-xs text-[#12231B]"
                  >
                    “{phrase}”
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {commandLog.length === 0 ? (
                  <p className="text-xs text-[#4F6358] py-4 text-center">No commands logged yet.</p>
                ) : (
                  commandLog.slice(0, 25).map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-xl bg-white border border-[#E2D9C8] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-[#065F46]">{entry.intent}</span>
                        <span className="text-[10px] font-mono text-[#697D72]">
                          {new Date(entry.time).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="font-semibold text-[#12231B]">Heard: {entry.transcript}</p>
                      <p className="text-[#4F6358]">Result: {entry.result}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        )}

        {/* Always-Visible Pill + Large Talk Button + Reactive Voice Orb */}
        <div
          className={`glass-card border p-2 pr-3 rounded-full shadow-2xl flex items-center gap-2.5 transition-all ${
            hapticFlash
              ? 'border-[#C59B42] ring-4 ring-[#C59B42]/40'
              : 'border-[#065F46]/30'
          }`}
        >
          {/* Glowing Reactive Voice Orb / Large Talk Button */}
          <button
            ref={talkBtnRef}
            type="button"
            onClick={handleTalkClick}
            onPointerDown={handleTalkPointerDown}
            onPointerUp={handleTalkPointerUp}
            onPointerLeave={handleTalkPointerUp}
            aria-pressed={micActive}
            aria-keyshortcuts="Space Enter"
            aria-label={
              sosCountdown != null
                ? 'Cancel Emergency SOS countdown'
                : micActive
                ? 'Stop listening and cancel'
                : 'Talk to SightLink Voice Assistant (Space or Enter to talk, hold 3 seconds for Emergency SOS)'
            }
            style={orbGlowStyle}
            className={`min-w-[54px] min-h-[54px] px-4 rounded-full flex items-center justify-center gap-2 font-bold text-sm transition-colors focus-visible-ring ${
              sosCountdown != null || sosActive
                ? 'bg-red-600 text-white'
                : micActive
                ? 'bg-[#065F46] text-white'
                : 'bg-[#065F46] hover:bg-[#054D39] text-white'
            }`}
          >
            {micActive ? (
              <Mic className="w-5 h-5 text-[#F4E3BC]" aria-hidden="true" />
            ) : sosCountdown != null ? (
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Mic className="w-5 h-5" aria-hidden="true" />
            )}
            <span>{sosCountdown != null ? 'Cancel' : micActive ? 'Listening' : 'Talk'}</span>
          </button>

          {/* Persistent State & Privacy Microphone Indicator */}
          <div className="flex flex-col min-w-[92px]">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  micActive
                    ? 'bg-red-600'
                    : assistantState === 'Thinking' || assistantState === 'Acting'
                    ? 'bg-[#C59B42]'
                    : 'bg-[#065F46]'
                } ${micActive && !reducedMotion ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
              <span className="text-xs font-mono font-bold text-[#12231B]">
                {assistantState}
              </span>
            </div>
            <span className="text-[11px] font-mono text-[#354B40] flex items-center gap-1">
              {micActive ? (
                <span className="text-red-700 font-bold">Microphone on</span>
              ) : (
                <span>
                  <Radio className="w-3 h-3 inline mr-0.5 text-[#065F46]" aria-hidden="true" />
                  {hardwareConnected ? 'ESP32 Ready' : 'Button Ready'}
                </span>
              )}
            </span>
          </div>

          {/* Expand / Collapse Drawer Button */}
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            aria-expanded={drawerOpen}
            aria-controls="sightlink-assistant-panel"
            aria-label={drawerOpen ? 'Close voice assistant console' : 'Open voice assistant console'}
            className="min-w-[44px] min-h-[44px] rounded-full bg-[#F6F1E6] border border-[#DCD2BF] hover:border-[#065F46] text-[#12231B] flex items-center justify-center"
          >
            {drawerOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </>
  );
}
