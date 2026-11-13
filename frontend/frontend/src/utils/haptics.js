/**
 * SightLink Centralized Haptic & Tactile Feedback Engine
 * - Scales patterns according to accessibility preferences (hapticEnabled, hapticIntensity, per-category toggles)
 * - Dispatches 'sightlink:haptic-pulse' events for visual confirmation on all devices
 * - Provides subtle low-frequency Web Audio tactile-thump fallback on desktops lacking vibration hardware
 */

export const HAPTIC_PREFS_KEY = 'sightlink_accessibility_prefs';

export const HAPTIC_PATTERNS = {
  tap: { pattern: [40], category: 'interactions', freq: 95 },
  listen: { pattern: [65], category: 'interactions', freq: 115 },
  cancel: { pattern: [45], category: 'interactions', freq: 80 },
  confirm: { pattern: [70, 45, 95], category: 'interactions', freq: 110 },
  error: { pattern: [130, 55, 85], category: 'interactions', freq: 72 },
  turn: { pattern: [80, 40, 80], category: 'navigation', freq: 105 },
  approach: { pattern: [70], category: 'navigation', freq: 100 },
  reroute: { pattern: [100, 50, 100], category: 'navigation', freq: 95 },
  arrived: { pattern: [120, 60, 120, 60, 200], category: 'navigation', freq: 120 },
  obstacle_warn: { pattern: [110, 60, 110], category: 'obstacles', freq: 88 },
  obstacle_danger: { pattern: [220, 70, 220, 70, 280], category: 'obstacles', freq: 75 },
  sos: { pattern: [300, 100, 300, 100, 400], category: 'sos', freq: 82 },
};

export function readStoredHapticPrefs() {
  const defaults = {
    hapticEnabled: true,
    hapticIntensity: 80,
    hapticDesktopAudioFallback: true,
    hapticCategories: {
      sos: true,
      navigation: true,
      obstacles: true,
      interactions: true,
    },
  };
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(HAPTIC_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      hapticCategories: {
        ...defaults.hapticCategories,
        ...(parsed?.hapticCategories && typeof parsed.hapticCategories === 'object'
          ? parsed.hapticCategories
          : {}),
      },
    };
  } catch {
    return defaults;
  }
}

export function scaleHapticPattern(pattern = [60], intensity = 80) {
  const pct = Number(intensity);
  if (!Number.isFinite(pct) || pct <= 0) return null;

  if (Array.isArray(pattern)) {
    if (pattern.length === 0) return null;
    return pattern.map((ms, idx) => {
      const val = Math.max(10, Number(ms) || 40);
      // Odd indices are pauses between vibrations: keep pause timing crisp
      if (idx % 2 === 1) {
        return Math.max(30, Math.round(val));
      }
      return Math.max(20, Math.round((val * pct) / 100));
    });
  }

  return Math.max(20, Math.round(((Number(pattern) || 60) * pct) / 100));
}

function playTactileAudioMirror(scaledPattern, baseFreq = 95, intensity = 80) {
  if (typeof window === 'undefined') return false;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;

  try {
    const ctx = new AudioCtx();
    const steps = Array.isArray(scaledPattern) ? scaledPattern : [scaledPattern];
    const peakGain = Math.max(0.06, Math.min(0.35, (intensity / 100) * 0.24));
    let offsetSec = 0;

    steps.forEach((ms, idx) => {
      const durSec = Math.max(0.025, Math.min(0.45, ms / 1000));
      if (idx % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseFreq, ctx.currentTime + offsetSec);
        osc.frequency.exponentialRampToValueAtTime(Math.max(48, baseFreq * 0.68), ctx.currentTime + offsetSec + durSec);

        gain.gain.setValueAtTime(0.001, ctx.currentTime + offsetSec);
        gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + offsetSec + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offsetSec + durSec);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offsetSec);
        osc.stop(ctx.currentTime + offsetSec + durSec + 0.02);
      }
      offsetSec += durSec;
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, Math.round((offsetSec + 0.25) * 1000));
    return true;
  } catch {
    return false;
  }
}

export function triggerHapticDetailed(patternOrName = 'tap', options = {}) {
  const prefs = options.prefs || readStoredHapticPrefs();

  if (prefs.hapticEnabled === false) {
    return { triggered: false, nativeVibrated: false, audioMirrored: false, pattern: null, reason: 'disabled' };
  }

  const intensity = Number(prefs.hapticIntensity ?? 80);
  if (!Number.isFinite(intensity) || intensity <= 0) {
    return { triggered: false, nativeVibrated: false, audioMirrored: false, pattern: null, reason: 'muted' };
  }

  const preset = typeof patternOrName === 'string' ? HAPTIC_PATTERNS[patternOrName] : null;
  const rawPattern = preset ? preset.pattern : patternOrName;
  const category = options.category || preset?.category || 'interactions';
  const freq = options.freq || preset?.freq || 95;

  if (prefs.hapticCategories && prefs.hapticCategories[category] === false) {
    return { triggered: false, nativeVibrated: false, audioMirrored: false, pattern: null, reason: 'category_disabled' };
  }

  const scaled = scaleHapticPattern(rawPattern, intensity);
  if (!scaled) {
    return { triggered: false, nativeVibrated: false, audioMirrored: false, pattern: null, reason: 'invalid_pattern' };
  }

  let nativeVibrated = false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      nativeVibrated = Boolean(navigator.vibrate(scaled));
    } catch {
      nativeVibrated = false;
    }
  }

  let audioMirrored = false;
  const allowDesktopMirror = prefs.hapticDesktopAudioFallback !== false || options.forceAudioMirror === true;
  if ((!nativeVibrated || options.forceAudioMirror) && allowDesktopMirror) {
    audioMirrored = playTactileAudioMirror(scaled, freq, intensity);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('sightlink:haptic-pulse', {
          detail: {
            name: typeof patternOrName === 'string' ? patternOrName : 'custom',
            category,
            pattern: scaled,
            nativeVibrated,
            audioMirrored,
            timestamp: Date.now(),
          },
        })
      );
    } catch {
      // ignore CustomEvent errors in restricted environments
    }
  }

  return {
    triggered: nativeVibrated || audioMirrored,
    nativeVibrated,
    audioMirrored,
    pattern: scaled,
    category,
    reason: nativeVibrated ? 'native_vibrate' : audioMirrored ? 'desktop_audio_mirror' : 'visual_only',
  };
}

export function triggerHaptic(patternOrName = 'tap', options = {}) {
  return triggerHapticDetailed(patternOrName, options).triggered;
}

