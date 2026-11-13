/**
 * SightLink AI Voice Assistant — Pedestrian Navigation Engine
 * Pure ESM geometric helpers, Nominatim/Photon multi-match geocoding,
 * OSRM/OpenRouteService walking routing, off-route detection & turn-by-turn evaluation.
 */

import {
  assistantMsg,
  formatDirectionLocalized,
  formatDistanceSpokenLocalized,
  normalizeLangCode,
  translateManeuverStep,
} from './i18n.js';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const DEFAULT_NOMINATIM_URL = env.VITE_GEOCODER_URL || 'https://nominatim.openstreetmap.org';
const DEFAULT_OSRM_URL = env.VITE_ROUTING_URL || 'https://router.project-osrm.org/route/v1/foot';

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function compassDirection(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const toDeg = (v) => (v * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const dirs = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
  return dirs[Math.round(brng / 45) % 8];
}

export function formatDistanceMeters(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDistanceSpoken(meters, lang = 'en-IN') {
  if (!Number.isFinite(meters)) return '';
  if (normalizeLangCode(lang) !== 'en') {
    return formatDistanceSpokenLocalized(meters, lang);
  }
  if (meters < 1000) {
    const rounded = meters >= 50 ? Math.round(meters / 5) * 5 : Math.max(1, Math.round(meters));
    return `${rounded} meters`;
  }
  return `${(meters / 1000).toFixed(1)} kilometers`;
}

/**
 * Equirectangular local projection distance in meters from point `pt` to segment `a` -> `b`.
 */
export function pointToSegmentDistanceMeters(pt, a, b) {
  const pLat = Number(pt?.latitude ?? pt?.lat);
  const pLng = Number(pt?.longitude ?? pt?.lng);
  const aLat = Number(a?.latitude ?? a?.lat);
  const aLng = Number(a?.longitude ?? a?.lng);
  const bLat = Number(b?.latitude ?? b?.lat);
  const bLng = Number(b?.longitude ?? b?.lng);

  if ([pLat, pLng, aLat, aLng, bLat, bLng].some((v) => !Number.isFinite(v))) {
    return Infinity;
  }

  const refLatRad = ((aLat + bLat) / 2) * (Math.PI / 180);
  const mPerDegLat = 111132.92;
  const mPerDegLng = 111412.84 * Math.cos(refLatRad);

  const ax = 0;
  const ay = 0;
  const bx = (bLng - aLng) * mPerDegLng;
  const by = (bLat - aLat) * mPerDegLat;
  const px = (pLng - aLng) * mPerDegLng;
  const py = (pLat - aLat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-6) {
    return Math.hypot(px, py);
  }
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export function minDistanceToPolylineMeters(lat, lng, polyline = []) {
  if (!Array.isArray(polyline) || polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    const p = polyline[0];
    return haversineMeters(lat, lng, Number(p.latitude ?? p.lat), Number(p.longitude ?? p.lng));
  }
  let best = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const d = pointToSegmentDistanceMeters({ latitude: lat, longitude: lng }, polyline[i], polyline[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

export function detectOffRoute(lat, lng, polyline = [], thresholdMeters = 45) {
  const distanceMeters = minDistanceToPolylineMeters(lat, lng, polyline);
  if (!Number.isFinite(distanceMeters)) {
    return { isOffRoute: false, distanceMeters: 0 };
  }
  return {
    isOffRoute: distanceMeters > thresholdMeters,
    distanceMeters: Math.round(distanceMeters),
  };
}

function buildTurnActionText(maneuverType, modifier) {
  const mod = (modifier || '').replace(/_/g, ' ').trim();
  if (maneuverType === 'arrive') return 'arrive at your destination';
  if (maneuverType === 'depart') return 'start walking';
  if (maneuverType === 'turn' && mod) return `turn ${mod}`;
  if (maneuverType === 'continue' && mod) return `keep ${mod}`;
  if (maneuverType === 'new name' || maneuverType === 'continue') return 'continue straight';
  if (maneuverType === 'roundabout' || maneuverType === 'rotary') return 'cross the roundabout';
  if (mod) return `head ${mod}`;
  return maneuverType ? String(maneuverType).replace(/_/g, ' ') : 'continue';
}

export function formatRouteSteps(rawSteps = [], lang = 'en-IN') {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];
  const total = rawSteps.length;
  const isEnglish = normalizeLangCode(lang) === 'en';

  return rawSteps.map((st, idx) => {
    // Handles both backend `/api/assistant/route` shape and raw OSRM step shape
    const maneuver = st.maneuver || {};
    const loc = Array.isArray(maneuver.location) ? maneuver.location : null;
    const lat = Number(st.latitude ?? st.lat ?? (loc ? loc[1] : null));
    const lng = Number(st.longitude ?? st.lng ?? (loc ? loc[0] : null));
    const road = (st.road ?? st.name ?? '').trim();
    const distM = Number(st.distance_m ?? st.distance ?? 0);
    const mType = st.maneuver_type || maneuver.type || (idx === total - 1 ? 'arrive' : idx === 0 ? 'depart' : 'turn');
    const modifier = st.modifier || maneuver.modifier || '';
    const isDest = mType === 'arrive' || idx === total - 1;

    const actionPhrase = buildTurnActionText(mType, modifier);
    const roadSuffix = road ? ` onto ${road}` : '';
    const distSpoken = formatDistanceSpoken(distM, lang);
    const distShort = formatDistanceMeters(distM);

    const translated = !isEnglish
      ? translateManeuverStep({ type: isDest ? 'arrive' : idx === 0 ? 'depart' : mType, modifier, road, distanceMeters: distM, lang })
      : null;

    let label = st.instruction || '';
    if (!label) {
      if (translated) {
        label = translated.label;
      } else if (idx === 0) {
        label = road ? `Start walking along ${road}` : 'Start walking route';
      } else if (isDest) {
        label = 'Arrive at destination';
      } else {
        const cap = actionPhrase.charAt(0).toUpperCase() + actionPhrase.slice(1);
        label = `${cap}${roadSuffix}`;
      }
    }

    const spoken = translated
      ? translated.spoken
      : isDest
      ? 'You have arrived at your destination.'
      : `${label}${distSpoken ? `, walk ${distSpoken}` : ''}.`;

    const maneuverPhrase = translated
      ? translated.maneuverPhrase
      : isDest
      ? 'you will arrive at your destination'
      : `${actionPhrase}${roadSuffix}`;

    return {
      index: idx,
      label,
      sub: isDest ? road || 'Destination' : `${distShort}${road ? ` · ${road}` : ' · Footpath / Road'}`,
      road,
      distanceMeters: distM,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      isDest,
      maneuverPhrase,
      spoken,
    };
  });
}

export function dedupeGeocodeCandidates(matches = []) {
  const out = [];
  for (const m of matches) {
    const lat = Number(m.latitude ?? m.lat);
    const lng = Number(m.longitude ?? m.lng ?? m.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const shortName = String(m.short_name || m.name || m.display_name || 'Location').split(',')[0].trim();
    const street = String(m.street || '').trim();
    const displayName = String(m.display_name || shortName).trim();

    const isDup = out.some((existing) => {
      const dist = haversineMeters(existing.latitude, existing.longitude, lat, lng);
      return dist < 150 && existing.short_name.toLowerCase() === shortName.toLowerCase();
    });

    if (!isDup) {
      out.push({
        display_name: displayName,
        short_name: shortName,
        street,
        latitude: lat,
        longitude: lng,
        distance_m: m.distance_m ?? null,
        promptLabel: street && !shortName.toLowerCase().includes(street.toLowerCase())
          ? `${shortName} on ${street}`
          : shortName,
      });
    }
  }
  return out;
}

export async function geocodeDestination(query, { lat, lng, fetchFn, assistantApi } = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return { candidates: [], needsDisambiguation: false, error: 'Empty destination query' };
  }

  // 1. Prefer backend proxy (supports configured NOMINATIM / PHOTON env cleanly)
  if (assistantApi?.geocode) {
    try {
      const res = await assistantApi.geocode(q, { lat, lng, limit: 4 });
      if (Array.isArray(res?.matches) && res.matches.length > 0) {
        const candidates = dedupeGeocodeCandidates(res.matches);
        return {
          provider: res.provider || 'backend',
          candidates,
          needsDisambiguation: candidates.length > 1,
        };
      }
    } catch {
      // Fall through to direct free Nominatim/Photon
    }
  }

  // 2. Direct free Nominatim fallback in browser/client
  const doFetch = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch) {
    return { candidates: [], needsDisambiguation: false, error: 'Network fetch unavailable' };
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5500);
    const viewboxParam =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? `&viewbox=${lng - 0.25},${lat + 0.25},${lng + 0.25},${lat - 0.25}&bounded=0`
        : '';
    const nomRes = await doFetch(
      `${DEFAULT_NOMINATIM_URL}/search?format=jsonv2&limit=4&addressdetails=1&q=${encodeURIComponent(q)}${viewboxParam}`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (nomRes.ok) {
      const items = await nomRes.json();
      const normalized = (Array.isArray(items) ? items : []).map((item) => {
        const addr = item.address || {};
        const fLat = Number(item.lat);
        const fLng = Number(item.lon);
        const road = addr.road || addr.suburb || addr.neighbourhood || '';
        const short = item.name || String(item.display_name || q).split(',')[0];
        const distM =
          Number.isFinite(lat) && Number.isFinite(lng)
            ? Math.round(haversineMeters(lat, lng, fLat, fLng))
            : null;
        return {
          display_name: item.display_name || short,
          short_name: short,
          street: road,
          latitude: fLat,
          longitude: fLng,
          distance_m: distM,
        };
      });
      const candidates = dedupeGeocodeCandidates(normalized);
      return {
        provider: 'nominatim',
        candidates,
        needsDisambiguation: candidates.length > 1,
      };
    }
  } catch {
    // Fall through cleanly
  }

  return { candidates: [], needsDisambiguation: false, error: `No location matches found for ${q}` };
}

export async function reverseGeocodeLocation(lat, lng, { fetchFn } = {}) {
  const doFetch = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4500);
    const res = await doFetch(
      `${DEFAULT_NOMINATIM_URL}/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const landmark = data.name || addr.amenity || addr.shop || addr.building || addr.public_building || '';
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const area = addr.neighbourhood || addr.suburb || addr.city_district || addr.city || addr.town || '';
    const shortParts = [road, area].filter(Boolean);
    const addressText = shortParts.join(', ') || data.display_name?.split(',').slice(0, 3).join(', ') || '';

    return {
      address: addressText,
      landmark,
      road,
      area,
      displayName: data.display_name || addressText,
    };
  } catch {
    return null;
  }
}

export async function findNearestBusStop(lat, lng, { fetchFn, assistantApi } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, nearest_stop: null, stops: [], error: 'Invalid coordinates' };
  }

  // 1. Try backend proxy if available
  if (typeof assistantApi?.getNearestBusStop === 'function') {
    try {
      const res = await assistantApi.getNearestBusStop(lat, lng);
      if (res && res.success && res.nearest_stop) {
        return res;
      }
    } catch {
      // Fall through to client fetch
    }
  }

  // 2. Direct free client-side Nominatim query bounded around user's GPS
  const doFetch = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch) {
    return { success: false, nearest_stop: null, stops: [], error: 'Network fetch unavailable' };
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const delta = 0.035;
    const url = `${DEFAULT_NOMINATIM_URL}/search?format=jsonv2&limit=8&addressdetails=1&q=bus+stop&viewbox=${lng - delta},${lat + delta},${lng + delta},${lat - delta}&bounded=1`;
    const resp = await doFetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const items = await resp.json();
      const stops = (Array.isArray(items) ? items : []).map((item) => {
        const fLat = Number(item.lat);
        const fLng = Number(item.lon);
        const distM = Math.round(haversineMeters(lat, lng, fLat, fLng));
        const rawName = item.name || (item.display_name || 'Bus Stop').split(',')[0].trim();
        const name = /bus\s*stop|station/i.test(rawName) ? rawName : `${rawName} Bus Stop`;
        return {
          name,
          short_name: rawName,
          display_name: item.display_name || name,
          distance_m: distM,
          walking_minutes: Math.max(1, Math.round(distM / 75)),
          latitude: fLat,
          longitude: fLng,
        };
      });

      if (stops.length > 0) {
        stops.sort((a, b) => a.distance_m - b.distance_m);
        return {
          success: true,
          nearest_stop: stops[0],
          stops,
        };
      }
    }
  } catch {
    // Graceful fallback
  }

  return { success: false, nearest_stop: null, stops: [] };
}

export function buildCompassFallbackRoute(from, to, destName = 'Destination', lang = 'en-IN') {
  const distM = Math.round(haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude));
  const dir = compassDirection(from.latitude, from.longitude, to.latitude, to.longitude);
  const midLat = (from.latitude + to.latitude) / 2;
  const midLng = (from.longitude + to.longitude) / 2;
  const isEnglish = normalizeLangCode(lang) === 'en';
  const dirLocal = formatDirectionLocalized(dir, lang);
  const distSpoken = formatDistanceSpoken(distM, lang);

  const steps = [
    {
      index: 0,
      label: isEnglish ? `Walk ${dir} toward ${destName}` : `${destName} (${dirLocal})`,
      sub: `${formatDistanceMeters(distM)} direct bearing`,
      road: '',
      distanceMeters: distM,
      lat: midLat,
      lng: midLng,
      latitude: midLat,
      longitude: midLng,
      isDest: false,
      maneuverPhrase: isEnglish ? `head ${dir.toLowerCase()} toward ${destName}` : `${destName} (${dirLocal})`,
      spoken: isEnglish
        ? `Head ${dir.toLowerCase()} toward ${destName} for ${distSpoken}.`
        : `${destName} (${dirLocal}) — ${distSpoken}`,
    },
    {
      index: 1,
      label: isEnglish ? 'Arrive at destination' : assistantMsg(lang, 'nav_arrived', { place: destName }),
      sub: destName,
      road: destName,
      distanceMeters: 0,
      lat: to.latitude,
      lng: to.longitude,
      latitude: to.latitude,
      longitude: to.longitude,
      isDest: true,
      maneuverPhrase: isEnglish ? `arrive at ${destName}` : assistantMsg(lang, 'nav_arrived', { place: destName }),
      spoken: assistantMsg(lang, 'nav_arrived', { place: destName }),
    },
  ];

  return {
    provider: 'compass_offline',
    fallback: true,
    distanceMeters: distM,
    durationSec: Math.max(60, Math.round(distM / 1.25)),
    polyline: [
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: to.latitude, longitude: to.longitude },
    ],
    steps,
  };
}

export async function fetchWalkingRoute(from, to, { destName = 'Destination', lang = 'en-IN', fetchFn, assistantApi } = {}) {
  // 1. Prefer backend proxy (uses configured OSRM or ORS env cleanly)
  if (assistantApi?.getWalkingRoute) {
    try {
      const res = await assistantApi.getWalkingRoute({
        fromLat: from.latitude,
        fromLng: from.longitude,
        toLat: to.latitude,
        toLng: to.longitude,
      });
      if (res && Array.isArray(res.steps) && res.steps.length > 0) {
        return {
          provider: res.provider || 'osrm',
          fallback: false,
          distanceMeters: Number(res.distance_m || 0),
          durationSec: Number(res.duration_s || 0),
          polyline: Array.isArray(res.geometry) ? res.geometry : [],
          steps: formatRouteSteps(res.steps, lang),
        };
      }
    } catch {
      // Fall through to direct public OSRM
    }
  }

  // 2. Direct OSRM public foot routing
  const doFetch = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (doFetch) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const url = `${DEFAULT_OSRM_URL}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?steps=true&geometries=geojson&overview=full`;
      const osrmRes = await doFetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (osrmRes.ok) {
        const data = await osrmRes.json();
        const route = data?.routes?.[0];
        const leg = route?.legs?.[0];
        if (route && leg && Array.isArray(leg.steps) && leg.steps.length > 0) {
          const poly = (route.geometry?.coordinates || []).map(([ln, la]) => ({
            latitude: la,
            longitude: ln,
          }));
          return {
            provider: 'osrm',
            fallback: false,
            distanceMeters: Math.round(Number(route.distance || 0)),
            durationSec: Math.round(Number(route.duration || 0)),
            polyline: poly,
            steps: formatRouteSteps(leg.steps, lang),
          };
        }
      }
    } catch {
      // Fall through to compass offline fallback
    }
  }

  return buildCompassFallbackRoute(from, to, destName, lang);
}

/**
 * Evaluate GPS progress along an active walking route.
 * Detects arrival, off-route divergence, step completion, and 15m-65m approach cues ("In 50 meters, turn left...").
 */
export function evaluateNavProgress({
  lat,
  lng,
  destination,
  steps = [],
  polyline = [],
  currentStepIndex = 0,
  spokenApproaches = new Set(),
  lang = 'en-IN',
  offRouteThresholdM = 45,
  stepAdvanceThresholdM = 20,
  arrivalThresholdM = 20,
  approachTriggerMinM = 15,
  approachTriggerMaxM = 65,
} = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !destination || steps.length === 0) {
    return { action: 'none', nextStepIndex: currentStepIndex, distanceRemainingM: null };
  }

  const distToDest = Math.round(
    haversineMeters(lat, lng, Number(destination.latitude ?? destination.lat), Number(destination.longitude ?? destination.lng))
  );

  // 1. Arrival detection
  if (distToDest <= arrivalThresholdM) {
    return {
      action: 'arrived',
      nextStepIndex: steps.length - 1,
      distanceRemainingM: distToDest,
      spokenMessage: assistantMsg(lang, 'nav_arrived', {
        place: destination.short_name || destination.name,
      }),
    };
  }

  // 2. Off-route detection
  const offRoute = detectOffRoute(lat, lng, polyline, offRouteThresholdM);
  if (offRoute.isOffRoute) {
    return {
      action: 'reroute',
      nextStepIndex: currentStepIndex,
      distanceRemainingM: distToDest,
      offRouteDistanceM: offRoute.distanceMeters,
      spokenMessage: assistantMsg(lang, 'nav_reroute', { meters: offRoute.distanceMeters }),
    };
  }

  // 3. Evaluate upcoming turn step
  const nextIdx = Math.min(steps.length - 1, currentStepIndex + 1);
  const nextStep = steps[nextIdx];
  if (nextStep && Number.isFinite(nextStep.latitude) && Number.isFinite(nextStep.longitude)) {
    const distToNextTurnM = Math.round(haversineMeters(lat, lng, nextStep.latitude, nextStep.longitude));

    // Reached final arrival waypoint near building OR exact destination coordinates -> arrive
    if (nextIdx > currentStepIndex && distToNextTurnM <= stepAdvanceThresholdM) {
      if (nextStep.isDest && distToDest <= 80) {
        return {
          action: 'arrived',
          nextStepIndex: steps.length - 1,
          distanceRemainingM: 0,
          spokenMessage: assistantMsg(lang, 'nav_arrived', {
            place: destination.short_name || destination.name,
          }),
        };
      }
      return {
        action: 'advance_step',
        nextStepIndex: nextIdx,
        distanceRemainingM: distToDest,
        distanceToNextTurnM: distToNextTurnM,
        spokenMessage: nextStep.spoken,
      };
    }

    // Distance-triggered early turn cue ("In 50 meters, turn left onto Gandhi Road.")
    if (
      nextIdx > currentStepIndex &&
      distToNextTurnM >= approachTriggerMinM &&
      distToNextTurnM <= approachTriggerMaxM &&
      !spokenApproaches.has(nextIdx)
    ) {
      const cueDist = Math.round(distToNextTurnM / 5) * 5 || distToNextTurnM;
      return {
        action: 'approach_cue',
        cueStepIndex: nextIdx,
        nextStepIndex: currentStepIndex,
        distanceRemainingM: distToDest,
        distanceToNextTurnM: distToNextTurnM,
        spokenMessage: assistantMsg(lang, 'nav_approach_cue', {
          meters: cueDist,
          phrase: nextStep.maneuverPhrase,
        }),
      };
    }

    return {
      action: 'none',
      nextStepIndex: currentStepIndex,
      distanceRemainingM: distToDest,
      distanceToNextTurnM: distToNextTurnM,
      spokenMessage: null,
    };
  }

  return {
    action: 'none',
    nextStepIndex: currentStepIndex,
    distanceRemainingM: distToDest,
    distanceToNextTurnM: null,
    spokenMessage: null,
  };
}
