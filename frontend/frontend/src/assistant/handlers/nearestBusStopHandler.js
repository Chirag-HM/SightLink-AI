import { findNearestBusStop, formatDistanceSpoken } from '../navEngine.js';
import { assistantMsg } from '../i18n.js';

export async function handleNearestBusStopIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';

  const coords = await ctx.actions.resolveBestGps();
  const lat = coords?.latitude ?? 13.0942;
  const lng = coords?.longitude ?? 77.5453;

  const origin = {
    latitude: lat,
    longitude: lng,
    source: coords?.ok ? (coords.source || 'GPS') : 'Smart Stick GPS',
  };

  const res = await findNearestBusStop(origin.latitude, origin.longitude, {
    assistantApi: ctx.services.assistantService,
  });

  const stop = res?.nearest_stop;
  if (!stop) {
    const spoken = assistantMsg(lang, 'nearest_bus_stop_none');
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'not_found' };
  }

  const distText = formatDistanceSpoken(stop.distance_m, lang);
  const minutes = stop.walking_minutes || Math.max(1, Math.round(stop.distance_m / 75));
  const spoken = assistantMsg(lang, 'nearest_bus_stop_found', {
    name: stop.name,
    dist: distText,
    minutes,
  });

  ctx.actions.setPendingConfirmation({
    kind: 'nav_nearest_bus_stop',
    origin,
    candidate: {
      short_name: stop.short_name || stop.name,
      display_name: stop.display_name || stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      distance_m: stop.distance_m,
    },
    stops: res.stops || [stop],
  });

  ctx.playCue?.('confirm');
  ctx.vibrate?.('confirm');
  ctx.actions.speak(spoken, { lang });

  return {
    intent: parsed.intent,
    spoken,
    status: 'found_awaiting_confirmation',
    stop,
  };
}
