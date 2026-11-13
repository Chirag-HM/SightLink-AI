import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import useWebSocket from '../hooks/useWebSocket';
import { getAccessibilityPrefs, saveAccessibilityPrefs } from '../hooks/useVoiceAssistant';
import {
  assistantService,
  assistanceService,
  busUnifiedService,
  familyService,
  hardwareButtonService,
  safetyApiService,
  visionService,
  ultrasonicService,
} from '../services/api';
import { sosSiren } from '../utils/sosSound';
import { INTENTS, parseIntent, resolveIntentWithFallback } from './intentEngine';
import {
  BrowserSpeechTtsAdapter,
  CloudSpeechAdapter,
  DEFAULT_VOICE_LANGUAGE,
  VOICE_LANGUAGES,
  createBrowserSttController,
  playAssistantCue,
  triggerHaptic,
} from './speechAdapters';
import {
  geocodeDestination,
  fetchWalkingRoute,
  reverseGeocodeLocation,
  evaluateNavProgress,
  formatDistanceMeters,
} from './navEngine';
import {
  getOfflineQueue,
  enqueueOfflineAction,
  clearOfflineQueue,
  flushOfflineQueue,
} from './offlineQueue';
import { dispatchIntent } from './handlers';
import { buildSosPayloadAndFallbacks } from './handlers/sosHandler';
import { assistantMsg } from './i18n';

const AssistantContext = createContext(null);

const CLIENT_ID_KEY = 'sightlink_assistant_client_id';
const COMMAND_LOG_KEY = 'sightlink_assistant_command_log';

function getOrCreateClientId() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      let cid = window.localStorage.getItem(CLIENT_ID_KEY);
      if (!cid) {
        cid = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        window.localStorage.setItem(CLIENT_ID_KEY, cid);
      }
      return cid;
    }
  } catch {
    // ignore
  }
  return 'web-default';
}

function loadLocalCommandLog() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(COMMAND_LOG_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // ignore
  }
  return [];
}

function saveLocalCommandLog(entries) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(COMMAND_LOG_KEY, JSON.stringify(entries.slice(0, 100)));
    }
  } catch {
    // ignore
  }
}

