import { useState, useRef, useEffect, useCallback } from 'react';
import { normalizeDigits } from '../assistant/i18n';

export const HELP_TRIGGER_PHRASES = [
  'i need assistance',
  'help me cross the road',
  'help me cross',
  'need help',
  'मुझे मदद चाहिए',
  'सड़क पार करने में मदद',
  'madad chahiye',
  'எனக்கு உதவி வேண்டும்',
  'ரோடு தாண்ட உதவி',
  'udavi venum',
  'నాకు సహాయం కావాలి',
  'రోడ్డు దాటడానికి సహాయం',
  'sahayam kavali',
  'ನನಗೆ ಸಹಾಯ ಬೇಕು',
  'ರಸ್ತೆ ದಾಟಲು ಸಹಾಯ',
  'sahaya beku',
];

export const LIVE_ASSIST_TRIGGER_PHRASES = [
  'show someone my camera',
  'i need eyes',
  'need eyes',
  'show my camera',
  'eyes on demand',
  'कैमरा दिखाओ',
  'मेरा कैमरा दिखाओ',
  'camera dikhao',
  'கேமராவை காட்டு',
  'camera kaattu',
  'కెమెరా చూపించు',
  'camera choopinchu',
  'ಕ್ಯಾಮೆರಾ ತೋರಿಸು',
  'camera torisu',
];

export function parseLiveAssistTrigger(transcript = '') {
  const lower = transcript.trim().toLowerCase();
  if (!lower) return null;
  const matched = LIVE_ASSIST_TRIGGER_PHRASES.some((phrase) => lower.includes(phrase));
  if (!matched) return null;
  return { matched: true, transcript };
}

export function parseLiveAssistCommand(transcript = '') {
  const lower = transcript.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('keep going') || lower.includes('extend') || lower.includes('more time') || lower.includes('जारी रखो') || lower.includes('தொடர்') || lower.includes('కొనసాగించు') || lower.includes('ಮುಂದುವರಿಸು')) {
    return { action: 'extend', extraSeconds: 30 };
  }
  if (lower.includes('send someone') || lower.includes('in person') || lower.includes('need someone here') || lower.includes('किसी को भेजो') || lower.includes('யாரையாவது அனுப்பு') || lower.includes('ఎవరినైనా పంపు') || lower.includes('ಯಾರನ್ನಾದರೂ ಕಳಿಸು')) {
    return { action: 'escalate' };
  }
  if (lower.includes('end camera') || lower.includes('stop camera') || lower.includes('end session') || lower.includes('stop video') || lower.includes('कैमरा बंद') || lower.includes('கேமரா நிறுத்து') || lower.includes('కెమెరా ఆపు') || lower.includes('ಕ್ಯಾಮೆರಾ ನಿಲ್ಲಿಸು')) {
    return { action: 'end' };
  }
  if (lower.includes('confirm camera') || lower.includes('start camera') || lower.includes('yes start') || lower.includes('कैमरा शुरू') || lower.includes('கேமரா தொடங்கு') || lower.includes('కెమెరా ప్రారంభించు') || lower.includes('ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸು')) {
    return { action: 'consent' };
  }
  return null;
}

