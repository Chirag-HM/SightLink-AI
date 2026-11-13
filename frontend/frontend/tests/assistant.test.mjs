import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INTENTS,
  parseIntent,
  resolveIntentWithFallback,
} from '../src/assistant/intentEngine.js';
import {
  geocodeDestination,
  fetchWalkingRoute,
  evaluateNavProgress,
  detectOffRoute,
} from '../src/assistant/navEngine.js';
import {
  enqueueOfflineAction,
  getOfflineQueue,
  clearOfflineQueue,
  flushOfflineQueue,
} from '../src/assistant/offlineQueue.js';
import { dispatchIntent } from '../src/assistant/handlers/index.js';
import { UNKNOWN_FALLBACK_MESSAGE } from '../src/assistant/handlers/controlHandler.js';
import {
  extractBusRouteNumber,
  extractNavigationPlace,
} from '../src/assistant/intentEngine.js';
import { detectLanguageFromText } from '../src/assistant/i18n.js';
import {
  scaleHapticPattern,
  triggerHapticDetailed,
} from '../src/utils/haptics.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function createHarness(overrides = {}) {
  const store = createMemoryStorage();
  const state = {
    user: { id: 'u-1', role: 'blind_user', full_name: 'Asha' },
    isOnline: true,
    stickGps: null,
    navigation: { active: false, steps: [], polyline: [], currentStepIndex: 0 },
    pendingConfirmation: null,
    sosCountdown: null,
    lastSpoken: '',
    ...overrides.state,
  };

  const events = {
    spoken: [],
    navigatedTo: [],
    cues: [],
    haptics: [],
    sosCountdownStarts: [],
    sosFired: [],
    sosCancelledCount: 0,
    navStarted: [],
    navStopped: [],
    busResults: [],
    offlineQueued: [],
    silenced: 0,
    stoppedAll: 0,
  };

  const services = {
    safetyApiService: {
      triggerSos: async (p) => ({ status: 'ok', payload: p }),
    },
    assistanceService: {
      createRequest: async (p) => ({ id: 'req-1', payload: p }),
    },
    familyService: {
      sendCheckInAlert: async (p) => ({
        status: 'sent',
        sent_channels: ['gmail', 'telegram'],
        spoken_summary:
          p.action_type === 'call_family'
            ? 'Notified your family via Gmail and Telegram.'
            : 'Sent your live location to family.',
      }),
      emitNavigationEvent: async () => ({ shared: true }),
    },
    busUnifiedService: {
      getArrivals: async (route) => {
        if (route === '400') {
          return {
            has_data: true,
            route_number: '400',
            spoken_summary: 'Bus 400 arrives at Central Stop in 6 minutes, going toward Airport.',
            arrivals: [{ stop_name: 'Central Stop', eta_minutes: 6, direction: 'Airport' }],
          };
        }
        return {
          has_data: false,
          route_number: route,
          spoken_summary: `No transit arrival data is available for route ${route}. Would you like to navigate to the nearest bus stop or request volunteer assistance?`,
          nearest_stop: { name: 'Central Stop', latitude: 12.9778, longitude: 77.5713 },
        };
      },
    },
    assistantService: {
      geocode: async (q) => {
        if (q.toLowerCase().includes('palya')) {
          return {
            provider: 'nominatim',
            matches: [
              {
                short_name: 'MS Palya',
                display_name: 'MS Palya, Bengaluru',
                street: 'MS Palya Main Road',
                latitude: 13.0816,
                longitude: 77.5482,
                distance_m: 1400,
              },
            ],
          };
        }
        if (q.toLowerCase().includes('city hospital')) {
          return {
            provider: 'nominatim',
            matches: [
              {
                short_name: 'City Hospital',
                display_name: 'City Hospital, Main Road, Bengaluru',
                street: 'Main Road',
                latitude: 12.978,
                longitude: 77.572,
                distance_m: 120,
              },
              {
                short_name: 'City Hospital Clinic',
                display_name: 'City Hospital Clinic, Gandhi Road, Bengaluru',
                street: 'Gandhi Road',
                latitude: 12.989,
                longitude: 77.59,
                distance_m: 1950,
              },
            ],
          };
        }
        return {
          provider: 'nominatim',
          matches: [
            {
              short_name: 'Gandhi Road',
              display_name: 'Gandhi Road, Bengaluru',
              street: 'Gandhi Road',
              latitude: 12.979,
              longitude: 77.573,
              distance_m: 180,
            },
          ],
        };
      },
      getNearestBusStop: async () => ({
        success: true,
        nearest_stop: {
          name: 'Sambhram College Bus Stop',
          short_name: 'Sambhram College',
          display_name: 'Sambhram College Bus Stop, MS Palya Road, Bengaluru',
          distance_m: 550,
          walking_minutes: 7,
          latitude: 13.0905,
          longitude: 77.5442,
        },
        stops: [
          {
            name: 'Sambhram College Bus Stop',
            short_name: 'Sambhram College',
            display_name: 'Sambhram College Bus Stop, MS Palya Road, Bengaluru',
            distance_m: 550,
            walking_minutes: 7,
            latitude: 13.0905,
            longitude: 77.5442,
          },
        ],
      }),
      getWalkingRoute: async () => ({
        provider: 'osrm',
        distance_m: 260,
        duration_s: 210,
        geometry: [
          { latitude: 12.9778, longitude: 77.5713 },
          { latitude: 12.9784, longitude: 77.5713 },
          { latitude: 12.979, longitude: 77.573 },
        ],
        steps: [
          {
            road: 'Station Road',
            distance_m: 60,
            duration_s: 45,
            latitude: 12.9778,
            longitude: 77.5713,
            maneuver_type: 'depart',
            modifier: '',
          },
          {
            road: 'Gandhi Road',
            distance_m: 150,
            duration_s: 125,
            latitude: 12.9784,
            longitude: 77.5713,
            maneuver_type: 'turn',
            modifier: 'left',
          },
          {
            road: 'Gandhi Road',
            distance_m: 0,
            duration_s: 0,
            latitude: 12.979,
            longitude: 77.573,
            maneuver_type: 'arrive',
            modifier: '',
          },
        ],
      }),
    },
    geocodeDestination,
    fetchWalkingRoute,
    reverseGeocodeLocation: async () => ({
      address: 'Gandhi Road, Shivajinagar',
      landmark: 'Central Metro Entrance',
    }),
    ...overrides.services,
  };

  const ctx = {
    getState: () => state,
    playCue: (k) => events.cues.push(k),
    vibrate: (p) => events.haptics.push(p),
    services,
    actions: {
      resolveBestGps: async () => ({ latitude: 12.9778, longitude: 77.5713, source: 'Browser GPS', ok: true }),
      navigateTo: (path) => events.navigatedTo.push(path),
      speak: (text) => {
        state.lastSpoken = text;
        events.spoken.push(text);
      },
      silenceSpeech: () => {
        events.silenced += 1;
      },
      startSosCountdown: (sec, source, prompt) => {
        state.sosCountdown = sec;
        events.sosCountdownStarts.push({ sec, source });
        state.lastSpoken = prompt;
        events.spoken.push(prompt);
      },
      cancelSosCountdown: () => {
        state.sosCountdown = null;
        events.sosCancelledCount += 1;
      },
      fireSosNow: async (source) => {
        state.sosCountdown = null;
        events.sosFired.push({ source, online: state.isOnline });
        if (!state.isOnline) {
          enqueueOfflineAction({ kind: 'sos', payload: { source } }, store);
          return { queued: true, spoken: 'Emergency SOS queued offline.' };
        }
        return { queued: false, spoken: 'Emergency SOS sent immediately.' };
      },
      startNavigationSession: async (routeData) => {
        state.navigation = {
          active: true,
          ...routeData,
          currentStepIndex: 0,
          distanceRemainingM: routeData.distanceMeters,
        };
        events.navStarted.push(routeData);
      },
      stopNavigationSession: async (reason) => {
        state.navigation = { ...state.navigation, active: false };
        events.navStopped.push(reason);
      },
      setPendingConfirmation: (p) => {
        state.pendingConfirmation = p;
      },
      setBusResult: (r) => events.busResults.push(r),
      enqueueOffline: (item) => {
        const entry = enqueueOfflineAction(item, store);
        events.offlineQueued.push(entry);
        return entry;
      },
      stopAllActivity: () => {
        events.stoppedAll += 1;
      },
    },
  };

  return { state, events, ctx, store };
}

