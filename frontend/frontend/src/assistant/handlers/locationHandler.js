import { assistantMsg } from '../i18n.js';

export async function handleWhatIsAheadIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const parts = [];

  try {
    const [visionRes, ultraRes] = await Promise.all([
      ctx.services.visionService?.getDetections?.().catch(() => null),
      ctx.services.ultrasonicService?.getDistance?.().catch(() => null),
    ]);
    const stickDist = state.stickGps?.distance_cm;
    if (Number.isFinite(stickDist) && stickDist < 900) {
      parts.push(assistantMsg(lang, 'ahead_ultrasonic', { meters: (Number(stickDist) / 100).toFixed(1) }));
    } else if (ultraRes?.distance != null) {
      parts.push(assistantMsg(lang, 'ahead_ultrasonic', { meters: ultraRes.distance }));
    }
    if (Array.isArray(visionRes?.detections) && visionRes.detections.length > 0) {
      const top = visionRes.detections[0];
      parts.push(assistantMsg(lang, 'ahead_camera', { label: top.label, distance: top.distance || '' }));
    }
  } catch {
    // Soft fallback below
  }

  const spoken = parts.length > 0 ? parts.join(' ') : assistantMsg(lang, 'ahead_no_sensor');
  ctx.playCue?.(parts.length > 0 ? 'confirm' : 'tap');
  ctx.vibrate?.('tap');
  ctx.actions.speak(spoken, { lang });
  return {
    intent: parsed.intent,
    spoken,
    status: parts.length > 0 ? 'executed' : 'no_sensor_data',
  };
}

export async function handleWhereAmIIntent(parsed, ctx) {
  const lang = parsed?.detectedLang || ctx.getState().language || 'en-IN';
  const coords = await ctx.actions.resolveBestGps();
  if (!coords.ok) {
    if (Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
      const geo = await ctx.services.reverseGeocodeLocation(coords.latitude, coords.longitude).catch(() => null);
      const approxPlace = geo?.landmark || geo?.address || 'Bengaluru';
      const spoken =
        lang === 'kn-IN'
          ? `ಲೈವ್ GPS ಸಿಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಅಂದಾಜು ಸ್ಥಳ: ${approxPlace}. ನಿಖರ ಸ್ಥಳಕ್ಕಾಗಿ ದಯವಿಟ್ಟು ಸ್ಥಳದ ಅನುಮತಿ ಆನ್ ಮಾಡಿ.`
          : lang === 'hi-IN'
          ? `लाइव जीपीएस सिग्नल नहीं मिला। अनुमानित स्थान: ${approxPlace}। सटीक स्थान के लिए जीपीएस ऑन करें।`
          : lang === 'ta-IN'
          ? `நேரடி ஜிபிஎஸ் கிடைக்கவில்லை. தோராயமான இடம்: ${approxPlace}. துல்லியமான இடத்திற்கு ஜிபிஎஸ் இயக்கவும்.`
          : lang === 'te-IN'
          ? `లైవ్ జీపీఎస్ అందలేదు. మీ సుమారు ప్రాంతం: ${approxPlace}. ఖచ్చితమైన స్థానం కోసం జీపీఎస్ ఆన్ చేయండి.`
          : `Live GPS fix is pending. Approximate reference area is near ${approxPlace}. Please enable device location.`;
      ctx.playCue?.('confirm');
      ctx.vibrate?.('tap');
      ctx.actions.speak(spoken, { lang });
      return { intent: parsed.intent, spoken, status: 'gps_approximate', data: { ...coords, geo } };
    }
    const spoken = assistantMsg(lang, 'where_gps_unavailable');
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'gps_unavailable' };
  }

  const geo = await ctx.services.reverseGeocodeLocation(coords.latitude, coords.longitude);
  let spoken = '';
  if (geo?.landmark && geo?.address && !geo.address.toLowerCase().includes(geo.landmark.toLowerCase())) {
    spoken = assistantMsg(lang, 'where_at_near', { address: geo.address, landmark: geo.landmark });
  } else if (geo?.address) {
    spoken = assistantMsg(lang, 'where_at', { address: geo.address });
  } else if (geo?.landmark) {
    spoken = assistantMsg(lang, 'where_near', { landmark: geo.landmark });
  } else {
    spoken = assistantMsg(lang, 'where_coords', {
      source: coords.source,
      lat: coords.latitude.toFixed(5),
      lng: coords.longitude.toFixed(5),
    });
  }

  ctx.playCue?.('confirm');
  ctx.vibrate?.('confirm');
  ctx.actions.speak(spoken, { lang });
  return {
    intent: parsed.intent,
    spoken,
    status: 'executed',
    data: { ...coords, geo },
  };
}
