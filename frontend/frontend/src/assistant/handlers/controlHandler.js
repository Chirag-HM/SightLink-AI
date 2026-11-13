import { startRouteToCandidate } from './navigationHandler.js';
import { handleVolunteerIntent } from './volunteerHandler.js';
import { INTENTS } from '../intentEngine.js';
import { assistantMsg } from '../i18n.js';

export const UNKNOWN_FALLBACK_MESSAGE = assistantMsg('en-IN', 'unknown_fallback');
export const HELP_COMMANDS_MESSAGE = assistantMsg('en-IN', 'help_commands');

const LANG_DISPLAY_NAMES = {
  'en-IN': 'English',
  'en-US': 'English',
  'hi-IN': 'हिन्दी (Hindi)',
  'ta-IN': 'தமிழ் (Tamil)',
  'te-IN': 'తెలుగు (Telugu)',
  'kn-IN': 'ಕನ್ನಡ (Kannada)',
};

export async function handleControlOrConfirmationIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';

  // 0. Language switch request
  if (parsed.intent === INTENTS.SET_LANGUAGE) {
    const targetLang = parsed?.slots?.targetLang || lang;
    const name = LANG_DISPLAY_NAMES[targetLang] || targetLang;
    if (typeof ctx.actions.setLanguage === 'function') {
      ctx.actions.setLanguage(targetLang, { silent: true });
    }
    const spoken = assistantMsg(targetLang, 'language_switched', { name });
    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang: targetLang });
    return { intent: parsed.intent, spoken, status: 'executed', data: { language: targetLang } };
  }

  // 1. Handle active confirmation responses first
  if (
    parsed.intent === INTENTS.CONFIRM_YES ||
    parsed.intent === INTENTS.CONFIRM_NO ||
    parsed.intent === INTENTS.CONFIRM_OPTION
  ) {
    const pending = state.pendingConfirmation;
    if (!pending) {
      const msg = assistantMsg(lang, 'unknown_fallback');
      ctx.actions.speak(msg, { lang });
      return { intent: parsed.intent, spoken: msg, status: 'no_pending' };
    }

    if (pending.kind === 'nav_disambiguation') {
      const candidates = pending.candidates || [];
      if (parsed.intent === INTENTS.CONFIRM_OPTION) {
        const idx = Number(parsed.slots?.index ?? 0);
        const chosen = candidates[idx];
        if (chosen) {
          ctx.actions.setPendingConfirmation(null);
          const navRes = await startRouteToCandidate(pending.origin, chosen, ctx, lang);
          return { intent: parsed.intent, spoken: navRes.spoken, status: 'confirmed' };
        }
      }
      if (parsed.intent === INTENTS.CONFIRM_YES) {
        const chosen = candidates[pending.candidateIndex || 0];
        if (chosen) {
          ctx.actions.setPendingConfirmation(null);
          const navRes = await startRouteToCandidate(pending.origin, chosen, ctx, lang);
          return { intent: parsed.intent, spoken: navRes.spoken, status: 'confirmed' };
        }
      }
      if (parsed.intent === INTENTS.CONFIRM_NO) {
        const nextIdx = (pending.candidateIndex || 0) + 1;
        if (nextIdx < candidates.length) {
          const nextCand = candidates[nextIdx];
          ctx.actions.setPendingConfirmation({ ...pending, candidateIndex: nextIdx });
          const spoken = assistantMsg(lang, 'nav_did_you_mean', { label: nextCand.promptLabel });
          ctx.actions.speak(spoken, { lang });
          return { intent: parsed.intent, spoken, status: 'next_candidate' };
        }
        ctx.actions.setPendingConfirmation(null);
        const spoken = assistantMsg(lang, 'nav_selection_cancelled');
        ctx.vibrate?.('cancel');
        ctx.actions.speak(spoken, { lang });
        return { intent: parsed.intent, spoken, status: 'cancelled' };
      }
    }

    if (pending.kind === 'nav_nearest_bus_stop') {
      if (parsed.intent === INTENTS.CONFIRM_YES) {
        ctx.actions.setPendingConfirmation(null);
        const navRes = await startRouteToCandidate(pending.origin, pending.candidate, ctx, lang);
        return { intent: parsed.intent, spoken: navRes.spoken, status: 'confirmed' };
      }
      if (parsed.intent === INTENTS.CONFIRM_NO) {
        ctx.actions.setPendingConfirmation(null);
        const spoken = assistantMsg(lang, 'ok_cancelled');
        ctx.vibrate?.('cancel');
        ctx.actions.speak(spoken, { lang });
        return { intent: parsed.intent, spoken, status: 'cancelled' };
      }
    }

    if (pending.kind === 'bus_no_data') {
      if (parsed.slots?.action === 'navigate_to_stop' || parsed.intent === INTENTS.CONFIRM_YES) {
        const stop = pending.nearestStop;
        ctx.actions.setPendingConfirmation(null);
        if (stop && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) {
          const navRes = await startRouteToCandidate(
            pending.origin,
            {
              short_name: stop.name || 'Nearest Bus Stop',
              display_name: stop.name || 'Nearest Bus Stop',
              latitude: stop.latitude,
              longitude: stop.longitude,
            },
            ctx,
            lang
          );
          return { intent: parsed.intent, spoken: navRes.spoken, status: 'navigating_to_stop' };
        }
        ctx.actions.navigateTo('/navigation');
        const spoken = assistantMsg(lang, 'nav_open_for_stop');
        ctx.vibrate?.('confirm');
        ctx.actions.speak(spoken, { lang });
        return { intent: parsed.intent, spoken, status: 'executed' };
      }

      if (parsed.slots?.action === 'volunteer_assistance') {
        ctx.actions.setPendingConfirmation(null);
        return handleVolunteerIntent(
          { intent: INTENTS.VOLUNTEER_ASSISTANCE, detectedLang: lang, slots: { assistanceType: 'navigation' } },
          ctx
        );
      }

      if (parsed.intent === INTENTS.CONFIRM_NO) {
        ctx.actions.setPendingConfirmation(null);
        const spoken = assistantMsg(lang, 'ok_cancelled');
        ctx.vibrate?.('cancel');
        ctx.actions.speak(spoken, { lang });
        return { intent: parsed.intent, spoken, status: 'cancelled' };
      }
    }
  }

  // 2. CANCEL — cancels SOS countdown, pending confirmation, active listening, or active navigation
  if (parsed.intent === INTENTS.CANCEL) {
    ctx.playCue?.('cancel');
    ctx.vibrate?.('cancel');
    if (state.sosCountdown != null) {
      ctx.actions.cancelSosCountdown();
      const spoken = assistantMsg(lang, 'sos_cancelled');
      ctx.actions.speak(spoken, { lang });
      return { intent: parsed.intent, spoken, status: 'sos_cancelled' };
    }
    if (state.pendingConfirmation) {
      ctx.actions.setPendingConfirmation(null);
      const spoken = assistantMsg(lang, 'action_cancelled');
      ctx.actions.speak(spoken, { lang });
      return { intent: parsed.intent, spoken, status: 'confirmation_cancelled' };
    }
    if (state.navigation?.active) {
      await ctx.actions.stopNavigationSession('cancelled');
      const spoken = assistantMsg(lang, 'nav_cancelled');
      ctx.actions.speak(spoken, { lang });
      return { intent: parsed.intent, spoken, status: 'navigation_cancelled' };
    }
    ctx.actions.stopAllActivity();
    const spoken = assistantMsg(lang, 'cancelled');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'cancelled' };
  }

  // 3. STOP_SPEECH — silence active TTS output cleanly
  if (parsed.intent === INTENTS.STOP_SPEECH) {
    ctx.actions.silenceSpeech();
    ctx.vibrate?.('tap');
    return { intent: parsed.intent, spoken: assistantMsg(lang, 'speech_stopped'), status: 'executed' };
  }

  // 4. REPEAT — repeat last response
  if (parsed.intent === INTENTS.REPEAT) {
    const spoken = state.lastSpoken || assistantMsg(lang, 'repeat_empty');
    ctx.vibrate?.('tap');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'executed' };
  }

  // 5. HELP — list assistant capabilities
  if (parsed.intent === INTENTS.HELP) {
    const spoken = assistantMsg(lang, 'help_commands');
    ctx.vibrate?.('tap');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'executed' };
  }

  // 6. UNKNOWN fallback
  ctx.playCue?.('error');
  ctx.vibrate?.('error');
  const fallback = assistantMsg(lang, 'unknown_fallback');
  ctx.actions.speak(fallback, { lang });
  return {
    intent: INTENTS.UNKNOWN,
    spoken: fallback,
    status: 'unknown',
  };
}