export function parseFamilyVoiceCommand(transcript = '') {
  const lower = normalizeDigits(transcript).trim().toLowerCase();
  if (!lower) return null;
  if (
    lower.includes('read my sharing') || lower.includes('read sharing') || lower.includes('read settings') || lower.includes('sharing status') ||
    lower.includes('शेयरिंग स्थिति') || lower.includes('पகிர்வு நிலை') || lower.includes('பகிர்வு நிலை') || lower.includes('షేరింగ్ స్థితి') || lower.includes('ಹಂಚಿಕೆ ಸ್ಥಿತಿ')
  ) {
    return { action: 'read_settings' };
  }
  if (
    lower.includes('pause for one hour') || lower.includes('pause sharing for one hour') || lower.includes('pause sharing for an hour') || lower.includes('pause for an hour') || lower.includes('1 hour') ||
    lower.includes('1 घंटे') || lower.includes('एक घंटे') || lower.includes('1 மணி') || lower.includes('1 గంట') || lower.includes('1 ಗಂಟೆ')
  ) {
    return { action: 'pause_1h' };
  }
  if (lower.includes('pause sharing') || lower === 'pause' || lower.includes('शेयरिंग रोको') || lower.includes('பகிர்வை நிறுத்து')) {
    return { action: 'pause' };
  }
  if (lower.includes('resume sharing') || lower.includes('start sharing') || lower.includes('शेयरिंग शुरू') || lower.includes('பகிர்வை தொடங்கு')) {
    return { action: 'resume' };
  }
  if (lower.includes('stop sharing') || lower.includes('शेयरिंग बंद')) {
    return { action: 'stop' };
  }
  if (lower.includes('turn on quiet hours') || lower.includes('enable quiet hours') || lower.includes('quiet hours on')) {
    return { action: 'quiet_on' };
  }
  if (lower.includes('turn off quiet hours') || lower.includes('disable quiet hours') || lower.includes('quiet hours off')) {
    return { action: 'quiet_off' };
  }
  if (lower.includes('turn off live map') || lower.includes('hide live map') || lower.includes('disable live map')) {
    return { action: 'map_off' };
  }
  if (lower.includes('turn on live map') || lower.includes('show live map') || lower.includes('enable live map')) {
    return { action: 'map_on' };
  }
  if (lower.includes('arrival and departure only') || lower.includes('arrivals only')) {
    return { action: 'arrival_only' };
  }
  if (lower.includes('confirm family') || lower.includes('approve family') || lower.includes('confirm invite')) {
    return { action: 'confirm_invite' };
  }
  if (lower.includes('decline family') || lower.includes('reject family')) {
    return { action: 'decline_invite' };
  }
  if (lower.includes('delete my location history') || lower.includes('clear location history')) {
    return { action: 'delete_history' };
  }
  return null;
}

export function parseAssistanceTrigger(transcript = '') {
  const lower = transcript.trim().toLowerCase();
  if (!lower) return null;

  const matched = HELP_TRIGGER_PHRASES.some((phrase) => lower.includes(phrase));
  if (!matched) return null;

  let type = 'other';
  if (
    lower.includes('cross') || lower.includes('road') || lower.includes('street') || lower.includes('zebra') ||
    lower.includes('सड़क') || lower.includes('पार') || lower.includes('ரோடு') || lower.includes('சாலை') || lower.includes('రోడ్డు') || lower.includes('ರಸ್ತೆ')
  ) {
    type = 'crossing road';
  } else if (
    lower.includes('navigate') ||
    lower.includes('navigation') ||
    lower.includes('direction') ||
    lower.includes('bus') ||
    lower.includes('way') ||
    lower.includes('रास्ता') ||
    lower.includes('வழி') ||
    lower.includes('దారి') ||
    lower.includes('ದಾರಿ')
  ) {
    type = 'navigation';
  }

  return { matched: true, type, transcript };
}

export const ACCESSIBILITY_PREFS_KEY = 'sightlink_accessibility_prefs';

export const DEFAULT_ACCESSIBILITY_PREFS = {
  speechRate: 1.0,
  speechPitch: 1.0,
  speechVolume: 90,
  audioLanguage: 'en-IN',
  hapticIntensity: 80,
  hapticEnabled: true,
  hapticDesktopAudioFallback: true,
  hapticCategories: {
    sos: true,
    navigation: true,
    obstacles: true,
    interactions: true,
  },
  screenReaderHints: true,
};

export function getAccessibilityPrefs() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      ...DEFAULT_ACCESSIBILITY_PREFS,
      hapticCategories: { ...DEFAULT_ACCESSIBILITY_PREFS.hapticCategories },
    };
  }
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_PREFS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_ACCESSIBILITY_PREFS,
        hapticCategories: { ...DEFAULT_ACCESSIBILITY_PREFS.hapticCategories },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ACCESSIBILITY_PREFS,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      hapticCategories: {
        ...DEFAULT_ACCESSIBILITY_PREFS.hapticCategories,
        ...(parsed?.hapticCategories && typeof parsed.hapticCategories === 'object'
          ? parsed.hapticCategories
          : {}),
      },
    };
  } catch {
    return {
      ...DEFAULT_ACCESSIBILITY_PREFS,
      hapticCategories: { ...DEFAULT_ACCESSIBILITY_PREFS.hapticCategories },
    };
  }
}