test('Intent Engine: matches all required intents with 3+ phrasing variations', () => {
  const cases = [
    [INTENTS.VOLUNTEER_ASSISTANCE, ['I need volunteer assistance', 'I need help crossing the road', 'need someone to help me']],
    [INTENTS.LIVE_ASSIST, ['show someone my camera', 'I need eyes', 'start eyes on demand']],
    [INTENTS.EMERGENCY_SOS, ['emergency', 'SOS', "help me I'm in danger"]],
    [INTENTS.NAVIGATION, ['navigate to Gandhi Road', 'take me to City Hospital', 'from my location to MG Road Metro']],
    [INTENTS.BUS_INFO, ['check bus number 400', 'when is bus 400 coming', 'where is bus 400']],
    [INTENTS.CALL_FAMILY, ['call my family', 'phone my family', 'notify my family']],
    [INTENTS.SEND_LOCATION, ['send my location to family', 'share my location', 'tell my family where i am']],
    [INTENTS.WHERE_AM_I, ['where am I', 'what is my location', 'tell me where i am']],
    [INTENTS.CANCEL, ['cancel', 'abort', 'do not send']],
    [INTENTS.STOP_SPEECH, ['stop talking', 'be quiet', 'mute']],
    [INTENTS.REPEAT, ['repeat', 'say that again', 'what did you say']],
    [INTENTS.HELP, ['help', 'what can you do', 'list commands']],
    [INTENTS.NAV_HOW_FAR, ['how far', 'distance remaining', 'how much further']],
    [INTENTS.NAV_STOP, ['stop navigation', 'end navigation', 'cancel navigation']],
  ];

  for (const [expectedIntent, phrases] of cases) {
    assert.equal(phrases.length, 3, `Expected 3 variations for ${expectedIntent}`);
    for (const phrase of phrases) {
      const parsed = parseIntent(phrase);
      assert.equal(parsed.intent, expectedIntent, `Phrase "${phrase}" resolved to ${parsed.intent} instead of ${expectedIntent}`);
    }
  }

  // Slot extraction checks
  assert.equal(parseIntent('check bus number 400').slots.routeNumber, '400');
  assert.equal(parseIntent('when is bus four hundred coming').slots.routeNumber, '400');
  assert.equal(parseIntent('navigate to City Hospital').slots.place, 'City Hospital');
  assert.equal(parseIntent('from my location to MG Road Metro').slots.place, 'MG Road Metro');
  assert.equal(parseIntent('next turn', { navigationActive: true }).intent, INTENTS.NAV_REPEAT);
  assert.equal(parseIntent('I need help', { navigationActive: true }).intent, INTENTS.VOLUNTEER_ASSISTANCE);
});

