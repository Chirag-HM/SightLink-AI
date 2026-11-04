import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Volume2, Mic, Eye, Zap, Sliders,
  Check, Play, RotateCcw, Save, Shield, HelpCircle,
  Vibrate, Bell
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';

export default function AccessibilityPage() {
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [screenReaderHints, setScreenReaderHints] = useState(true);
  const [hapticIntensity, setHapticIntensity] = useState(80);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [speechVolume, setSpeechVolume] = useState(90);
  const [audioLanguage, setAudioLanguage] = useState('en-IN');
  const [announcementFrequency, setAnnouncementFrequency] = useState('balanced');
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleTestSpeech = () => {
    setIsPlayingTest(true);
    setTimeout(() => {
      setIsPlayingTest(false);
    }, 2200);
  };

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <DashboardShell
      title="Accessibility & Audio Profiles"
      subtitle="Customize speech feedback, haptic vibration curves, screen readers, and multi-lingual output"
      icon={Settings}
    >
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Visual Adjustments */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
              <Eye className="w-5 h-5 text-accent-cyan" />
              <div>
                <h3 className="font-display font-semibold text-white text-base">Visual & Screen Display</h3>
                <p className="text-xs text-dark-300">Optimize contrast and presentation for low-vision users</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-dark-800/40 border border-white/[0.04]">
                <div>
                  <label className="text-sm font-medium text-white block">High Contrast Mode</label>
                  <span className="text-xs text-dark-300">Boost border luminosity and sharpen color borders to 7:1 ratio</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHighContrast(!highContrast)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    highContrast ? 'bg-accent-cyan' : 'bg-dark-700'
                  }`}
                  aria-pressed={highContrast}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      highContrast ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-dark-800/40 border border-white/[0.04]">
                <div>
                  <label className="text-sm font-medium text-white block">Screen Reader Aria Hints</label>
                  <span className="text-xs text-dark-300">Emit live aria-live announcements for background telemetric alerts</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScreenReaderHints(!screenReaderHints)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                    screenReaderHints ? 'bg-accent-cyan' : 'bg-dark-700'
                  }`}
                  aria-pressed={screenReaderHints}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      screenReaderHints ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Speech Engine Configuration */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Volume2 className="w-5 h-5 text-accent-violet" />
                <div>
                  <h3 className="font-display font-semibold text-white text-base">Audio & Text-to-Speech Engine</h3>
                  <p className="text-xs text-dark-300">Fine-tune acoustic feedback synthesized into the stick audio earpiece</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTestSpeech}
                disabled={isPlayingTest}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-violet/15 border border-accent-violet/30 text-accent-violet hover:bg-accent-violet/25 text-xs font-mono transition-all"
              >
                <Play className={`w-3.5 h-3.5 ${isPlayingTest ? 'animate-spin' : ''}`} />
                {isPlayingTest ? 'Auditioning...' : 'Audition Voice'}
              </button>
            </div>

            <div className="space-y-6">
              {/* Language Selection */}
              <div>
                <label className="text-xs font-mono text-dark-300 block mb-2">Voice Model & Dialect</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'en-IN', name: 'Indian English', badge: 'Default' },
                    { id: 'kn-IN', name: 'Kannada (ಕನ್ನಡ)', badge: 'Regional' },
                    { id: 'hi-IN', name: 'Hindi (हिंदी)', badge: 'Popular' },
                    { id: 'en-US', name: 'US English', badge: 'Standard' },
                  ].map(lang => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setAudioLanguage(lang.id)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        audioLanguage === lang.id
                          ? 'bg-accent-violet/15 border-accent-violet/40 text-white shadow-glow-sm'
                          : 'bg-dark-800/40 border-white/[0.04] text-dark-300 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold block">{lang.name}</span>
                      <span className="text-[10px] font-mono text-dark-400">{lang.badge}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders: Speech Rate, Pitch, Volume */}
              <div className="grid sm:grid-cols-3 gap-6">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-dark-300">Speed</span>
                    <span className="text-accent-violet font-bold">{speechRate}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="w-full accent-accent-violet bg-dark-700 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-dark-400 mt-1">
                    <span>0.5x</span>
                    <span>2.0x</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-dark-300">Pitch</span>
                    <span className="text-accent-violet font-bold">{speechPitch}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={speechPitch}
                    onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                    className="w-full accent-accent-violet bg-dark-700 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-dark-400 mt-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-dark-300">Volume</span>
                    <span className="text-accent-violet font-bold">{speechVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={speechVolume}
                    onChange={(e) => setSpeechVolume(parseInt(e.target.value))}
                    className="w-full accent-accent-violet bg-dark-700 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-dark-400 mt-1">
                    <span>20%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stick Haptics & Vibration */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
              <Zap className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="font-display font-semibold text-white text-base">Haptic Motor Vibration Curves</h3>
                <p className="text-xs text-dark-300">Configure ESP8266 ergonomic handle vibration intensity upon obstacle proximity</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-2">
                  <span className="text-dark-300">Vibration Amplitude</span>
                  <span className="text-amber-400 font-bold">{hapticIntensity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={hapticIntensity}
                  onChange={(e) => setHapticIntensity(parseInt(e.target.value))}
                  className="w-full accent-amber-400 bg-dark-700 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Proximity presets */}
              <div className="p-4 rounded-xl bg-dark-800/40 border border-white/[0.04] flex items-center justify-between text-xs">
                <span className="text-dark-300">Proximity Threshold Curve</span>
                <span className="font-mono text-emerald-400">Safe: &gt;2m · Warn: 1m · Danger: &lt;0.5m</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Summary & Save Card */}
        <div className="space-y-6">
          <div className="glass-card p-6 border-accent-cyan/20">
            <h3 className="font-display font-bold text-white text-base mb-4">Device Sync State</h3>

            <div className="space-y-3 mb-6 text-xs">
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-dark-300">Synced Stick ID</span>
                <span className="font-mono text-accent-cyan">SIGHTLINK-ESP32-V2</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-dark-300">Audio Profile</span>
                <span className="font-mono text-white">{audioLanguage.toUpperCase()} · {speechRate}x</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-dark-300">Haptics Engine</span>
                <span className="font-mono text-amber-400">{hapticIntensity}% Active</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-dark-300">Aria Live Support</span>
                <span className="font-mono text-emerald-400">Enabled</span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSave}
                className="w-full py-3 rounded-full bg-gradient-to-r from-accent-cyan to-accent-blue text-dark-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-glow-sm"
              >
                {isSaved ? (
                  <>
                    <Check className="w-4 h-4 text-dark-950" /> Preferences Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-dark-950" /> Push To Smart Stick
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setHighContrast(false);
                  setLargeText(false);
                  setSpeechRate(1.0);
                  setSpeechPitch(1.0);
                  setSpeechVolume(90);
                  setHapticIntensity(80);
                  setAudioLanguage('en-IN');
                }}
                className="w-full py-2.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-dark-300 hover:text-white text-xs font-mono transition-all flex items-center justify-center gap-2 border border-white/[0.06]"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore Defaults
              </button>
            </div>
          </div>

          {/* Compliance & Certification */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">WCAG 2.2 AAA Standard</h4>
            </div>
            <p className="text-xs text-dark-300 leading-relaxed">
              SIGHTLINK adheres to the highest accessibility benchmarks for assistive technology interfaces, providing redundant multimodal feedback (visual, audio, haptic) across all critical alerts.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
