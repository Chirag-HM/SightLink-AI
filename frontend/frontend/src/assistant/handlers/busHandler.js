import { assistantMsg, normalizeLangCode } from '../i18n.js';

export async function handleBusInfoIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const isEnglish = normalizeLangCode(lang) === 'en';
  const routeNumber = parsed?.slots?.routeNumber;

  if (!routeNumber) {
    const spoken = assistantMsg(lang, 'bus_needs_route');
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'needs_route' };
  }

  if (!state.isOnline) {
    const spoken = assistantMsg(lang, 'bus_offline', { route: routeNumber });
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'offline' };
  }

  const coords = await ctx.actions.resolveBestGps();
  const lat = coords.latitude ?? 12.9716;
  const lng = coords.longitude ?? 77.5946;

  try {
    const res = await ctx.services.busUnifiedService.getArrivals(routeNumber, {
      latitude: lat,
      longitude: lng,
    });
    ctx.actions.setBusResult(res);

    let spoken;
    if (!isEnglish) {
      if (res?.has_data && Array.isArray(res?.arrivals) && res.arrivals.length > 0) {
        const top = res.arrivals[0];
        spoken = assistantMsg(lang, 'bus_eta', {
          route: res.route_number || routeNumber,
          stop: top.stop_name || res.nearest_stop?.name || 'Central Stop',
          eta: top.eta_minutes ?? 5,
          direction: top.direction || '',
        });
      } else if (!res?.has_data) {
        spoken = assistantMsg(lang, 'bus_no_data', { route: routeNumber });
      } else {
        spoken = assistantMsg(lang, 'bus_checked', { route: routeNumber });
      }
    } else {
      spoken = res?.spoken_summary || assistantMsg(lang, 'bus_checked', { route: routeNumber });
    }

    if (!res?.has_data) {
      ctx.actions.setPendingConfirmation({
        kind: 'bus_no_data',
        routeNumber,
        nearestStop: res?.nearest_stop || null,
        origin: { latitude: lat, longitude: lng, source: coords.source || 'GPS' },
      });
    } else {
      ctx.actions.setPendingConfirmation(null);
    }

    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    return {
      intent: parsed.intent,
      spoken,
      status: res?.has_data ? 'executed' : 'no_data',
      data: res,
    };
  } catch (err) {
    const spoken = assistantMsg(lang, 'bus_error', { route: routeNumber });
    ctx.actions.setPendingConfirmation({
      kind: 'bus_no_data',
      routeNumber,
      nearestStop: null,
      origin: { latitude: lat, longitude: lng, source: coords.source || 'GPS' },
    });
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return {
      intent: parsed.intent,
      spoken,
      status: 'error',
      error: err?.message,
    };
  }
}
