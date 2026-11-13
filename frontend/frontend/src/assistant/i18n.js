/**
 * SightLink Multilingual Assistant Dictionary, Script Detection & Digit Normalization
 * Pure ESM module (zero DOM/Vite-only dependencies; safe in Node unit tests & browser).
 * Supports: English (en-IN / en-US), Hindi (hi-IN), Tamil (ta-IN), Telugu (te-IN), Kannada (kn-IN).
 */

export function normalizeLangCode(lang = 'en-IN') {
  const code = String(lang || 'en-IN').toLowerCase();
  if (code.startsWith('hi')) return 'hi';
  if (code.startsWith('ta')) return 'ta';
  if (code.startsWith('te')) return 'te';
  if (code.startsWith('kn')) return 'kn';
  return 'en';
}

export function toFullLocale(langOrShort = 'en-IN') {
  const short = normalizeLangCode(langOrShort);
  if (short === 'hi') return 'hi-IN';
  if (short === 'ta') return 'ta-IN';
  if (short === 'te') return 'te-IN';
  if (short === 'kn') return 'kn-IN';
  return String(langOrShort || '').toLowerCase() === 'en-us' ? 'en-US' : 'en-IN';
}

const DIGIT_SCRIPT_BASES = [
  0x0966, // Devanagari ०-९
  0x0be6, // Tamil ௦-௯
  0x0c66, // Telugu ౦-౯
  0x0ce6, // Kannada ೦-೯
];

export function normalizeDigits(text = '') {
  return String(text || '').replace(/[\u0966-\u096F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF]/g, (ch) => {
    const code = ch.charCodeAt(0);
    for (const base of DIGIT_SCRIPT_BASES) {
      if (code >= base && code <= base + 9) {
        return String(code - base);
      }
    }
    return ch;
  });
}

const SPOKEN_ONES_EN = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const MULTI_WORD_NUMBERS = [
  // Longest phrases must be matched before shorter ones (e.g. "నాలుగు వందలు" before "వంద")
  ['ನಾಲ್ಕು ನೂರು', '400'], ['ಒಂದು ನೂರು', '100'], ['ಎರಡು ನೂರು', '200'], ['ಮೂರು ನೂರು', '300'], ['ಐದು ನೂರು', '500'],
  ['ಆರು ನೂರು', '600'], ['ಏಳು ನೂರು', '700'], ['ಎಂಟು ನೂರು', '800'], ['ಒಂಬತ್ತು ನೂರು', '900'],
  ['ನಾಲ್ಕುನೂರು', '400'], ['ಒಂದುನೂರು', '100'], ['ಎರಡುನೂರು', '200'], ['ಮೂರುನೂರು', '300'], ['ಐದುನೂರು', '500'],
  ['నాలుగు వందలు', '400'], ['నాలుగు వందల', '400'], ['రెండు వందలు', '200'], ['మూడు వందలు', '300'], ['ఐదు వందలు', '500'], ['ఐదు వందల', '500'], ['ఒక వంద', '100'],
  ['ఆరు వందలు', '600'], ['ఏడు వందలు', '700'], ['ఎనిమిది వందలు', '800'], ['తొమ్మిది వందలు', '900'],
  ['naalugu vandalu', '400'], ['nalugu vandalu', '400'], ['rendu vandalu', '200'], ['moodu vandalu', '300'], ['aidu vandalu', '500'],
  ['naalku nooru', '400'], ['aidunooru', '500'],
  ['paanch sau', '500'], ['panch sau', '500'], ['chaar sau', '400'], ['char sau', '400'], ['teen sau', '300'], ['ek sau', '100'], ['do sau', '200'],
  ['irunooru', '200'], ['munnooru', '300'], ['naanooru', '400'], ['nanooru', '400'], ['ainooru', '500'], ['innooru', '200'],
  ['एक सौ', '100'], ['दो सौ', '200'], ['तीन सौ', '300'], ['चार सौ', '400'], ['पाँच सौ', '500'], ['पांच सौ', '500'], ['छह सौ', '600'], ['सात सौ', '700'], ['आठ सौ', '800'], ['नौ सौ', '900'],
  ['இருநூறு', '200'], ['முன்னூறு', '300'], ['நானூறு', '400'], ['நாநூறு', '400'], ['ஐநூறு', '500'], ['ஐந்நூறு', '500'],
  ['அறுநூறு', '600'], ['எழுநூறு', '700'], ['எண்ணூறு', '800'], ['தொள்ளாயிரம்', '900'],
  ['ಇನ್ನೂರು', '200'], ['ಮುನ್ನೂರು', '300'], ['ನಾನೂರು', '400'], ['ಐನೂರು', '500'], ['ಆರುನೂರು', '600'], ['ಏಳುನೂರು', '700'], ['ಎಂಟುನೂರು', '800'], ['ಒಂಬೈನೂರು', '900'],
  ['நூறு', '100'], ['ನೂರು', '100'], ['వంద', '100'], ['सौ', '100'], ['vanda', '100'], ['nooru', '100'],
].sort((a, b) => b[0].length - a[0].length);

