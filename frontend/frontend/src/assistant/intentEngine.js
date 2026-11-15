/**
 * SightLink AI Voice Assistant — Multilingual Rule-Based + Fuzzy Intent Engine + Optional LLM Fallback
 * Understands English, Hindi (Devanagari & Hinglish), Tamil (script & Tanglish),
 * Telugu (script & Tenglish), and Kannada (script & Kanglish).
 */
import {
  detectLanguageFromText,
  normalizeDigits,
  normalizeSpokenNumbersAll,
} from './i18n.js';

export const INTENTS = {
  EMERGENCY_SOS: 'EMERGENCY_SOS',
  VOLUNTEER_ASSISTANCE: 'VOLUNTEER_ASSISTANCE',
  LIVE_ASSIST: 'LIVE_ASSIST',
  WHAT_IS_AHEAD: 'WHAT_IS_AHEAD',
  NAVIGATION: 'NAVIGATION',
  NEAREST_BUS_STOP: 'NEAREST_BUS_STOP',
  BUS_INFO: 'BUS_INFO',
  BMTC_SOURCE_DESTINATION: 'BMTC_SOURCE_DESTINATION',
  BMTC_ROUTE_STOPS: 'BMTC_ROUTE_STOPS',
  CALL_FAMILY: 'CALL_FAMILY',
  SEND_LOCATION: 'SEND_LOCATION',
  WHERE_AM_I: 'WHERE_AM_I',
  CANCEL: 'CANCEL',
  STOP_SPEECH: 'STOP_SPEECH',
  REPEAT: 'REPEAT',
  HELP: 'HELP',
  NAV_HOW_FAR: 'NAV_HOW_FAR',
  NAV_STOP: 'NAV_STOP',
  NAV_REPEAT: 'NAV_REPEAT',
  CONFIRM_YES: 'CONFIRM_YES',
  CONFIRM_NO: 'CONFIRM_NO',
  CONFIRM_OPTION: 'CONFIRM_OPTION',
  SET_LANGUAGE: 'SET_LANGUAGE',
  UNKNOWN: 'UNKNOWN',
};