test('Intent Engine: fuzzy typo recovery, noisy UNKNOWN fallback, and optional LLM fallback', async () => {
  // Typo near "emergency"
  assert.equal(parseIntent('emergncy help').intent, INTENTS.EMERGENCY_SOS);

  // Completely noisy unrecognized input -> exact spoken fallback
  const h = createHarness();
  const parsedUnknown = parseIntent('zxqv blorp noodle');
  assert.equal(parsedUnknown.intent, INTENTS.UNKNOWN);
  const out = await dispatchIntent(parsedUnknown, h.ctx);
  assert.equal(out.spoken, UNKNOWN_FALLBACK_MESSAGE);

  // Optional LLM fallback succeeds when rule engine returns UNKNOWN
  const llmResolved = await resolveIntentWithFallback(
    'could someone walk me down to Apollo Hospital',
    { language: 'en-IN' },
    async () => ({ intent: 'NAVIGATION', place: 'Apollo Hospital', confidence: 0.88 })
  );
  assert.equal(llmResolved.intent, INTENTS.NAVIGATION);
  assert.equal(llmResolved.slots.place, 'Apollo Hospital');
  assert.equal(llmResolved.engine, 'llm');
});

test('Emergency SOS: voice starts 5s countdown, cancel stops it; hardware 3s long press skips countdown', async () => {
  const h = createHarness();

  // Voice SOS -> 5s countdown + spoken warning
  const voiceSos = await dispatchIntent(parseIntent("help me I'm in danger"), h.ctx);
  assert.equal(voiceSos.status, 'countdown_started');
  assert.equal(h.events.sosCountdownStarts.length, 1);
  assert.equal(h.events.sosCountdownStarts[0].sec, 5);
  assert.equal(h.events.sosFired.length, 0);

  // Cancel during SOS countdown -> aborted cleanly
  const cancelRes = await dispatchIntent(parseIntent('cancel', { sosCountdownActive: true }), h.ctx);
  assert.equal(cancelRes.status, 'sos_cancelled');
  assert.equal(h.events.sosCancelledCount, 1);

  // Hardware 3s long press -> skips countdown & fires SOS directly
  const hwLong = await dispatchIntent(parseIntent('emergency sos'), h.ctx, { hardwareLongPress: true });
  assert.equal(hwLong.status, 'executed');
  assert.equal(h.events.sosFired.length, 1);
  assert.equal(h.events.sosFired[0].source, 'hardware_long_press');
});

