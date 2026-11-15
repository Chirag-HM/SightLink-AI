import {
  getAccessibilityPrefs,
  pickVoiceForLang,
  playBackendNeuralTts,
  primeSharedAudioContext,
  stopBackendNeuralTts,
} from '../hooks/useVoiceAssistant';
import { triggerHaptic, triggerHapticDetailed, HAPTIC_PATTERNS } from '../utils/haptics';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

export const VOICE_LANGUAGES = [
  { id: 'en-IN', name: 'English (India)', short: 'EN-IN', badge: 'Default' },
  { id: 'en-US', name: 'English (US)', short: 'EN-US', badge: 'Standard' },
  { id: 'hi-IN', name: 'Hindi (हिन्दी)', short: 'HI', badge: 'हिंदी' },
  { id: 'ta-IN', name: 'Tamil (தமிழ்)', short: 'TA', badge: 'தமிழ்' },
  { id: 'te-IN', name: 'Telugu (తెలుగు)', short: 'TE', badge: 'తెలుగు' },
  { id: 'kn-IN', name: 'Kannada (ಕನ್ನಡ)', short: 'KN', badge: 'ಕನ್ನಡ' },
];

export const DEFAULT_VOICE_LANGUAGE = env.VITE_DEFAULT_VOICE_LANG || 'en-IN';
export const CLOUD_STT_ENABLED = String(env.VITE_CLOUD_STT_ENABLED || 'false').toLowerCase() === 'true';
export const CLOUD_TTS_ENABLED = String(env.VITE_CLOUD_TTS_ENABLED || 'false').toLowerCase() === 'true';

/**
 * Play a distinct Web Audio API tone cue for button feedback, cancel, turn alert, or SOS.
 */
export function playAssistantCue(kind = 'listen') {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const prefs = getAccessibilityPrefs();
    const vol = Math.max(0.08, Math.min(0.45, (Number(prefs.speechVolume ?? 90) / 100) * 0.32));

    const playTone = (freq, startOffset, durationSec, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + durationSec + 0.02);
    };

    if (kind === 'listen') {
      playTone(720, 0, 0.11, 'sine');
      playTone(960, 0.09, 0.11, 'sine');
    } else if (kind === 'cancel') {
      playTone(540, 0, 0.09, 'triangle');
      playTone(380, 0.08, 0.12, 'triangle');
    } else if (kind === 'turn') {
      playTone(660, 0, 0.08, 'sine');
    } else if (kind === 'confirm') {
      playTone(587, 0, 0.08, 'sine');
      playTone(880, 0.09, 0.12, 'sine');
    } else if (kind === 'sos') {
      playTone(880, 0, 0.16, 'square');
      playTone(660, 0.18, 0.16, 'square');
      playTone(880, 0.36, 0.18, 'square');
    } else if (kind === 'error') {
      playTone(300, 0, 0.14, 'sawtooth');
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Graceful no-op before user gesture
  }
}

export { triggerHaptic, triggerHapticDetailed, HAPTIC_PATTERNS };

/**
 * Default Browser SpeechSynthesis TTS adapter implementing TTS interface.
 */
export const BrowserSpeechTtsAdapter = {
  id: 'browser_speech_synthesis',
  isSupported: () =>
    typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined'),
  cancel: () => {
    stopBackendNeuralTts();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  },
  speak: (text, options = {}) => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !text) {
        resolve(false);
        return;
      }
      const prefs = getAccessibilityPrefs();
      const rate = options.rate ?? Number(prefs.speechRate ?? 1.0);
      const pitch = options.pitch ?? Number(prefs.speechPitch ?? 1.0);
      const volume =
        options.volume ?? Math.max(0.1, Math.min(1.0, Number(prefs.speechVolume ?? 90) / 100));
      const lang = options.lang ?? (prefs.audioLanguage || DEFAULT_VOICE_LANGUAGE);
      const interrupt = options.interrupt ?? true;

      if (interrupt) {
        stopBackendNeuralTts();
        if ('speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            // ignore
          }
        }
      }

      primeSharedAudioContext();
      const chosenVoice = pickVoiceForLang(lang);
      const isIndicOrNonEnglish =
        !String(lang).toLowerCase().startsWith('en') || /[\u0900-\u0CFF]/.test(String(text));

      const speakViaWebSpeech = () => {
        if (!('speechSynthesis' in window)) {
          resolve(false);
          return;
        }
        try {
          const utterance = new SpeechSynthesisUtterance(String(text));
          utterance.rate = rate;
          utterance.pitch = pitch;
          utterance.volume = volume;
          utterance.lang = lang;
          if (chosenVoice) {
            utterance.voice = chosenVoice;
          }

          let settled = false;
          const done = (ok) => {
            if (settled) return;
            settled = true;
            resolve(ok);
          };
          utterance.onend = () => done(true);
          utterance.onerror = () => {
            if (isIndicOrNonEnglish) {
              playBackendNeuralTts(text, { lang, rate, volume }).then((played) => done(played));
            } else {
              done(false);
            }
          };

          // Safety fallback in case mobile browser misses onend
          const estMs = Math.max(1800, Math.min(14000, String(text).length * 75));
          setTimeout(() => done(true), estMs);

          window.speechSynthesis.speak(utterance);
        } catch {
          resolve(false);
        }
      };

      // For Indian languages (Kannada, Hindi, Tamil, Telugu), always prioritize natural neural TTS
      if (isIndicOrNonEnglish) {
        playBackendNeuralTts(text, { lang, rate, volume }).then((played) => {
          if (played) {
            resolve(true);
          } else {
            speakViaWebSpeech();
          }
        });
        return;
      }

      speakViaWebSpeech();
    });
  },
};