export function AssistantProvider({ children }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const handleButtonActionRef = useRef(null);
  const onStickButton = useCallback((act, opts) => {
    handleButtonActionRef.current?.(act, opts);
  }, []);
  const { location: stickGps } = useStickGps({ onButtonPress: onStickButton });
  const clientId = useMemo(() => getOrCreateClientId(), []);

  // Core assistant status: 'Idle' | 'Listening' | 'Thinking' | 'Acting'
  const [assistantState, setAssistantState] = useState('Idle');
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [language, setLanguageState] = useState(
    () => getAccessibilityPrefs().audioLanguage || DEFAULT_VOICE_LANGUAGE
  );
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastHeard, setLastHeard] = useState('');
  const [lastSpoken, setLastSpoken] = useState('');
  const [lastIntent, setLastIntent] = useState('');
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  const [isOnline, setIsOnline] = useState(
    () => (typeof navigator !== 'undefined' ? navigator.onLine !== false : true)
  );
  const [offlineOutbox, setOfflineOutbox] = useState(() => getOfflineQueue());
  const [drawerOpen, setDrawerOpen] = useState(false);

  // SOS Countdown & Fallbacks
  const [sosCountdown, setSosCountdown] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [sosFallbacks, setSosFallbacks] = useState(null);

  // Pending confirmations (navigation disambiguation or bus no-data follow-up)
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  // Bus result snapshot
  const [busResult, setBusResult] = useState(null);

  // Navigation live session
  const [navigation, setNavigation] = useState({
    active: false,
    arrived: false,
    origin: null,
    destination: null,
    steps: [],
    polyline: [],
    currentStepIndex: 0,
    distanceMeters: 0,
    durationSec: 0,
    distanceRemainingM: 0,
    distanceToNextTurnM: null,
    rerouteCount: 0,
    provider: '',
    fallback: false,
    familyShared: false,
    userPosition: null,
    notice: '',
  });

  // Command logs & backend hardware status
  const [commandLog, setCommandLog] = useState(() => loadLocalCommandLog());
  const [hardwareConnected, setHardwareConnected] = useState(false);
  const [hardwareDevices, setHardwareDevices] = useState([]);
  const [configInfo, setConfigInfo] = useState(null);

  // Refs for latest synchronous access in async callbacks & WS handlers
  const stateRef = useRef({});
  const failureCountRef = useRef(0);
  const sosTimerRef = useRef(null);
  const sttRef = useRef(null);
  const seenHwEventsRef = useRef(new Set());
  const spokenApproachesRef = useRef(new Set());
  const lastRerouteAtRef = useRef(0);
  const lastObstacleHapticAtRef = useRef(0);
  const navWatchIdRef = useRef(null);

  stateRef.current = {
    user,
    assistantState,
    micActive,
    language,
    lastSpoken,
    isOnline,
    sosCountdown,
    sosActive,
    pendingConfirmation,
    navigation,
    stickGps,
  };

  const announce = useCallback((msg) => {
    setAriaAnnouncement('');
    setTimeout(() => setAriaAnnouncement(msg), 20);
  }, []);

  const speak = useCallback(
    (text, opts = {}) => {
      if (!text) return Promise.resolve(false);
      const str = String(text);
      setLastSpoken(str);
      announce(str);
      if (CloudSpeechAdapter.ttsEnabled) {
        CloudSpeechAdapter.synthesize(str, { lang: opts.lang || stateRef.current.language }).catch(() => {});
      }
      return BrowserSpeechTtsAdapter.speak(str, {
        lang: opts.lang || stateRef.current.language,
        ...opts,
      });
    },
    [announce]
  );

  const silenceSpeech = useCallback(() => {
    BrowserSpeechTtsAdapter.cancel();
    setAssistantState('Idle');
  }, []);

  const setLanguage = useCallback(
    (nextLang, { silent = false } = {}) => {
      setLanguageState(nextLang);
      saveAccessibilityPrefs({ audioLanguage: nextLang });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sightlink:prefs-updated', { detail: { audioLanguage: nextLang } }));
      }
      const match = VOICE_LANGUAGES.find((l) => l.id === nextLang);
      if (match && !silent) {
        triggerHaptic('tap');
        speak(assistantMsg(nextLang, 'language_switched', { name: match.name }), { lang: nextLang });
      }
    },
    [speak]
  );

  const appendLog = useCallback(
    ({ transcript, intent, result, status = 'executed', source = 'voice' }) => {
      const entry = {
        id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toISOString(),
        transcript: String(transcript || ''),
        intent: String(intent || INTENTS.UNKNOWN),
        result: String(result || ''),
        status,
        source,
      };
      setCommandLog((prev) => {
        const next = [entry, ...prev].slice(0, 100);
        saveLocalCommandLog(next);
        return next;
      });
      if (stateRef.current.isOnline) {
        assistantService
          .addLog({
            client_id: clientId,
            transcript: entry.transcript || '(button)',
            intent: entry.intent,
            result: entry.result,
            status: entry.status,
            source: entry.source,
          })
          .catch(() => {
            // Optional server persistence
          });
      }
    },
    [clientId]
  );

  const deleteHistory = useCallback(async () => {
    setCommandLog([]);
    saveLocalCommandLog([]);
    if (stateRef.current.isOnline) {
      try {
        await assistantService.clearLogs(clientId);
      } catch {
        // Local wipe always succeeds
      }
    }
    triggerHaptic('tap');
    speak(assistantMsg(stateRef.current.language, 'history_cleared'));
  }, [clientId, speak]);

  const clearOfflineOutbox = useCallback(() => {
    clearOfflineQueue();
    setOfflineOutbox([]);
  }, []);

  const enqueueOffline = useCallback((action) => {
    const item = enqueueOfflineAction(action);
    setOfflineOutbox(getOfflineQueue());
    return item;
  }, []);

  const resolveBestGps = useCallback(() => {
    const sg = stateRef.current.stickGps;
    if (sg?.fix && Number.isFinite(sg.latitude) && Number.isFinite(sg.longitude)) {
      return Promise.resolve({
        latitude: Number(sg.latitude),
        longitude: Number(sg.longitude),
        source: 'Smart Stick GPS',
        ok: true,
      });
    }
    return new Promise((resolve) => {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              source: 'Browser GPS',
              ok: true,
            }),
          () =>
            resolve({
              latitude: 12.9778,
              longitude: 77.5713,
              source: 'Fallback Reference',
              ok: false,
            }),
          { enableHighAccuracy: true, timeout: 4500, maximumAge: 5000 }
        );
      } else {
        resolve({
          latitude: 12.9778,
          longitude: 77.5713,
          source: 'Fallback Reference',
          ok: false,
        });
      }
    });
  }, []);

  // ── SOS Dispatch & Countdown ───────────────────────────────────────────────
  const cancelSosCountdown = useCallback(() => {
    if (sosTimerRef.current) {
      clearInterval(sosTimerRef.current);
      sosTimerRef.current = null;
    }
    setSosCountdown(null);
    setAssistantState('Idle');
  }, []);

  const stopSosAlert = useCallback(async () => {
    cancelSosCountdown();
    setSosActive(false);
    sosSiren.stopSiren();
    triggerHaptic('cancel');
    if (stateRef.current.isOnline && stateRef.current.user?.role === 'blind_user') {
      try {
        await safetyApiService.resolveSos();
      } catch {
        // ignore
      }
    }
    speak(assistantMsg(stateRef.current.language, 'sos_resolved'));
  }, [cancelSosCountdown, speak]);

  const fireSosNow = useCallback(
    async (source = 'voice_assistant', langOverride = null) => {
      const activeLang = langOverride || stateRef.current.language || 'en-IN';
      cancelSosCountdown();
      setSosActive(true);
      try {
        sosSiren.startSiren(0.32);
      } catch {
        // ignore audio context blocks
      }
      triggerHaptic('sos');

      let batteryLevel = null;
      try {
        if (navigator.getBattery) {
          const bat = await navigator.getBattery();
          batteryLevel = Math.round((bat.level || 0) * 100);
        }
      } catch {
        // optional
      }

      const coords = await resolveBestGps();
      const { apiPayload, fallbacks } = buildSosPayloadAndFallbacks(coords, source, batteryLevel);
      setSosFallbacks(fallbacks);

      if (!stateRef.current.isOnline) {
        enqueueOffline({
          kind: 'sos',
          label: `Emergency SOS (${source})`,
          payload: apiPayload,
        });
        const spoken = assistantMsg(activeLang, 'sos_offline');
        speak(spoken, { lang: activeLang });
        return { queued: true, spoken, fallbacks };
      }

      try {
        if (stateRef.current.user?.role === 'blind_user') {
          const res = await safetyApiService.triggerSos(apiPayload);
          const merged = { ...fallbacks, ...res };
          setSosFallbacks(merged);
          const spoken = assistantMsg(activeLang, 'sos_triggered');
          speak(spoken, { lang: activeLang });
          return { queued: false, spoken, fallbacks: merged };
        }
        const spoken = assistantMsg(activeLang, 'sos_siren_guest');
        speak(spoken, { lang: activeLang });
        return { queued: false, spoken, fallbacks };
      } catch (err) {
        if (!stateRef.current.isOnline || Number(err?.status || 0) === 0 || Number(err?.status) >= 500) {
          enqueueOffline({
            kind: 'sos',
            label: `Emergency SOS (${source})`,
            payload: apiPayload,
          });
          const spoken = assistantMsg(activeLang, 'sos_queued_network');
          speak(spoken, { lang: activeLang });
          return { queued: true, spoken, fallbacks };
        }
        const spoken = err?.message || assistantMsg(activeLang, 'sos_siren_guest');
        speak(spoken, { lang: activeLang });
        return { queued: false, spoken, fallbacks };
      }
    },
    [cancelSosCountdown, resolveBestGps, enqueueOffline, speak]
  );

  const startSosCountdown = useCallback(
    (seconds = 5, source = 'voice_assistant', initialPrompt = null, langOverride = null) => {
      const activeLang = langOverride || stateRef.current.language || 'en-IN';
      cancelSosCountdown();
      setSosCountdown(seconds);
      speak(initialPrompt || assistantMsg(activeLang, 'sos_countdown'), { lang: activeLang });

      let remaining = seconds;
      sosTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(sosTimerRef.current);
          sosTimerRef.current = null;
          setSosCountdown(null);
          fireSosNow(source, activeLang);
        } else {
          setSosCountdown(remaining);
        }
      }, 1000);
    },
    [cancelSosCountdown, speak, fireSosNow]
  );

  // ── Live Navigation Tracking & Rerouting ───────────────────────────────────
  const stopNavGeoWatch = useCallback(() => {
    if (navWatchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(navWatchIdRef.current);
      } catch {
        // ignore
      }
      navWatchIdRef.current = null;
    }
  }, []);

  const stopNavigationSession = useCallback(
    async (status = 'cancelled') => {
      stopNavGeoWatch();
      const cur = stateRef.current.navigation;
      if (cur?.destination && stateRef.current.isOnline && stateRef.current.user?.role === 'blind_user') {
        familyService
          .emitNavigationEvent({
            status,
            destination_name: cur.destination.short_name || cur.destination.name,
            destination_lat: cur.destination.latitude,
            destination_lng: cur.destination.longitude,
          })
          .catch(() => {});
      }
      spokenApproachesRef.current = new Set();
      setNavigation((prev) => ({
        ...prev,
        active: false,
        arrived: status === 'arrived',
      }));
    },
    [stopNavGeoWatch]
  );

  const evaluateCoordinateUpdate = useCallback(
    async (lat, lng) => {
      const nav = stateRef.current.navigation;
      if (!nav?.active || !nav.destination) return;
      const activeLang = stateRef.current.language || 'en-IN';

      const evalRes = evaluateNavProgress({
        lat,
        lng,
        destination: nav.destination,
        steps: nav.steps,
        polyline: nav.polyline,
        currentStepIndex: nav.currentStepIndex,
        spokenApproaches: spokenApproachesRef.current,
        lang: activeLang,
      });

      if (evalRes.action === 'arrived') {
        playAssistantCue('confirm');
        triggerHaptic('arrived');
        speak(evalRes.spokenMessage, { lang: activeLang });
        setNavigation((prev) => ({
          ...prev,
          active: false,
          arrived: true,
          currentStepIndex: prev.steps.length - 1,
          distanceRemainingM: 0,
          userPosition: { latitude: lat, longitude: lng },
        }));
        stopNavGeoWatch();
        if (stateRef.current.isOnline && stateRef.current.user?.role === 'blind_user') {
          familyService
            .emitNavigationEvent({
              status: 'arrived',
              destination_name: nav.destination.short_name || nav.destination.name,
              destination_lat: nav.destination.latitude,
              destination_lng: nav.destination.longitude,
              latitude: lat,
              longitude: lng,
            })
            .catch(() => {});
        }
        return;
      }

      if (evalRes.action === 'reroute') {
        const now = Date.now();
        if (now - lastRerouteAtRef.current < 10000) {
          setNavigation((prev) => ({
            ...prev,
            distanceRemainingM: evalRes.distanceRemainingM ?? prev.distanceRemainingM,
            userPosition: { latitude: lat, longitude: lng },
          }));
          return;
        }
        lastRerouteAtRef.current = now;
        playAssistantCue('turn');
        triggerHaptic('reroute');
        speak(evalRes.spokenMessage, { lang: activeLang });
        try {
          const fresh = await fetchWalkingRoute(
            { latitude: lat, longitude: lng },
            { latitude: nav.destination.latitude, longitude: nav.destination.longitude },
            {
              destName: nav.destination.short_name,
              lang: activeLang,
              assistantApi: assistantService,
            }
          );
          spokenApproachesRef.current = new Set();
          setNavigation((prev) => ({
            ...prev,
            steps: fresh.steps,
            polyline: fresh.polyline,
            currentStepIndex: 0,
            distanceMeters: fresh.distanceMeters,
            durationSec: fresh.durationSec,
            distanceRemainingM: fresh.distanceMeters,
            rerouteCount: (prev.rerouteCount || 0) + 1,
            provider: fresh.provider,
            fallback: fresh.fallback,
            userPosition: { latitude: lat, longitude: lng },
            notice: `Rerouted (${evalRes.offRouteDistanceM}m off route)`,
          }));
          if (fresh.steps?.[0]?.spoken) {
            speak(fresh.steps[0].spoken, { lang: activeLang });
          }
          if (stateRef.current.isOnline && stateRef.current.user?.role === 'blind_user') {
            familyService
              .emitNavigationEvent({
                status: 'rerouted',
                destination_name: nav.destination.short_name || nav.destination.name,
                destination_lat: nav.destination.latitude,
                destination_lng: nav.destination.longitude,
                latitude: lat,
                longitude: lng,
                distance_text: formatDistanceMeters(fresh.distanceMeters),
              })
              .catch(() => {});
          }
        } catch {
          // Keep current route if temporary reroute fails
        }
        return;
      }

      if (evalRes.action === 'approach_cue') {
        spokenApproachesRef.current.add(evalRes.cueStepIndex);
        playAssistantCue('turn');
        triggerHaptic('approach');
        speak(evalRes.spokenMessage, { lang: activeLang });
      } else if (evalRes.action === 'advance_step') {
        playAssistantCue('turn');
        triggerHaptic('turn');
        speak(evalRes.spokenMessage, { lang: activeLang });
      }

      setNavigation((prev) => ({
        ...prev,
        currentStepIndex: evalRes.nextStepIndex,
        distanceRemainingM: evalRes.distanceRemainingM ?? prev.distanceRemainingM,
        distanceToNextTurnM: evalRes.distanceToNextTurnM ?? prev.distanceToNextTurnM,
        userPosition: { latitude: lat, longitude: lng },
      }));
    },
    [speak, stopNavGeoWatch]
  );

  const startNavigationSession = useCallback(
    async (routeData) => {
      stopNavGeoWatch();
      spokenApproachesRef.current = new Set();
      lastRerouteAtRef.current = 0;

      let familyShared = false;
      if (stateRef.current.isOnline && stateRef.current.user?.role === 'blind_user') {
        try {
          const famRes = await familyService.emitNavigationEvent({
            status: 'started',
            destination_name: routeData.destination.short_name || routeData.destination.name,
            destination_lat: routeData.destination.latitude,
            destination_lng: routeData.destination.longitude,
            latitude: routeData.origin.latitude,
            longitude: routeData.origin.longitude,
            distance_text: formatDistanceMeters(routeData.distanceMeters),
          });
          familyShared = Boolean(famRes?.shared);
        } catch {
          familyShared = false;
        }
      }

      setNavigation({
        active: true,
        arrived: false,
        origin: routeData.origin,
        destination: routeData.destination,
        steps: routeData.steps || [],
        polyline: routeData.polyline || [],
        currentStepIndex: 0,
        distanceMeters: routeData.distanceMeters || 0,
        durationSec: routeData.durationSec || 0,
        distanceRemainingM: routeData.distanceMeters || 0,
        distanceToNextTurnM: routeData.steps?.[0]?.distanceMeters ?? null,
        rerouteCount: 0,
        provider: routeData.provider || 'osrm',
        fallback: Boolean(routeData.fallback),
        familyShared,
        userPosition: {
          latitude: routeData.origin.latitude,
          longitude: routeData.origin.longitude,
        },
        notice: routeData.fallback
          ? 'Showing offline direct bearing directions; full turn-by-turn street data requires network.'
          : '',
      });

      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navWatchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            evaluateCoordinateUpdate(pos.coords.latitude, pos.coords.longitude);
          },
          () => {
            // Silently tolerate watch glitches; stick GPS or manual step controls remain usable
          },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
      }
    },
    [stopNavGeoWatch, evaluateCoordinateUpdate]
  );

  const selectNavStep = useCallback(
    (idx) => {
      setNavigation((prev) => {
        const clamped = Math.max(0, Math.min((prev.steps?.length || 1) - 1, idx));
        const st = prev.steps?.[clamped];
        triggerHaptic(st?.isDest ? 'arrived' : 'turn');
        if (st?.spoken) {
          speak(st.spoken);
        }
        return {
          ...prev,
          currentStepIndex: clamped,
          userPosition:
            Number.isFinite(st?.latitude) && Number.isFinite(st?.longitude)
              ? { latitude: st.latitude, longitude: st.longitude }
              : prev.userPosition,
        };
      });
    },
    [speak]
  );

  // Also feed Smart Stick GPS & ultrasonic obstacle proximity into active navigation & haptic alerts
  useEffect(() => {
    if (navigation.active && stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
      evaluateCoordinateUpdate(Number(stickGps.latitude), Number(stickGps.longitude));
    }
    const distCm = Number(stickGps?.distance_cm);
    if (Number.isFinite(distCm) && distCm > 0 && distCm < 120) {
      const now = Date.now();
      const cooldown = distCm < 50 ? 2500 : 4000;
      if (now - lastObstacleHapticAtRef.current >= cooldown) {
        lastObstacleHapticAtRef.current = now;
        triggerHaptic(distCm < 50 ? 'obstacle_danger' : 'obstacle_warn');
      }
    }
  }, [navigation.active, stickGps, evaluateCoordinateUpdate]);

  useEffect(() => stopNavGeoWatch, [stopNavGeoWatch]);

  // ── Handler Execution Context ──────────────────────────────────────────────
  const buildHandlerContext = useCallback(
    () => ({
      getState: () => stateRef.current,
      playCue: playAssistantCue,
      vibrate: triggerHaptic,
      services: {
        safetyApiService,
        assistanceService,
        familyService,
        busUnifiedService,
        assistantService,
        visionService,
        ultrasonicService,
        geocodeDestination,
        fetchWalkingRoute,
        reverseGeocodeLocation,
      },
      actions: {
        resolveBestGps,
        navigateTo: (path) => navigate(path),
        speak,
        setLanguage,
        silenceSpeech,
        startSosCountdown,
        cancelSosCountdown,
        fireSosNow,
        startNavigationSession,
        stopNavigationSession,
        setPendingConfirmation,
        setBusResult,
        enqueueOffline,
        setAssistantState,
        stopAllActivity: () => {
          try {
            sttRef.current?.stop({ abort: true });
          } catch {
            // ignore
          }
          setMicActive(false);
          setInterimTranscript('');
          setAssistantState('Idle');
        },
      },
    }),
    [
      resolveBestGps,
      navigate,
      speak,
      setLanguage,
      silenceSpeech,
      startSosCountdown,
      cancelSosCountdown,
      fireSosNow,
      startNavigationSession,
      stopNavigationSession,
      enqueueOffline,
    ]
  );

  const processTranscript = useCallback(
    async (transcript, { source = 'voice' } = {}) => {
      const clean = String(transcript || '').trim();
      if (!clean) return null;

      failureCountRef.current = 0;
      setInterimTranscript('');
      setLastHeard(clean);
      setAssistantState('Thinking');

      try {
        const s = stateRef.current;
        const llmFn = s.isOnline ? (payload) => assistantService.parseWithLlm(payload) : null;
        const parsed = await resolveIntentWithFallback(
          clean,
          {
            language: s.language,
            navigationActive: Boolean(s.navigation?.active),
            pendingConfirmation: s.pendingConfirmation,
            sosCountdownActive: s.sosCountdown != null,
          },
          llmFn
        );

        setLastIntent(parsed.intent);
        setAssistantState('Acting');

        const outcome = await dispatchIntent(parsed, buildHandlerContext(), { source });
        appendLog({
          transcript: clean,
          intent: parsed.intent,
          result: outcome?.spoken || outcome?.status || 'Done',
          status: outcome?.status || 'executed',
          source,
        });
        return outcome;
      } catch (err) {
        const msg = err?.message || 'Unable to process voice command.';
        speak(msg);
        appendLog({
          transcript: clean,
          intent: INTENTS.UNKNOWN,
          result: msg,
          status: 'error',
          source,
        });
        return { intent: INTENTS.UNKNOWN, spoken: msg, status: 'error' };
      } finally {
        setAssistantState((prev) => (prev === 'Acting' || prev === 'Thinking' ? 'Idle' : prev));
      }
    },
    [buildHandlerContext, appendLog, speak]
  );

  // ── Web Speech API Controller w/ 5s silence timeout & 2-failure retry ──────
  const stopListening = useCallback(({ abort = false } = {}) => {
    try {
      sttRef.current?.stop({ abort });
    } catch {
      // ignore
    }
    setMicActive(false);
    setMicLevel(0);
    setInterimTranscript('');
  }, []);

  const handleRecognitionFailure = useCallback(
    (reason = 'silence') => {
      setMicActive(false);
      setMicLevel(0);
      setInterimTranscript('');
      const activeLang = stateRef.current.language || 'en-IN';

      if (reason === 'unsupported' || reason === 'not-allowed' || reason === 'service-not-allowed') {
        failureCountRef.current = 0;
        setAssistantState('Idle');
        triggerHaptic('error');
        const msg = assistantMsg(
          activeLang,
          reason === 'not-allowed' ? 'mic_denied' : 'mic_unavailable'
        );
        speak(msg, { lang: activeLang });
        appendLog({
          transcript: '(microphone unavailable)',
          intent: INTENTS.UNKNOWN,
          result: msg,
          status: 'error',
          source: 'voice',
        });
        return;
      }

      const nextFailures = failureCountRef.current + 1;
      failureCountRef.current = nextFailures;

      if (nextFailures < 2) {
        setAssistantState('Thinking');
        triggerHaptic('tap');
        const retryMsg = assistantMsg(activeLang, 'retry_speech');
        speak(retryMsg, { lang: activeLang }).then(() => {
          // Hands-free second attempt if user didn't cancel in the meantime
          if (stateRef.current.assistantState !== 'Idle' && sttRef.current?.isSupported) {
            setAssistantState('Listening');
            sttRef.current.start(stateRef.current.language);
          }
        });
      } else {
        failureCountRef.current = 0;
        setAssistantState('Idle');
        const giveUpMsg = assistantMsg(activeLang, 'retry_exhausted');
        playAssistantCue('error');
        triggerHaptic('error');
        speak(giveUpMsg, { lang: activeLang });
        appendLog({
          transcript: '(unrecognized speech x2)',
          intent: INTENTS.UNKNOWN,
          result: giveUpMsg,
          status: 'retry_exhausted',
          source: 'voice',
        });
      }
    },
    [speak, appendLog]
  );

  useEffect(() => {
    sttRef.current = createBrowserSttController({
      lang: language,
      silenceTimeoutMs: 5000,
      onStart: () => {
        setMicActive(true);
        setAssistantState('Listening');
      },
      onInterim: (text) => {
        setInterimTranscript(text);
      },
      onFinal: (text) => {
        setMicActive(false);
        setMicLevel(0);
        processTranscript(text, { source: 'voice' });
      },
      onSilenceTimeout: () => {
        handleRecognitionFailure('silence');
      },
      onError: (code) => {
        if (code === 'no-speech' || code === 'nomatch') {
          handleRecognitionFailure(code);
        } else {
          handleRecognitionFailure(code);
        }
      },
      onEnd: () => {
        setMicActive(false);
        setMicLevel(0);
      },
      onMicLevel: (lvl) => {
        setMicLevel(lvl);
      },
    });

    return () => {
      try {
        sttRef.current?.stop({ abort: true });
      } catch {
        // ignore
      }
    };
  }, [language, processTranscript, handleRecognitionFailure]);

  // ── Unified Hardware & On-Screen Button State Machine ─────────────────────
  const handleButtonAction = useCallback(
    async (action = 'single_press', { source = 'button', eventId = null } = {}) => {
      if (eventId) {
        if (seenHwEventsRef.current.has(eventId)) return;
        seenHwEventsRef.current.add(eventId);
        if (seenHwEventsRef.current.size > 80) {
          const first = seenHwEventsRef.current.values().next().value;
          seenHwEventsRef.current.delete(first);
        }
      }

      if (action === 'long_press' || action === 'press_hold_sos') {
        stopListening({ abort: true });
        failureCountRef.current = 0;
        setPendingConfirmation(null);
        setAssistantState('Acting');
        const res = await dispatchIntent(
          parseIntent('emergency sos', { language: stateRef.current.language }),
          buildHandlerContext(),
          { hardwareLongPress: true, source }
        );
        appendLog({
          transcript: '[Hardware 3s Long Press]',
          intent: INTENTS.EMERGENCY_SOS,
          result: res.spoken,
          status: res.status || 'executed',
          source,
        });
        setAssistantState('Idle');
        return;
      }

      const activeLang = stateRef.current.language || 'en-IN';

      if (action === 'bus_assistant' || action === 'bus_press') {
        stopListening({ abort: true });
        failureCountRef.current = 0;
        setPendingConfirmation(null);
        playAssistantCue('listen');
        triggerHaptic('listen');
        setInterimTranscript('');
        setAssistantState('Listening');
        const busPrompt =
          activeLang === 'kn-IN'
            ? 'ಯಾವ ಬಸ್ ಮಾರ್ಗದ ಮಾಹಿತಿ ಬೇಕು?'
            : activeLang === 'hi-IN'
            ? 'कौन सा बस रूट देखना है?'
            : activeLang === 'ta-IN'
            ? 'எந்த பஸ் வழித்தடம் வேண்டும்?'
            : activeLang === 'te-IN'
            ? 'ఏ బస్సు రూట్ సమాచారం కావాలి?'
            : 'Which bus route do you want?';
        announce(busPrompt);
        appendLog({
          transcript: '[Hardware Bus Button D5]',
          intent: INTENTS.BUS_INFO,
          result: busPrompt,
          status: 'listening',
          source,
        });
        await speak(busPrompt, { interrupt: true, lang: activeLang });
        if (stateRef.current.assistantState === 'Listening' && sttRef.current?.isSupported) {
          sttRef.current.start(stateRef.current.language);
        }
        return;
      }

      if (action === 'cancel') {
        stopListening({ abort: true });
        failureCountRef.current = 0;
        if (stateRef.current.sosCountdown != null) {
          cancelSosCountdown();
          playAssistantCue('cancel');
          triggerHaptic('cancel');
          const msg = assistantMsg(activeLang, 'sos_cancelled');
          speak(msg, { lang: activeLang });
          appendLog({
            transcript: '[Button Cancel]',
            intent: INTENTS.CANCEL,
            result: msg,
            status: 'sos_cancelled',
            source,
          });
          return;
        }
        setPendingConfirmation(null);
        setAssistantState('Idle');
        playAssistantCue('cancel');
        triggerHaptic('cancel');
        speak(assistantMsg(activeLang, 'cancelled'), { lang: activeLang });
        return;
      }

      // Single press behavior:
      // - If SOS countdown active -> cancel SOS!
      // - If currently Listening / Thinking / Acting -> press again = cancel!
      // - If Idle -> beep, vibrate, speak "Listening", open SpeechRecognition!
      if (stateRef.current.sosCountdown != null) {
        cancelSosCountdown();
        playAssistantCue('cancel');
        triggerHaptic('cancel');
        const msg = assistantMsg(activeLang, 'sos_cancelled');
        speak(msg, { lang: activeLang });
        appendLog({
          transcript: '[Button Press Cancel SOS]',
          intent: INTENTS.CANCEL,
          result: msg,
          status: 'sos_cancelled',
          source,
        });
        return;
      }

      if (stateRef.current.micActive || stateRef.current.assistantState === 'Listening') {
        stopListening({ abort: true });
        failureCountRef.current = 0;
        setAssistantState('Idle');
        playAssistantCue('cancel');
        triggerHaptic('cancel');
        speak(assistantMsg(activeLang, 'cancelled'), { lang: activeLang });
        appendLog({
          transcript: '[Button Press Cancel]',
          intent: INTENTS.CANCEL,
          result: assistantMsg(activeLang, 'listening_cancelled'),
          status: 'cancelled',
          source,
        });
        return;
      }

      // Idle -> start listening
      failureCountRef.current = 0;
      playAssistantCue('listen');
      triggerHaptic('listen');
      setInterimTranscript('');
      setAssistantState('Listening');
      announce('Microphone on. Listening.');

      if (!sttRef.current?.isSupported) {
        setDrawerOpen(true);
        handleRecognitionFailure('unsupported');
        return;
      }

      // Speak short "Listening" cue, then start mic cleanly so speaker echo doesn't trigger STT
      await speak(assistantMsg(activeLang, 'listening'), { interrupt: true, lang: activeLang });
      if (stateRef.current.assistantState === 'Listening') {
        sttRef.current.start(stateRef.current.language);
      }
    },
    [
      stopListening,
      buildHandlerContext,
      appendLog,
      cancelSosCountdown,
      speak,
      announce,
      handleRecognitionFailure,
    ]
  );
  handleButtonActionRef.current = handleButtonAction;

  // Keyboard Space/Enter trigger helper for Accessibility controls
  const triggerTalkButton = useCallback(() => {
    handleButtonAction('single_press', { source: 'ui_button' });
  }, [handleButtonAction]);

  const simulateHardwarePress = useCallback(
    async (action = 'single_press') => {
      try {
        await hardwareButtonService.triggerButtonEvent({
          action,
          device_id: 'web-simulator',
          source: 'ui_simulator',
          client_id: clientId,
          user_id: stateRef.current.user?.id || null,
        });
      } catch {
        // Offline or backend unavailable: trigger locally directly
        handleButtonAction(action, { source: 'ui_simulator_local' });
      }
    },
    [clientId, handleButtonAction]
  );

  // ── WebSocket Subscription for Physical ESP32 Hardware Button ─────────────
  const handleWsEvent = useCallback(
    (msg) => {
      if (!msg?.type) return;
      if (msg.type === 'HARDWARE_BUTTON_EVENT') {
        handleButtonAction(msg.action || 'single_press', {
          source: msg.source || 'esp32_hardware',
          eventId: msg.event_id,
        });
        setHardwareConnected(true);
      }
    },
    [handleButtonAction]
  );

  useWebSocket(`/ws/assistant/${encodeURIComponent(clientId)}${user?.id ? `?user_id=${encodeURIComponent(user.id)}` : ''}`, {
    enabled: Boolean(isOnline),
    onMessage: handleWsEvent,
  });

  // Also subscribe on main user WS when logged in
  useWebSocket(
    user?.id && user?.role ? `/ws/${encodeURIComponent(user.id)}/${encodeURIComponent(user.role)}` : null,
    {
      enabled: Boolean(isOnline && user?.id && user?.role),
      onMessage: handleWsEvent,
    }
  );

  // Poll hardware status & config cleanly on mount/periodic refresh
  useEffect(() => {
    let active = true;
    const syncMeta = async () => {
      if (!stateRef.current.isOnline) return;
      const [hw, cfg] = await Promise.all([
        hardwareButtonService.getStatus().catch(() => null),
        assistantService.getConfig().catch(() => null),
      ]);
      if (!active) return;
      if (hw) {
        setHardwareConnected(Boolean(hw.connected));
        setHardwareDevices(Array.isArray(hw.devices) ? hw.devices : []);
      }
      if (cfg) {
        setConfigInfo(cfg);
      }
    };
    syncMeta();
    const timer = setInterval(syncMeta, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Load persisted logs if online when user/client changes
  useEffect(() => {
    if (!isOnline) return;
    assistantService
      .getLogs(clientId)
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          const normalized = rows.map((r) => ({
            id: r.id,
            time: r.created_at,
            transcript: r.transcript,
            intent: r.intent,
            result: r.result,
            status: r.status,
            source: r.source,
          }));
          setCommandLog((prev) => {
            const seen = new Set(normalized.map((n) => `${n.transcript}|${n.intent}|${n.time}`));
            const merged = [
              ...normalized,
              ...prev.filter((p) => !seen.has(`${p.transcript}|${p.intent}|${p.time}`)),
            ].slice(0, 100);
            saveLocalCommandLog(merged);
            return merged;
          });
        }
      })
      .catch(() => {
        // Ignore if DB unavailable
      });
  }, [clientId, user?.id, isOnline]);

  // Online / Offline Connectivity & Auto-Flush Offline Queue
  const flushQueuedActions = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    const pending = getOfflineQueue();
    if (pending.length === 0) return null;

    const summary = await flushOfflineQueue({
      sos: (payload) => safetyApiService.triggerSos(payload),
      volunteer: (payload) => assistanceService.createRequest(payload),
      family_checkin: (payload) => familyService.sendCheckInAlert(payload),
    });
    setOfflineOutbox(getOfflineQueue());
    if (summary.flushedCount > 0) {
      triggerHaptic('confirm');
      speak(assistantMsg(stateRef.current.language, 'offline_flushed', { count: summary.flushedCount }));
    }
    return summary;
  }, [speak]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      flushQueuedActions();
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    const onPrefsSync = () => {
      const next = getAccessibilityPrefs().audioLanguage || DEFAULT_VOICE_LANGUAGE;
      setLanguageState(next);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('sightlink:prefs-updated', onPrefsSync);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('sightlink:prefs-updated', onPrefsSync);
    };
  }, [flushQueuedActions]);

  // Flush offline queue once user signs in while online
  useEffect(() => {
    if (isOnline && user?.role === 'blind_user') {
      flushQueuedActions();
    }
  }, [isOnline, user?.role, flushQueuedActions]);

  const value = {
    clientId,
    assistantState,
    micActive,
    micLevel,
    sttSupported: Boolean(sttRef.current?.isSupported ?? (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition))),
    language,
    languages: VOICE_LANGUAGES,
    setLanguage,
    interimTranscript,
    lastHeard,
    lastSpoken,
    lastIntent,
    ariaAnnouncement,
    isOnline,
    offlineOutbox,
    offlineOutboxCount: offlineOutbox.length,
    drawerOpen,
    setDrawerOpen,
    sosCountdown,
    sosActive,
    sosFallbacks,
    pendingConfirmation,
    setPendingConfirmation,
    busResult,
    navigation,
    commandLog,
    hardwareConnected,
    hardwareDevices,
    configInfo,
    // Actions
    triggerTalkButton,
    handleButtonAction,
    simulateHardwarePress,
    processTranscript,
    speak,
    silenceSpeech,
    cancelSosCountdown,
    stopSosAlert,
    fireSosNow,
    startNavigationSession,
    stopNavigationSession,
    selectNavStep,
    evaluateCoordinateUpdate,
    flushQueuedActions,
    clearOfflineOutbox,
    deleteHistory,
    vibrate: triggerHaptic,
  };

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error('useAssistant must be used inside <AssistantProvider>');
  }
  return ctx;
}