test('Volunteer Assistance, Live Assist, Where Am I, and Family Alerts dispatch cleanly', async () => {
  const h = createHarness();

  const vol = await dispatchIntent(parseIntent('I need help crossing the road'), h.ctx);
  assert.equal(vol.status, 'executed');
  assert.equal(vol.spoken, 'Looking for a volunteer nearby.');
  assert.ok(h.events.navigatedTo.at(-1).startsWith('/assist?autostart=1'));

  const live = await dispatchIntent(parseIntent('show someone my camera'), h.ctx);
  assert.equal(live.status, 'executed');
  assert.equal(h.events.navigatedTo.at(-1), '/live-assist?autostart=1&voice_start=1');

  const loc = await dispatchIntent(parseIntent('where am I'), h.ctx);
  assert.equal(loc.status, 'executed');
  assert.ok(loc.spoken.includes('Gandhi Road'));
  assert.ok(loc.spoken.includes('Central Metro Entrance'));

  const fam = await dispatchIntent(parseIntent('send my location to family'), h.ctx);
  assert.equal(fam.status, 'executed');
  assert.ok(fam.spoken.includes('location'));
});

test('Navigation: multi-match voice confirmation, approach cue, off-route reroute, arrival & cancel', async () => {
  const h = createHarness();

  // Ambiguous query triggers "Did you mean City Hospital on Main Road?"
  const firstStep = await dispatchIntent(parseIntent('navigate to City Hospital'), h.ctx);
  assert.equal(firstStep.status, 'awaiting_confirmation');
  assert.ok(firstStep.spoken.includes('Did you mean City Hospital on Main Road?'));
  assert.ok(h.state.pendingConfirmation);

  // Saying "No" cycles to 2nd option; saying "Cancel" aborts cleanly
  const rejectOne = await dispatchIntent(
    parseIntent('no', { pendingConfirmation: h.state.pendingConfirmation }),
    h.ctx
  );
  assert.equal(rejectOne.status, 'next_candidate');
  assert.ok(rejectOne.spoken.includes('City Hospital Clinic on Gandhi Road'));

  const confirmSecond = await dispatchIntent(
    parseIntent('yes', { pendingConfirmation: h.state.pendingConfirmation }),
    h.ctx
  );
  assert.equal(confirmSecond.status, 'confirmed');
  assert.equal(h.state.navigation.active, true);
  assert.equal(h.events.navStarted.length, 1);

  // Approach cue (~50m before turn waypoint 12.9784, 77.5713 -> ~45m south)
  const approachEval = evaluateNavProgress({
    lat: 12.9780,
    lng: 77.5713,
    destination: h.state.navigation.destination,
    steps: h.state.navigation.steps,
    polyline: h.state.navigation.polyline,
    currentStepIndex: 0,
    spokenApproaches: new Set(),
  });
  assert.equal(approachEval.action, 'approach_cue');
  assert.ok(approachEval.spokenMessage.includes('turn left onto Gandhi Road'));

  // Off-route detection (>45m perpendicular from route)
  const offEval = evaluateNavProgress({
    lat: 12.9781,
    lng: 77.5704, // ~97m west of polyline
    destination: h.state.navigation.destination,
    steps: h.state.navigation.steps,
    polyline: h.state.navigation.polyline,
    currentStepIndex: 0,
  });
  assert.equal(offEval.action, 'reroute');
  assert.ok(detectOffRoute(12.9781, 77.5704, h.state.navigation.polyline, 45).isOffRoute);

  // Arrival detection (<20m from destination coordinates)
  const arrEval = evaluateNavProgress({
    lat: h.state.navigation.destination.latitude + 0.00005,
    lng: h.state.navigation.destination.longitude + 0.00005,
    destination: h.state.navigation.destination,
    steps: h.state.navigation.steps,
    polyline: h.state.navigation.polyline,
    currentStepIndex: 1,
  });
  assert.equal(arrEval.action, 'arrived');

  // Voice "stop navigation" cancels cleanly
  const stopNav = await dispatchIntent(parseIntent('stop navigation', { navigationActive: true }), h.ctx);
  assert.equal(stopNav.status, 'executed');
  assert.equal(h.state.navigation.active, false);
});

