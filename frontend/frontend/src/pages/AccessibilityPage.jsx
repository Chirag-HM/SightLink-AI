import { useState, useEffect } from 'react';
import {
  Settings, Volume2, Eye, Zap,
  Check, Play, RotateCcw, Save, Shield, Smartphone
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import {
  speakText,
  DEFAULT_ACCESSIBILITY_PREFS,
  getAccessibilityPrefs,
  saveAccessibilityPrefs,
} from '../hooks/useVoiceAssistant';
import { triggerHaptic, triggerHapticDetailed } from '../utils/haptics';

const SAMPLE_TEST_SPEECH = {
  'en-IN': 'SightLink voice output is active at your selected speed, pitch, and volume.',
  'en-US': 'SightLink voice output is active at your selected speed, pitch, and volume.',
  'hi-IN': 'साइटलिंक की आवाज़ आपकी चुनी हुई गति, पिच और वॉल्यूम पर सक्रिय है।',
  'ta-IN': 'நீங்கள் தேர்ந்தெடுத்த வேகம், சுருதி மற்றும் ஒலியளவில் சைட்லிங்க் குரல் செயல்படுகிறது.',
  'te-IN': 'మీరు ఎంచుకున్న వేగం, పిచ్ మరియు వాల్యూమ్‌తో సైట్‌లింక్ వాయిస్ అవుట్‌ಪుట్ సిద్ధంగా ఉంది.',
  'kn-IN': 'ನೀವು ಆಯ್ಕೆ ಮಾಡಿದ ವೇಗ, ಪಿಚ್ ಮತ್ತು ಧ್ವನಿ ಮಟ್ಟದಲ್ಲಿ ಸೈಟ್‌ಲಿಂಕ್ ಧ್ವನಿ ಸಕ್ರಿಯವಾಗಿದೆ.',
};

export default function AccessibilityPage() {
  const {
    highContrast,
    setHighContrast,
    largeText,
    setLargeText,
    reducedMotion,
    setReducedMotionPref,
  } = useAuth();
  const { connection: stickConnection, deviceUrl } = useStickGps();

  const initialPrefs = getAccessibilityPrefs();
  const [screenReaderHints, setScreenReaderHints] = useState(Boolean(initialPrefs.screenReaderHints));
  const [hapticEnabled, setHapticEnabled] = useState(initialPrefs.hapticEnabled !== false);
  const [hapticIntensity, setHapticIntensity] = useState(Number(initialPrefs.hapticIntensity));
  const [hapticDesktopAudioFallback, setHapticDesktopAudioFallback] = useState(
    initialPrefs.hapticDesktopAudioFallback !== false
  );
  const [hapticCategories, setHapticCategories] = useState({
    ...DEFAULT_ACCESSIBILITY_PREFS.hapticCategories,
    ...(initialPrefs.hapticCategories || {}),
  });
  const [speechRate, setSpeechRate] = useState(Number(initialPrefs.speechRate));
  const [speechPitch, setSpeechPitch] = useState(Number(initialPrefs.speechPitch));
  const [speechVolume, setSpeechVolume] = useState(Number(initialPrefs.speechVolume));
  const [audioLanguage, setAudioLanguage] = useState(initialPrefs.audioLanguage || 'en-IN');
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [hapticFeedbackMsg, setHapticFeedbackMsg] = useState('');
  const [hapticPulseActive, setHapticPulseActive] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // Persist changes continuously so every page reading getAccessibilityPrefs() stays in sync
  useEffect(() => {
    saveAccessibilityPrefs({
      speechRate,
      speechPitch,
      speechVolume,
      audioLanguage,
      hapticEnabled,
      hapticIntensity,
      hapticDesktopAudioFallback,
      hapticCategories,
      screenReaderHints,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sightlink:prefs-updated', { detail: { audioLanguage } }));
    }
  }, [
    speechRate,
    speechPitch,
    speechVolume,
    audioLanguage,
    hapticEnabled,
    hapticIntensity,
    hapticDesktopAudioFallback,
    hapticCategories,
    screenReaderHints,
  ]);

  useEffect(() => {
    const syncExternal = (ev) => {
      const nextLang = ev?.detail?.audioLanguage || getAccessibilityPrefs().audioLanguage;
      if (nextLang) {
        setAudioLanguage((prev) => (prev === nextLang ? prev : nextLang));
      }
    };
    window.addEventListener('sightlink:prefs-updated', syncExternal);
    return () => window.removeEventListener('sightlink:prefs-updated', syncExternal);
  }, []);

  const announce = (msg) => {
    if (screenReaderHints) {
      setLiveAnnouncement(msg);
    }
  };

  const handleTestSpeech = () => {
    setIsPlayingTest(true);
    const msg = SAMPLE_TEST_SPEECH[audioLanguage] || SAMPLE_TEST_SPEECH['en-IN'];
    announce(msg);
    triggerHaptic('tap');
    speakText(msg, {
      rate: speechRate,
      pitch: speechPitch,
      volume: speechVolume / 100,
      lang: audioLanguage,
    });
    setTimeout(() => {
      setIsPlayingTest(false);
    }, 2200);
  };

  const handleTestHaptic = (patternName = 'confirm') => {
    const res = triggerHapticDetailed(patternName, {
      prefs: {
        hapticEnabled,
        hapticIntensity,
        hapticDesktopAudioFallback,
        hapticCategories,
      },
    });
    if (res.triggered) {
      setHapticPulseActive(true);
      setTimeout(() => setHapticPulseActive(false), 450);
    }
    const patternStr = Array.isArray(res.pattern) ? `${res.pattern.join(' / ')} ms` : `${res.pattern} ms`;
    if (res.reason === 'disabled') {
      setHapticFeedbackMsg('Haptic feedback is switched off. Enable the master toggle to test vibrations.');
    } else if (res.reason === 'muted') {
      setHapticFeedbackMsg('Vibration amplitude is 0% (muted). Increase the slider above 0%.');
    } else if (res.reason === 'category_disabled') {
      setHapticFeedbackMsg(`The "${patternName}" haptic category is currently disabled above.`);
    } else if (res.nativeVibrated) {
      setHapticFeedbackMsg(`Device vibration triggered (${patternStr}).`);
    } else if (res.audioMirrored) {
      setHapticFeedbackMsg(
        `Tactile-audio fallback pulse played (${patternStr}) — no phone vibration motor detected on this browser, mobile devices & stick will vibrate natively.`
      );
    } else {
      setHapticFeedbackMsg(`Visual pulse triggered (${patternStr}) — vibration motor & audio mirror both inactive.`);
    }
  };

  const handleSave = () => {
    saveAccessibilityPrefs({
      speechRate,
      speechPitch,
      speechVolume,
      audioLanguage,
      hapticEnabled,
      hapticIntensity,
      hapticDesktopAudioFallback,
      hapticCategories,
      screenReaderHints,
    });
    setIsSaved(true);
    announce('Accessibility and audio preferences saved to your local browser profile.');
    speakText('Accessibility preferences saved.', {
      rate: speechRate,
      pitch: speechPitch,
      volume: speechVolume / 100,
      lang: audioLanguage,
    });
    triggerHaptic('confirm');
    setTimeout(() => setIsSaved(false), 2200);
  };

  const handleRestoreDefaults = () => {
    setHighContrast(false);
    setLargeText(false);
    setReducedMotionPref(false);
    setScreenReaderHints(DEFAULT_ACCESSIBILITY_PREFS.screenReaderHints);
    setSpeechRate(DEFAULT_ACCESSIBILITY_PREFS.speechRate);
    setSpeechPitch(DEFAULT_ACCESSIBILITY_PREFS.speechPitch);
    setSpeechVolume(DEFAULT_ACCESSIBILITY_PREFS.speechVolume);
    setHapticEnabled(DEFAULT_ACCESSIBILITY_PREFS.hapticEnabled);
    setHapticIntensity(DEFAULT_ACCESSIBILITY_PREFS.hapticIntensity);
    setHapticDesktopAudioFallback(DEFAULT_ACCESSIBILITY_PREFS.hapticDesktopAudioFallback);
    setHapticCategories({ ...DEFAULT_ACCESSIBILITY_PREFS.hapticCategories });
    setAudioLanguage(DEFAULT_ACCESSIBILITY_PREFS.audioLanguage);
    saveAccessibilityPrefs(DEFAULT_ACCESSIBILITY_PREFS);
    setHapticFeedbackMsg('');
    announce('Restored default accessibility settings.');
    speakText('Restored default accessibility settings.', {
      rate: DEFAULT_ACCESSIBILITY_PREFS.speechRate,
      pitch: DEFAULT_ACCESSIBILITY_PREFS.speechPitch,
      volume: DEFAULT_ACCESSIBILITY_PREFS.speechVolume / 100,
      lang: DEFAULT_ACCESSIBILITY_PREFS.audioLanguage,
    });
  };

  return (
    <DashboardShell
      title="Accessibility & Audio Profiles"
      subtitle="Customize speech feedback, vibration intensity, screen reader live announcements, and multi-lingual output"
      icon={Settings}
    >
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Visual Adjustments */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#E2D9C8]">
              <Eye className="w-5 h-5 text-[#065F46]" />
              <div>
                <h3 className="font-display font-semibold text-[#12231B] text-base">Visual &amp; Screen Display</h3>
                <p className="text-xs text-[#4F6358]">Optimize contrast and presentation for low-vision users</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]">
                <div>
                  <label className="text-sm font-medium text-[#12231B] block">High Contrast Mode</label>
                  <span className="text-xs text-[#4F6358]">Boost border luminosity and sharpen color borders to 7:1 ratio</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHighContrast(!highContrast)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    highContrast ? 'bg-[#065F46]' : 'bg-[#D7CEBC]'
                  }`}
                  aria-label="Toggle high contrast mode"
                  aria-pressed={highContrast}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      highContrast ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]">
                <div>
                  <label className="text-sm font-medium text-[#12231B] block">Large Accessible Font Size</label>
                  <span className="text-xs text-[#4F6358]">Scale interface typography and controls up for low-vision clarity</span>
                </div>
                <button
                  type="button"
                  onClick={() => setLargeText(!largeText)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    largeText ? 'bg-[#065F46]' : 'bg-[#D7CEBC]'
                  }`}
                  aria-label="Toggle large accessible font size"
                  aria-pressed={largeText}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      largeText ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]">
                <div>
                  <label className="text-sm font-medium text-[#12231B] block">Reduce Motion &amp; Disable 3D</label>
                  <span className="text-xs text-[#4F6358]">Switch interactive Three.js &amp; scroll animations to calm static fallbacks</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReducedMotionPref(!reducedMotion)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    reducedMotion ? 'bg-[#065F46]' : 'bg-[#D7CEBC]'
                  }`}
                  aria-label="Toggle reduced motion"
                  aria-pressed={reducedMotion}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      reducedMotion ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]">
                <div>
                  <label className="text-sm font-medium text-[#12231B] block">Screen Reader Aria Hints</label>
                  <span className="text-xs text-[#4F6358]">Emit live aria-live announcements for status updates</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScreenReaderHints(!screenReaderHints)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    screenReaderHints ? 'bg-[#065F46]' : 'bg-[#D7CEBC]'
                  }`}
                  aria-label="Toggle screen reader aria hints"
                  aria-pressed={screenReaderHints}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      screenReaderHints ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Speech Engine Configuration */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E2D9C8]">
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-[#8C6A23]" />
                <div>
                  <h3 className="font-display font-semibold text-[#12231B] text-base">Audio &amp; Text-to-Speech Engine</h3>
                  <p className="text-xs text-[#4F6358]">Saved settings apply automatically to voice guidance across SightLink</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestSpeech}
                disabled={isPlayingTest}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#ECF7F2] border border-[#065F46]/25 text-[#065F46] hover:bg-[#DCF1E7] text-xs font-mono font-semibold transition-all"
              >
                <Play className={`w-3.5 h-3.5 ${isPlayingTest ? 'animate-spin' : ''}`} />
                {isPlayingTest ? 'Speaking...' : 'Test Voice'}
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-xs font-mono text-[#4F6358] block mb-2">Voice Model &amp; Dialect</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'en-IN', name: 'Indian English', badge: 'Default' },
                    { id: 'en-US', name: 'US English', badge: 'Standard' },
                    { id: 'hi-IN', name: 'Hindi (हिन्दी)', badge: 'हिंदी' },
                    { id: 'ta-IN', name: 'Tamil (தமிழ்)', badge: 'தமிழ்' },
                    { id: 'te-IN', name: 'Telugu (తెలుగు)', badge: 'తెలుగు' },
                    { id: 'kn-IN', name: 'Kannada (ಕನ್ನಡ)', badge: 'ಕನ್ನಡ' },
                  ].map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setAudioLanguage(lang.id)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        audioLanguage === lang.id
                          ? 'bg-[#065F46] border-[#065F46] text-white shadow-glow-sm'
                          : 'bg-[#F6F1E6] border-[#E2D9C8] text-[#354B40] hover:border-[#065F46]/35 hover:text-[#12231B]'
                      }`}
                    >
                      <span className="text-xs font-semibold block">{lang.name}</span>
                      <span className={`text-[10px] font-mono ${audioLanguage === lang.id ? 'text-[#F4E3BC]' : 'text-[#697D72]'}`}>
                        {lang.badge}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-6">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-[#4F6358]">Speed</span>
                    <span className="text-[#065F46] font-bold">{speechRate}x</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Speech speed"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="w-full accent-[#065F46] bg-[#E5DCCB] h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#697D72] mt-1">
                    <span>0.5x</span>
                    <span>2.0x</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-[#4F6358]">Pitch</span>
                    <span className="text-[#065F46] font-bold">{speechPitch}</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Speech pitch"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={speechPitch}
                    onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                    className="w-full accent-[#065F46] bg-[#E5DCCB] h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#697D72] mt-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-[#4F6358]">Volume</span>
                    <span className="text-[#065F46] font-bold">{speechVolume}%</span>
                  </div>
                  <input
                    type="range"
                    aria-label="Speech volume"
                    min="20"
                    max="100"
                    value={speechVolume}
                    onChange={(e) => setSpeechVolume(parseInt(e.target.value, 10))}
                    className="w-full accent-[#065F46] bg-[#E5DCCB] h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#697D72] mt-1">
                    <span>20%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stick Haptics & Vibration */}
          <div className={`glass-card p-6 md:p-8 transition-all ${hapticPulseActive ? 'ring-4 ring-[#C59B42]/50 border-[#C59B42]' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[#E2D9C8]">
              <div className="flex items-center gap-3">
                <Zap className={`w-5 h-5 ${hapticPulseActive ? 'text-[#065F46] scale-125 transition-transform' : 'text-[#8C6A23]'}`} />
                <div>
                  <h3 className="font-display font-semibold text-[#12231B] text-base">Haptic &amp; Vibration Feedback</h3>
                  <p className="text-xs text-[#4F6358]">Configure alert vibration patterns for mobile, smart stick &amp; desktop tactile pulses</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleTestHaptic('confirm')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FBF3DF] border border-[#C59B42]/40 text-[#7D5B1C] text-xs font-mono font-semibold hover:bg-[#F4E3BC]"
              >
                <Smartphone className="w-3.5 h-3.5" /> Test Vibration
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]">
                <div>
                  <label className="text-sm font-medium text-[#12231B] block">Enable Haptic &amp; Vibration Alerts</label>
                  <span className="text-xs text-[#4F6358]">Master switch for all vibration feedback across SOS, navigation &amp; obstacles</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHapticEnabled(!hapticEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    hapticEnabled ? 'bg-[#065F46]' : 'bg-[#D7CEBC]'
                  }`}
                  aria-label="Toggle haptic feedback"
                  aria-pressed={hapticEnabled}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      hapticEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-[#4F6358]">Vibration Amplitude</span>
                  <span className="text-[#065F46] font-bold">{hapticEnabled ? `${hapticIntensity}%` : 'OFF'}</span>
                </div>
                <input
                  type="range"
                  aria-label="Vibration amplitude"
                  min="0"
                  max="100"
                  step="5"
                  value={hapticIntensity}
                  onChange={(e) => setHapticIntensity(parseInt(e.target.value, 10))}
                  className="w-full accent-[#065F46] bg-[#E5DCCB] h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Haptic Category Toggles */}
              <div className="grid sm:grid-cols-2 gap-2.5">
                {[
                  { key: 'sos', label: 'Emergency SOS Pulses' },
                  { key: 'navigation', label: 'Turn & Arrival Haptics' },
                  { key: 'obstacles', label: 'Stick Obstacle Warnings' },
                  { key: 'interactions', label: 'Buttons & Voice Cues' },
                ].map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() =>
                      setHapticCategories((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }))
                    }
                    aria-pressed={Boolean(hapticCategories[cat.key])}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between text-xs transition-colors ${
                      hapticCategories[cat.key]
                        ? 'bg-[#ECF7F2] border-[#065F46]/35 text-[#065F46] font-semibold'
                        : 'bg-[#FAF7F0] border-[#E2D9C8] text-[#697D72]'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span className="font-mono text-[10px] uppercase">
                      {hapticCategories[cat.key] ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]">
                <div>
                  <label className="text-sm font-medium text-[#12231B] block">Desktop Tactile-Audio Pulse Fallback</label>
                  <span className="text-xs text-[#4F6358]">Play a subtle low-frequency pulse on desktop browsers without vibration motors</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHapticDesktopAudioFallback(!hapticDesktopAudioFallback)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    hapticDesktopAudioFallback ? 'bg-[#065F46]' : 'bg-[#D7CEBC]'
                  }`}
                  aria-label="Toggle desktop tactile audio fallback"
                  aria-pressed={hapticDesktopAudioFallback}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                      hapticDesktopAudioFallback ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Quick Pattern Presets Tester */}
              <div>
                <span className="text-xs font-mono text-[#4F6358] block mb-2">Test Haptic Patterns</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'tap', label: 'Button Tap' },
                    { id: 'turn', label: 'Nav Turn' },
                    { id: 'obstacle_danger', label: 'Obstacle Alert' },
                    { id: 'sos', label: 'SOS Pulse' },
                  ].map((pat) => (
                    <button
                      key={pat.id}
                      type="button"
                      onClick={() => handleTestHaptic(pat.id)}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-white border border-[#DCD2BF] hover:border-[#065F46] text-xs font-semibold text-[#12231B] transition-colors"
                    >
                      {pat.label}
                    </button>
                  ))}
                </div>
              </div>

              {hapticFeedbackMsg && (
                <p className="text-xs font-mono text-[#065F46] bg-[#ECF7F2] border border-[#065F46]/25 rounded-lg px-3 py-2">
                  {hapticFeedbackMsg}
                </p>
              )}

              <div className="p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-center justify-between text-xs">
                <span className="text-[#4F6358]">Ultrasonic Alert Thresholds</span>
                <span className="font-mono font-semibold text-[#065F46]">Safe: &gt;2m · Warn: &lt;1.2m · Danger: &lt;0.5m</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Summary & Save Card */}
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-display font-bold text-[#12231B] text-base mb-4">Profile State</h3>

            <div className="space-y-3 mb-6 text-xs">
              <div className="flex justify-between py-2 border-b border-[#E2D9C8]">
                <span className="text-[#4F6358]">Smart Stick Link</span>
                <span className={`font-mono font-semibold ${stickConnection === 'connected' ? 'text-[#065F46]' : 'text-[#8C6A23]'}`}>
                  {stickConnection === 'connected' ? `Online (${deviceUrl})` : 'Offline (Local Profile)'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#E2D9C8]">
                <span className="text-[#4F6358]">Audio Profile</span>
                <span className="font-mono font-semibold text-[#12231B]">{audioLanguage.toUpperCase()} · {speechRate}x</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#E2D9C8]">
                <span className="text-[#4F6358]">Haptic Setting</span>
                <span className="font-mono font-semibold text-[#8C6A23]">{hapticIntensity}%</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#E2D9C8]">
                <span className="text-[#4F6358]">Aria Live Hints</span>
                <span className="font-mono font-semibold text-[#065F46]">{screenReaderHints ? 'Enabled' : 'Muted'}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSave}
                className="w-full py-3 rounded-full bg-[#065F46] hover:bg-[#054D39] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-glow-sm"
              >
                {isSaved ? (
                  <>
                    <Check className="w-4 h-4 text-white" /> Preferences Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-white" /> Save Accessibility Profile
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="w-full py-2.5 rounded-full bg-[#F6F1E6] hover:bg-[#EBE3D3] text-[#354B40] hover:text-[#12231B] text-xs font-mono transition-all flex items-center justify-center gap-2 border border-[#DCD2BF]"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore Defaults
              </button>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-[#065F46]" />
              <h4 className="text-xs font-mono font-bold text-[#12231B] uppercase tracking-wider">WCAG 2.2 AAA Standard</h4>
            </div>
            <p className="text-xs text-[#4F6358] leading-relaxed">
              SIGHTLINK persists your voice speed, language, contrast, large text, and reduced motion choices locally so every page respects them automatically.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
