import { assistantMsg, normalizeLangCode } from '../i18n.js';

export async function handleFamilyIntent(parsed, ctx) {
  const isCall = parsed.intent === 'CALL_FAMILY';
  const actionType = isCall ? 'call_family' : 'send_location';
  const coords = await ctx.actions.resolveBestGps();
  const lat = coords.ok ? coords.latitude : 12.9716;
  const lng = coords.ok ? coords.longitude : 77.5946;
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const isEnglish = normalizeLangCode(lang) === 'en';

  const payload = {
    action_type: actionType,
    latitude: coords.ok ? lat : null,
    longitude: coords.ok ? lng : null,
    message: isCall
      ? 'Voice Assistant Request: Please call or check in with me right away.'
      : 'Voice Assistant Check-in: Sharing my current live location with you.',
  };

  if (!state.isOnline) {
    ctx.actions.enqueueOffline({
      kind: 'family_checkin',
      label: isCall ? 'Call family alert' : 'Send location to family',
      payload,
    });
    const spoken = assistantMsg(lang, isCall ? 'family_call_offline' : 'family_loc_offline');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'queued_offline' };
  }

  try {
    const res = await ctx.services.familyService.sendCheckInAlert(payload);
    const spoken = !isEnglish
      ? assistantMsg(lang, isCall ? 'family_sent_call' : 'family_sent_loc')
      : res?.spoken_summary || assistantMsg(lang, 'family_sent_loc');
    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'executed', data: res };
  } catch (err) {
    if (!state.isOnline || Number(err?.status || 0) === 0 || err?.status >= 500) {
      ctx.actions.enqueueOffline({
        kind: 'family_checkin',
        label: isCall ? 'Call family alert' : 'Send location to family',
        payload,
      });
      const spoken = assistantMsg(lang, 'family_queued_network');
      ctx.vibrate?.('error');
      ctx.actions.speak(spoken, { lang });
      return { intent: parsed.intent, spoken, status: 'queued_offline' };
    }
    const spoken = isEnglish
      ? err?.message || assistantMsg(lang, 'family_signin_needed')
      : assistantMsg(lang, 'family_signin_needed');
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'error' };
  }
}