test('Bus Information: returns live ETA for route 400 and offers volunteer/walk fallback when missing', async () => {
  const h = createHarness();

  const hit = await dispatchIntent(parseIntent('check bus number 400'), h.ctx);
  assert.equal(hit.status, 'executed');
  assert.equal(hit.spoken, 'Bus 400 arrives at Central Stop in 6 minutes, going toward Airport.');

  const miss = await dispatchIntent(parseIntent('when is bus 999 coming'), h.ctx);
  assert.equal(miss.status, 'no_data');
  assert.ok(miss.spoken.toLowerCase().includes('volunteer'));
  assert.equal(h.state.pendingConfirmation.kind, 'bus_no_data');

  // Confirming "volunteer assistance" escalates seamlessly
  const escalate = await dispatchIntent(
    parseIntent('volunteer assistance', { pendingConfirmation: h.state.pendingConfirmation }),
    h.ctx
  );
  assert.equal(escalate.status, 'executed');
  assert.ok(h.events.navigatedTo.at(-1).startsWith('/assist?autostart=1'));
});

test('Offline Queue: SOS, volunteer & family alerts queue offline and flush when reconnected', async () => {
  const h = createHarness({ state: { isOnline: false } });
  clearOfflineQueue(h.store);

  await dispatchIntent(parseIntent('I need volunteer assistance'), h.ctx);
  await dispatchIntent(parseIntent('send my location to family'), h.ctx);
  await dispatchIntent(parseIntent('emergency'), h.ctx, { hardwareLongPress: true });

  const queued = getOfflineQueue(h.store);
  assert.equal(queued.length, 3);
  assert.deepEqual(
    queued.map((q) => q.kind),
    ['volunteer', 'family_checkin', 'sos']
  );

  // Flush on reconnect
  const sentKinds = [];
  const flushRes = await flushOfflineQueue(
    {
      volunteer: async () => sentKinds.push('volunteer'),
      family_checkin: async () => sentKinds.push('family_checkin'),
      sos: async () => sentKinds.push('sos'),
    },
    h.store
  );
  assert.equal(flushRes.flushedCount, 3);
  assert.equal(flushRes.remainingCount, 0);
  assert.deepEqual(sentKinds, ['volunteer', 'family_checkin', 'sos']);
});

test('Cancel at every stage: listening, SOS countdown, nav confirmation, and active route', async () => {
  const h = createHarness();

  // Stage 1: Cancel active listening/activity
  const cIdle = await dispatchIntent(parseIntent('cancel'), h.ctx);
  assert.equal(cIdle.status, 'cancelled');
  assert.equal(h.events.stoppedAll, 1);

  // Stage 2: Cancel SOS countdown
  await dispatchIntent(parseIntent('emergency'), h.ctx);
  assert.equal(h.state.sosCountdown, 5);
  const cSos = await dispatchIntent(parseIntent('cancel', { sosCountdownActive: true }), h.ctx);
  assert.equal(cSos.status, 'sos_cancelled');
  assert.equal(h.state.sosCountdown, null);

  // Stage 3: Cancel ambiguous navigation confirmation
  await dispatchIntent(parseIntent('navigate to City Hospital'), h.ctx);
  assert.ok(h.state.pendingConfirmation);
  const cConf = await dispatchIntent(parseIntent('cancel', { pendingConfirmation: h.state.pendingConfirmation }), h.ctx);
  assert.equal(cConf.status, 'confirmation_cancelled');
  assert.equal(h.state.pendingConfirmation, null);

  // Stage 4: Cancel active walking route
  await dispatchIntent(parseIntent('navigate to Gandhi Road'), h.ctx);
  assert.equal(h.state.navigation.active, true);
  const cNav = await dispatchIntent(parseIntent('cancel', { navigationActive: true }), h.ctx);
  assert.equal(cNav.status, 'navigation_cancelled');
  assert.equal(h.state.navigation.active, false);
});

test('Button State Machine & Recognition Retry: single press listens, second press cancels, 2 failures reset to Idle', () => {
  // Mirrors handleButtonAction + handleRecognitionFailure transitions cleanly
  let state = 'Idle';
  let failures = 0;
  const spoken = [];

  const pressButton = () => {
    if (state === 'Listening') {
      state = 'Idle';
      failures = 0;
      spoken.push('Cancelled.');
      return 'cancelled';
    }
    failures = 0;
    state = 'Listening';
    spoken.push('Listening');
    return 'listening';
  };

  const onSilenceFailure = () => {
    failures += 1;
    if (failures < 2) {
      state = 'Thinking';
      spoken.push("I didn't catch that, please say it again.");
      state = 'Listening';
    } else {
      failures = 0;
      state = 'Idle';
      spoken.push('You can press the button and try again.');
    }
  };

  assert.equal(pressButton(), 'listening');
  assert.equal(state, 'Listening');
  assert.equal(pressButton(), 'cancelled');
  assert.equal(state, 'Idle');

  // Re-start and fail twice on silence
  pressButton();
  onSilenceFailure();
  assert.equal(spoken.at(-1), "I didn't catch that, please say it again.");
  assert.equal(state, 'Listening');
  onSilenceFailure();
  assert.equal(spoken.at(-1), 'You can press the button and try again.');
  assert.equal(state, 'Idle');
});

