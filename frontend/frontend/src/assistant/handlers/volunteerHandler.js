import { assistantMsg } from '../i18n.js';

export async function handleVolunteerIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const assistanceType = parsed?.slots?.assistanceType || (state.navigation?.active ? 'navigation' : 'crossing road');
  const fromNavigation = Boolean(parsed?.slots?.fromNavigation || state.navigation?.active);

  const coords = await ctx.actions.resolveBestGps();
  const notes = fromNavigation
    ? `Requested assistance while walking to ${state.navigation?.destination?.short_name || 'destination'}`
    : undefined;

  if (!state.isOnline) {
    ctx.actions.enqueueOffline({
      kind: 'volunteer',
      label: `Volunteer help (${assistanceType})`,
      payload: {
        latitude: coords.latitude ?? 12.9716,
        longitude: coords.longitude ?? 77.5946,
        assistance_type: assistanceType,
        notes,
        radius_km: 0.5,
      },
    });
    const spoken = assistantMsg(lang, 'volunteer_offline');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    ctx.actions.navigateTo(
      `/assist?offline_queued=1&type=${encodeURIComponent(assistanceType)}${
        notes ? `&notes=${encodeURIComponent(notes)}` : ''
      }`
    );
    return {
      intent: parsed.intent,
      spoken,
      status: 'queued_offline',
    };
  }

  const spoken = assistantMsg(lang, 'volunteer_searching');
  ctx.playCue?.('confirm');
  ctx.vibrate?.('confirm');
  ctx.actions.speak(spoken, { lang });
  ctx.actions.navigateTo(
    `/assist?autostart=1&from_voice=1&type=${encodeURIComponent(assistanceType)}${
      notes ? `&notes=${encodeURIComponent(notes)}` : ''
    }`
  );

  return {
    intent: parsed.intent,
    spoken,
    status: 'executed',
  };
}