function cleanText(raw = '') {
  return normalizeSpokenNumbersAll(String(raw || ''))
    .toLowerCase()
    .replace(/[\u200c\u200d]/g, '')
    .replace(/[?!.,'’"“”।॥]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Unicode-safe phrase matcher (avoids JS `\b` bug on Devanagari/Tamil/Telugu/Kannada scripts).
 */
function hasAnyPhrase(text, phrases = []) {
  for (const phrase of phrases) {
    const p = phrase.toLowerCase().trim();
    if (!p) continue;
    const pat = new RegExp(`(?:^|\\s)${escapeRegExp(p)}(?:$|\\s)`, 'u');
    if (pat.test(text)) return true;
  }
  return false;
}

function containsAnySubstring(text, substrings = []) {
  return substrings.some((sub) => text.includes(sub));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function hasFuzzyToken(tokens, targets, maxDist = 1) {
  for (const tok of tokens) {
    for (const target of targets) {
      if (tok === target) return true;
      if (target.length >= 5 && Math.abs(tok.length - target.length) <= maxDist) {
        if (levenshtein(tok, target) <= maxDist) return true;
      }
    }
  }
  return false;
}

export function extractBusRouteNumber(raw = '') {
  const norm = normalizeSpokenNumbersAll(raw);
  // Explicit English or Indic prefix: "bus number 400", "बस नंबर 400", "பஸ் 400", "బస్సు 400", "ಬಸ್ 400"
  const explicitPrefix = norm.match(
    /(?:^|\s)(?:bus|route|line|number|no\.?|बस|रूट|नंबर|பஸ்|பேருந்து|எண்|బస్సు|బస్|నంబర్|ಬಸ್|ಬಸ್ಸು|ನಂಬರ್|ಸಂಖ್ಯೆ)\s*(?:#\s*)?(?:number|no\.?|नंबर|எண்|నంబర్|ನಂಬರ್|ಸಂಖ್ಯೆ)?\s*([a-z]?-?\d{1,4}[a-z]?)(?:\s|$|[?!.,।])/i
  );
  if (explicitPrefix) return explicitPrefix[1].toUpperCase();

  // Indic post-route order: "400 नंबर बस", "400 बस", "400 பஸ்", "400 బస్సు", "400 ಬಸ್", "400ನೇ ಬಸ್"
  const indicSuffix = norm.match(
    /(?:^|\s)([a-z]?-?\d{1,4}[a-z]?)\s*(?:ನೇ|ನಂಬರ್|ನೇಯ|नंबर|वां|वाँ|வது|వ|number|no\.?)?\s*(?:bus|route|बस|பஸ்|பேருந்து|బస్సు|బస్|ಬಸ್|ಬಸ್ಸು)(?:\s|$|[?!.,।])/i
  );
  if (indicSuffix) return indicSuffix[1].toUpperCase();

  // Attached Kannada/Tamil/Telugu ordinal+route like "400ನೇ ಬಸ್"
  const attachedOrdinal = norm.match(
    /(?:^|\s)([a-z]?-?\d{1,4}[a-z]?)(?:ನೇ|வது|వ|वां|वाँ)\s*(?:bus|route|बस|பஸ்|பேருந்து|బస్సు|బస్|ಬಸ್|ಬಸ್ಸು)/i
  );
  if (attachedOrdinal) return attachedOrdinal[1].toUpperCase();

  // "where is 400", "when is 400 coming", "400 कब आएगी", "400 எப்போ வரும்", "400 ఎప్పుడు", "400 ಯಾವಾಗ"
  const contextual = norm.match(
    /\b(?:when\s+is|where\s+is|check|next)\s+(?:bus\s+)?(\d{1,4}[a-z]?)\b/i
  );
  if (contextual) return contextual[1].toUpperCase();

  // Standalone route token (alphanumeric with digits)
  const generic = normalizeDigits(norm).match(/(?:^|\s)([a-z]-\d{2,4}[a-z]?|\d{1,4}[a-z]?)(?:\s|$|[?!.,।])/i);
  if (generic) return generic[1].toUpperCase();
  return null;
}

export function extractSourceDestination(raw = '') {
  const norm = normalizeSpokenNumbersAll(raw).trim();
  if (!norm) return null;

  // 1. English patterns
  const enPatterns = [
    /\b(?:plan\s+(?:a\s+)?(?:trip|journey|commute)|trip\s+planner|trip)\s+(?:from|between)\s+([^,]+?)\s+(?:to|and)\s+([^,.?!]+)/i,
    /\b(?:plan\s+(?:a\s+)?(?:trip|journey|commute)|trip\s+planner)\s+to\s+([^,.?!]+)/i,
    /\b(?:bus(?:es)?|bmtc|route|public\s+transport)\s+(?:from|between)\s+([^,]+?)\s+(?:to|and)\s+([^,.?!]+)/i,
    /\b(?:how\s+to\s+go|how\s+to\s+reach|how\s+to\s+get|can\s+i\s+go)\s+from\s+([^,]+?)\s+to\s+([^,.?!]+?)(?:\s+by\s+bus|\s+bmtc)?$/i,
    /\bfrom\s+([^,]+?)\s+to\s+([^,.?!]+)/i,
    /\b(?:which|what)\s+bus\s+(?:goes\s+)?from\s+([^,]+?)\s+to\s+([^,.?!]+)/i,
    /\b(?:bus(?:es)?\s+between|connecting)\s+([^,]+?)\s+and\s+([^,.?!]+)/i,
    /\b([^,]+?)\s+to\s+([^,.?!]+?)\s+(?:bus(?:es)?|trip)\b/i,
    /\b(?:bus(?:es)?|bmtc|trip)\s+to\s+([^,.?!]+)/i,
  ];

  for (const pat of enPatterns) {
    const m = norm.match(pat);
    if (m && m[1] && m[2]) {
      const src = m[1].replace(/^(?:the\s+)/i, '').trim();
      const dst = m[2].replace(/^(?:the\s+)/i, '').replace(/\b(?:by\s+bus|bmtc|please|today|now)\b/gi, '').trim();
      if (src && dst && src.toLowerCase() !== dst.toLowerCase()) {
        return { source: src, destination: dst };
      }
    } else if (m && m[1] && !m[2]) {
      const dst = m[1].replace(/^(?:the\s+)/i, '').replace(/\b(?:by\s+bus|bmtc|please|today|now)\b/gi, '').trim();
      if (dst) {
        return { source: null, destination: dst };
      }
    }
  }

  // 2. Kannada patterns: "<SOURCE> ನಿಂದ/ಇಂದ/ದಿಂದ <DEST> ಗೆ ಬಸ್"
  const knPattern = /(.+?)\s*(?:ನಿಂದ|ಇಂದ|ದಿಂದ)\s+(.+?)(?:ಗೆ|ಕ್ಕೆ|ವರೆಗೆ|ತನಕ)\s*(?:ಯಾವ\s*)?(?:ಬಸ್|ಬಸ್ಸು|ರೂಟ್|ಪ್ರಯಾಣ|ಟ್ರಿಪ್)?/iu;
  const knMatch = norm.match(knPattern);
  if (knMatch && knMatch[1] && knMatch[2]) {
    const src = knMatch[1].replace(/[\u200c\u200d]/g, '').trim();
    const dst = knMatch[2].replace(/[\u200c\u200d]/g, '').trim();
    if (src && dst) return { source: src, destination: dst };
  }

  // Kanglish: "<SOURCE> ninda/inda <DEST> ge bus"
  const kanglishPattern = /\b([a-z0-9\s]+?)\s+(?:ninda|inda)\s+([a-z0-9\s]+?)\s+(?:ge|kke|varige)\s+(?:bus|buses|trip)?/i;
  const kanglishMatch = norm.match(kanglishPattern);
  if (kanglishMatch && kanglishMatch[1] && kanglishMatch[2]) {
    return { source: kanglishMatch[1].trim(), destination: kanglishMatch[2].trim() };
  }

  // 3. Hindi: "<SOURCE> से <DEST> (तक)? बस/ट्रिप"
  const hiPattern = /([^\s]+(?:\s+[^\s]+)?)\s+से\s+([^\s]+(?:\s+[^\s]+)?)\s*(?:तक)?\s*(?:बस|रूट|ट्रिप|यात्रा)/iu;
  const hiMatch = norm.match(hiPattern);
  if (hiMatch && hiMatch[1] && hiMatch[2]) {
    return { source: hiMatch[1].trim(), destination: hiMatch[2].trim() };
  }

  // Hinglish: "<SOURCE> se <DEST> bus/trip"
  const hinglishMatch = /\b([a-z0-9\s]+?)\s+se\s+([a-z0-9\s]+?)\s+(?:tak\s+)?(?:bus|trip)\b/i.exec(norm);
  if (hinglishMatch && hinglishMatch[1] && hinglishMatch[2]) {
    return { source: hinglishMatch[1].trim(), destination: hinglishMatch[2].trim() };
  }

  return null;
}

export function extractRouteStopsQuery(raw = '') {
  const norm = normalizeSpokenNumbersAll(raw).toLowerCase().trim();
  const isStopInquiry =
    hasAnyPhrase(norm, [
      'stop explorer', 'open stop explorer', 'explore stops', 'explore bus stops', 'explore route stops', 'stops explorer',
      'stops', 'bus stops', 'all stops', 'stops list', 'list of stops', 'route stops', 'stop sequence', 'bus stop sequence',
      'stops for', 'stops of', 'what are the stops', 'where does it stop', 'which stops',
      'source to destination stops', 'intermediate stops', 'explore route',
      'ನಿಲ್ದಾಣಗಳು', 'ಬಸ್ ನಿಲ್ದಾಣಗಳು', 'ಸ್ಟಾಪ್‌ಗಳು', 'ಸ್ಟಾಪ್ ಗಳು', 'ಯಾವ ನಿಲ್ದಾಣ',
      'ಸ್ಟಾಪ್ ಲಿಸ್ಟ್', 'ನಿಲ್ದಾಣಗಳ ಪಟ್ಟಿ', 'ಸ್ಟಾಪ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್', 'ಸ್ಟಾಪ್ ಸೀಕ್ವೆನ್ಸ್',
      'स्टॉप', 'स्टॉप्स', 'बस स्टॉप', 'कहाँ रुकती है', 'कहा रुकती है', 'स्टॉप लिस्ट', 'स्टॉप एक्सप्लोरर',
      'நிறுத்தங்கள்', 'பஸ் நிறுத்தங்கள்', 'எங்கே நிற்கும்', 'ஸ்டாப் எக்ஸ்ப்ளோரர்',
      'స్టాప్‌లు', 'బస్ స్టాప్‌లు', 'ఎక్కడ ఆగుతుంది', 'స్టాప్ ఎక్స్‌ప్లోరర్',
      'stops yaavuvu', 'stops list', 'all stops', 'stop explorer',
    ]) ||
    norm.includes('stop explorer') ||
    norm.includes('explore stops') ||
    norm.includes('ಸ್ಟಾಪ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್') ||
    norm.includes('स्टॉप एक्सप्लोरर') ||
    norm.includes('stops') ||
    norm.includes('ನಿಲ್ದಾಣ') ||
    norm.includes('ಸ್ಟಾಪ್');

  if (!isStopInquiry) return null;
  let route = extractBusRouteNumber(raw);
  if (!route) {
    const standalone = norm.match(/(?:^|\s)(?:route\s+|bus\s+|for\s+|of\s+)?([a-z]?-?\d{1,4}[a-z]?)(?:\s|$|[?!.,])/i);
    if (standalone && standalone[1] && /\d/.test(standalone[1])) {
      route = standalone[1].toUpperCase();
    }
  }
  if (route) return { routeNumber: route };

  const isExplicitExplorer =
    hasAnyPhrase(norm, [
      'stop explorer', 'open stop explorer', 'explore stops', 'explore bus stops', 'stops explorer',
      'ಸ್ಟಾಪ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್', 'ನಿಲ್ದಾಣಗಳ ಪಟ್ಟಿ', 'ಸ್ಟಾಪ್ ಸೀಕ್ವೆನ್ಸ್',
      'स्टॉप एक्सप्लोरर', 'स्टॉप लिस्ट', 'बस स्टॉप एक्सप्लोरर',
      'ஸ்டாப் எக்ஸ்ப்ளோரர்', 'స్టాప్ ఎక్స్‌ప్లోరర్',
    ]);
  return isExplicitExplorer ? { routeNumber: null, isExplorerCommand: true } : null;
}

export function extractNavigationPlace(raw = '') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // English prefix patterns
  const prefixPatterns = [
    /\bfrom\s+my\s+(?:current\s+)?location\s+to\s+(.+)$/i,
    /\b(?:start\s+)?(?:navigation|navigate|navigating|directions?|route|path|way)\s+(?:me\s+)?(?:to|toward|towards|for)\s+(.+)$/i,
    /\b(?:start\s+)?(?:walking\s+(?:assistance|directions?|route|guide|help)?|walk)\s+(?:me\s+)?(?:to|toward|towards|for)\s+(.+)$/i,
    /\b(?:take|guide|bring|lead)\s+me\s+(?:to|toward|towards)\s+(.+)$/i,
    /\b(?:go|head)\s+(?:to|toward|towards)\s+(.+)$/i,
    /\b(?:how\s+(?:do\s+i|can\s+i)\s+(?:walk|get|reach|go)|how\s+to\s+(?:walk|get|reach|go))\s+(?:to\s+)?(.+)$/i,
    /\b(?:help\s+me\s+(?:walk|get|reach|go)|i\s+(?:want|need)\s+to\s+(?:walk|get|reach|go))\s+(?:to\s+)?(.+)$/i,
  ];
  for (const pat of prefixPatterns) {
    const m = trimmed.match(pat);
    if (m && m[1]) {
      const cleaned = m[1]
        .replace(/[.?!।]+$/g, '')
        .replace(/\b(?:please|right now|now|for me)\b/gi, '')
        .replace(/^(?:the\s+)/i, '')
        .trim();
      if (cleaned) return cleaned;
    }
  }

  // Indic & Romanized postposition patterns: "<PLACE> [postposition] <nav-verb>"
  const sanitized = trimmed.replace(/[\u200c\u200d]/g, '');
  const indicDestMatch = sanitized.match(
    /^(.+?)\s+(?:जाना\s+है|जाना|ले\s+चलो|ले\s+चलिए|रास्ता\s+बताओ|रास्ता\s+बताइए|रास्ता\s+दिखाओ|रास्ता\s+दिखाइए|नेविगेट\s+करो|चलो|चलिए|पैदल\s+रास्ता|jaana\s+hai|jana\s+hai|le\s+chalo|rasta\s+batao|rasta\s+dikhao|navigate\s+karo|போகணும்|போக\s+வேண்டும்|வழி\s+சொல்லு|வழி\s+சொல்லுங்க|வழி\s+காட்டு|வழி\s+காட்டுங்க|நடக்கணும்|poganum|pogalam|vazhi\s+sollu|vali\s+sollu|వెళ్లాలి|వెళ్ళాలి|దారి\s+చూపించు|దారి\s+చూపించండి|దారి\s+చెప్పు|దారి\s+చెప్పండి|తీసుకెళ్లు|తీసుకెళ్ళండి|నడక\s+సహాయం|vellali|daari\s+choopinchu|daari\s+cheppu|ಹೋಗಬೇಕು|ಹೋಗ್ಬೇಕು|ಹೋಗೋಣ|ಹೋಗೋದು\s+ಹೇಗೆ|ದಾರಿ\s+ತೋರಿಸು|ದಾರಿ\s+ತೋರಿಸಿ|ದಾರಿ\s+ಹೇಳು|ದಾರಿ\s+ಹೇಳಿ|ಕರೆದುಕೊಂಡು\s+ಹೋಗು|ಕರೆದುಕೊಂಡು\s+ಹೋಗಿ|ನ್ಯಾವಿಗೇಟ್\s+ಮಾಡಿ|ನಡಿಗೆ\s+ಮಾರ್ಗದರ್ಶನ|ನಡಿಗೆ\s+ಸಹಾಯ|ವಾಕಿಂಗ್\s+ಅಸಿಸ್ಟೆನ್ಸ್|hogabeku|hogbeku|hogona|daari\s+torisu|daari\s+torisi|dari\s+torisu)(?:[.?!।]*)$/iu
  );
  if (indicDestMatch && indicDestMatch[1]) {
    let place = indicDestMatch[1]
      .replace(/^(?:मुझे|मेरा|मेरी|मेरे|कृपया|நான்|என்னை|எனக்கு|தயவுசெய்து|నేను|నన్ను|నాకు|దయచేసి|ನಾನು|ನನ್ನನ್ನು|ನನಗೆ|ದಯವಿಟ್ಟು|mujhe|please)\s+/iu, '')
      .replace(/\s+(?:को|तक|के\s+लिए|की\s+ओर|की\s+तरफ|में|से|க்கு|க்குப்|கு|కు|కి|వైపు|ಗೆ|ಕ್ಕೆ|ತನಕ|ವರೆಗೆ|ಕಡೆಗೆ|ko|tak|ki|ke|ku|ge|kk)$/iu, '')
      .replace(/[\u0B95-\u0BB9][\u0BBE-\u0BCD]?க்கு$/u, (m) => m.replace(/க்கு$/, ''))
      .replace(/[\u0C80-\u0CFF](?:ಗೆ|ಕ್ಕೆ)$/u, (m) => (m.endsWith('ಕ್ಕೆ') ? m.replace(/ಕ್ಕೆ$/, '') : m.replace(/ಗೆ$/, '')))
      .replace(/[.?!।]+$/g, '')
      .trim();
    if (place && !/^(?:कहाँ|कहां|किधर|एथे|where|enga|ekkada|elli|ನೆವಿಗೇಟ್|ನ್ಯಾವಿಗೇಟ್|navigate)$/i.test(place)) {
      return place;
    }
  }

  // Tamil/Telugu/Kannada attached suffix e.g. "மெட்ரோக்கு வழி" / "ರೋಡ್‌ಗೆ ದಾರಿ" / "ಮೆಜೆಸ್ಟಿಕ್‌ಗೆ ಹೋಗಬೇಕು"
  const attachedSuffixMatch = sanitized.match(
    /^(.+?)(?:க்கு|కు|కి|ಗೆ|ಕ್ಕೆ|ತನಕ|ವರೆಗೆ)\s+(?:வழி|போக|దారి|వెళ్లాలి|వెళ్ళాలి|ದಾರಿ|ಹೋಗಬೇಕು|ಹೋಗ್ಬೇಕು|ಹೋಗೋಣ|ಹೋಗೋದು|ತಿಳಿಸು|ತಿಳಿಸಿ|ಚೂಪించు|ತೋರಿಸು|ತೋರಿಸಿ|ಹೇಳು|ಹೇಳಿ|ಕರೆದುಕೊಂಡು|ನಡಿಗೆ\s+ಮಾರ್ಗದರ್ಶನ|ನಡಿಗೆ\s+ಸಹಾಯ|ವಾಕಿಂಗ್\s+ಅಸಿಸ್ಟೆನ್ಸ್)/iu
  );
  if (attachedSuffixMatch && attachedSuffixMatch[1]) {
    const place = attachedSuffixMatch[1]
      .replace(/^(?:நான்|நேனு|ನೆನು|ನಾನು|ನೇನು|mujhe)\s+/iu, '')
      .trim();
    if (place && !/^(?:ನನ|ನನಗೆ|ನಾನು|எனக்கு|నాకు|mujhe)$/iu.test(place)) {
      return place;
    }
  }

  return null;
}

function detectLanguageSwitchIntent(text) {
  const switchVerb = hasAnyPhrase(text, [
    'switch language', 'change language', 'speak in', 'talk in', 'use language', 'reply in', 'respond in',
    'भाषा बदलो', 'भाषा बदलें', 'में बोलो', 'में बात करो', 'में जवाब दो',
    'மொழி மாற்று', 'பேசு', 'மொழியில்',
    'భాష మార్చు', 'లో మాట్లాడు', 'లో చెప్పు',
    'ಭಾಷೆ ಬದಲಿಸಿ', 'ಭಾಷೆ ಬದಲಾಯಿಸಿ', 'ನಲ್ಲಿ ಮಾತಾಡು', 'ನಲ್ಲಿ ಮಾತಾಡಿ', 'ನಲ್ಲಿ ಹೇಳು', 'ನಲ್ಲಿ ಹೇಳಿ', 'ನಲ್ಲಿ ಉತ್ತರಿಸಿ',
    'mein bolo', 'mein baat', 'il pesu', 'lo matladu', 'dalli matadu', 'dalli matadi',
  ]) || containsAnySubstring(text, [
    'हिंदी में', 'हिन्दी में', 'தமிழில்', 'தமிழுக்கு', 'తెలుగులో',
    'ಕನ್ನಡದಲ್ಲಿ', 'ಕನ್ನಡ ಭಾಷೆ', 'english mein', 'अंग्रेजी में', 'ஆங்கிலத்தில்', 'ఇంగ్లీషులో', 'ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ', 'ಇಂಗ್ಲಿಷ್ ನಲ್ಲಿ',
  ]);

  if (!switchVerb) return null;
  if (containsAnySubstring(text, ['hindi', 'हिंदी', 'हिन्दी', 'hinglish'])) return 'hi-IN';
  if (containsAnySubstring(text, ['tamil', 'तमिल', 'தமிழ்', 'தமிழில்', 'தமிழுக்கு'])) return 'ta-IN';
  if (containsAnySubstring(text, ['telugu', 'तेलुगु', 'తెలుగు'])) return 'te-IN';
  if (containsAnySubstring(text, ['kannada', 'कन्नड़', 'ಕನ್ನಡ'])) return 'kn-IN';
  if (containsAnySubstring(text, ['english', 'अंग्रेजी', 'आंग्ल', 'ஆங்கிலம்', 'ஆங்கிலத்தில்', 'ఇంగ్లీష్', 'ఇంగ్లీషులో', 'ಇಂಗ್ಲಿಷ್'])) return 'en-IN';
  return null;
}

export function parseIntent(transcript = '', options = {}) {
  const raw = String(transcript || '').trim();
  const text = cleanText(raw);
  const detectedLang = detectLanguageFromText(raw, options.language || 'en-IN');

  if (!text) {
    return { intent: INTENTS.UNKNOWN, confidence: 0, transcript: raw, detectedLang, slots: {} };
  }

  const tokens = text.split(' ').filter(Boolean);
  const {
    navigationActive = false,
    pendingConfirmation = null,
    sosCountdownActive = false,
  } = options;

  const makeResult = (intent, confidence, slots = {}) => ({
    intent,
    confidence,
    transcript: raw,
    detectedLang,
    slots,
  });

  // 0. Language switching request
  const targetLang = detectLanguageSwitchIntent(text);
  if (targetLang) {
    return makeResult(INTENTS.SET_LANGUAGE, 0.96, { targetLang });
  }

  // 1. Always prioritize CANCEL during active SOS countdown; otherwise allow explicit NAV_STOP before generic CANCEL
  if (
    sosCountdownActive &&
    (text === 'stop' ||
      hasFuzzyToken(tokens, ['cancel', 'abort', 'stop'], 1) ||
      hasAnyPhrase(text, [
        'रद्द', 'रद्द करो', 'रोको', 'बंद करो', 'रुक', 'रद्द करें', 'कैंसल',
        'ரத்து', 'நிறுத்து', 'வேண்டாம்',
        'రద్దు', 'ఆపు', 'ఆపండి', 'వద్దు',
        'ರದ್ದು', 'ರದ್ದು ಮಾಡು', 'ರದ್ದು ಮಾಡಿ', 'ನಿಲ್ಲಿಸು', 'ನಿಲ್ಲಿಸಿ', 'ಸಾಕು', 'ಬೇಡ', 'ಬೇಡ ಬಿಡಿ', 'ಕ್ಯಾನ್ಸಲ್',
        'ruko', 'aapu', 'nillisu', 'niruthu', 'beda'
      ]))
  ) {
    return makeResult(INTENTS.CANCEL, 0.96);
  }

  if (
    !sosCountdownActive &&
    (hasAnyPhrase(text, [
      'stop navigation', 'end navigation', 'exit navigation', 'cancel navigation', 'stop route',
      'नेविगेशन रोको', 'नेविगेशन बंद करो', 'रास्ता बंद करो', 'रास्ता रोको',
      'வழிகாட்டுதலை நிறுத்து', 'நடைபயணம் நிறுத்து', 'வழி நிறுத்து',
      'నావిగేషన్ ఆపు', 'దారి ఆపండి', 'దారి ఆపు',
      'ನ್ಯಾವಿಗೇಶನ್ ನಿಲ್ಲಿಸು', 'ನ್ಯಾವಿಗೇಶನ್ ರದ್ದು', 'ದಾರಿ ನಿಲ್ಲಿಸಿ', 'ದಾರಿ ನಿಲ್ಲಿಸು',
    ]) || (navigationActive && hasAnyPhrase(text, ['रोको', 'निरुथु', 'நிறுத்து', 'ఆపు', 'ನಿಲ್ಲಿಸು', 'ನಿಲ್ಲಿಸಿ', 'ಸಾಕು', 'aapu', 'nillisu', 'niruthu'])))
  ) {
    return makeResult(INTENTS.NAV_STOP, 0.97);
  }

  if (
    hasAnyPhrase(text, [
      'cancel', 'abort', 'never mind', 'nevermind', 'dont send', 'do not send', 'stop countdown', 'cancel sos', 'stop emergency',
      'रद्द', 'रद्द करो', 'रद्द करें', 'कैंसल', 'मत भेजो', 'बंद करो', 'छोड़ो',
      'ரத்து', 'ரத்து செய்', 'வேண்டாம்', 'அனுப்பாதே', 'niruthu', 'vendam',
      'రద్దు', 'రద్దు చేయి', 'క్యాన్సల్', 'వద్దు', 'పంపొద్దు', 'vaddu',
      'ರದ್ದು', 'ರದ್ದು ಮಾಡು', 'ರದ್ದು ಮಾಡಿ', 'ರದ್ದುಗೊಳಿಸಿ', 'ಬೇಡ', 'ಬೇಡ ಬಿಡಿ', 'ಕ್ಯಾನ್ಸಲ್', 'ಕ್ಯಾನ್ಸಲ್ ಮಾಡಿ', 'ಸಾಕು', 'beda',
    ])
  ) {
    return makeResult(INTENTS.CANCEL, 0.99);
  }

  // 2. Active voice confirmation replies (e.g. navigation disambiguation / bus fallback)
  if (pendingConfirmation) {
    const optNumMatch =
      text.match(/(?:^|\s)(?:option|choice|number|match|विकल्प|ऑप्शन|नंबर|விருப்பம்|ஆப்ஷன்|ஆப்ஷன|ఆప్షన్|ఎంపిక|ಆಯ್ಕೆ|ಆಪ್ಷನ್)\s*(1|2|3|4|first|second|third|पहला|दूसरा|तीसरा|முதல்|இரண்டாவது|மூன்றாவது|మొదటి|రెండవ|మూడవ|ಮೊದಲ|ಎರಡನೇ|ಮೂರನೇ)(?:\s|$)/u) ||
      text.match(/^\s*(first|second|third|one|two|three|1|2|3)\s*(?:one)?\s*$/);
    if (optNumMatch) {
      const word = optNumMatch[1];
      const mapIdx = {
        1: 0, first: 0, one: 0, पहला: 0, முதல்: 0, మొదటి: 0, ಮೊದಲ: 0,
        2: 1, second: 1, two: 1, दूसरा: 1, இரண்டாவது: 1, రెండవ: 1, ಎರಡನೇ: 1,
        3: 2, third: 2, three: 2, तीसरा: 2, மூன்றாவது: 2, మూడవ: 2, ಮೂರನೇ: 2,
        4: 3,
      };
      return makeResult(INTENTS.CONFIRM_OPTION, 0.95, { index: mapIdx[word] ?? 0 });
    }
    if (
      hasAnyPhrase(text, [
        'yes', 'yeah', 'yep', 'correct', 'confirm', 'sure', 'ok', 'okay', 'proceed', 'start', 'go ahead', 'right', 'that one',
        'हाँ', 'हां', 'जी', 'सही', 'ठीक है', 'ठीक', 'शुरू करो', 'haan', 'ha',
        'ஆம்', 'ஆமாம்', 'சரி', 'தொடங்கு', 'aam', 'aama', 'seri',
        'అవును', 'సరే', 'ప్రారంభించు', 'avunu', 'sare',
        'ಹೌದು', 'ಸರಿ', 'ಆಯ್ತು', 'ಓಕೆ', 'ಪ್ರಾರಂಭಿಸಿ', 'ಶುರು ಮಾಡಿ', 'haudu', 'howdu',
      ])
    ) {
      return makeResult(INTENTS.CONFIRM_YES, 0.95);
    }
    if (
      hasAnyPhrase(text, [
        'no', 'nope', 'wrong', 'other', 'next', 'different', 'neither', 'not that',
        'नहीं', 'ना', 'गलत', 'दूसरा', 'nahi', 'nahin',
        'இல்லை', 'வேண்டாம்', 'தவறு', 'illa', 'illai',
        'కాదు', 'వద్దు', 'తప్పు', 'kaadu', 'kadu',
        'ಇಲ್ಲ', 'ಅಲ್ಲ', 'ಬೇಡ', 'ತಪ್ಪು', 'illa',
      ])
    ) {
      return makeResult(INTENTS.CONFIRM_NO, 0.93);
    }
    if (pendingConfirmation.kind === 'bus_no_data') {
      if (hasAnyPhrase(text, ['navigate', 'stop', 'bus stop', 'walk', 'स्टॉप', 'रास्ता', 'நிறுத்தம்', 'வழி', 'స్టాప్', 'దారి', 'ನಿಲ್ದಾಣ', 'ದಾರಿ'])) {
        return makeResult(INTENTS.CONFIRM_OPTION, 0.9, { action: 'navigate_to_stop' });
      }
      if (hasAnyPhrase(text, ['volunteer', 'assistance', 'help', 'मदद', 'सहायता', 'உதவி', 'సహాయం', 'ಸಹಾಯ'])) {
        return makeResult(INTENTS.CONFIRM_OPTION, 0.9, { action: 'volunteer_assistance' });
      }
    }
  }

  // 3. Emergency SOS (voice distress & typos across all 5 languages)
  if (
    hasAnyPhrase(text, [
      'sos', 's o s', 'emergency', 'im in danger', 'i am in danger', 'in danger', 'save me', 'distress', 'medical emergency', 'emergency sos',
      'आपातकाल', 'आपातकालीन', 'आपातकालीन एसओएस', 'एसओएस', 'एस ओ एस', 'बचाओ', 'मुझे बचाओ', 'खतरा', 'खतरे में', 'आपातकालीन मदद', 'इमरजेंसी',
      'bachao', 'khatra', 'khatre mein', 'emergency sos',
      'அவசரம்', 'அவசர உதவி', 'ஆபத்து', 'காப்பாற்றுங்கள்', 'காப்பாத்து', 'எஸ் ஓ எஸ்', 'எமர்ஜென்சி', 'aabaththu', 'avasaram',
      'అత్యవసరం', 'అత్యవసర', 'ప్రమాదం', 'రక్షించండి', 'కాపాడండి', 'ఎస్ ఓ ఎస్', 'ఎమర్జెన్సీ', 'pramadam', 'kapadandi',
      'ತುರ್ತು', 'ತುರ್ತು ಪರಿಸ್ಥಿತಿ', 'ತುರ್ತು ಸಹಾಯ', 'ಅಪಾಯ', 'ಅಪಾಯದಲ್ಲಿದ್ದೇನೆ', 'ಕಾಪಾಡಿ', 'ನನ್ನನ್ನು ಕಾಪಾಡಿ', 'ರಕ್ಷಿಸಿ', 'ಎಮರ್ಜೆನ್ಸಿ', 'ಎಸ್ ಒ ಎಸ್', 'ಎಸ್ಓಎಸ್', 'apattu', 'aapattu', 'kapadi',
    ]) ||
    containsAnySubstring(text, ['आपातकालीन', 'बचाओ', 'अवसर sos', 'அவசர sos', 'అత్యవసర sos', 'ತುರ್ತು sos', 'ಎಸ್ ಒ ಎಸ್', 'ಎಸ್ಓಎಸ್']) ||
    hasFuzzyToken(tokens, ['emergency', 'danger'], 2)
  ) {
    return makeResult(INTENTS.EMERGENCY_SOS, 0.98);
  }

  // 4. In-navigation commands when walking route is active (or explicitly spoken anytime)
  if (
    hasAnyPhrase(text, [
      'how far', 'distance remaining', 'how much further', 'how long left', 'eta remaining', 'remaining distance',
      'कितनी दूर', 'कितना दूर', 'कितनी दूरी', 'कितना समय', 'kitni door', 'kitna door',
      'எவ்வளவு தூரம்', 'இன்னும் எவ்வளவு தூரம்', 'evvalavu dooram', 'evlo dooram',
      'ఎంత దూరం', 'ఇంకా ఎంత దూరం', 'entha dooram', 'enta dooram',
      'ಎಷ್ಟು ದೂರ', 'ಇನ್ನು ಎಷ್ಟು ದೂರ', 'ಇನ್ನೆಷ್ಟು ದೂರ', 'eshtu doora', 'eshtu dura',
    ])
  ) {
    return makeResult(INTENTS.NAV_HOW_FAR, 0.96);
  }
  if (
    navigationActive &&
    hasAnyPhrase(text, [
      'repeat', 'next turn', 'what next', 'where do i turn', 'say again',
      'अगला मोड़', 'कहाँ मुड़ना है', 'फिर से बताओ', 'அடுத்த திருப்பம்', 'தற்போதைய படி', 'తరువాతి మలుపు', 'ಮುಂದಿನ ತಿರುವು', 'ಮತ್ತೆ ಹೇಳಿ',
    ])
  ) {
    return makeResult(INTENTS.NAV_REPEAT, 0.95);
  }

  // 5. Eyes on Demand (LIVE_ASSIST) & What is ahead (WHAT_IS_AHEAD)
  if (
    hasAnyPhrase(text, [
      'what is ahead', 'whats ahead', 'what is in front', 'whats in front', 'any obstacle', 'obstacles ahead', 'obstacle', 'obstacles', 'any obstacles', 'obstacle ahead',
      'आगे क्या है', 'सामने क्या है', 'aage kya hai', 'samne kya hai',
      'முன்னால் என்ன இருக்கிறது', 'எதிரில் என்ன இருக்கிறது', 'munnadi enna',
      'ముందు ఏముంది', 'ఎదురుగా ఏముంది', 'mundu emundi',
      'ಮುಂದೆ ಏನಿದೆ', 'ಮುಂದೇನಿದೆ', 'ಎದುರು ಏನಿದೆ', 'ಮುಂದೆ ಅಡೆತಡೆ', 'ಅಡೆತಡೆ ಇದೆಯಾ', 'ಅಡೆತಡೆ', 'ಅಡೆತಡೆಗಳು', 'ಏನಿದೆ ಮುಂದೆ', 'ಮುಂದೆ ಯಾರಿದ್ದಾರೆ', 'ಮುಂದೆ ಏನಾದ್ರೂ ಇದೆಯಾ', 'ಮುಂದೆ ಯಾರಾದ್ರೂ ಇದ್ದಾರಾ', 'munde enide', 'adetade idiya',
    ]) ||
    containsAnySubstring(text, ['ಮುಂದೆ ಏನಿದೆ', 'ಮುಂದೇನಿದೆ', 'ಎದುರು ಏನಿದೆ', 'ಅಡೆತಡೆ', 'ಮುಂದೆ ಅಡೆತಡೆ', 'whats ahead', 'what is ahead'])
  ) {
    return makeResult(INTENTS.WHAT_IS_AHEAD, 0.96);
  }

  if (
    hasAnyPhrase(text, [
      'show someone my camera', 'show my camera', 'i need eyes', 'need eyes', 'eyes on demand', 'live video help', 'start camera help', 'see through my camera',
      'कैमरा दिखाओ', 'मेरा कैमरा दिखाओ', 'कैमरा दिखाइए', 'लाइव वीडियो मदद', 'किसी को कैमरा दिखाओ', 'camera dikhao', 'mera camera dikhao',
      'என் கேமராவை காட்டு', 'கேமரா காட்டு', 'கேமரா காட்டுங்க', 'நேரடி வீடியோ உதவி', 'camera kaattu',
      'నా కెమెరా చూపించు', 'కెమెరా చూపించు', 'కెమెరా చూపించండి', 'లైవ్ వీడియో సహాయం', 'camera choopinchu', 'camera chupinchu',
      'ನನ್ನ ಕ್ಯಾಮೆರಾ ತೋರಿಸು', 'ನನ್ನ ಕ್ಯಾಮೆರಾ ತೋರಿಸಿ', 'ಕ್ಯಾಮೆರಾ ತೋರಿಸು', 'ಕ್ಯಾಮೆರಾ ತೋರಿಸಿ', 'ಕ್ಯಾಮೆರಾ ಆನ್ ಮಾಡಿ', 'ಲೈವ್ ವಿಡಿಯೋ ಸಹಾಯ', 'camera torisu', 'camera torisi', 'camera thorsu',
    ]) ||
    ((tokens.includes('camera') || containsAnySubstring(text, ['कैमरा', 'கேமரா', 'కెమెరా', 'ಕ್ಯಾಮೆರಾ'])) &&
      (hasFuzzyToken(tokens, ['someone', 'eyes', 'volunteer', 'help', 'show', 'dikhao', 'kaattu', 'choopinchu', 'torisu', 'torisi'], 1) ||
        containsAnySubstring(text, ['दिखा', 'காட்டு', 'చూపించ', 'ತೋರಿಸ', 'ಆನ್', 'मदद', 'உதவி', 'సహాయం', 'ಸಹಾಯ'])))
  ) {
    return makeResult(INTENTS.LIVE_ASSIST, 0.96);
  }

  // 6. Volunteer Assistance (distinguished carefully from HELP capabilities menu!)
  const isHelpMenuQuery =
    text === 'help' ||
    hasAnyPhrase(text, [
      'what can you do', 'list commands', 'commands', 'assistant menu', 'capabilities',
      'मदद सूची', 'क्या कर सकते हो', 'कमांड सूची',
      'உதவி பட்டியல்', 'என்ன செய்ய முடியும்', 'கட்டளைகள்',
      'సహాయం మెను', 'ఏమి చేయగలవు',
      'ಸಹಾಯ ಪಟ್ಟಿ', 'ಏನು ಮಾಡಬಹುದು', 'ಏನೆಲ್ಲಾ ಮಾಡಬಹುದು', 'ಕಮಾಂಡ್ಸ್', 'ಕಮಾಂಡ್ ಪಟ್ಟಿ', 'ಹೆಲ್ಪ್ ಮೆನು',
    ]);

  const hasVolunteerToken =
    containsAnySubstring(text, [
      'ವಾಲಂಟಿಯರ್', 'ವಲಂಟಿಯರ್', 'ವಾಲಂಟಿಯನ್ಸ್', 'ಸ್ವಯಂಸೇವಕ', 'ಸ್ವಯಂಸೇವಕರ', 'ಸ್ವಯಂಸೇವಕರು',
      'தன்னார்வலர்', 'వాలంటీర్', 'volunteer', 'volunteers'
    ]);

  const isWalkingAssistance =
    hasAnyPhrase(text, [
      'walking assistance', 'walk assistance', 'walking guide', 'walking route', 'walking directions', 'walking navigation',
      'ನಡಿಗೆ ಸಹಾಯ', 'ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ', 'ವಾಕಿಂಗ್ ಅಸಿಸ್ಟೆನ್ಸ್', 'पैदल सहायता',
    ]) || (text.includes('walking') && !hasVolunteerToken) || (Boolean(extractNavigationPlace(raw)));

  if (
    !isHelpMenuQuery &&
    !isWalkingAssistance &&
    (hasVolunteerToken ||
      hasAnyPhrase(text, [
        'volunteer assistance', 'need a volunteer', 'find a volunteer', 'find volunteer', 'request volunteer', 'can i get a volunteer', 'can i get the volunteers', 'get me a volunteer',
        'help me cross', 'cross the road', 'cross street', 'need someone to help me', 'someone to help',
        'i need assistance', 'request assistance', 'assist me', 'i need help',
        'मुझे मदद चाहिए', 'मदद चाहिए', 'मदद करो', 'मदद कीजिए', 'सड़क पार करने में मदद', 'सड़क पार', 'स्वयंसेवक चाहिए', 'स्वयंसेवक बुलाओ',
        'madad chahiye', 'madad karo', 'road cross', 'sadak paar',
        'எனக்கு உதவி வேண்டும்', 'உதவி வேண்டும்', 'உதவி செய்', 'உதவி பண்ணுங்க', 'ரோடு தாண்ட உதவி', 'சாலையை கடக்க உதவி', 'தன்னார்வலர் வேண்டும்',
        'udavi venum', 'uthavi venum', 'road cross panna',
        'నాకు సహాయం కావాలి', 'సహాయం కావాలి', 'సహాయం చేయండి', 'రోడ్డు దాటడానికి సహాయం', 'వాలంటీర్ కావాలి',
        'sahayam kavali', 'sahayam cheyandi', 'road daataniki',
        'ನನಗೆ ಸಹಾಯ ಬೇಕು', 'ನನಗೆ ಸಹಾಯ ಮಾಡಿ', 'ಸಹಾಯ ಬೇಕು', 'ಸಹಾಯ ಮಾಡಿ', 'ಹೆಲ್ಪ್ ಬೇಕು', 'ಹೆಲ್ಪ್ ಮಾಡಿ', 'ರಸ್ತೆ ದಾಟಲು ಸಹಾಯ', 'ರಸ್ತೆ ದಾಟಲು ಸಹಾಯ ಮಾಡಿ', 'ರಸ್ತೆ ದಾಟಿಸಿ', 'ದಾಟಲು ಸಹಾಯ', 'ಸ್ವಯಂಸೇವಕ ಬೇಕು', 'ಸ್ವಯಂಸೇವಕರ ಸಹಾಯ ಬೇಕು', 'ಸ್ವಯಂಸೇವಕರನ್ನು ಕರೆಯಿರಿ', 'ವಾಲಂಟಿಯರ್ ಬೇಕು', 'ವಾಲಂಟಿಯರ್ ಸಹಾಯ ಬೇಕು', 'ವಲಂಟಿಯರ್ ಬೇಕು', 'ಯಾರನ್ನಾದರೂ ಸಹಾಯಕ್ಕೆ ಕಳಿಸಿ',
        'sahaya beku', 'sahaya madi', 'road cross maadoke', 'volunteer beku',
      ]) ||
      (navigationActive && hasAnyPhrase(text, ['i need help', 'need help', 'help me', 'मदद', 'உதவி', 'సహాయం', 'ಸಹಾಯ'])) ||
      hasFuzzyToken(tokens, ['volunteer', 'assistance'], 2))
  ) {
    let assistanceType = 'crossing road';
    if (
      navigationActive ||
      containsAnySubstring(text, ['navigate', 'lost', 'way', 'direction', 'रास्ता', 'खो गया', 'வழி', 'దారి', 'ದಾರಿ'])
    ) {
      assistanceType = 'navigation';
    } else if (
      !containsAnySubstring(text, ['cross', 'road', 'street', 'सड़क', 'पार', 'ரோடு', 'சாலை', 'கடக்க', 'தாண்ட', 'రోడ్డు', 'దాట', 'ರಸ್ತೆ', 'ದಾಟ', 'volunteer', 'स्वयंसेवक', 'ಸ್ವಯಂಸೇವಕ'])
    ) {
      assistanceType = 'other';
    }
    return makeResult(INTENTS.VOLUNTEER_ASSISTANCE, 0.95, {
      assistanceType,
      fromNavigation: navigationActive,
    });
  }

  // 7. Family Call / Send Location (includes Parents, Mom, Dad, Guardians across languages)
  const isFamilyCallQuery =
    hasAnyPhrase(text, [
      'call my family', 'call family', 'ring family', 'phone my family', 'contact my family', 'notify my family', 'alert my family',
      'call my parents', 'call parents', 'phone parents', 'ring parents', 'contact parents',
      'call mom', 'call my mom', 'call dad', 'call my dad', 'call mother', 'call father', 'call caregiver', 'call guardian',
      'परिवार को कॉल करो', 'परिवार को कॉल करें', 'घर पर फोन करो', 'परिवार को बुलाओ', 'परिवार को सूचित करो', 'माता पिता को फोन करो', 'मम्मी को फोन करो', 'पापा को फोन करो', 'घर कॉल करो', 'parivar ko call', 'ghar call',
      'குடும்பத்திற்கு போன் செய்', 'குடும்பத்தை அழை', 'வீட்டிற்கு கால் செய்', 'பெற்றோருக்கு கால் செய்', 'அம்மாவுக்கு கால் செய்', 'அப்பாவுக்கு கால் செய்', 'kudumbathukku call',
      'కుటుంబానికి కాల్ చేయి', 'కుటుంబానికి కాల్ చేయండి', 'ఇంటికి ఫోన్ చేయి', 'కుటుంబానికి ఫోన్', 'తల్లిదండ్రులకు కాల్ చేయి', 'అమ్మకు కాల్ చేయి', 'నాన్నకు కాల్ చేయి', 'intiki call',
      'ಕುಟುಂಬಕ್ಕೆ ಕರೆ ಮಾಡು', 'ಕುಟುಂಬಕ್ಕೆ ಕರೆ ಮಾಡಿ', 'ಕುಟುಂಬಕ್ಕೆ ಕಾಲ್ ಮಾಡು', 'ಕುಟುಂಬಕ್ಕೆ ಕಾಲ್ ಮಾಡಿ', 'ಮನೆಗೆ ಫೋನ್ ಮಾಡು', 'ಮನೆಗೆ ಫೋನ್ ಮಾಡಿ', 'ಮನೆಗೆ ಕಾಲ್ ಮಾಡು', 'ಮನೆಗೆ ಕಾಲ್ ಮಾಡಿ', 'ಮನೆಯವರಿಗೆ ಫೋನ್ ಮಾಡಿ', 'ಮನೆಯವರಿಗೆ ಕಾಲ್ ಮಾಡಿ', 'ಕುಟುಂಬಕ್ಕೆ ಫೋನ್', 'ಪೇರೆಂಟ್ಸ್ ಗೆ ಕಾಲ್ ಮಾಡು', 'ಪೇರೆಂಟ್ಸ್ ಗೆ ಕಾಲ್ ಮಾಡಿ', 'ಪೇರೆಂಟ್ಸ್ ಗೆ ಫೋನ್ ಮಾಡು', 'ಪೇರೆಂಟ್ಸ್ ಗೆ ಫೋನ್ ಮಾಡಿ', 'ಅಪ್ಪ ಅಮ್ಮಗೆ ಕಾಲ್ ಮಾಡು', 'ಅಪ್ಪ ಅಮ್ಮಗೆ ಕಾಲ್ ಮಾಡಿ', 'ಅಪ್ಪ ಅಮ್ಮಗೆ ಫೋನ್ ಮಾಡು', 'ಅಪ್ಪ ಅಮ್ಮಗೆ ಫೋನ್ ಮಾಡಿ', 'ಅಮ್ಮನಿಗೆ ಕಾಲ್ ಮಾಡು', 'ಅಪ್ಪನಿಗೆ ಕಾಲ್ ಮಾಡು', 'manege call', 'parents ge call',
    ]) ||
    ((text.includes('call') || text.includes('phone') || text.includes('ring') || text.includes('ಕಾಲ್') || text.includes('ಫೋನ್') || text.includes('कॉल') || text.includes('फोन')) &&
      (text.includes('parent') || text.includes('family') || text.includes('mom') || text.includes('dad') || text.includes('mother') || text.includes('father') || text.includes('ಪೇರೆಂಟ್ಸ್') || text.includes('ಅಪ್ಪ ಅಮ್ಮ') || text.includes('ಕುಟುಂಬ') || text.includes('ಮನೆಗೆ') || text.includes('ಮನೆಯವರಿಗೆ') || text.includes('परिवार') || text.includes('माता पिता')));

  if (isFamilyCallQuery) {
    return makeResult(INTENTS.CALL_FAMILY, 0.96, { actionType: 'call_family' });
  }

  if (
    hasAnyPhrase(text, [
      'send my location', 'share my location', 'send location', 'tell my family where', 'location to family', 'location to my family', 'update my family',
      'परिवार को लोकेशन भेजो', 'मेरी लोकेशन भेजो', 'लोकेशन भेजो', 'घर पर लोकेशन भेजो', 'parivar ko location bhejo', 'location bhejo',
      'குடும்பத்திற்கு இருப்பிடம் அனுப்பு', 'என் இருப்பிடத்தை அனுப்பு', 'இருப்பிடம் அனுப்பு', 'location anuppu', 'kudumbathukku location',
      'కుటుంబానికి లొకేషన్ పంపు', 'నా లొకేషన్ పంపు', 'ఇంటికి లొకేషన్ పంపు', 'location pampu', 'intiki location',
      'ಕುಟುಂಬಕ್ಕೆ ಲೊಕೇಶನ್ ಕಳಿಸು', 'ಕುಟುಂಬಕ್ಕೆ ಲೊಕೇಶನ್ ಕಳಿಸಿ', 'ಕುಟುಂಬಕ್ಕೆ ಲೊಕೇಶನ್ ಕಳುಹಿಸಿ', 'ನನ್ನ ಲೊಕೇಶನ್ ಕಳಿಸು', 'ನನ್ನ ಲೊಕೇಶನ್ ಕಳಿಸಿ', 'ನನ್ನ ಸ್ಥಳ ಕಳುಹಿಸು', 'ನನ್ನ ಸ್ಥಳ ಕಳಿಸಿ', 'ಲೊಕೇಶನ್ ಕಳಿಸು', 'ಲೊಕೇಶನ್ ಕಳಿಸಿ', 'ಲೊಕೇಶನ್ ಕಳುಹಿಸಿ', 'ಮನೆಗೆ ಲೊಕೇಶನ್ ಕಳಿಸು', 'ಮನೆಗೆ ಲೊಕೇಶನ್ ಕಳಿಸಿ', 'location kalisu', 'manege location',
    ])
  ) {
    return makeResult(INTENTS.SEND_LOCATION, 0.96, { actionType: 'send_location' });
  }

  // 8. Nearest Bus Stop vs. Bus Information vs. Walking Navigation
  const navPlace = extractNavigationPlace(raw);
  const routeNumber = extractBusRouteNumber(raw);

  // Dedicated nearest bus stop inquiry: "which is the nearest bus stop near me", "nearest bus stop", "ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್ ಯಾವುದು"
  const isNearestBusStopQuery =
    !routeNumber &&
    (hasAnyPhrase(text, [
      'nearest bus stop', 'nearest bus stand', 'nearest bus station',
      'nearby bus stop', 'nearby bus stand', 'nearby bus station',
      'closest bus stop', 'closest bus stand', 'closest bus station',
      'which is the nearest bus stop', 'which is the nearest bus stop near me',
      'where is the nearest bus stop', 'where is the closest bus stop',
      'what is the nearest bus stop', 'what is the closest bus stop',
      'find nearest bus stop', 'find closest bus stop', 'find the nearest bus stop',
      'which is nearest bus stop', 'tell me nearest bus stop', 'tell me the nearest bus stop',
      'ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್', 'ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣ', 'ಹತ್ತಿರದ ಬಸ್ ಸ್ಟ್ಯಾಂಡ್',
      'ಹತ್ತಿರದ ಬಸ್ ಸ್ಟಾಪ್ ಯಾವುದು', 'ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣ ಯಾವುದು',
      'ನನ್ನ ಹತ್ತಿರ ಇರೋ ಬಸ್ ಸ್ಟಾಪ್', 'ಹತ್ತಿರ ಇರೋ ಬಸ್ ಸ್ಟಾಪ್', 'ಹತ್ತಿರ ಬಸ್ ಸ್ಟಾಪ್',
      'ಬಸ್ ಸ್ಟಾಪ್ ಎಲ್ಲಿದೆ', 'ಹತ್ತಿರದ ಬಸ್ ನಿಲ್ದಾಣ ಎಲ್ಲಿದೆ',
      'निकटतम बस स्टॉप', 'निकटतम बस स्टैंड', 'पास का बस स्टॉप', 'पास का बस स्टैंड', 'सबसे पास का बस स्टॉप',
      'निकटतम बस स्टॉप कौन सा है', 'पास में बस स्टॉप कहाँ है',
      'அருகிலுள்ள பேருந்து நிறுத்தம்', 'அருகில் உள்ள பேருந்து நிறுத்தம்', 'அருகிலுள்ள பஸ் ஸ்டாப்',
      'அருகிலுள்ள பேருந்து நிறுத்தம் எது',
      'సమీప బస్ స్టాప్', 'సమీపంలోని బస్ స్టాప్', 'దగ్గర్లోని బస్ స్టాప్',
      'సమీప బಸ್ ಸ್ಟಾಪ್ ఏది',
      'hattirada bus stop', 'hattirada bus stand', 'pass ka bus stop', 'arugilulla bus stop', 'sameepa bus stop',
    ]) ||
      ((text.includes('nearest') || text.includes('closest') || text.includes('nearby') || text.includes('ಹತ್ತಿರದ') || text.includes('ಹತ್ತಿರ ಇರೋ') || text.includes('निकटतम') || text.includes('पास का') || text.includes('அருகிலுள்ள') || text.includes('సమీప')) &&
        (text.includes('bus stop') || text.includes('bus stand') || text.includes('bus station') || text.includes('ಬಸ್ ಸ್ಟಾಪ್') || text.includes('ಬಸ್ ನಿಲ್ದಾಣ') || text.includes('ಬಸ್ ಸ್ಟ್ಯಾಂಡ್') || text.includes('बस स्टॉप') || text.includes('बस स्टैंड') || text.includes('பேருந்து நிறுத்தம்') || text.includes('బస్ ಸ್ಟಾಪ್')) &&
        !hasAnyPhrase(text, ['navigate to', 'take me to', 'walk to', 'guide me to', 'start navigation to'])));

  if (isNearestBusStopQuery) {
    return makeResult(INTENTS.NEAREST_BUS_STOP, 0.97);
  }

  // Explicit bus stand navigation (e.g. "navigate to bus stop", "walk to bus stand")
  const isBusStandNavigation =
    !routeNumber &&
    (hasAnyPhrase(text, [
      'bus stand', 'bus stop', 'bus station',
      'ಬಸ್ ನಿಲ್ದಾಣ', 'ಬಸ್ ಸ್ಟಾಪ್', 'ಬಸ್ ಸ್ಟ್ಯಾಂಡ್',
      'बस स्टैंड', 'बस स्टॉप', 'பேருந்து நிறுத்தம்', 'బಸ್ ಸ್ಟಾಪ್',
    ]) ||
      (containsAnySubstring(text, ['bus stand', 'bus stop', 'bus station', 'ಬಸ್ ನಿಲ್ದಾಣ', 'ಬಸ್ ಸ್ಟಾಪ್', 'ಬಸ್ ಸ್ಟ್ಯಾಂಡ್', 'बस स्टैंड', 'बस स्टॉप']) &&
        hasAnyPhrase(text, [
          'navigate', 'walk', 'go', 'directions', 'take me', 'where is', 'where', 'find', 'reach', 'need', 'only',
          'ಎಲ್ಲಿದೆ', 'ದಾರಿ', 'ಹೋಗಬೇಕು', 'ಹತ್ತಿರದ', 'ತಿಳಿಸು', 'ತೋರಿಸು', 'ಕರೆದುಕೊಂಡು',
          'कहाँ', 'किधर', 'रास्ता', 'வழி', 'எங்கே', 'దారి', 'ఎక్కడ'
        ])));

  if (isBusStandNavigation && !navPlace) {
    return makeResult(INTENTS.NAVIGATION, 0.95, { place: 'Nearest Bus Stop' });
  }

  // 8b. Source to Destination BMTC Trip Planning (e.g. "bus from Majestic to Whitefield", "plan a trip to Silk Board", "trip planner")
  const srcDst = extractSourceDestination(raw);
  const isTripPlannerQuery =
    hasAnyPhrase(text, [
      'trip planner', 'open trip planner', 'plan a trip', 'plan trip', 'bus trip planner', 'bmtc trip planner',
      'plan my trip', 'plan journey', 'commute planner',
      'ಟ್ರಿಪ್ ಪ್ಲಾನರ್', 'ಪ್ರಯಾಣ ಯೋಜನೆ', 'ಪ್ರಯಾಣ ಯೋಜಿಸಿ', 'ಟ್ರಿಪ್ ಪ್ಲಾನ್', 'ಬಸ್ ಪ್ರಯಾಣ ಯೋಜನೆ',
      'ट्रिप प्लानर', 'यात्रा योजना', 'यात्रा प्लानर', 'ट्रिप प्लान', 'बस यात्रा योजना',
      'ட்ரிப் பிளானர்', 'பயண திட்டம்',
      'ట్రిప్ ప్లానర్', 'ప్రయాణ ప్రణాళిక',
    ]);

  if (srcDst && (srcDst.source || srcDst.destination)) {
    return makeResult(INTENTS.BMTC_SOURCE_DESTINATION, 0.98, {
      source: srcDst.source || null,
      destination: srcDst.destination || null,
      openMenu: false,
    });
  }

  if (isTripPlannerQuery) {
    return makeResult(INTENTS.BMTC_SOURCE_DESTINATION, 0.98, {
      source: null,
      destination: null,
      openMenu: true,
    });
  }

  // 8c. Route Stops Query & Stop Explorer (e.g. "what are the stops for 500D", "stop explorer for 500D", "explore stops")
  const stopsQuery = extractRouteStopsQuery(raw);
  const isStopExplorerQuery =
    hasAnyPhrase(text, [
      'stop explorer', 'open stop explorer', 'explore stops', 'explore bus stops', 'explore nearby stops',
      'show stop explorer', 'stops explorer',
      'ಸ್ಟಾಪ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್', 'ನಿಲ್ದಾಣಗಳ ಅನ್ವೇಷಣೆ', 'ಸ್ಟಾಪ್ ಲಿಸ್ಟ್',
      'स्टॉप एक्सप्लोरर', 'स्टॉप सूची', 'बस स्टॉप एक्सप्लोरर',
      'ஸ்டாப் எக்ஸ்ப்ளோரர்', 'நிறுத்தங்கள் எக்ஸ்ப்ளோரர்',
      'స్టాప్ ఎక్స్‌ప్లోరర్', 'స్టాప్స్ ఎక్స్‌ప్లోరర్',
    ]);

  if (stopsQuery && stopsQuery.routeNumber) {
    return makeResult(INTENTS.BMTC_ROUTE_STOPS, 0.98, {
      routeNumber: stopsQuery.routeNumber,
      isExplorerCommand: true,
    });
  }

  if (isStopExplorerQuery || stopsQuery?.isExplorerCommand) {
    return makeResult(INTENTS.BMTC_ROUTE_STOPS, 0.98, {
      routeNumber: null,
      isExplorerCommand: true,
    });
  }

  const mentionsBus =
    hasAnyPhrase(text, ['bus', 'bmtc', 'transit', 'shuttle', 'arrival', 'arriving', 'coming']) ||
    containsAnySubstring(text, ['बस', 'पहुंचेगी', 'ஆகும்', 'பஸ்', 'பேருந்து', 'బస్సు', 'ಬಸ್', 'ಬಸ್', 'ಬಸ್ಸು', 'ಬಿಎಂಟಿಸಿ']) ||
    hasFuzzyToken(tokens, ['bus'], 0);
  if (mentionsBus && !navPlace) {
    if (
      routeNumber ||
      hasAnyPhrase(text, ['bus', 'next bus', 'बस', 'பஸ்', 'பேருந்து', 'బస్సు', 'ಬಸ್', 'ಬಸ್ಸು'])
    ) {
      return makeResult(INTENTS.BUS_INFO, routeNumber ? 0.96 : 0.85, { routeNumber });
    }
  }

  // 9. Voice Navigation ("navigate to X", "walking assistance to X", "MG Road जाना है", etc.)
  if (navPlace) {
    return makeResult(INTENTS.NAVIGATION, 0.95, { place: navPlace });
  }
  if (
    hasAnyPhrase(text, [
      'walking assistance', 'start walking assistance', 'walking guide', 'walk assistance', 'walking navigation',
      'navigate', 'directions', 'walking route', 'take me',
      'रास्ता बताओ', 'नेविगेशन', 'पैदल रास्ता', 'पैदल सहायता',
      'வழி சொல்லு', 'வழிகாட்டுதல்', 'நடைபயண உதவி',
      'దారి చూపించు', 'నావిగేషన్', 'నడక సహాయం',
      'ದಾರಿ ತೋರಿಸು', 'ದಾರಿ ತೋರಿಸಿ', 'ದಾರಿ ಹೇಳಿ', 'ಮಾರ್ಗದರ್ಶನ', 'ನ್ಯಾವಿಗೇಶನ್', 'ನಡಿಗೆ ಸಹಾಯ', 'ನಡಿಗೆ ಮಾರ್ಗದರ್ಶನ', 'ವಾಕಿಂಗ್ ಅಸಿಸ್ಟೆನ್ಸ್',
    ]) ||
    hasFuzzyToken(tokens, ['navigate', 'directions'], 2)
  ) {
    return makeResult(INTENTS.NAVIGATION, 0.85, { place: null });
  }

  // 10. Where am I (supports literary & colloquial spoken forms across all 5 languages)
  if (
    hasAnyPhrase(text, [
      'where am i', 'what is my location', 'whats my location', 'current location', 'current address',
      'nearby landmark', 'which street', 'my address', 'tell me where i am', 'tell my location',
      'मैं कहाँ हूँ', 'मैं कहां हूं', 'मैं कहां पर हूं', 'मैं कहाँ पर हूँ', 'मैं किधर हूं', 'मैं किधर हूँ', 'मेरी लोकेशन क्या है', 'मेरा पता क्या है', 'मैं किस जगह हूँ', 'ये कौन सी जगह है', 'kahan hoon', 'main kahan hoon', 'kaha hu',
      'நான் எங்கே இருக்கிறேன்', 'நான் எங்க இருக்கேன்', 'எங்க இருக்கேன்', 'நான் எங்கே', 'என் இருப்பிடம் என்ன', 'எந்த இடம்', 'இது எந்த இடம்', 'naan enga irukken', 'enga irukken',
      'నేను ఎక్కడ ఉన్నాను', 'నేను ఎక్కడ ఉన్నా', 'ఎక్కడ ఉన్నాను', 'నా లొకేషన్ ఏమిటి', 'నా లొకేషన్ ఏంటి', 'ఏ స్థలం', 'nenu ekkada unnanu', 'ekkada unna',
      'ನಾನು ಎಲ್ಲಿದ್ದೇನೆ', 'ನಾನು ಎಲ್ಲಿದ್ದೀನಿ', 'ಎಲ್ಲಿದ್ದೀನಿ', 'ಎಲ್ಲಿದ್ದೇನೆ', 'ಎಲ್ಲಿ ಇದ್ದೀನಿ', 'ನಾನು ಎಲ್ಲಿ ಇದ್ದೀನಿ', 'ನಾನು ಎಲ್ಲಿ ಇದ್ದೇನೆ', 'ನಾನೆಲ್ಲಿದ್ದೀನಿ', 'ನಾನೆಲ್ಲಿದ್ದೇನೆ', 'ನಾನು ಎಲ್ಲಿ', 'ಈಗ ನಾನು ಎಲ್ಲಿ', 'ನಾನು ಈಗ ಎಲ್ಲಿದ್ದೀನಿ', 'ಈಗ ನಾನು ಎಲ್ಲಿದ್ದೀನಿ', 'ನಾನು ಎಲ್ಲಿದೀನಿ', 'ಎಲ್ಲಿದೀನಿ', 'ಎಲ್ಲಿದಿನಿ', 'ಎಲ್ಲಿದ್ದಿನಿ', 'ನನ್ನ ಸ್ಥಳ ಯಾವುದು', 'ನನ್ನ ಸ್ಥಳ', 'ನನ್ನ ಲೊಕೇಶನ್', 'ನನ್ನ ಲೊಕೇಶನ್ ಏನು', 'ನನ್ನ ಲೊಕೇಶನ್ ಹೇಳಿ', 'ಇದು ಯಾವ ಜಾಗ', 'ಇದು ಯಾವ ಸ್ಥಳ', 'ಇದು ಯಾವ ಏರಿಯಾ', 'ಇದು ಯಾವ ರೋಡು', 'ಇದು ಯಾವ ಊರು', 'ಯಾವ ಜಾಗ', 'ನನ್ನ ಜಾಗ ಹೇಳಿ', 'ನನ್ನ ಜಾಗ', 'ಇಲ್ಲಿ ಯಾವುದು', 'ಇಲ್ಲಿ ಎಲ್ಲಿದ್ದೀನಿ', 'ಲೊಕೇಶನ್ ಹೇಳಿ', 'ಲೊಕೇಶನ್ ಏನು', 'naanu elliddene', 'naanu elliddini', 'elliddini', 'ellidini',
    ]) ||
    containsAnySubstring(text, [
      'ಎಲ್ಲಿದ್ದೀನಿ', 'ಎಲ್ಲಿದೀನಿ', 'ಎಲ್ಲಿದಿನಿ', 'ಎಲ್ಲಿದ್ದಿನಿ', 'ಎಲ್ಲಿದ್ದೇನೆ', 'ಎಲ್ಲಿ ಇದ್ದೀನಿ', 'ಎಲ್ಲಿ ಇದ್ದೇನೆ',
      'ನನ್ನ ಲೊಕೇಶನ್', 'ನನ್ನ ಸ್ಥಳ', 'ನನ್ನ ಜಾಗ', 'ಇದು ಯಾವ ಜಾಗ', 'ಇದು ಯಾವ ಸ್ಥಳ', 'ಇದು ಯಾವ ಏರಿಯಾ',
      'engae irukken', 'enga irukken', 'kahan hoon', 'ekkada unna'
    ]) ||
    /(?:^|\s)(?:ನಾನು\s*)?ಎಲ್ಲಿದ್ದ[ೀೇ]ನ[ಿೆ]?(?:\s|$)/u.test(text) ||
    /(?:^|\s)(?:நான்\s*)?எங்க(?:ே)?\s*இருக்க[ேಿ]ன்(?:\s|$)/u.test(text)
  ) {
    return makeResult(INTENTS.WHERE_AM_I, 0.97);
  }

  // 11. Control commands (REPEAT / STOP_SPEECH / HELP)
  if (
    hasAnyPhrase(text, [
      'repeat', 'say that again', 'say again', 'pardon', 'what did you say',
      'दोहराएं', 'दोहराओ', 'फिर से बोलो', 'फिर से कहो', 'dobara bolo', 'phir se bolo',
      'மீண்டும் சொல்', 'திரும்பச் சொல்', 'marupadiyum sollu',
      'మళ్లీ చెప్పు', 'మరలా చెప్పు', 'malli cheppu',
      'ಮತ್ತೆ ಹೇಳು', 'ಮತ್ತೆ ಹೇಳಿ', 'ಇನ್ನೊಮ್ಮೆ ಹೇಳಿ', 'ಇನ್ನೊಂದು ಸಾರಿ ಹೇಳಿ', 'ಪುನರಾವರ್ತಿಸಿ', 'matte helu', 'matte heli',
    ])
  ) {
    return makeResult(INTENTS.REPEAT, 0.95);
  }
  if (
    hasAnyPhrase(text, [
      'stop talking', 'be quiet', 'quiet', 'mute', 'shut up', 'silence', 'stop speaking',
      'चुप हो जाओ', 'चुप रहो', 'बोलना बंद करो', 'आवाज़ बंद करो', 'chup raho',
      'பேசுவதை நிறுத்து', 'அமைதியாக இரு', 'pesuvathai niruthu',
      'మాట్లాడటం ఆపు', 'నిశ్శబ్దంగా ఉండు', 'matladatam aapu',
      'ಮಾತಾಡುವುದನ್ನು ನಿಲ್ಲಿಸು', 'ಮಾತು ನಿಲ್ಲಿಸಿ', 'ಸುಮ್ಮನಿರು', 'ಸುಮ್ಮನಿರಿ', 'ಮ್ಯೂಟ್ ಮಾಡಿ', 'ನಿಲ್ಲಿಸಿ', 'ನಿಲ್ಲಿಸು', 'ಸಾಕು', 'matadodu nillisu', 'nillisu', 'nillisi',
    ]) ||
    text === 'stop' ||
    text === 'ನಿಲ್ಲಿಸು' ||
    text === 'ನಿಲ್ಲಿಸಿ' ||
    text === 'ಸಾಕು'
  ) {
    return makeResult(INTENTS.STOP_SPEECH, 0.95);
  }
  if (isHelpMenuQuery) {
    return makeResult(INTENTS.HELP, 0.92);
  }

  return makeResult(INTENTS.UNKNOWN, 0);
}

/**
 * Run rule+fuzzy engine first; optionally delegate only unclear UNKNOWN transcripts to backend LLM.
 */
export async function resolveIntentWithFallback(transcript, options = {}, llmParserFn = null) {
  const ruleResult = parseIntent(transcript, options);
  if (ruleResult.intent !== INTENTS.UNKNOWN) {
    return { ...ruleResult, engine: 'rules' };
  }

  if (typeof llmParserFn === 'function') {
    try {
      const llmRes = await llmParserFn({
        transcript,
        language: options.language || ruleResult.detectedLang || 'en-IN',
        navigation_active: Boolean(options.navigationActive),
      });
      if (llmRes && llmRes.intent && llmRes.intent !== INTENTS.UNKNOWN && Number(llmRes.confidence || 0) >= 0.45) {
        return {
          intent: llmRes.intent,
          confidence: Number(llmRes.confidence || 0.7),
          transcript,
          detectedLang: ruleResult.detectedLang,
          slots: {
            place: llmRes.place || null,
            routeNumber: llmRes.routeNumber || null,
          },
          engine: 'llm',
        };
      }
    } catch {
      // Optional LLM fallback gracefully ignored if unreachable
    }
  }

  return { ...ruleResult, engine: 'rules' };
}