export function normalizeSpokenNumbersAll(text = '') {
  let out = normalizeDigits(text);
  out = out.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+(?:and\s+)?([a-z0-9]+))?\b/gi,
    (_, h, rest) => {
      const base = SPOKEN_ONES_EN[h.toLowerCase()] * 100;
      if (!rest) return String(base);
      const rLower = rest.toLowerCase();
      if (SPOKEN_ONES_EN[rLower] != null) return String(base + SPOKEN_ONES_EN[rLower]);
      const num = Number(rest);
      return Number.isFinite(num) ? String(base + num) : `${base} ${rest}`;
    }
  );
  for (const [phrase, digits] of MULTI_WORD_NUMBERS) {
    if (out.toLowerCase().includes(phrase.toLowerCase())) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$|[?!.,।])`, 'gi'), `$1${digits}`);
    }
  }
  return out;
}

const ROMANIZED_MARKERS = {
  hi: [
    'kahan', 'kaha', 'kahan hai', 'kaha hai', 'madad', 'chahiye', 'chahie', 'aayegi', 'aayega',
    'bhejo', 'parivar', 'ghar', 'kitni door', 'kitna door', 'jaana hai', 'jana hai', 'le chalo',
    'rasta', 'dikhao', 'dobara', 'ruko', 'band karo', 'khatra', 'bachao', 'aage kya hai',
    'hindi mein', 'hindi me', 'samjhao',
  ],
  ta: [
    'enga', 'engae', 'irukken', 'irukke', 'udavi', 'uthavi', 'venum', 'vendum', 'eppo',
    'poganum', 'pogalam', 'vazhi', 'vali', 'kudumbam', 'kudumbathukku', 'anuppu', 'kaattu',
    'evvalavu', 'dooram', 'niruthu', 'vendam', 'aabaththu', 'tamilil', 'tamizhil', 'munnadi',
  ],
  te: [
    'ekkada', 'unnanu', 'unna', 'sahayam', 'kavali', 'kaavali', 'eppudu', 'vastundi', 'vellali',
    'daari', 'dari', 'cheppu', 'intiki', 'kutumbam', 'pampu', 'choopinchu', 'chupinchu',
    'entha dooram', 'aapu', 'apey', 'pramadam', 'telugulo', 'mundu em',
  ],
  kn: [
    'elliddene', 'ellidini', 'elliddini', 'ellide', 'sahaya', 'beku', 'yaavaga', 'yavaga', 'barutte',
    'hogabeku', 'hogbeku', 'hogona', 'daari', 'dari', 'torisu', 'torisi', 'thorsu', 'manege', 'kalisu', 'kalisi',
    'eshtu doora', 'eshtu dura', 'nillisu', 'nillisi', 'beda', 'aapattu', 'apattu', 'kannadadalli', 'munde enide',
  ],
};

/**
 * Detect reply locale automatically when user writes/speaks in Devanagari/Tamil/Telugu/Kannada
 * or recognizable Hinglish/Tanglish/Tenglish/Kanglish, otherwise preserving `fallbackLang`.
 */
export function detectLanguageFromText(raw = '', fallbackLang = 'en-IN') {
  const text = String(raw || '');
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN';

  const lower = text.toLowerCase();
  const scores = { hi: 0, ta: 0, te: 0, kn: 0 };
  for (const [langKey, markers] of Object.entries(ROMANIZED_MARKERS)) {
    for (const marker of markers) {
      if (new RegExp(`(?:^|\\s)${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|[?.!,])`, 'i').test(lower)) {
        scores[langKey] += marker.includes(' ') ? 2 : 1;
      }
    }
  }

  let bestKey = null;
  let bestScore = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) {
      bestScore = v;
      bestKey = k;
    }
  }
  if (bestKey && bestScore >= 1) {
    return toFullLocale(bestKey);
  }
  return toFullLocale(fallbackLang);
}

export function formatDistanceSpokenLocalized(meters, lang = 'en-IN') {
  if (!Number.isFinite(meters)) return '';
  const code = normalizeLangCode(lang);
  if (meters < 1000) {
    const rounded = meters >= 50 ? Math.round(meters / 5) * 5 : Math.max(1, Math.round(meters));
    const unit = {
      en: 'meters',
      hi: 'मीटर',
      ta: 'மீட்டர்',
      te: 'మీటర్లు',
      kn: 'ಮೀಟರ್',
    }[code];
    return `${rounded} ${unit}`;
  }
  const km = (meters / 1000).toFixed(1);
  const unit = {
    en: 'kilometers',
    hi: 'किलोमीटर',
    ta: 'கிலோமீட்டர்',
    te: 'కిలోమీటర్లు',
    kn: 'ಕಿಲೋಮೀಟರ್',
  }[code];
  return `${km} ${unit}`;
}

export function formatDirectionLocalized(dir = 'North', lang = 'en-IN') {
  const code = normalizeLangCode(lang);
  if (code === 'en') return dir;
  const MAP = {
    hi: {
      North: 'उत्तर', 'North-East': 'उत्तर-पूर्व', East: 'पूर्व', 'South-East': 'दक्षिण-पूर्व',
      South: 'दक्षिण', 'South-West': 'दक्षिण-पश्चिम', West: 'पश्चिम', 'North-West': 'उत्तर-पश्चिम',
    },
    ta: {
      North: 'வடக்கு', 'North-East': 'வடகிழக்கு', East: 'கிழக்கு', 'South-East': 'தென்கிழக்கு',
      South: 'தெற்கு', 'South-West': 'தென்மேற்கு', West: 'மேற்கு', 'North-West': 'வடமேற்கு',
    },
    te: {
      North: 'ఉత్తరం', 'North-East': 'ఈశాన్యం', East: 'తూర్పు', 'South-East': 'ఆగ్నేయం',
      South: 'దక్షిణం', 'South-West': 'నైరుతి', West: 'పడమర', 'North-West': 'వాయవ్యం',
    },
    kn: {
      North: 'ಉತ್ತರ', 'North-East': 'ಈಶಾನ್ಯ', East: 'ಪೂರ್ವ', 'South-East': 'ಆಗ್ನೇಯ',
      South: 'ದಕ್ಷಿಣ', 'South-West': 'ನೈಋತ್ಯ', West: 'ಪಶ್ಚಿಮ', 'North-West': 'ವಾಯುವ್ಯ',
    },
  };
  return MAP[code]?.[dir] || dir;
}

const MESSAGES = {
  en: {
    listening: 'Listening',
    cancelled: 'Cancelled.',
    listening_cancelled: 'Listening cancelled.',
    action_cancelled: 'Action cancelled.',
    retry_speech: "I didn't catch that, please say it again.",
    retry_exhausted: 'You can press the button and try again.',
    mic_denied: 'Microphone permission was denied. Enable mic access or type your command below.',
    mic_unavailable: 'Speech recognition is unavailable in this browser. Type your command in the Assistant panel or hold the button for SOS.',
    language_switched: ({ name }) => `Voice language switched to ${name}`,
    history_cleared: 'Command history cleared.',
    sos_resolved: 'Emergency SOS resolved.',
    sos_cancelled: 'Emergency SOS cancelled.',
    sos_countdown: 'Emergency SOS in 5 seconds. Say cancel to stop.',
    sos_offline: 'Emergency SOS activated offline. Your alert is queued for automatic cloud delivery, and emergency SMS and WhatsApp links are ready.',
    sos_triggered: 'Emergency SOS triggered! Live location sent to your family via Gmail and Telegram alerts.',
    sos_siren_guest: 'Emergency SOS siren activated with your GPS coordinates. Sign in as a User or tap SMS or WhatsApp fallback to notify family immediately.',
    sos_queued_network: 'Network unstable. Emergency SOS queued locally and SMS fallback is ready.',
    volunteer_offline: 'Network is offline. Your volunteer assistance request is queued with your location and will dispatch as soon as connectivity returns.',
    volunteer_searching: 'Looking for a volunteer nearby.',
    live_assist_offline: 'Live camera Eyes on Demand requires an internet connection. Say Emergency SOS or ask for volunteer help to queue locally.',
    live_assist_starting: 'Starting Eyes on Demand live camera assistance.',
    nav_ask_dest: 'Where would you like to walk to? Say navigate to, followed by the destination.',
    nav_not_found: ({ place }) => `Sorry, I could not find ${place}. Please name a nearby street or landmark.`,
    nav_disambiguate: ({ first, second }) => `Did you mean ${first}? Say yes to start, option 2 for ${second}, or cancel.`,
    nav_did_you_mean: ({ label }) => `Did you mean ${label}? Say yes to start, or cancel.`,
    nav_selection_cancelled: 'Okay, destination selection cancelled.',
    nav_started: ({ place, dist, minutes, firstStep }) =>
      `Starting walking navigation to ${place}, ${dist}, about ${minutes} minutes. ${firstStep || ''}`.trim(),
    nav_started_offline: ({ place, dist, minutes, firstStep }) =>
      `Offline bearing navigation to ${place}, ${dist}, about ${minutes} minutes walk. ${firstStep || ''}`.trim(),
    nav_inactive: 'No walking navigation is active right now.',
    nav_not_running: 'Navigation is not currently running.',
    nav_how_far: ({ dist, place, minutes, step }) =>
      `${dist} remaining to ${place}, about ${minutes} minutes. ${step ? `Current step: ${step}.` : ''}`.trim(),
    nav_repeat_fallback: 'Continue walking along the route.',
    nav_no_repeat: 'No active navigation instruction to repeat.',
    nav_stopped: 'Walking navigation stopped.',
    nav_cancelled: 'Walking navigation cancelled.',
    nav_arrived: ({ place }) => `You have arrived at ${place || 'your destination'}.`,
    nav_reroute: ({ meters }) => `You are ${meters} meters off route. Recalculating walking directions.`,
    nav_approach_cue: ({ meters, phrase }) => `In ${meters} meters, ${phrase}.`,
    nav_open_for_stop: 'Opening walking navigation so you can choose the nearest bus stop.',
    nearest_bus_stop_found: ({ name, dist, minutes }) =>
      `The nearest bus stop is ${name}, about ${dist} away, a ${minutes} minute walk. Would you like me to start walking directions there?`,
    nearest_bus_stop_none: "I couldn't find any bus stops within walking distance of your current location.",
    bus_needs_route: 'Please say the bus number, for example, check bus 400.',
    bus_offline: ({ route }) => `You are currently offline, so live arrival times for bus ${route} are unavailable. Say I need help to queue volunteer assistance.`,
    bus_checked: ({ route }) => `Checked bus ${route}.`,
    bus_eta: ({ route, stop, eta, direction }) =>
      `Bus ${route} arrives at ${stop} in ${eta} minutes${direction ? `, going toward ${direction}` : ''}.`,
    bus_no_data: ({ route }) =>
      `No transit arrival data is available for route ${route}. Would you like to navigate to the nearest bus stop or request volunteer assistance?`,
    bus_error: ({ route }) =>
      `Sorry, I could not fetch bus ${route} arrivals right now. Would you like me to navigate you to the nearest bus stop or request volunteer help?`,
    family_call_offline: 'Network is offline. Your request to contact family has been queued and will send as soon as connectivity returns.',
    family_loc_offline: 'Network is offline. Your location update for family has been queued and will send when connected.',
    family_sent_loc: 'Sent your live location update to your family contacts.',
    family_sent_call: 'Notified your family via Gmail and Telegram.',
    family_queued_network: 'Unable to reach server right now. Family alert queued locally and will retry automatically.',
    family_signin_needed: 'Please sign in with your User account so we can notify your approved family guardians.',
    where_gps_unavailable: 'I cannot read your GPS location right now. Please enable browser location permissions or connect your smart stick.',
    where_at_near: ({ address, landmark }) => `You are at ${address}, near ${landmark}.`,
    where_at: ({ address }) => `You are at ${address}.`,
    where_near: ({ landmark }) => `You are near ${landmark}.`,
    where_coords: ({ source, lat, lng }) => `Your coordinates via ${source} are ${lat} north, ${lng} east.`,
    unknown_fallback: "Sorry, I can't do that yet. You can ask for volunteer help, SOS, navigation, or bus information.",
    help_commands: 'You can say: I need volunteer assistance, Show someone my camera, Emergency SOS, Navigate to a destination, Check bus 400, Where am I, Send my location to family, Repeat, or Cancel.',
    repeat_empty: 'I have not said anything to repeat yet.',
    speech_stopped: '(Speech stopped)',
    ok_cancelled: 'Okay, cancelled.',
    offline_flushed: ({ count }) => `Connection restored. Dispatched ${count} queued ${count === 1 ? 'request' : 'requests'}.`,
    family_signin_required: 'Sign in with your User account to read or change Family Sharing settings.',
    family_sharing_status: ({ status, code, count }) => `Family updates are ${status}. Invite code is ${code}. Approved guardians: ${count}.`,
    family_paused_1h: 'Family updates paused for 1 hour.',
    family_paused: 'Family updates paused.',
    family_resumed: 'Family updates resumed.',
    family_invite_updated: 'Updated family invite status.',
    family_opening_controls: 'Opening Family Sharing controls.',
    ahead_ultrasonic: ({ meters }) => `Ultrasonic sensor reads ${meters} meters ahead.`,
    ahead_camera: ({ label, distance }) => `Camera detected ${label}${distance ? ` at ${distance}` : ''}.`,
    ahead_no_sensor: 'Smart stick ultrasonic and ESP32-CAM vision endpoints are not reporting live sensor data right now. Open AI Vision to configure your camera URL.',
  },

  hi: {
    listening: 'सुन रहा हूँ',
    cancelled: 'रद्द कर दिया गया।',
    listening_cancelled: 'सुनना रद्द कर दिया गया।',
    action_cancelled: 'कार्रवाई रद्द कर दी गई।',
    retry_speech: 'मुझे सुनाई नहीं दिया, कृपया फिर से बोलें।',
    retry_exhausted: 'आप बटन दबाकर फिर से कोशिश कर सकते हैं।',
    mic_denied: 'माइक्रोफोन की अनुमति नहीं मिली। कृपया माइक चालू करें या नीचे टाइप करें।',
    mic_unavailable: 'इस ब्राउज़र में वॉइस पहचान उपलब्ध नहीं है। नीचे अपना संदेश टाइप करें या एसओएस के लिए बटन दबाए रखें।',
    language_switched: ({ name }) => `आवाज़ की भाषा ${name} कर दी गई है।`,
    history_cleared: 'कमांड इतिहास साफ कर दिया गया।',
    sos_resolved: 'आपातकालीन एसओएस बंद कर दिया गया।',
    sos_cancelled: 'आपातकालीन एसओएस रद्द कर दिया गया।',
    sos_countdown: '5 सेकंड में आपातकालीन एसओएस भेजा जाएगा। रोकने के लिए कैंसल बोलें।',
    sos_offline: 'ऑफ़लाइन आपातकालीन एसओएस चालू किया गया। आपका अलर्ट कतार में है और एसएमएस व व्हाट्सएप लिंक तैयार हैं।',
    sos_triggered: 'आपातकालीन एसओएस भेज दिया गया! आपकी लाइव लोकेशन परिवार को ईमेल और टेलीग्राम पर भेज दी गई है।',
    sos_siren_guest: 'एसओएस सायरन और जीपीएस लोकेशन चालू है। परिवार को तुरंत सूचना देने के लिए साइन इन करें या एसएमएस/व्हाट्सएप का उपयोग करें।',
    sos_queued_network: 'नेटवर्क कमजोर है। एसओएस स्थानीय रूप से सहेजा गया है और एसएमएस लिंक तैयार है।',
    volunteer_offline: 'इंटरनेट बंद है। स्वयंसेवक मदद का अनुरोध सहेजा गया है और नेटवर्क आते ही भेज दिया जाएगा।',
    volunteer_searching: 'पास में एक स्वयंसेवक की तलाश की जा रही है।',
    live_assist_offline: 'लाइव कैमरा सहायता के लिए इंटरनेट आवश्यक है। आपातकालीन एसओएस या स्वयंसेवक मदद के लिए बोलें।',
    live_assist_starting: 'लाइव वीडियो सहायता शुरू की जा रही है।',
    nav_ask_dest: 'आप कहाँ पैदल जाना चाहते हैं? कृपया स्थान का नाम बताएं।',
    nav_not_found: ({ place }) => `क्षमा करें, ${place} नहीं मिल सका। कृपया पास की किसी सड़क या स्थान का नाम बताएं।`,
    nav_disambiguate: ({ first, second }) => `क्या आपका मतलब ${first} से है? शुरू करने के लिए हाँ बोलें, ${second} के लिए विकल्प 2 बोलें, या रद्द करें।`,
    nav_did_you_mean: ({ label }) => `क्या आपका मतलब ${label} से है? शुरू करने के लिए हाँ बोलें, या रद्द करें।`,
    nav_selection_cancelled: 'ठीक है, स्थान चयन रद्द कर दिया गया।',
    nav_started: ({ place, dist, minutes, firstStep }) =>
      `${place} के लिए पैदल नेविगेशन शुरू हो रहा है, दूरी ${dist}, लगभग ${minutes} मिनट। ${firstStep || ''}`.trim(),
    nav_started_offline: ({ place, dist, minutes, firstStep }) =>
      `${place} के लिए ऑफ़लाइन दिशा शुरू, दूरी ${dist}, लगभग ${minutes} मिनट पैदल। ${firstStep || ''}`.trim(),
    nav_inactive: 'अभी कोई पैदल नेविगेशन सक्रिय नहीं है।',
    nav_not_running: 'अभी नेविगेशन चालू नहीं है।',
    nav_how_far: ({ dist, place, minutes, step }) =>
      `${place} अभी ${dist} दूर है, लगभग ${minutes} मिनट। ${step ? `अगला कदम: ${step}।` : ''}`.trim(),
    nav_repeat_fallback: 'मार्ग पर आगे चलते रहें।',
    nav_no_repeat: 'दोहराने के लिए कोई सक्रिय नेविगेशन निर्देश नहीं है।',
    nav_stopped: 'पैदल नेविगेशन रोक दिया गया।',
    nav_cancelled: 'पैदल नेविगेशन रद्द कर दिया गया।',
    nav_arrived: ({ place }) => `आप ${place || 'अपने गंतव्य'} पर पहुँच गए हैं।`,
    nav_reroute: ({ meters }) => `आप रास्ते से ${meters} मीटर दूर हैं। नया पैदल मार्ग खोजा जा रहा है।`,
    nav_approach_cue: ({ meters, phrase }) => `${meters} मीटर के बाद, ${phrase}।`,
    nav_open_for_stop: 'निकटतम बस स्टॉप चुनने के लिए नेविगेशन खोला जा रहा है।',
    nearest_bus_stop_found: ({ name, dist, minutes }) =>
      `निकटतम बस स्टॉप ${name} है, लगभग ${dist} दूर, ${minutes} मिनट की पैदल दूरी। क्या आप वहां के लिए पैदल नेविगेशन शुरू करना चाहते हैं?`,
    nearest_bus_stop_none: 'आपके वर्तमान स्थान के पास कोई बस स्टॉप नहीं मिला।',
    bus_needs_route: 'कृपया बस नंबर बताएं, जैसे बस नंबर 400 चेक करें।',
    bus_offline: ({ route }) => `आप अभी ऑफ़लाइन हैं, इसलिए बस ${route} का लाइव समय उपलब्ध नहीं है। मदद के लिए बोलें।`,
    bus_checked: ({ route }) => `बस ${route} की जानकारी देखी गई।`,
    bus_eta: ({ route, stop, eta, direction }) =>
      `बस ${route}, ${stop} पर ${eta} मिनट में आ रही है${direction ? `, ${direction} की ओर` : ''}।`,
    bus_no_data: ({ route }) =>
      `रूट ${route} के लिए अभी कोई लाइव बस डेटा उपलब्ध नहीं है। क्या आप निकटतम बस स्टॉप तक जाना चाहेंगे या स्वयंसेवक मदद मंगाना चाहेंगे?`,
    bus_error: ({ route }) =>
      `क्षमा करें, अभी बस ${route} की जानकारी नहीं मिल सकी। क्या आप पास के बस स्टॉप का रास्ता या स्वयंसेवक मदद चाहते हैं?`,
    family_call_offline: 'इंटरनेट बंद है। परिवार को कॉल करने का अनुरोध कतार में है और कनेक्शन आते ही भेज दिया जाएगा।',
    family_loc_offline: 'इंटरनेट बंद है। परिवार को लोकेशन भेजने का अनुरोध कतार में है और कनेक्शन आते ही भेजा जाएगा।',
    family_sent_loc: 'आपकी लाइव लोकेशन परिवार के संपर्कों को भेज दी गई है।',
    family_sent_call: 'आपके परिवार को ईमेल और टेलीग्राम के माध्यम से सूचित कर दिया गया है।',
    family_queued_network: 'अभी सर्वर से संपर्क नहीं हो पा रहा है। परिवार अलर्ट सहेजा गया है और अपने आप भेजा जाएगा।',
    family_signin_needed: 'परिवार को सूचित करने के लिए कृपया अपने उपयोगकर्ता खाते से साइन इन करें।',
    where_gps_unavailable: 'अभी आपकी जीपीएस लोकेशन नहीं मिल रही है। कृपया लोकेशन अनुमति चालू करें या स्मार्ट स्टिक जोड़ें।',
    where_at_near: ({ address, landmark }) => `आप अभी ${address} पर हैं, ${landmark} के पास।`,
    where_at: ({ address }) => `आप अभी ${address} पर हैं।`,
    where_near: ({ landmark }) => `आप अभी ${landmark} के पास हैं।`,
    where_coords: ({ source, lat, lng }) => `${source} के अनुसार आपके निर्देशांक ${lat} उत्तर, ${lng} पूर्व हैं।`,
    unknown_fallback: 'क्षमा करें, मैं यह नहीं समझ पाया। आप स्वयंसेवक मदद, एसओएस, नेविगेशन, या बस की जानकारी पूछ सकते हैं।',
    help_commands: 'आप बोल सकते हैं: मुझे मदद चाहिए, मेरा कैमरा दिखाओ, आपातकालीन एसओएस, एमजी रोड जाना है, बस 400 कब आएगी, मैं कहाँ हूँ, परिवार को लोकेशन भेजो, दोहराएं, या रद्द करें।',
    repeat_empty: 'दोहराने के लिए अभी कुछ कहा नहीं गया है।',
    speech_stopped: '(आवाज़ रोकी गई)',
    ok_cancelled: 'ठीक है, रद्द कर दिया गया।',
    offline_flushed: ({ count }) => `इंटरनेट जुड़ गया। कतार में रखे ${count} अनुरोध भेज दिए गए।`,
    family_signin_required: 'फ़ैमिली शेयरिंग सेटिंग देखने या बदलने के लिए अपने खाते से साइन इन करें।',
    family_sharing_status: ({ status, code, count }) => `परिवार लोकेशन अपडेट ${status} हैं। आमंत्रण कोड ${code} है। स्वीकृत अभिभावक: ${count}।`,
    family_paused_1h: 'परिवार अपडेट 1 घंटे के लिए रोके गए।',
    family_paused: 'परिवार अपडेट रोके गए।',
    family_resumed: 'परिवार अपडेट फिर से शुरू हो गए।',
    family_invite_updated: 'परिवार आमंत्रण स्थिति अपडेट हो गई।',
    family_opening_controls: 'फ़ैमिली शेयरिंग नियंत्रण खोले जा रहे हैं।',
    ahead_ultrasonic: ({ meters }) => `अल्ट्रासोनिक सेंसर आगे ${meters} मीटर की दूरी दिखा रहा है।`,
    ahead_camera: ({ label, distance }) => `कैमरे ने ${label}${distance ? ` (${distance} पर)` : ''} देखा है।`,
    ahead_no_sensor: 'अभी स्मार्ट स्टिक सेंसर या कैमरा लाइव डेटा नहीं भेज रहे हैं। कैमरा सेट करने के लिए एआई विज़न खोलें।',
  },

  ta: {
    listening: 'கேட்கிறேன்',
    cancelled: 'ரத்து செய்யப்பட்டது.',
    listening_cancelled: 'கேட்பது ரத்து செய்யப்பட்டது.',
    action_cancelled: 'செயல் ரத்து செய்யப்பட்டது.',
    retry_speech: 'சரியாகக் கேட்கவில்லை, தயவுசெய்து மீண்டும் சொல்லுங்கள்.',
    retry_exhausted: 'நீங்கள் பொத்தானை அழுத்தி மீண்டும் முயற்சிக்கலாம்.',
    mic_denied: 'மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டது. மைக்கை இயக்கவும் அல்லது கீழே தட்டச்சு செய்யவும்.',
    mic_unavailable: 'இந்த உலாவியில் குரல் அங்கீகாரம் இல்லை. கீழே தட்டச்சு செய்யவும் அல்லது SOS-க்கு பொத்தானை அழுத்திப் பிடிக்கவும்.',
    language_switched: ({ name }) => `குரல் மொழி ${name} ஆக மாற்றப்பட்டது.`,
    history_cleared: 'கட்டளை வரலாறு அழிக்கப்பட்டது.',
    sos_resolved: 'அவசர SOS நிறுத்தப்பட்டது.',
    sos_cancelled: 'அவசர SOS ரத்து செய்யப்பட்டது.',
    sos_countdown: '5 வினாடிகளில் அவசர SOS அனுப்பப்படும். நிறுத்த ரத்து எனச் சொல்லுங்கள்.',
    sos_offline: 'ஆஃப்லைனில் SOS இயக்கப்பட்டது. எச்சரிக்கை வரிசையில் உள்ளது; SMS மற்றும் WhatsApp இணைப்புகள் தயார்.',
    sos_triggered: 'அவசர SOS அனுப்பப்பட்டது! உங்கள் நேரடி இருப்பிடம் குடும்பத்திற்கு மின்னஞ்சல் மற்றும் டெலிகிராமில் அனுப்பப்பட்டது.',
    sos_siren_guest: 'SOS சைரன் மற்றும் GPS இருப்பிடம் இயக்கப்பட்டது. குடும்பத்திற்கு அனுப்ப உள்நுழையவும் அல்லது SMS/WhatsApp பயன்படுத்தவும்.',
    sos_queued_network: 'நெட்வொர்க் குறைவாக உள்ளது. SOS உள்ளூரில் சேமிக்கப்பட்டது மற்றும் SMS இணைப்பு தயார்.',
    volunteer_offline: 'இணையம் இல்லை. உங்கள் தன்னார்வலர் உதவி கோரிக்கை சேமிக்கப்பட்டுள்ளது; இணையம் வந்ததும் அனுப்பப்படும்.',
    volunteer_searching: 'அருகிலுள்ள தன்னார்வலரைத் தேடுகிறேன்.',
    live_assist_offline: 'நேரடி கேமரா உதவிக்கு இணையம் தேவை. அவசர SOS அல்லது தன்னார்வலர் உதவி எனச் சொல்லவும்.',
    live_assist_starting: 'நேரடி கேமரா உதவி தொடங்கப்படுகிறது.',
    nav_ask_dest: 'நீங்கள் எங்கு நடந்து செல்ல விரும்புகிறீர்கள்? இடத்தின் பெயரைச் சொல்லுங்கள்.',
    nav_not_found: ({ place }) => `மன்னிக்கவும், ${place} இடத்தைக் கண்டுபிடிக்க முடியவில்லை. அருகிலுள்ள தெரு அல்லது அடையாளத்தைச் சொல்லுங்கள்.`,
    nav_disambiguate: ({ first, second }) => `நீங்கள் குறிப்பிடுவது ${first} தானா? தொடங்க ஆம் சொல்லுங்கள், ${second} என்பதற்கு விருப்பம் 2 சொல்லுங்கள், அல்லது ரத்து செய்யவும்.`,
    nav_did_you_mean: ({ label }) => `நீங்கள் குறிப்பிடுவது ${label} தானா? தொடங்க ஆம் சொல்லுங்கள், அல்லது ரத்து செய்யவும்.`,
    nav_selection_cancelled: 'சரி, இடத் தேர்வு ரத்து செய்யப்பட்டது.',
    nav_started: ({ place, dist, minutes, firstStep }) =>
      `${place} நோக்கி நடைபயண வழிகாட்டுதல் தொடங்குகிறது, தூரம் ${dist}, சுமார் ${minutes} நிமிடங்கள். ${firstStep || ''}`.trim(),
    nav_started_offline: ({ place, dist, minutes, firstStep }) =>
      `${place} நோக்கி ஆஃப்லைன் திசை வழிகாட்டுதல், தூரம் ${dist}, சுமார் ${minutes} நிமிடங்கள். ${firstStep || ''}`.trim(),
    nav_inactive: 'தற்போது நடைபயண வழிகாட்டுதல் எதுவும் இயக்கத்தில் இல்லை.',
    nav_not_running: 'வழிகாட்டுதல் தற்போது இயங்கவில்லை.',
    nav_how_far: ({ dist, place, minutes, step }) =>
      `${place} செல்ல இன்னும் ${dist} உள்ளது, சுமார் ${minutes} நிமிடங்கள். ${step ? `தற்போதைய படி: ${step}.` : ''}`.trim(),
    nav_repeat_fallback: 'வழியில் தொடர்ந்து நடக்கவும்.',
    nav_no_repeat: 'மீண்டும் சொல்ல வழிகாட்டுதல் எதுவும் இல்லை.',
    nav_stopped: 'நடைபயண வழிகாட்டுதல் நிறுத்தப்பட்டது.',
    nav_cancelled: 'நடைபயண வழிகாட்டுதல் ரத்து செய்யப்பட்டது.',
    nav_arrived: ({ place }) => `நீங்கள் ${place || 'உங்கள் இலக்கை'} அடைந்துவிட்டீர்கள்.`,
    nav_reroute: ({ meters }) => `நீங்கள் வழியிலிருந்து ${meters} மீட்டர் விலகி உள்ளீர்கள். புதிய வழி கணக்கிடப்படுகிறது.`,
    nav_approach_cue: ({ meters, phrase }) => `${meters} மீட்டரில், ${phrase}.`,
    nav_open_for_stop: 'அருகிலுள்ள பேருந்து நிறுத்தத்தைத் தேர்ந்தெடுக்க வழிகாட்டுதல் திறக்கப்படுகிறது.',
    nearest_bus_stop_found: ({ name, dist, minutes }) =>
      `அருகிலுள்ள பேருந்து நிறுத்தம் ${name}, சுமார் ${dist} தூரத்தில், ${minutes} நிமிட நடைப்பயணம். அங்கு செல்ல நடைபயண வழிகாட்டுதலைத் தொடங்கவா?`,
    nearest_bus_stop_none: 'உங்கள் தற்போதைய இருப்பிடத்திற்கு அருகில் பேருந்து நிறுத்தங்கள் எதுவும் கிடைக்கவில்லை.',
    bus_needs_route: 'தயவுசெய்து பேருந்து எண்ணைச் சொல்லுங்கள், எடுத்துக்காட்டாக பஸ் 400.',
    bus_offline: ({ route }) => `நீங்கள் ஆஃப்லைனில் உள்ளீர்கள், பஸ் ${route} நேரம் கிடைக்கவில்லை. உதவி தேவை எனச் சொல்லவும்.`,
    bus_checked: ({ route }) => `பஸ் ${route} விவரம் பார்க்கப்பட்டது.`,
    bus_eta: ({ route, stop, eta, direction }) =>
      `பஸ் ${route}, ${stop} நிறுத்தத்திற்கு ${eta} நிமிடங்களில் வருகிறது${direction ? `, ${direction} திசை நோக்கி` : ''}.`,
    bus_no_data: ({ route }) =>
      `பஸ் ${route} நேரடித் தகவல் இல்லை. அருகிலுள்ள பேருந்து நிறுத்தத்திற்கு வழிகாட்டவா அல்லது தன்னார்வலர் உதவி கோரவா?`,
    bus_error: ({ route }) =>
      `மன்னிக்கவும், பஸ் ${route} தகவலைப் பெற முடியவில்லை. அருகிலுள்ள நிறுத்தத்திற்கு வழிகாட்டவா அல்லது உதவி கோரவா?`,
    family_call_offline: 'இணையம் இல்லை. குடும்பத்தைத் தொடர்பு கொள்ளும் கோரிக்கை வரிசையில் சேமிக்கப்பட்டது.',
    family_loc_offline: 'இணையம் இல்லை. குடும்பத்திற்கு இருப்பிடம் அனுப்பும் கோரிக்கை வரிசையில் சேமிக்கப்பட்டது.',
    family_sent_loc: 'உங்கள் நேரடி இருப்பிடம் குடும்பத்தினருக்கு அனுப்பப்பட்டது.',
    family_sent_call: 'உங்கள் குடும்பத்தினருக்கு மின்னஞ்சல் மற்றும் டெலிகிராம் மூலம் தெரிவிக்கப்பட்டது.',
    family_queued_network: 'சேவையகத்தை அணுக முடியவில்லை. குடும்ப எச்சரிக்கை உள்ளூரில் சேமிக்கப்பட்டது.',
    family_signin_needed: 'குடும்பத்தினருக்குத் தெரிவிக்க உங்கள் கணக்கில் உள்நுழையவும்.',
    where_gps_unavailable: 'தற்போது GPS இருப்பிடம் கிடைக்கவில்லை. இருப்பிட அனுமதியை இயக்கவும் அல்லது ஸ்மார்ட் குச்சியை இணைக்கவும்.',
    where_at_near: ({ address, landmark }) => `நீங்கள் ${address} இல், ${landmark} அருகில் உள்ளீர்கள்.`,
    where_at: ({ address }) => `நீங்கள் ${address} இல் உள்ளீர்கள்.`,
    where_near: ({ landmark }) => `நீங்கள் ${landmark} அருகில் உள்ளீர்கள்.`,
    where_coords: ({ source, lat, lng }) => `${source} வழியாக உங்கள் ஆயத்தொலைவுகள் ${lat} வடக்கு, ${lng} கிழக்கு.`,
    unknown_fallback: 'மன்னிக்கவும், என்னால் அதைச் செய்ய முடியவில்லை. தன்னார்வலர் உதவி, SOS, வழிகாட்டுதல் அல்லது பஸ் தகவல் கேட்கலாம்.',
    help_commands: 'நீங்கள் சொல்லலாம்: உதவி வேண்டும், கேமராவைக் காட்டு, அவசர SOS, எம்.ஜி ரோடு போகணும், பஸ் 400 எப்போ வரும், நான் எங்கே இருக்கிறேன், குடும்பத்திற்கு இருப்பிடம் அனுப்பு, அல்லது ரத்து செய்.',
    repeat_empty: 'மீண்டும் சொல்ல இதுவரை எதுவும் கூறவில்லை.',
    speech_stopped: '(பேச்சு நிறுத்தப்பட்டது)',
    ok_cancelled: 'சரி, ரத்து செய்யப்பட்டது.',
    offline_flushed: ({ count }) => `இணையம் இணைக்கப்பட்டது. சேமிக்கப்பட்ட ${count} கோரிக்கைகள் அனுப்பப்பட்டன.`,
    family_signin_required: 'குடும்பப் பகிர்வு அமைப்புகளைப் பார்க்க உங்கள் கணக்கில் உள்நுழையவும்.',
    family_sharing_status: ({ status, code, count }) => `குடும்பப் பகிர்வு நிலை: ${status}. அழைப்புக் குறியீடு: ${code}. அங்கீகரிக்கப்பட்டவர்கள்: ${count}.`,
    family_paused_1h: 'குடும்பப் பகிர்வு 1 மணி நேரம் நிறுத்தப்பட்டது.',
    family_paused: 'குடும்பப் பகிர்வு இடைநிறுத்தப்பட்டது.',
    family_resumed: 'குடும்பப் பகிர்வு மீண்டும் தொடங்கியது.',
    family_invite_updated: 'குடும்ப அழைப்பு நிலை புதுப்பிக்கப்பட்டது.',
    family_opening_controls: 'குடும்பப் பகிர்வு அமைப்புகள் திறக்கப்படுகின்றன.',
    ahead_ultrasonic: ({ meters }) => `அல்ட்ராசோனிக் சென்சார் முன்னால் ${meters} மீட்டர் தூரத்தைக் காட்டுகிறது.`,
    ahead_camera: ({ label, distance }) => `கேமரா ${label}${distance ? ` (${distance} தூரத்தில்)` : ''} கண்டறிந்துள்ளது.`,
    ahead_no_sensor: 'ஸ்மார்ட் குச்சி சென்சார் அல்லது கேமரா தரவு இப்போது கிடைக்கவில்லை. AI Vision பக்கத்தில் கேமராவை அமைக்கவும்.',
  },

  te: {
    listening: 'వింటున్నాను',
    cancelled: 'రద్దు చేయబడింది.',
    listening_cancelled: 'వినడం రద్దు చేయబడింది.',
    action_cancelled: 'చర్య రద్దు చేయబడింది.',
    retry_speech: 'సరిగ్గా వినిపించలేదు, దయచేసి మళ్లీ చెప్పండి.',
    retry_exhausted: 'మీరు బటన్ నొక్కి మళ్లీ ప్రయత్నించవచ్చు.',
    mic_denied: 'మైక్రోఫోన్ అనుమతి నిరాకరించబడింది. మైక్ ఆన్ చేయండి లేదా క్రింద టైప్ చేయండి.',
    mic_unavailable: 'ఈ బ్రౌజర్‌లో వాయిస్ గుర్తింపు అందుబాటులో లేదు. క్రింద టైప్ చేయండి లేదా SOS కోసం బటన్ నొక్కి ఉంచండి.',
    language_switched: ({ name }) => `వాయిస్ భాష ${name} కు మార్చబడింది.`,
    history_cleared: 'కమాండ్ చరిత్ర క్లియర్ చేయబడింది.',
    sos_resolved: 'అత్యవసర SOS ఆపివేయబడింది.',
    sos_cancelled: 'అత్యవసర SOS రద్దు చేయబడింది.',
    sos_countdown: '5 సెకన్లలో అత్యవసర SOS పంపబడుతుంది. ఆపడానికి క్యాన్సల్ అని చెప్పండి.',
    sos_offline: 'ఆఫ్‌లైన్ SOS ప్రారంభించబడింది. మీ అలర్ట్ క్యూలో ఉంది; SMS మరియు WhatsApp లింకులు సిద్ధంగా ఉన్నాయి.',
    sos_triggered: 'అత్యవసర SOS పంపబడింది! మీ లైవ్ లొకేషన్ కుటుంబానికి Gmail మరియు Telegram ద్వారా పంపబడింది.',
    sos_siren_guest: 'SOS సైరన్ మరియు GPS లొకేషన్ ఆన్ అయ్యాయి. కుటుంబానికి పంపడానికి సైన్ ఇన్ చేయండి లేదా SMS/WhatsApp వాడండి.',
    sos_queued_network: 'నెట్‌వర్క్ బలహీనంగా ఉంది. SOS స్థానికంగా సేవ్ చేయబడింది మరియు SMS లింక్ సిద్ధంగా ఉంది.',
    volunteer_offline: 'ఇంటర్నెట్ ఆఫ్‌లైన్‌లో ఉంది. వాలంటీర్ సహాయం క్యూలో ఉంచబడింది; కనెక్షన్ వచ్చిన వెంటనే పంపబడుతుంది.',
    volunteer_searching: 'సమీపంలో వాలంటీర్ కోసం వెతుకుతున్నాను.',
    live_assist_offline: 'లైవ్ కెమెరా సహాయం కోసం ఇంటర్నెట్ అవసరం. అత్యవసర SOS లేదా వాలంటీర్ సహాయం అడగండి.',
    live_assist_starting: 'లైవ్ కెమెరా సహాయం ప్రారంభమవుతోంది.',
    nav_ask_dest: 'మీరు నడిచి ఎక్కడికి వెళ్లాలనుకుంటున్నారు? దయచేసి స్థలం పేరు చెప్పండి.',
    nav_not_found: ({ place }) => `క్షమించండి, ${place} కనుగొనలేకపోయాను. దగ్గరలోని రోడ్డు లేదా ప్రదేశం పేరు చెప్పండి.`,
    nav_disambiguate: ({ first, second }) => `మీ ఉద్దేశ్యం ${first} ఏనా? ప్రారంభించడానికి అవును అని చెప్పండి, ${second} కోసం ఆప్షన్ 2 చెప్పండి, లేదా రద్దు చేయండి.`,
    nav_did_you_mean: ({ label }) => `మీ ఉద్దేశ్యం ${label} ఏనా? ప్రారంభించడానికి అవును చెప్పండి లేదా రద్దు చేయండి.`,
    nav_selection_cancelled: 'సరే, గమ్యస్థానం ఎంపిక రద్దు చేయబడింది.',
    nav_started: ({ place, dist, minutes, firstStep }) =>
      `${place} వైపు నడక నావిగేషన్ ప్రారంభమవుతోంది, దూరం ${dist}, సుమారు ${minutes} నిమిషాలు. ${firstStep || ''}`.trim(),
    nav_started_offline: ({ place, dist, minutes, firstStep }) =>
      `${place} కు ఆఫ్‌లైన్ దిశ నావిగేషన్, దూరం ${dist}, సుమారు ${minutes} నిమిషాలు. ${firstStep || ''}`.trim(),
    nav_inactive: 'ప్రస్తుతం నడక నావిగేషన్ ఏదీ యాక్టివ్‌గా లేదు.',
    nav_not_running: 'నావిగేషన్ ప్రస్తుతం నడవడం లేదు.',
    nav_how_far: ({ dist, place, minutes, step }) =>
      `${place} ఇంకా ${dist} దూరంలో ఉంది, సుమారు ${minutes} నిమిషాలు. ${step ? `ప్రస్తుత అడుగు: ${step}.` : ''}`.trim(),
    nav_repeat_fallback: 'మార్గంలో నడవడం కొనసాగించండి.',
    nav_no_repeat: 'మళ్లీ చెప్పడానికి యాక్టివ్ నావిగేషన్ సూచన లేదు.',
    nav_stopped: 'నడక నావిగేషన్ ఆపివేయబడింది.',
    nav_cancelled: 'నడక నావిగేషన్ రద్దు చేయబడింది.',
    nav_arrived: ({ place }) => `మీరు ${place || 'మీ గమ్యస్థానానికి'} చేరుకున్నారు.`,
    nav_reroute: ({ meters }) => `మీరు దారి నుండి ${meters} మీటర్లు దూరంగా ఉన్నారు. కొత్త దారి లెక్కించబడుతోంది.`,
    nav_approach_cue: ({ meters, phrase }) => `${meters} మీటర్లలో, ${phrase}.`,
    nav_open_for_stop: 'సమీప బస్ స్టాప్ ఎంచుకోవడానికి నావిగేషన్ తెరవబడుతోంది.',
    nearest_bus_stop_found: ({ name, dist, minutes }) =>
      `సమీప బస్ స్టాప్ ${name}, సుమారు ${dist} దూరంలో, ${minutes} నిమిషాల నడక. అక్కడికి నడక నావిగేషన్ ప్రారంభించమంటారా?`,
    nearest_bus_stop_none: 'మీ ప్రస్తుత స్థానానికి సమీపంలో బస్ స్టాప్‌లు ఏవీ కనుగొనబడలేదు.',
    bus_needs_route: 'దయచేసి బస్సు నంబర్ చెప్పండి, ఉదాహరణకు బస్సు 400.',
    bus_offline: ({ route }) => `మీరు ఆఫ్‌లైన్‌లో ఉన్నారు, బస్సు ${route} సమయాలు అందుబాటులో లేవు. సహాయం కావాలని చెప్పండి.`,
    bus_checked: ({ route }) => `బస్సు ${route} వివరాలు పరిశీలించబడ్డాయి.`,
    bus_eta: ({ route, stop, eta, direction }) =>
      `బస్సు ${route}, ${stop} వద్దకు ${eta} నిమిషాల్లో వస్తుంది${direction ? `, ${direction} వైపు వెళ్తోంది` : ''}.`,
    bus_no_data: ({ route }) =>
      `రూట్ ${route} లైవ్ బస్సు డేటా లేదు. సమీప బస్ స్టాప్‌కు దారి చూపించమంటారా లేదా వాలంటీర్ సహాయం కోరమంటారా?`,
    bus_error: ({ route }) =>
      `క్షమించండి, బస్సు ${route} వివరాలు పొందలేకపోయాము. దగ్గరలోని బస్ స్టాప్‌కు నావిగేట్ చేయాలా లేదా సహాయం కోరాలా?`,
    family_call_offline: 'ఇంటర్నెట్ లేదు. కుటుంబానికి కాల్ అభ్యర్థన క్యూలో ఉంది; కనెక్షన్ వచ్చినప్పుడు పంపబడుతుంది.',
    family_loc_offline: 'ఇంటర్నెట్ లేదు. కుటుంబానికి లొకేషన్ అప్‌డేట్ క్యూలో ఉంది; కనెక్షన్ వచ్చినప్పుడు పంపబడుతుంది.',
    family_sent_loc: 'మీ లైవ్ లొకేషన్ మీ కుటుంబ సభ్యులకు పంపబడింది.',
    family_sent_call: 'మీ కుటుంబ సభ్యులకు Gmail మరియు Telegram ద్వారా తెలియజేయబడింది.',
    family_queued_network: 'సర్వర్ అందుబాటులో లేదు. కుటుంబ అలర్ట్ స్థానికంగా సేవ్ చేయబడింది.',
    family_signin_needed: 'కుటుంబానికి తెలియజేయడానికి దయచేసి మీ ఖాతాతో సైన్ ఇన్ చేయండి.',
    where_gps_unavailable: 'ప్రస్తుతం GPS లొకేషన్ చదవలేకపోతున్నాను. లొకేషన్ అనుమతి ఆన్ చేయండి లేదా స్మార్ట్ స్టిక్ కనెక్ట్ చేయండి.',
    where_at_near: ({ address, landmark }) => `మీరు ${address} వద్ద, ${landmark} సమీపంలో ఉన్నారు.`,
    where_at: ({ address }) => `మీరు ${address} వద్ద ఉన్నారు.`,
    where_near: ({ landmark }) => `మీరు ${landmark} సమీపంలో ఉన్నారు.`,
    where_coords: ({ source, lat, lng }) => `${source} ప్రకారం మీ స్థానం ${lat} ఉత్తరం, ${lng} తూర్పు.`,
    unknown_fallback: 'క్షమించండి, నాకు అర్థం కాలేదు. మీరు వాలంటీర్ సహాయం, SOS, నావిగేషన్ లేదా బస్సు సమాచారం అడగవచ్చు.',
    help_commands: 'మీరు చెప్పగలరు: నాకు సహాయం కావాలి, కెమెరా చూపించు, అత్యవసర SOS, ఎంజీ రోడ్ కి వెళ్లాలి, బస్సు 400 ఎప్పుడు వస్తుంది, నేను ఎక్కడ ఉన్నాను, కుటుంబానికి లొకేషన్ పంపు, లేదా క్యాన్సల్.',
    repeat_empty: 'మళ్లీ చెప్పడానికి ఇంకా ఏమీ చెప్పలేదు.',
    speech_stopped: '(మాట ఆపివేయబడింది)',
    ok_cancelled: 'సరే, రద్దు చేయబడింది.',
    offline_flushed: ({ count }) => `ఇంటర్నెట్ తిరిగి వచ్చింది. సేవ్ చేసిన ${count} అభ్యర్థనలు పంపబడ్డాయి.`,
    family_signin_required: 'కుటుంబ షేరింగ్ సెట్టింగ్‌ల కోసం దయచేసి సైన్ ఇన్ చేయండి.',
    family_sharing_status: ({ status, code, count }) => `కుటుంబ అప్‌డేట్‌లు ${status}. ఆహ్వాన కోడ్ ${code}. ఆమోదించిన వారు: ${count}.`,
    family_paused_1h: 'కుటుంబ అప్‌డేట్‌లు 1 గంట పాటు ఆపబడ్డాయి.',
    family_paused: 'కుటుంబ అప్‌డేట్‌లు ఆపబడ్డాయి.',
    family_resumed: 'కుటుంబ అప్‌డేట్‌లు మళ్లీ ప్రారంభమయ్యాయి.',
    family_invite_updated: 'కుటుంబ ఆహ్వాన స్థితి నవీకరించబడింది.',
    family_opening_controls: 'కుటుంబ షేరింగ్ నియంత్రణలు తెరవబడుతున్నాయి.',
    ahead_ultrasonic: ({ meters }) => `అల్ట్రాసోనిక్ సెన్సార్ ముందు ${meters} మీటర్లు చూపిస్తోంది.`,
    ahead_camera: ({ label, distance }) => `కెమెరా ${label}${distance ? ` (${distance} దూరంలో)` : ''} గుర్తించింది.`,
    ahead_no_sensor: 'స్మార్ట్ స్టిక్ సెన్సార్ లేదా కెమెరా లైవ్ డేటా ఇవ్వడం లేదు. AI Vision లో కెమెరా సెట్ చేయండి.',
  },

  kn: {
    listening: 'ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ',
    cancelled: 'ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    listening_cancelled: 'ಕೇಳುವುದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    action_cancelled: 'ಕ್ರಿಯೆ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    retry_speech: 'ಸರಿಯಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ, ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಿ.',
    retry_exhausted: 'ನೀವು ಬಟನ್ ಒತ್ತಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬಹುದು.',
    mic_denied: 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಮೈಕ್ ಆನ್ ಮಾಡಿ ಅಥವಾ ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ.',
    mic_unavailable: 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಲಭ್ಯವಿಲ್ಲ. ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ SOS ಗಾಗಿ ಬಟನ್ ಒತ್ತಿ ಹಿಡಿಯಿರಿ.',
    language_switched: ({ name }) => `ಧ್ವನಿ ಭಾಷೆಯನ್ನು ${name} ಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.`,
    history_cleared: 'ಕಮಾಂಡ್ ಇತಿಹಾಸವನ್ನು ತೆರವುಗೊಳಿಸಲಾಗಿದೆ.',
    sos_resolved: 'ತುರ್ತು SOS ಅನ್ನು ನಿಲ್ಲಿಸಲಾಗಿದೆ.',
    sos_cancelled: 'ತುರ್ತು SOS ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    sos_countdown: '5 ಸೆಕೆಂಡುಗಳಲ್ಲಿ ತುರ್ತು SOS ಕಳುಹಿಸಲಾಗುತ್ತದೆ. ನಿಲ್ಲಿಸಲು ಕ್ಯಾನ್ಸಲ್ ಎಂದು ಹೇಳಿ.',
    sos_offline: 'ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ SOS ಸಕ್ರಿಯಗೊಳಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಎಚ್ಚರಿಕೆ ಕ್ಯೂನಲ್ಲಿದೆ ಮತ್ತು SMS, WhatsApp ಲಿಂಕ್‌ಗಳು ಸಿದ್ಧವಾಗಿವೆ.',
    sos_triggered: 'ತುರ್ತು SOS ಕಳುಹಿಸಲಾಗಿದೆ! ನಿಮ್ಮ ಲೈವ್ ಸ್ಥಳವನ್ನು ಕುಟುಂಬಕ್ಕೆ Gmail ಮತ್ತು Telegram ಮೂಲಕ ಕಳುಹಿಸಲಾಗಿದೆ.',
    sos_siren_guest: 'SOS ಸೈರನ್ ಮತ್ತು GPS ಸ್ಥಳ ಸಕ್ರಿಯವಾಗಿದೆ. ಕುಟುಂಬಕ್ಕೆ ತಿಳಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ ಅಥವಾ SMS/WhatsApp ಬಳಸಿ.',
    sos_queued_network: 'ನೆಟ್‌ವರ್ಕ್ ದುರ್ಬಲವಾಗಿದೆ. SOS ಸ್ಥಳೀಯವಾಗಿ ಉಳಿಸಲಾಗಿದೆ ಮತ್ತು SMS ಲಿಂಕ್ ಸಿದ್ಧವಾಗಿದೆ.',
    volunteer_offline: 'ಇಂಟರ್ನೆಟ್ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದೆ. ಸ್ವಯಂಸೇವಕರ ಸಹಾಯ ವಿನಂತಿ ಕ್ಯೂನಲ್ಲಿದೆ; ಸಂಪರ್ಕ ಬಂದ ತಕ್ಷಣ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.',
    volunteer_searching: 'ಹತ್ತಿರದ ಸ್ವಯಂಸೇವಕರನ್ನು ಹುಡುಕಲಾಗುತ್ತಿದೆ.',
    live_assist_offline: 'ಲೈವ್ ಕ್ಯಾಮೆರಾ ಸಹಾಯಕ್ಕೆ ಇಂಟರ್ನೆಟ್ ಅಗತ್ಯವಿದೆ. ತುರ್ತು SOS ಅಥವಾ ಸ್ವಯಂಸೇವಕರ ಸಹಾಯ ಕೇಳಿ.',
    live_assist_starting: 'ಲೈವ್ ಕ್ಯಾಮೆರಾ ಸಹಾಯವನ್ನು ಪ್ರಾರಂಭಿಸಲಾಗುತ್ತಿದೆ.',
    nav_ask_dest: 'ನೀವು ಎಲ್ಲಿಗೆ ನಡೆದು ಹೋಗಲು ಬಯಸುತ್ತೀರಿ? ದಯವಿಟ್ಟು ಸ್ಥಳದ ಹೆಸರನ್ನು ಹೇಳಿ.',
    nav_not_found: ({ place }) => `ಕ್ಷಮಿಸಿ, ${place} ಹುಡುಕಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಹತ್ತಿರದ ರಸ್ತೆ ಅಥವಾ ಸ್ಥಳದ ಹೆಸರನ್ನು ಹೇಳಿ.`,
    nav_disambiguate: ({ first, second }) => `ನೀವು ${first} ಬಗ್ಗೆ ಹೇಳುತ್ತಿದ್ದೀರಾ? ಪ್ರಾರಂಭಿಸಲು ಹೌದು ಎಂದು ಹೇಳಿ, ${second} ಗಾಗಿ ಆಯ್ಕೆ 2 ಹೇಳಿ, ಅಥವಾ ರದ್ದುಗೊಳಿಸಿ.`,
    nav_did_you_mean: ({ label }) => `ನೀವು ${label} ಬಗ್ಗೆ ಹೇಳುತ್ತಿದ್ದೀರಾ? ಪ್ರಾರಂಭಿಸಲು ಹೌದು ಹೇಳಿ, ಅಥವಾ ರದ್ದುಗೊಳಿಸಿ.`,
    nav_selection_cancelled: 'ಸರಿ, ಸ್ಥಳದ ಆಯ್ಕೆಯನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    nav_started: ({ place, dist, minutes, firstStep }) =>
      `${place} ಗೆ ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ, ದೂರ ${dist}, ಸುಮಾರು ${minutes} ನಿಮಿಷಗಳು. ${firstStep || ''}`.trim(),
    nav_started_offline: ({ place, dist, minutes, firstStep }) =>
      `${place} ಗೆ ಆಫ್‌ಲೈನ್ ದಿಕ್ಕಿನ ಮಾರ್ಗದರ್ಶನ, ದೂರ ${dist}, ಸುಮಾರು ${minutes} ನಿಮಿಷಗಳು. ${firstStep || ''}`.trim(),
    nav_inactive: 'ಪ್ರಸ್ತುತ ಯಾವುದೇ ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ ಸಕ್ರಿಯವಾಗಿಲ್ಲ.',
    nav_not_running: 'ಮಾರ್ಗದರ್ಶನ ಪ್ರಸ್ತುತ ಚಾಲನೆಯಲ್ಲಿಲ್ಲ.',
    nav_how_far: ({ dist, place, minutes, step }) =>
      `${place} ತಲುಪಲು ಇನ್ನೂ ${dist} ಇದೆ, ಸುಮಾರು ${minutes} ನಿಮಿಷಗಳು. ${step ? `ಪ್ರಸ್ತುತ ಹಂತ: ${step}.` : ''}`.trim(),
    nav_repeat_fallback: 'ದಾರಿಯಲ್ಲಿ ನಡೆಯುವುದನ್ನು ಮುಂದುವರಿಸಿ.',
    nav_no_repeat: 'ಪುನರಾವರ್ತಿಸಲು ಯಾವುದೇ ಸಕ್ರಿಯ ಮಾರ್ಗದರ್ಶನ ಸೂಚನೆ ಇಲ್ಲ.',
    nav_stopped: 'ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನವನ್ನು ನಿಲ್ಲಿಸಲಾಗಿದೆ.',
    nav_cancelled: 'ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನವನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    nav_arrived: ({ place }) => `ನೀವು ${place || 'ನಿಮ್ಮ ಗಮ್ಯಸ್ಥಾನವನ್ನು'} ತಲುಪಿದ್ದೀರಿ.`,
    nav_reroute: ({ meters }) => `ನೀವು ದಾರಿಯಿಂದ ${meters} ಮೀಟರ್ ದೂರದಲ್ಲಿದ್ದೀರಿ. ಹೊಸ ದಾರಿಯನ್ನು ಲೆಕ್ಕಹಾಕಲಾಗುತ್ತಿದೆ.`,
    nav_approach_cue: ({ meters, phrase }) => `${meters} ಮೀಟರ್‌ಗಳಲ್ಲಿ, ${phrase}.`,
    nav_open_for_stop: 'ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣವನ್ನು ಆಯ್ಕೆ ಮಾಡಲು ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ ತೆರೆಯಲಾಗುತ್ತಿದೆ.',
    nearest_bus_stop_found: ({ name, dist, minutes }) =>
      `ನಿಮ್ಮ ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣ ${name}, ಸುಮಾರು ${dist} ದೂರದಲ್ಲಿದೆ, ${minutes} ನಿಮಿಷಗಳ ನಡಿಗೆ. ಅಲ್ಲಿಗೆ ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ ಪ್ರಾರಂಭಿಸಬೇಕೆ?`,
    nearest_bus_stop_none: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳದ ಹತ್ತಿರ ಯಾವುದೇ ಬಸ್ ನಿಲ್ದಾಣಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
    bus_needs_route: 'ದಯವಿಟ್ಟು ಬಸ್ ಸಂಖ್ಯೆಯನ್ನು ಹೇಳಿ, ಉದಾಹರಣೆಗೆ ಬಸ್ 400.',
    bus_offline: ({ route }) => `ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ, ಬಸ್ ${route} ಸಮಯ ಲಭ್ಯವಿಲ್ಲ. ಸಹಾಯ ಬೇಕು ಎಂದು ಹೇಳಿ.`,
    bus_checked: ({ route }) => `ಬಸ್ ${route} ವಿವರವನ್ನು ಪರಿಶೀಲಿಸಲಾಗಿದೆ.`,
    bus_eta: ({ route, stop, eta, direction }) =>
      `ಬಸ್ ${route}, ${stop} ನಿಲ್ದಾಣಕ್ಕೆ ${eta} ನಿಮಿಷಗಳಲ್ಲಿ ಬರುತ್ತಿದೆ${direction ? `, ${direction} ಕಡೆಗೆ ಹೋಗುತ್ತಿದೆ` : ''}.`,
    bus_no_data: ({ route }) =>
      `ಮಾರ್ಗ ${route} ಗೆ ಲೈವ್ ಬಸ್ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣಕ್ಕೆ ದಾರಿ ತೋರಿಸಲೇ ಅಥವಾ ಸ್ವಯಂಸೇವಕರ ಸಹಾಯ ಕೇಳಲೇ?`,
    bus_error: ({ route }) =>
      `ಕ್ಷಮಿಸಿ, ಬಸ್ ${route} ಮಾಹಿತಿ ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣಕ್ಕೆ ದಾರಿ ತೋರಿಸಲೇ ಅಥವಾ ಸಹಾಯ ಕೇಳಲೇ?`,
    family_call_offline: 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ. ಕುಟುಂಬಕ್ಕೆ ಕರೆ ವಿನಂತಿಯನ್ನು ಕ್ಯೂ ಮಾಡಲಾಗಿದೆ; ಸಂಪರ್ಕ ಬಂದಾಗ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.',
    family_loc_offline: 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ. ಕುಟುಂಬಕ್ಕೆ ಸ್ಥಳದ ಮಾಹಿತಿಯನ್ನು ಕ್ಯೂ ಮಾಡಲಾಗಿದೆ; ಸಂಪರ್ಕ ಬಂದಾಗ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.',
    family_sent_loc: 'ನಿಮ್ಮ ಲೈವ್ ಸ್ಥಳವನ್ನು ಕುಟುಂಬದವರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.',
    family_sent_call: 'ನಿಮ್ಮ ಕುಟುಂಬಕ್ಕೆ Gmail ಮತ್ತು Telegram ಮೂಲಕ ತಿಳಿಸಲಾಗಿದೆ.',
    family_queued_network: 'ಸರ್ವರ್ ತಲುಪಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ. ಕುಟುಂಬ ಎಚ್ಚರಿಕೆಯನ್ನು ಸ್ಥಳೀಯವಾಗಿ ಉಳಿಸಲಾಗಿದೆ.',
    family_signin_needed: 'ಕುಟುಂಬಕ್ಕೆ ತಿಳಿಸಲು ದಯವಿಟ್ಟು ನಿಮ್ಮ ಖಾತೆಯೊಂದಿಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.',
    where_gps_unavailable: 'ಪ್ರಸ್ತುತ GPS ಸ್ಥಳವನ್ನು ಓದಲಾಗುತ್ತಿಲ್ಲ. ಸ್ಥಳದ ಅನುಮತಿ ಆನ್ ಮಾಡಿ ಅಥವಾ ಸ್ಮಾರ್ಟ್ ಸ್ಟಿಕ್ ಸಂಪರ್ಕಿಸಿ.',
    where_at_near: ({ address, landmark }) => `ನೀವು ${address} ನಲ್ಲಿ, ${landmark} ಹತ್ತಿರ ಇದ್ದೀರಿ.`,
    where_at: ({ address }) => `ನೀವು ${address} ನಲ್ಲಿ ಇದ್ದೀರಿ.`,
    where_near: ({ landmark }) => `ನೀವು ${landmark} ಹತ್ತಿರ ಇದ್ದೀರಿ.`,
    where_coords: ({ source, lat, lng }) => `${source} ಮೂಲಕ ನಿಮ್ಮ ನಿರ್ದೇಶಾಂಕಗಳು ${lat} ಉತ್ತರ, ${lng} ಪೂರ್ವ.`,
    unknown_fallback: 'ಕ್ಷಮಿಸಿ, ನನಗೆ ಅದು ಅರ್ಥವಾಗಲಿಲ್ಲ. ನೀವು ಸ್ವಯಂಸೇವಕರ ಸಹಾಯ, SOS, ದಾರಿ ಮಾರ್ಗದರ್ಶನ ಅಥವಾ ಬಸ್ ಮಾಹಿತಿ ಕೇಳಬಹುದು.',
    help_commands: 'ನೀವು ಹೇಳಬಹುದು: ನನಗೆ ಸಹಾಯ ಬೇಕು, ಕ್ಯಾಮೆರಾ ತೋರಿಸು, ತುರ್ತು SOS, ಎಂಜಿ ರೋಡ್ ಗೆ ದಾರಿ ತೋರಿಸು, ಬಸ್ 400 ಯಾವಾಗ ಬರುತ್ತೆ, ನಾನು ಎಲ್ಲಿದ್ದೇನೆ, ಕುಟುಂಬಕ್ಕೆ ಲೊಕೇಶನ್ ಕಳಿಸು, ಅಥವಾ ರದ್ದು ಮಾಡು.',
    repeat_empty: 'ಪುನರಾವರ್ತಿಸಲು ಇನ್ನೂ ಏನನ್ನೂ ಹೇಳಿಲ್ಲ.',
    speech_stopped: '(ಮಾತು ನಿಲ್ಲಿಸಲಾಗಿದೆ)',
    ok_cancelled: 'ಸರಿ, ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
    offline_flushed: ({ count }) => `ಇಂಟರ್ನೆಟ್ ಮರುಸಂಪರ್ಕಗೊಂಡಿದೆ. ಕ್ಯೂನಲ್ಲಿದ್ದ ${count} ವಿನಂತಿಗಳನ್ನು ಕಳುಹಿಸಲಾಗಿದೆ.`,
    family_signin_required: 'ಕುಟುಂಬ ಹಂಚಿಕೆ ಸೆಟ್ಟಿಂಗ್‌ಗಳಿಗಾಗಿ ದಯವಿಟ್ಟು ಸೈನ್ ಇನ್ ಮಾಡಿ.',
    family_sharing_status: ({ status, code, count }) => `ಕುಟುಂಬ ಹಂಚಿಕೆ ಸ್ಥಿತಿ: ${status}. ಆಹ್ವಾನ ಕೋಡ್ ${code}. ಅನುಮೋದಿತರು: ${count}.`,
    family_paused_1h: 'ಕುಟುಂಬ ಹಂಚಿಕೆಯನ್ನು 1 ಗಂಟೆ ತಡೆಹಿಡಿಯಲಾಗಿದೆ.',
    family_paused: 'ಕುಟುಂಬ ಹಂಚಿಕೆಯನ್ನು ತಡೆಹಿಡಿಯಲಾಗಿದೆ.',
    family_resumed: 'ಕುಟುಂಬ ಹಂಚಿಕೆಯನ್ನು ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಲಾಗಿದೆ.',
    family_invite_updated: 'ಕುಟುಂಬ ಆಹ್ವಾನ ಸ್ಥಿತಿಯನ್ನು ನವೀಕರಿಸಲಾಗಿದೆ.',
    family_opening_controls: 'ಕುಟುಂಬ ಹಂಚಿಕೆ ನಿಯಂತ್ರಣಗಳನ್ನು ತೆರೆಯಲಾಗುತ್ತಿದೆ.',
    ahead_ultrasonic: ({ meters }) => `ಅಲ್ಟ್ರಾಸೋನಿಕ್ ಸೆನ್ಸಾರ್ ಮುಂದೆ ${meters} ಮೀಟರ್ ತೋರಿಸುತ್ತಿದೆ.`,
    ahead_camera: ({ label, distance }) => `ಕ್ಯಾಮೆರಾ ${label}${distance ? ` (${distance} ದೂರದಲ್ಲಿ)` : ''} ಗುರುತಿಸಿದೆ.`,
    ahead_no_sensor: 'ಸ್ಮಾರ್ಟ್ ಸ್ಟಿಕ್ ಸೆನ್ಸಾರ್ ಅಥವಾ ಕ್ಯಾಮೆರಾ ಲೈವ್ ಡೇಟಾ ನೀಡುತ್ತಿಲ್ಲ. AI Vision ನಲ್ಲಿ ಕ್ಯಾಮೆರಾ ಸೆಟ್ ಮಾಡಿ.',
  },
};

export function assistantMsg(lang = 'en-IN', key, vars = {}) {
  const code = normalizeLangCode(lang);
  const entry = MESSAGES[code]?.[key] ?? MESSAGES.en[key];
  if (typeof entry === 'function') return entry(vars || {});
  return entry || '';
}

export const QUICK_COMMANDS_BY_LANG = {
  en: [
    'which is the nearest bus stop near me',
    'walking assistance to MS Palya',
    'where am i',
    'check bus number 400',
    'i need volunteer assistance',
    'help me cross the road',
    'show someone my camera',
    'navigate to MG Road Metro',
    'send my location to family',
    'what is ahead',
    'emergency sos',
    'help',
  ],
  hi: [
    'मैं कहाँ हूँ',
    'बस नंबर 400 कब आएगी',
    'मुझे मदद चाहिए',
    'सड़क पार करने में मदद करो',
    'मेरा कैमरा दिखाओ',
    'MG Road Metro जाना है',
    'परिवार को लोकेशन भेजो',
    'आगे क्या है',
    'आपातकालीन एसओएस',
    'मदद सूची',
  ],
  ta: [
    'நான் எங்கே இருக்கிறேன்',
    'பஸ் 400 எப்போ வரும்',
    'எனக்கு உதவி வேண்டும்',
    'ரோடு தாண்ட உதவி செய்',
    'என் கேமராவை காட்டு',
    'MG Road Metro போகணும்',
    'குடும்பத்திற்கு இருப்பிடம் அனுப்பு',
    'முன்னால் என்ன இருக்கிறது',
    'அவசர SOS',
    'உதவி பட்டியல்',
  ],
  te: [
    'నేను ఎక్కడ ఉన్నాను',
    'బస్సు 400 ఎప్పుడు వస్తుంది',
    'నాకు సహాయం కావాలి',
    'రోడ్డు దాటడానికి సహాయం చేయండి',
    'నా కెమెరా చూపించు',
    'MG Road Metro కు దారి చూపించు',
    'కుటుంబానికి లొకేషన్ పంపు',
    'ముందు ఏముంది',
    'అత్యవసర SOS',
    'సహాయం మెను',
  ],
  kn: [
    'ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್ ಯಾವುದು',
    'MS Palya ಗೆ ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ',
    'ನಾನು ಎಲ್ಲಿದ್ದೇನೆ',
    'ಬಸ್ 400 ಯಾವಾಗ ಬರುತ್ತೆ',
    'ನನಗೆ ಸಹಾಯ ಬೇಕು',
    'ರಸ್ತೆ ದಾಟಲು ಸಹಾಯ ಮಾಡಿ',
    'ನನ್ನ ಕ್ಯಾಮೆರಾ ತೋರಿಸು',
    'MG Road Metro ಗೆ ದಾರಿ ತೋರಿಸು',
    'ಕುಟುಂಬಕ್ಕೆ ಲೊಕೇಶನ್ ಕಳಿಸು',
    'ಮುಂದೆ ಏನಿದೆ',
    'ತುರ್ತು SOS',
    'ಸಹಾಯ ಪಟ್ಟಿ',
  ],
};

export function getQuickCommandsForLang(lang = 'en-IN') {
  const code = normalizeLangCode(lang);
  return QUICK_COMMANDS_BY_LANG[code] || QUICK_COMMANDS_BY_LANG.en;
}

export function getWelcomeMessage(lang = 'en-IN') {
  const code = normalizeLangCode(lang);
  return {
    en: 'Hello! Press Talk (or your hardware button) and speak or type in English, Hindi, Tamil, Telugu, or Kannada — try “Where am I?”, “Check bus 400”, “Navigate to MG Road”, or “Emergency SOS”.',
    hi: 'नमस्ते! Talk दबाएं (या अपना हार्डवेयर बटन दबाएं) और हिंदी, अंग्रेजी या अन्य भाषाओं में बोलें या लिखें — जैसे “मैं कहाँ हूँ”, “बस 400 कब आएगी”, “MG Road जाना है”, या “आपातकालीन एसओएस”।',
    ta: 'வணக்கம்! Talk பொத்தானை அழுத்தி தமிழ் அல்லது ஆங்கிலத்தில் பேசவும்/தட்டச்சு செய்யவும் — “நான் எங்கே இருக்கிறேன்”, “பஸ் 400 எப்போ வரும்”, “MG Road போகணும்”, அல்லது “அவசர SOS”.',
    te: 'నమస్కారం! Talk బటన్ నొక్కి తెలుగు లేదా ఇంగ్లీషులో మాట్లాడండి/టైప్ చేయండి — “నేను ఎక్కడ ఉన్నాను”, “బస్సు 400 ఎప్పుడు వస్తుంది”, “MG Road కు దారి”, లేదా “అత్యవసర SOS”.',
    kn: 'ನಮಸ್ಕಾರ! Talk ಒತ್ತಿ ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಮಾತನಾಡಿ/ಟೈಪ್ ಮಾಡಿ — “ನಾನು ಎಲ್ಲಿದ್ದೇನೆ”, “ಬಸ್ 400 ಯಾವಾಗ ಬರುತ್ತೆ”, “MG Road ಗೆ ದಾರಿ ತೋರಿಸು”, ಅಥವಾ “ತುರ್ತು SOS”.',
  }[code];
}

export function translateManeuverStep({ type, modifier, road, distanceMeters, lang = 'en-IN' }) {
  const code = normalizeLangCode(lang);
  if (code === 'en') return null; // navEngine keeps exact English phrasing
  const mod = String(modifier || '').replace(/_/g, ' ').trim();
  const isDest = type === 'arrive';
  const isDepart = type === 'depart';
  const distSpoken = formatDistanceSpokenLocalized(distanceMeters, lang);

  const dirWord = {
    hi: { left: 'बाएँ', 'slight left': 'हल्का बाएँ', 'sharp left': 'तेज़ बाएँ', right: 'दाएँ', 'slight right': 'हल्का दाएँ', 'sharp right': 'तेज़ दाएँ', straight: 'सीधे', uturn: 'यू-टर्न' },
    ta: { left: 'இடதுபுறம்', 'slight left': 'சற்று இடதுபுறம்', 'sharp left': 'கூர்மையாக இடது', right: 'வலதுபுறம்', 'slight right': 'சற்று வலதுபுறம்', 'sharp right': 'கூர்மையாக வலது', straight: 'நேராக', uturn: 'யு-டர்ன்' },
    te: { left: 'ఎడమవైపు', 'slight left': 'కొద్దిగా ఎడమవైపు', 'sharp left': 'తీవ్రంగా ఎడమవైపు', right: 'కుడివైపు', 'slight right': 'కొద్దిగా కుడివైపు', 'sharp right': 'తీవ్రంగా కుడివైపు', straight: 'నేరుగా', uturn: 'యు-టర్న్' },
    kn: { left: 'ಎಡಕ್ಕೆ', 'slight left': 'ಸ್ವಲ್ಪ ಎಡಕ್ಕೆ', 'sharp left': 'ತೀವ್ರ ಎಡಕ್ಕೆ', right: 'ಬಲಕ್ಕೆ', 'slight right': 'ಸ್ವಲ್ಪ ಬಲಕ್ಕೆ', 'sharp right': 'ತೀವ್ರ ಬಲಕ್ಕೆ', straight: 'ನೇರವಾಗಿ', uturn: 'ಯು-ಟರ್ನ್' },
  }[code];

  const turnDir = dirWord?.[mod] || (mod.includes('left') ? dirWord?.left : mod.includes('right') ? dirWord?.right : dirWord?.straight);

  if (isDest) {
    return {
      label: { hi: 'गंतव्य पर पहुँचें', ta: 'இலக்கை அடையவும்', te: 'గమ్యస్థానానికి చేరుకోండి', kn: 'ಗಮ್ಯಸ್ಥಾನ ತಲುಪಿ' }[code],
      maneuverPhrase: { hi: 'आप गंतव्य पर पहुँच जाएंगे', ta: 'இலக்கை அடைவீர்கள்', te: 'గమ్యస్థానానికి చేరుకుంటారు', kn: 'ನೀವು ಗಮ್ಯಸ್ಥಾನ ತಲುಪುತ್ತೀರಿ' }[code],
      spoken: assistantMsg(lang, 'nav_arrived', { place: road || '' }),
    };
  }
  if (isDepart) {
    const label = {
      hi: road ? `${road} पर पैदल चलना शुरू करें` : 'पैदल चलना शुरू करें',
      ta: road ? `${road} வழியாக நடக்கத் தொடங்குங்கள்` : 'நடக்கத் தொடங்குங்கள்',
      te: road ? `${road} వైపు నడవడం ప్రారంభించండి` : 'నడవడం ప్రారంభించండి',
      kn: road ? `${road} ಕಡೆಗೆ ನಡೆಯಲು ಪ್ರಾರಂಭಿಸಿ` : 'ನಡೆಯಲು ಪ್ರಾರಂಭಿಸಿ',
    }[code];
    const spoken = {
      hi: `${label}${distSpoken ? `, ${distSpoken} चलें` : ''}।`,
      ta: `${label}${distSpoken ? `, ${distSpoken} நடக்கவும்` : ''}.`,
      te: `${label}${distSpoken ? `, ${distSpoken} నడవండి` : ''}.`,
      kn: `${label}${distSpoken ? `, ${distSpoken} ನಡೆಯಿರಿ` : ''}.`,
    }[code];
    return { label, maneuverPhrase: label, spoken };
  }

  const actionPhrase = {
    hi: road ? `${road} पर ${turnDir} मुड़ें` : `${turnDir} मुड़ें`,
    ta: road ? `${road} இல் ${turnDir} திரும்பவும்` : `${turnDir} திரும்பவும்`,
    te: road ? `${road} పైకి ${turnDir} తిరగండి` : `${turnDir} తిరగండి`,
    kn: road ? `${road} ಕಡೆಗೆ ${turnDir} ತಿರುಗಿ` : `${turnDir} ತಿರುಗಿ`,
  }[code];
  const spoken = {
    hi: `${actionPhrase}${distSpoken ? `, ${distSpoken} चलें` : ''}।`,
    ta: `${actionPhrase}${distSpoken ? `, ${distSpoken} நடக்கவும்` : ''}.`,
    te: `${actionPhrase}${distSpoken ? `, ${distSpoken} నడవండి` : ''}.`,
    kn: `${actionPhrase}${distSpoken ? `, ${distSpoken} ನಡೆಯಿರಿ` : ''}.`,
  }[code];
  return { label: actionPhrase, maneuverPhrase: actionPhrase, spoken };
}
