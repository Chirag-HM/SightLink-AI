import { formatDistanceSpoken, findNearestBusStop } from '../navEngine.js';
import { assistantMsg } from '../i18n.js';

export async function startRouteToCandidate(origin, candidate, ctx, langOverride) {
  const lang = langOverride || ctx.getState().language || 'en-IN';
  const route = await ctx.services.fetchWalkingRoute(
    { latitude: origin.latitude, longitude: origin.longitude },
    { latitude: candidate.latitude, longitude: candidate.longitude },
    {
      destName: candidate.short_name || candidate.display_name,
      lang,
      assistantApi: ctx.services.assistantService,
    }
  );

  const etaMin = Math.max(1, Math.round((route.durationSec || 60) / 60));
  const distText = formatDistanceSpoken(route.distanceMeters, lang);
  const firstStepText = route.steps?.[0]?.spoken || '';
  const spoken = assistantMsg(lang, route.fallback ? 'nav_started_offline' : 'nav_started', {
    place: candidate.short_name,
    dist: distText,
    minutes: etaMin,
    firstStep: firstStepText,
  });

  await ctx.actions.startNavigationSession({
    origin,
    destination: {
      name: candidate.short_name || candidate.display_name,
      short_name: candidate.short_name || candidate.display_name,
      display_name: candidate.display_name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      lat: candidate.latitude,
      lng: candidate.longitude,
    },
    steps: route.steps,
    polyline: route.polyline,
    distanceMeters: route.distanceMeters,
    durationSec: route.durationSec,
    provider: route.provider,
    fallback: route.fallback,
  });

  ctx.playCue?.('confirm');
  ctx.vibrate?.('confirm');
  ctx.actions.speak(spoken, { lang });
  ctx.actions.navigateTo('/navigation');
  return { spoken, route };
}

export async function handleNavigationIntent(parsed, ctx) {
  const lang = parsed?.detectedLang || ctx.getState().language || 'en-IN';
  const place = parsed?.slots?.place;
  if (!place) {
    const spoken = assistantMsg(lang, 'nav_ask_dest');
    ctx.vibrate?.('tap');
    ctx.actions.speak(spoken, { lang });
    ctx.actions.navigateTo('/navigation');
    return { intent: parsed.intent, spoken, status: 'needs_destination' };
  }

  const coords = await ctx.actions.resolveBestGps();
  const origin = {
    latitude: coords.latitude ?? 12.9778,
    longitude: coords.longitude ?? 77.5713,
    source: coords.ok ? coords.source : 'Default Reference',
  };

  const isGenericBusStop =
    /^(?:the\s+)?(?:nearest\s+|nearby\s+|closest\s+)?bus\s+(?:stop|stand|station)$/i.test(place) ||
    /^(?:ಹತ್ತಿರದ\s+)?ಬಸ್\s*(?:ಸ್ಟಾಪ್|ನಿಲ್ದಾಣ|ಸ್ಟ್ಯಾಂಡ್)$/i.test(place) ||
    place === 'Bus Stop' ||
    place === 'Nearest Bus Stop';

  if (isGenericBusStop) {
    const busRes = await findNearestBusStop(origin.latitude, origin.longitude, {
      assistantApi: ctx.services.assistantService,
    });
    if (busRes?.nearest_stop) {
      const stop = busRes.nearest_stop;
      const result = await startRouteToCandidate(
        origin,
        {
          short_name: stop.name,
          display_name: stop.display_name || stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          distance_m: stop.distance_m,
        },
        ctx,
        lang
      );
      return {
        intent: parsed.intent,
        spoken: result.spoken,
        status: 'executed',
      };
    }
  }

  const geo = await ctx.services.geocodeDestination(place, {
    lat: origin.latitude,
    lng: origin.longitude,
    assistantApi: ctx.services.assistantService,
  });

  if (!geo.candidates || geo.candidates.length === 0) {
    const spoken = assistantMsg(lang, 'nav_not_found', { place });
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'not_found' };
  }

  if (geo.needsDisambiguation && geo.candidates.length > 1) {
    const first = geo.candidates[0];
    const second = geo.candidates[1];
    ctx.actions.setPendingConfirmation({
      kind: 'nav_disambiguation',
      query: place,
      candidates: geo.candidates,
      candidateIndex: 0,
      origin,
    });
    const spoken = assistantMsg(lang, 'nav_disambiguate', {
      first: first.promptLabel,
      second: second.promptLabel,
    });
    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    return {
      intent: parsed.intent,
      spoken,
      status: 'awaiting_confirmation',
      candidates: geo.candidates,
    };
  }

  const result = await startRouteToCandidate(origin, geo.candidates[0], ctx, lang);
  return {
    intent: parsed.intent,
    spoken: result.spoken,
    status: 'executed',
  };
}

export async function handleNavHowFarIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const nav = state.navigation;
  if (!nav?.active) {
    const spoken = assistantMsg(lang, 'nav_inactive');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'inactive' };
  }

  const remaining = nav.distanceRemainingM ?? nav.distanceMeters ?? 0;
  const etaMin = Math.max(1, Math.round(remaining / 75));
  const curStep = nav.steps?.[nav.currentStepIndex];
  const spoken = assistantMsg(lang, 'nav_how_far', {
    dist: formatDistanceSpoken(remaining, lang),
    place: nav.destination?.short_name || '',
    minutes: etaMin,
    step: curStep?.label || '',
  });
  ctx.vibrate?.('tap');
  ctx.actions.speak(spoken, { lang });
  return { intent: parsed.intent, spoken, status: 'executed' };
}

export async function handleNavRepeatIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const nav = state.navigation;
  if (nav?.active) {
    const curStep = nav.steps?.[nav.currentStepIndex];
    const spoken = curStep?.spoken || state.lastSpoken || assistantMsg(lang, 'nav_repeat_fallback');
    ctx.vibrate?.('turn');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'executed' };
  }
  const spoken = state.lastSpoken || assistantMsg(lang, 'nav_no_repeat');
  ctx.vibrate?.('tap');
  ctx.actions.speak(spoken, { lang });
  return { intent: parsed.intent, spoken, status: 'executed' };
}

export async function handleNavStopIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const nav = state.navigation;
  if (!nav?.active) {
    const spoken = assistantMsg(lang, 'nav_not_running');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'inactive' };
  }
  await ctx.actions.stopNavigationSession('cancelled');
  const spoken = assistantMsg(lang, 'nav_stopped');
  ctx.playCue?.('cancel');
  ctx.vibrate?.('cancel');
  ctx.actions.speak(spoken, { lang });
  return { intent: parsed.intent, spoken, status: 'executed' };
}