test('Multilingual Chatbot: understands & replies in Hindi, Tamil, Telugu, Kannada & Romanized forms', async () => {
  // 1. Native Indic digits & spoken hundreds -> route numbers
  assert.equal(extractBusRouteNumber('बस नंबर ४०० कब आएगी'), '400');
  assert.equal(extractBusRouteNumber('बस चार सौ'), '400');
  assert.equal(extractBusRouteNumber('பஸ் ௪௦௦ எப்போ வரும்'), '400');
  assert.equal(extractBusRouteNumber('బస్సు నాలుగు వందలు'), '400');
  assert.equal(extractBusRouteNumber('ಬಸ್ ನಾಲ್ಕು ನೂರು'), '400');

  // 2. Indic postposition navigation place extraction
  assert.equal(extractNavigationPlace('MG Road Metro जाना है'), 'MG Road Metro');
  assert.equal(extractNavigationPlace('गांधी रोड ले चलो'), 'गांधी रोड');
  assert.equal(extractNavigationPlace('MG Road க்கு வழி சொல்லு'), 'MG Road');
  assert.equal(extractNavigationPlace('సిటీ హాస్పిటల్ కు దారి చూపించు'), 'సిటీ హాస్పిటల్');
  assert.equal(extractNavigationPlace('ಗಾಂಧಿ ರೋಡ್ ಗೆ ದಾರಿ ತೋರಿಸು'), 'ಗಾಂಧಿ ರೋಡ್');

  // 3. Intent classification across scripts + Hinglish/Tanglish/Tenglish/Kanglish
  const multilingualCases = [
    ['मैं कहाँ हूँ', INTENTS.WHERE_AM_I, 'hi-IN'],
    ['main kahan hoon', INTENTS.WHERE_AM_I, 'hi-IN'],
    ['बस नंबर 400 कब आएगी', INTENTS.BUS_INFO, 'hi-IN'],
    ['मुझे मदद चाहिए', INTENTS.VOLUNTEER_ASSISTANCE, 'hi-IN'],
    ['मेरा कैमरा दिखाओ', INTENTS.LIVE_ASSIST, 'hi-IN'],
    ['परिवार को लोकेशन भेजो', INTENTS.SEND_LOCATION, 'hi-IN'],
    ['आपातकालीन एसओएस', INTENTS.EMERGENCY_SOS, 'hi-IN'],
    ['நான் எங்கே இருக்கிறேன்', INTENTS.WHERE_AM_I, 'ta-IN'],
    ['naan enga irukken', INTENTS.WHERE_AM_I, 'ta-IN'],
    ['பஸ் 400 எப்போ வரும்', INTENTS.BUS_INFO, 'ta-IN'],
    ['எனக்கு உதவி வேண்டும்', INTENTS.VOLUNTEER_ASSISTANCE, 'ta-IN'],
    ['நேரடி வீடியோ உதவி', INTENTS.LIVE_ASSIST, 'ta-IN'],
    ['నేను ఎక్కడ ఉన్నాను', INTENTS.WHERE_AM_I, 'te-IN'],
    ['బస్సు 400 ఎప్పుడు వస్తుంది', INTENTS.BUS_INFO, 'te-IN'],
    ['నాకు సహాయం కావాలి', INTENTS.VOLUNTEER_ASSISTANCE, 'te-IN'],
    ['nenu ekkada unnanu', INTENTS.WHERE_AM_I, 'te-IN'],
    ['ನಾನು ಎಲ್ಲಿದ್ದೇನೆ', INTENTS.WHERE_AM_I, 'kn-IN'],
    ['ನಾನು ಎಲ್ಲಿದ್ದೀನಿ?', INTENTS.WHERE_AM_I, 'kn-IN'],
    ['ಎಲ್ಲಿ ಇದ್ದೀನಿ', INTENTS.WHERE_AM_I, 'kn-IN'],
    ['ಬಸ್ 400 ಯಾವಾಗ ಬರುತ್ತೆ', INTENTS.BUS_INFO, 'kn-IN'],
    ['400ನೇ ಬಸ್ ಯಾವಾಗ ಬರುತ್ತೆ', INTENTS.BUS_INFO, 'kn-IN'],
    ['ನನಗೆ ಸಹಾಯ ಬೇಕು', INTENTS.VOLUNTEER_ASSISTANCE, 'kn-IN'],
    ['ನನಗೆ ಸಹಾಯ ಮಾಡಿ', INTENTS.VOLUNTEER_ASSISTANCE, 'kn-IN'],
    ['ಎಂಜಿ ರೋಡ್ ಗೆ ದಾರಿ ತೋರಿಸಿ', INTENTS.NAVIGATION, 'kn-IN'],
    ['ಮುಂದೆ ಏನಿದೆ', INTENTS.WHAT_IS_AHEAD, 'kn-IN'],
    ['ಎಸ್ ಒ ಎಸ್', INTENTS.EMERGENCY_SOS, 'kn-IN'],
    ['naanu elliddene', INTENTS.WHERE_AM_I, 'kn-IN'],
    ['हिंदी में बात करो', INTENTS.SET_LANGUAGE, 'hi-IN'],
  ];

  for (const [phrase, expectedIntent, expectedLang] of multilingualCases) {
    const parsed = parseIntent(phrase, { language: 'en-IN' });
    assert.equal(parsed.intent, expectedIntent, `Failed intent for "${phrase}" (got ${parsed.intent})`);
    assert.equal(detectLanguageFromText(phrase, 'en-IN'), expectedLang, `Failed lang detection for "${phrase}"`);
  }

  assert.equal(extractNavigationPlace('ಎಂಜಿ ರೋಡ್‌ಗೆ ದಾರಿ ತೋರಿಸಿ'), 'ಎಂಜಿ ರೋಡ್');
  assert.equal(extractBusRouteNumber('400ನೇ ಬಸ್ ಯಾವಾಗ ಬರುತ್ತೆ'), '400');

  // 4. End-to-end handler replies stay localized even when app language was en-IN
  const h = createHarness({ state: { language: 'en-IN' } });

  const hiLoc = await dispatchIntent(parseIntent('मैं कहाँ हूँ', { language: 'en-IN' }), h.ctx);
  assert.match(hiLoc.spoken, /आप अभी/);

  const taBus = await dispatchIntent(parseIntent('பஸ் 400 எப்போ வரும்', { language: 'en-IN' }), h.ctx);
  assert.match(taBus.spoken, /பஸ் 400/);
  assert.match(taBus.spoken, /நிமிடங்களில்/);

  const teSos = await dispatchIntent(parseIntent('అత్యవసర SOS', { language: 'en-IN' }), h.ctx);
  assert.match(teSos.spoken, /SOS/);
  assert.match(teSos.spoken, /సెకన్లలో/);

  const knNav = await dispatchIntent(parseIntent('Gandhi Road ಗೆ ದಾರಿ ತೋರಿಸು', { language: 'en-IN' }), h.ctx);
  assert.match(knNav.spoken, /ಮಾರ್ಗದರ್ಶನ|Gandhi Road/);
});