export function saveAccessibilityPrefs(nextPrefs) {
  const cur = getAccessibilityPrefs();
  const merged = {
    ...cur,
    ...(nextPrefs || {}),
    hapticCategories: {
      ...cur.hapticCategories,
      ...(nextPrefs?.hapticCategories && typeof nextPrefs.hapticCategories === 'object'
        ? nextPrefs.hapticCategories
        : {}),
    },
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACCESSIBILITY_PREFS_KEY, JSON.stringify(merged));
    }
  } catch {
    // ignore storage errors
  }
  return merged;
}

let activeNeuralAudio = null;
let activeNeuralUrl = null;
let activeNeuralAbort = null;
let activeNeuralSeq = 0;
let sharedAudioCtx = null;
let activeBufferSource = null;

export function getSharedAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    try {
      sharedAudioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function primeSharedAudioContext() {
  try {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function stopBackendNeuralTts() {
  activeNeuralSeq += 1;
  if (activeNeuralAbort) {
    try {
      activeNeuralAbort.abort();
    } catch {
      // ignore
    }
    activeNeuralAbort = null;
  }
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
      activeBufferSource.disconnect();
    } catch {
      // ignore
    }
    activeBufferSource = null;
  }
  if (activeNeuralAudio) {
    try {
      activeNeuralAudio.pause();
      activeNeuralAudio.src = '';
    } catch {
      // ignore
    }
    activeNeuralAudio = null;
  }
  if (activeNeuralUrl) {
    try {
      URL.revokeObjectURL(activeNeuralUrl);
    } catch {
      // ignore
    }
    activeNeuralUrl = null;
  }
}

export async function playBackendNeuralTts(text, { lang = 'kn-IN', rate = 1.0, volume = 0.9 } = {}) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined' || !text) return false;
  stopBackendNeuralTts();
  const seq = activeNeuralSeq;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  activeNeuralAbort = ctrl;

  try {
    const resp = await fetch('/api/assistant/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: String(text).slice(0, 680),
        lang: String(lang || 'en-IN'),
        rate: Number(rate || 1.0),
      }),
      signal: ctrl?.signal,
    });
    if (!resp.ok || seq !== activeNeuralSeq) return false;

    // Read raw audio buffer for Web Audio API (bypasses browser autoplay restrictions)
    const arrayBuffer = await resp.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0 || seq !== activeNeuralSeq) return false;

    const ctx = getSharedAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      if (ctx.state === 'running') {
        try {
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
          if (seq !== activeNeuralSeq) return false;

          return await new Promise((resolve) => {
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            const targetVol = Math.max(0.05, Math.min(1.0, Number(volume ?? 0.9)));
            gain.gain.setValueAtTime(targetVol, ctx.currentTime);

            source.buffer = audioBuffer;
            source.connect(gain);
            gain.connect(ctx.destination);

            activeBufferSource = source;

            const cleanup = (ok) => {
              if (activeBufferSource === source) {
                activeBufferSource = null;
              }
              resolve(ok);
            };

            source.onended = () => cleanup(true);
            source.start(0);
          });
        } catch {
          // If decoding failed, fall through to HTML5 Audio element below
        }
      }
    }

    // HTML5 Audio fallback
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    activeNeuralUrl = url;
    const audio = new Audio(url);
    audio.volume = Math.max(0.1, Math.min(1.0, Number(volume ?? 0.9)));
    activeNeuralAudio = audio;

    return await new Promise((resolve) => {
      const cleanup = (ok) => {
        if (activeNeuralAudio === audio) activeNeuralAudio = null;
        if (activeNeuralUrl === url) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          activeNeuralUrl = null;
        }
        resolve(ok);
      };
      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => cleanup(false));
      }
    });
  } catch {
    return false;
  }
}

export function pickVoiceForLang(lang = 'en-IN') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices?.() || [];
    if (!voices.length) return null;
    const norm = String(lang || 'en-IN').toLowerCase();
    const prefix = norm.split('-')[0];
    return (
      voices.find((v) => String(v.lang || '').toLowerCase() === norm) ||
      voices.find((v) => String(v.lang || '').toLowerCase().startsWith(`${prefix}-`)) ||
      voices.find((v) => String(v.lang || '').toLowerCase() === prefix) ||
      null
    );
  } catch {
    return null;
  }
}

