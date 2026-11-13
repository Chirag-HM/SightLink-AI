import { assistantMsg } from '../i18n.js';

export async function handleLiveAssistIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  if (!state.isOnline) {
    const spoken = assistantMsg(lang, 'live_assist_offline');
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'offline_blocked' };
  }

  const spoken = assistantMsg(lang, 'live_assist_starting');
  ctx.playCue?.('confirm');
  ctx.vibrate?.('confirm');
  ctx.actions.speak(spoken, { lang });
  ctx.actions.navigateTo('/live-assist?autostart=1&voice_start=1');

  return {
    intent: parsed.intent,
    spoken,
    status: 'executed',
  };
}