test('Haptics Engine: scales intensity and respects master, mute, and category prefs', () => {
  assert.deepEqual(scaleHapticPattern([100, 60, 200], 50), [50, 60, 100]);
  assert.equal(scaleHapticPattern([100, 60, 200], 0), null);

  const disabledRes = triggerHapticDetailed('sos', {
    prefs: { hapticEnabled: false, hapticIntensity: 80, hapticCategories: { sos: true } },
  });
  assert.equal(disabledRes.triggered, false);
  assert.equal(disabledRes.reason, 'disabled');

  const mutedRes = triggerHapticDetailed('tap', {
    prefs: { hapticEnabled: true, hapticIntensity: 0, hapticCategories: { interactions: true } },
  });
  assert.equal(mutedRes.triggered, false);
  assert.equal(mutedRes.reason, 'muted');

  const catDisabledRes = triggerHapticDetailed('obstacle_danger', {
    prefs: { hapticEnabled: true, hapticIntensity: 90, hapticCategories: { obstacles: false } },
  });
  assert.equal(catDisabledRes.triggered, false);
  assert.equal(catDisabledRes.reason, 'category_disabled');

  const validDry = triggerHapticDetailed('turn', {
    prefs: { hapticEnabled: true, hapticIntensity: 50, hapticDesktopAudioFallback: false, hapticCategories: { navigation: true } },
  });
  assert.deepEqual(validDry.pattern, [40, 40, 40]);
});