export function speakText(text, options = {}) {
  if (typeof window === 'undefined' || !text) {
    return;
  }
  const prefs = getAccessibilityPrefs();
  const rate = options.rate ?? Number(prefs.speechRate ?? 1.0);
  const pitch = options.pitch ?? Number(prefs.speechPitch ?? 1.0);
  const volume =
    options.volume ?? Math.max(0.1, Math.min(1.0, Number(prefs.speechVolume ?? 90) / 100));
  const lang = options.lang ?? (prefs.audioLanguage || 'en-IN');
  const interrupt = options.interrupt ?? true;

  if (interrupt) {
    stopBackendNeuralTts();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  }

  const chosenVoice = pickVoiceForLang(lang);
  const needsNeuralFallback =
    !chosenVoice && (!String(lang).toLowerCase().startsWith('en') || /[\u0900-\u0CFF]/.test(String(text)));

  const speakBrowser = () => {
    if (!('speechSynthesis' in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      utterance.lang = lang;
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }
      utterance.onerror = () => {
        if (!String(lang).toLowerCase().startsWith('en') || /[\u0900-\u0CFF]/.test(String(text))) {
          playBackendNeuralTts(text, { lang, rate, volume });
        }
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      // Graceful no-op when browser speechSynthesis blocks autoplay before gesture
    }
  };

  if (needsNeuralFallback) {
    playBackendNeuralTts(text, { lang, rate, volume }).then((played) => {
      if (!played) speakBrowser();
    });
    return;
  }

  speakBrowser();
}

export default function useVoiceAssistant({
  continuous = false,
  lang,
  onTranscript,
  onHelpTrigger,
  onLiveAssistTrigger,
} = {}) {
  const resolvedLang = lang || getAccessibilityPrefs().audioLanguage || 'en-IN';
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [micLevel, setMicLevel] = useState(0);

  const SpeechRec =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const supported = Boolean(SpeechRec);
  const recognitionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const triggeredSessionRef = useRef(false);

  const onTranscriptRef = useRef(onTranscript);
  const onHelpTriggerRef = useRef(onHelpTrigger);
  const onLiveAssistTriggerRef = useRef(onLiveAssistTrigger);
  onTranscriptRef.current = onTranscript;
  onHelpTriggerRef.current = onHelpTrigger;
  onLiveAssistTriggerRef.current = onLiveAssistTrigger;

  const stopAudioMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const startAudioMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i];
        const avg = sum / (buffer.length * 255);
        setMicLevel(Math.min(1, avg * 2.6));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // If user already granted SpeechRecognition or denies WebAudio, ignore softly
    }
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
    stopAudioMeter();
  }, [stopAudioMeter]);

  const startListening = useCallback(() => {
    setError('');
    if (!SpeechRec) {
      setError('Speech Recognition is not supported in this browser. Please use the high-contrast button below.');
      return false;
    }

    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }

    const recognition = new SpeechRec();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = resolvedLang;

    triggeredSessionRef.current = false;

    recognition.onstart = () => {
      triggeredSessionRef.current = false;
      setListening(true);
      startAudioMeter();
    };

    recognition.onresult = (event) => {
      let fullText = '';
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        fullText += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      const clean = fullText.trim();
      setTranscript(clean);
      onTranscriptRef.current?.(clean, { isFinal });

      if (!triggeredSessionRef.current) {
        const liveTrigger = parseLiveAssistTrigger(clean);
        if (liveTrigger) {
          triggeredSessionRef.current = true;
          onLiveAssistTriggerRef.current?.(liveTrigger);
        } else {
          const trigger = parseAssistanceTrigger(clean);
          if (trigger) {
            triggeredSessionRef.current = true;
            onHelpTriggerRef.current?.(trigger);
          }
        }
      }
    };

    recognition.onerror = (ev) => {
      if (ev.error === 'not-allowed') {
        setError('Microphone permission was denied. Enable mic access or use the button.');
      } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        setError(`Voice recognition paused (${ev.error}).`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      stopAudioMeter();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      return true;
    } catch (e) {
      setError(e.message || 'Could not start voice listener.');
      setListening(false);
      return false;
    }
  }, [SpeechRec, continuous, resolvedLang, startAudioMeter, stopAudioMeter]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      stopAudioMeter();
    };
  }, [stopAudioMeter]);

  return {
    supported,
    listening,
    transcript,
    error,
    micLevel,
    startListening,
    stopListening,
    speakText,
  };
}