/**
 * Optional Cloud STT/TTS Adapter (disabled by default via VITE_CLOUD_STT_ENABLED / VITE_CLOUD_TTS_ENABLED).
 */
export const CloudSpeechAdapter = {
  id: 'cloud_speech_adapter',
  sttEnabled: CLOUD_STT_ENABLED,
  ttsEnabled: CLOUD_TTS_ENABLED,
  async synthesize(text, options = {}) {
    if (!this.ttsEnabled) {
      return { handled: false, reason: 'Cloud TTS adapter disabled by default' };
    }
    const resp = await fetch('/api/assistant/cloud-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode: 'tts', text, lang: options.lang || DEFAULT_VOICE_LANGUAGE }),
    });
    if (!resp.ok) return { handled: false };
    const data = await resp.json();
    return { handled: Boolean(data?.enabled), data };
  },
};

export function createBrowserSttController({
  lang = DEFAULT_VOICE_LANGUAGE,
  silenceTimeoutMs = 5000,
  onStart,
  onInterim,
  onFinal,
  onSilenceTimeout,
  onError,
  onEnd,
  onMicLevel,
} = {}) {
  const SpeechRec =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  let recognition = null;
  let audioCtx = null;
  let stream = null;
  let rafId = null;
  let silenceTimer = null;
  let speechDebounceTimer = null;
  let stoppedManually = false;
  let gotFinalResult = false;
  let latestText = '';

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const clearSpeechDebounceTimer = () => {
    if (speechDebounceTimer) {
      clearTimeout(speechDebounceTimer);
      speechDebounceTimer = null;
    }
  };

  const finalizeIfReady = () => {
    clearSpeechDebounceTimer();
    clearSilenceTimer();
    if (gotFinalResult || stoppedManually) return;
    const textOut = latestText.trim();
    if (textOut) {
      gotFinalResult = true;
      stop();
      onFinal?.(textOut);
    }
  };

  const armSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (gotFinalResult || stoppedManually) return;
      if (latestText.trim()) {
        gotFinalResult = true;
        const textOut = latestText.trim();
        stop();
        onFinal?.(textOut);
      } else {
        stop();
        onSilenceTimeout?.();
      }
    }, silenceTimeoutMs);
  };

  const stopMeter = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      stream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    onMicLevel?.(0);
  };

  const startMeter = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i];
        const avg = sum / (buf.length * 255);
        onMicLevel?.(Math.min(1, avg * 2.8));
        rafId = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Soft fallback: voice orb uses calm pulse without analyser
    }
  };

  const start = (overrideLang) => {
    if (!SpeechRec) {
      onError?.('unsupported', 'Web Speech Recognition is unavailable in this browser.');
      return false;
    }

    stoppedManually = false;
    gotFinalResult = false;
    latestText = '';
    clearSilenceTimer();
    clearSpeechDebounceTimer();

    try {
      recognition?.abort();
    } catch {
      // ignore
    }

    recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = overrideLang || lang;

    recognition.onstart = () => {
      onStart?.();
      startMeter();
      armSilenceTimer();
    };

    recognition.onresult = (event) => {
      let accumulatedFinal = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const item = event.results[i];
        if (item.isFinal) {
          accumulatedFinal += item[0].transcript + ' ';
        } else {
          interim += item[0].transcript;
        }
      }
      const clean = (accumulatedFinal + interim).trim();
      if (clean) {
        latestText = clean;
        armSilenceTimer();
        onInterim?.(clean);

        // Allow user to finish speaking full sentences without premature cutoff
        clearSpeechDebounceTimer();
        speechDebounceTimer = setTimeout(() => {
          finalizeIfReady();
        }, 1250);
      }
    };

    recognition.onerror = (ev) => {
      clearSilenceTimer();
      clearSpeechDebounceTimer();
      if (stoppedManually || ev.error === 'aborted') return;
      onError?.(ev.error, ev.message || ev.error);
    };

    recognition.onend = () => {
      clearSilenceTimer();
      clearSpeechDebounceTimer();
      stopMeter();
      if (!stoppedManually && !gotFinalResult && latestText.trim()) {
        gotFinalResult = true;
        onFinal?.(latestText.trim());
      }
      onEnd?.({ hadFinal: gotFinalResult, stoppedManually });
    };

    try {
      recognition.start();
      return true;
    } catch (err) {
      clearSilenceTimer();
      clearSpeechDebounceTimer();
      stopMeter();
      onError?.('start_failed', err?.message || 'Could not start speech recognition.');
      return false;
    }
  };

  const stop = ({ abort = false } = {}) => {
    stoppedManually = true;
    clearSilenceTimer();
    clearSpeechDebounceTimer();
    try {
      if (abort) recognition?.abort();
      else recognition?.stop();
    } catch {
      // ignore
    }
    stopMeter();
  };

  return {
    isSupported: Boolean(SpeechRec),
    start,
    stop,
  };
}