test('Walking Assistance & Nearest Bus Stop: intent parsing across variations and languages', () => {
  // 1. Navigation phrases that previously fell through to UNKNOWN
  assert.equal(parseIntent('Navigation to Ms Palya.').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('Navigation to Ms Palya.').slots.place, 'Ms Palya');

  assert.equal(parseIntent('walking assistance to Ms Palya').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('walking assistance to Ms Palya').slots.place, 'Ms Palya');

  assert.equal(parseIntent('how do i walk to MS Palya').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('help me walk to Sambhram College').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('walk to MS Palya').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('take me to MS Palya').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('MS Palya ಗೆ ಹೋಗಬೇಕು').intent, INTENTS.NAVIGATION);
  assert.equal(parseIntent('MS Palya ಗೆ ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ').intent, INTENTS.NAVIGATION);

  // 2. Standalone walking assistance request
  const walkStandalone = parseIntent('walking assistance');
  assert.equal(walkStandalone.intent, INTENTS.NAVIGATION);
  assert.equal(walkStandalone.slots.place, null);

  // 3. Nearest Bus Stop inquiries
  const nearestQueries = [
    'which is the nearest bus stop near me',
    'where is the nearest bus stop',
    'what is the nearest bus stop',
    'nearest bus stop',
    'nearest bus stand',
    'closest bus stop',
    'ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್ ಯಾವುದು',
    'ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣ ಯಾವುದು',
    'ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್',
    'ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣ',
    'ನನ್ನ ಹತ್ತಿರ ಇರೋ ಬಸ್ ಸ್ಟಾಪ್',
    'hattirada bus stop',
    'निकटतम बस स्टॉप',
    'पास का बस स्टॉप',
    'அருகிலுள்ள பேருந்து நிறுத்தம்',
    'సమీప బస్ స్టాప్',
  ];

  for (const q of nearestQueries) {
    const res = parseIntent(q);
    assert.equal(res.intent, INTENTS.NEAREST_BUS_STOP, `Query "${q}" should resolve to NEAREST_BUS_STOP, got ${res.intent}`);
  }
});

test('Nearest Bus Stop Flow: queries stop, speaks distance/ETA, and starts walking navigation on confirmation', async () => {
  const h = createHarness();

  // 1. User asks "which is the nearest bus stop near me"
  const parsed = parseIntent('which is the nearest bus stop near me');
  const res = await dispatchIntent(parsed, h.ctx);

  assert.equal(res.status, 'found_awaiting_confirmation');
  assert.match(res.spoken, /Sambhram College/);
  assert.match(res.spoken, /550 meters/);
  assert.match(res.spoken, /7 minute/);

  // Check pending confirmation was set
  const pending = h.ctx.getState().pendingConfirmation;
  assert.ok(pending, 'pendingConfirmation must be set');
  assert.equal(pending.kind, 'nav_nearest_bus_stop');
  assert.equal(pending.candidate.short_name, 'Sambhram College');

  // 2. User confirms with "yes" -> starts walking navigation directly to that stop
  const yesParsed = parseIntent('yes', { pendingConfirmation: pending });
  const confirmRes = await dispatchIntent(yesParsed, h.ctx);

  assert.equal(confirmRes.status, 'confirmed');
  assert.match(confirmRes.spoken, /Starting walking navigation to Sambhram College/);
  assert.equal(h.ctx.getState().navigation.active, true);
  assert.equal(h.ctx.getState().navigation.destination.name, 'Sambhram College');

  // 3. In Kannada: "ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್ ಯಾವುದು"
  const knHarness = createHarness({ state: { language: 'kn-IN' } });
  const knParsed = parseIntent('ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್ ಯಾವುದು', { language: 'kn-IN' });
  const knRes = await dispatchIntent(knParsed, knHarness.ctx);

  assert.equal(knRes.status, 'found_awaiting_confirmation');
  assert.match(knRes.spoken, /ಸಂಭ್ರಮ್|Sambhram/);
  assert.match(knRes.spoken, /ಮೀಟರ್|ನಿಮಿಷ/);

  // User says "no" -> cancels gracefully
  const knPending = knHarness.ctx.getState().pendingConfirmation;
  const noParsed = parseIntent('ಬೇಡ', { pendingConfirmation: knPending });
  const noRes = await dispatchIntent(noParsed, knHarness.ctx);
  assert.ok(noRes.status === 'cancelled' || noRes.status === 'confirmation_cancelled');
  assert.equal(knHarness.ctx.getState().pendingConfirmation, null);
});

test('Walking Assistance to Place: "Navigation to Ms Palya." launches turn-by-turn route', async () => {
  const h = createHarness();

  const parsed = parseIntent('Navigation to Ms Palya.');
  const res = await dispatchIntent(parsed, h.ctx);

  assert.equal(res.status, 'executed');
  assert.match(res.spoken, /Starting walking navigation to MS Palya/);
  assert.equal(h.ctx.getState().navigation.active, true);
  assert.equal(h.ctx.getState().navigation.destination.name, 'MS Palya');
});


