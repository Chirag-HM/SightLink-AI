import { formatDistanceMeters } from '../navEngine.js';
import { assistantMsg } from '../i18n.js';

export async function handleSosIntent(parsed, ctx, options = {}) {
  const { hardwareLongPress = false } = options;
  const lang = parsed?.detectedLang || ctx.getState().language || 'en-IN';

  if (hardwareLongPress) {
    ctx.playCue?.('sos');
    ctx.vibrate?.([250, 80, 250], { category: 'sos' });
    const res = await ctx.actions.fireSosNow('hardware_long_press', lang);
    return {
      intent: parsed.intent,
      spoken: res.spoken,
      status: res.queued ? 'queued_offline' : 'executed',
      data: res,
    };
  }

  ctx.playCue?.('sos');
  ctx.vibrate?.([160, 70, 160], { category: 'sos' });
  const prompt = assistantMsg(lang, 'sos_countdown');
  ctx.actions.startSosCountdown(5, 'voice_assistant', prompt, lang);

  return {
    intent: parsed.intent,
    spoken: prompt,
    status: 'countdown_started',
  };
}

export function buildSosPayloadAndFallbacks(coords, source = 'voice_assistant', batteryLevel = null) {
  const lat = Number(coords?.latitude);
  const lng = Number(coords?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const mapsUrl = hasCoords
    ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`
    : null;
  const text = `EMERGENCY SOS! Need urgent help.${mapsUrl ? ` Live location: ${mapsUrl}` : ''}${
    batteryLevel != null ? ` (Battery: ${batteryLevel}%)` : ''
  }`;
  const encoded = encodeURIComponent(text);

  return {
    apiPayload: {
      latitude: hasCoords ? lat : null,
      longitude: hasCoords ? lng : null,
      battery_level: batteryLevel,
      source,
      notes: source === 'hardware_long_press'
        ? 'Triggered by 3s hardware button long press'
        : 'Triggered via SightLink Voice Assistant',
    },
    fallbacks: {
      google_maps_url: mapsUrl,
      sms_fallback_url: `sms:?body=${encoded}`,
      whatsapp_fallback_url: `https://wa.me/?text=${encoded}`,
      formatted_coords: hasCoords ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Unavailable',
      distanceLabel: hasCoords ? formatDistanceMeters(0) : null,
    },
  };
}
