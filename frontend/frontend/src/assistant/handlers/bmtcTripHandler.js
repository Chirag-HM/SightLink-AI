import { normalizeLangCode } from '../i18n.js';
import { bmtcService } from '../../services/api.js';
import { findNearestBusStop } from '../navEngine.js';

export async function handleBmtcSourceDestinationIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const normLang = normalizeLangCode(lang);
  const openMenu = parsed?.slots?.openMenu;
  let source = parsed?.slots?.source;
  const destination = parsed?.slots?.destination;

  const coords = await ctx.actions.resolveBestGps();
  const lat = coords?.latitude ?? 12.9716;
  const lng = coords?.longitude ?? 77.5946;

  // Case A: User explicitly requested Trip Planner menu / without stops
  if (openMenu || (!source && !destination)) {
    const spoken = {
      kn: 'ಬಿಎಂಟಿಸಿ ಟ್ರಿಪ್ ಪ್ಲಾನರ್ ತೆರೆಯಲಾಗಿದೆ. ನಿಮ್ಮ ಆರಂಭ ಮತ್ತು ತಲುಪುವ ಸ್ಥಳವನ್ನು ತಿಳಿಸಿ, ಉದಾಹರಣೆಗೆ "ಹೆಬ್ಬಾಳದಿಂದ ಸಿಲ್ಕ್ ಬೋರ್ಡ್‌ಗೆ ಬಸ್" ಅಥವಾ "ವೈಟ್‌ಫೀಲ್ಡ್‌ಗೆ ಟ್ರಿಪ್".',
      hi: 'बीएमटीसी ट्रिप प्लानर खुल गया है। अपना शुरुआती और अंतिम स्टॉप बताएं, जैसे "हेब्बाल से सिल्क बोर्ड बस" या "व्हाइटफील्ड के लिए बस"।',
      ta: 'BMTC பயண திட்டம் திறக்கப்பட்டது. உங்கள் தொடக்க மற்றும் சேருமிடத்தை சொல்லுங்கள், எ.கா. "ஹெப்பால் முதல் சில்க் போர்டு பஸ்".',
      te: 'BMTC ట్రిప్ ప్లానర్ తెరవబడింది. మీ ప్రారంభ మరియు గమ్యస్థానాన్ని చెప్పండి, ఉదా. "హెబ్బాల్ నుండి సిల్క్ బోర్డ్ బస్సు".',
      en: 'BMTC Trip Planner opened. Tell me your starting stop and destination, for example "Bus from Hebbal to Central Silk Board" or "Plan trip to Whitefield".',
    }[normLang] || 'BMTC Trip Planner opened. Tell me your starting stop and destination, for example "Bus from Hebbal to Central Silk Board" or "Plan trip to Whitefield".';

    ctx.actions.setBusResult?.({
      type: 'trip_planner_menu',
      source: null,
      destination: null,
      spoken_summary: spoken,
    });

    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    ctx.actions.navigateTo('/bmtc?tab=planner');

    return { intent: parsed.intent, spoken, status: 'menu_opened' };
  }

  // Case B: User specified destination only (e.g. "plan trip to Majestic" or "trip planner to Whitefield")
  let fromNearest = false;
  if (!source && destination) {
    try {
      const nearRes = await findNearestBusStop(lat, lng, { assistantApi: ctx.services.assistantService });
      if (nearRes?.nearest_stop?.name) {
        source = nearRes.nearest_stop.name;
        fromNearest = true;
      }
    } catch {
      // ignore
    }
    if (!source) {
      source = 'Current Location';
    }
  }

  try {
    const res = await bmtcService.planTrip(source, destination, lat, lng);

    let spoken = '';
    if (res?.success && Array.isArray(res.routes) && res.routes.length > 0) {
      const top = res.routes[0];
      const prefix = fromNearest
        ? (normLang === 'kn' ? `ನಿಮ್ಮ ಸಮೀಪದ ನಿಲ್ದಾಣ ${source} ನಿಂದ ` : `Planning trip from your nearest stop ${source} to `)
        : '';

      const isDirect = top.is_direct !== false;
      if (normLang === 'kn') {
        if (isDirect) {
          spoken = `${prefix}${top.from_stop} ನಿಂದ ${top.to_stop} ಗೆ ಮಾರ್ಗ ${top.route_number} ನೇರ ಬಸ್ ಇದೆ. ಒಟ್ಟು ${top.stops_count} ನಿಲ್ದಾಣಗಳು, ಅಂದಾಜು ${top.estimated_time_mins} ನಿಮಿಷಗಳು. ಟಿಕೆಟ್ ದರ ₹${top.fare_ordinary_inr}.`;
        } else {
          spoken = `${prefix}${top.from_stop} ನಿಂದ ${top.to_stop} ಗೆ ಸಂಪರ್ಕ ಬಸ್: ಮಾರ್ಗ ${top.route_number}, ಒಟ್ಟು ${top.stops_count} ನಿಲ್ದಾಣಗಳು, ಅಂದಾಜು ${top.estimated_time_mins} ನಿಮಿಷಗಳು. ಟಿಕೆಟ್ ದರ ₹${top.fare_ordinary_inr}.`;
        }
        if (top.next_bus_eta_mins) {
          spoken += ` ಮುಂದಿನ ಬಸ್ ${top.next_bus_eta_mins} ನಿಮಿಷಗಳಲ್ಲಿ ಬರುತ್ತದೆ.`;
        }
      } else if (normLang === 'hi') {
        if (isDirect) {
          spoken = `${prefix}${top.from_stop} से ${top.to_stop} के लिए रूट ${top.route_number} बस उपलब्ध है। कुल ${top.stops_count} स्टॉप, लगभग ${top.estimated_time_mins} मिनट। किराया ₹${top.fare_ordinary_inr}।`;
        } else {
          spoken = `${prefix}${top.from_stop} से ${top.to_stop} के लिए कनेक्टिंग रूट ${top.route_number} है। कुल ${top.stops_count} स्टॉप, लगभग ${top.estimated_time_mins} मिनट। किराया ₹${top.fare_ordinary_inr}।`;
        }
        if (top.next_bus_eta_mins) {
          spoken += ` अगली बस ${top.next_bus_eta_mins} मिनट में आएगी।`;
        }
      } else {
        if (isDirect) {
          spoken = `${prefix}Found route ${top.route_number} from ${top.from_stop} to ${top.to_stop} with ${top.stops_count} stops, taking approximately ${top.estimated_time_mins} minutes. Ordinary fare is ₹${top.fare_ordinary_inr}.`;
        } else {
          spoken = `${prefix}Found connecting transit: ${top.route_number} from ${top.from_stop} to ${top.to_stop} (${top.stops_count} stops, ~${top.estimated_time_mins} minutes, fare ₹${top.fare_ordinary_inr}).`;
        }
        if (top.next_bus_eta_mins) {
          spoken += ` Next bus arrives in ${top.next_bus_eta_mins} minutes.`;
        }
      }
    } else {
      if (normLang === 'kn') {
        spoken = `${source} ನಿಂದ ${destination} ಗೆ ನೇರ ಬಸ್ ಕಂಡುಬಂದಿಲ್ಲ. ಮೆಜೆಸ್ಟಿಕ್ ಅಥವಾ ಸಿಲ್ಕ್ ಬೋರ್ಡ್ ಮೂಲಕ ಸಂಪರ್ಕಿಸಬಹುದು.`;
      } else if (normLang === 'hi') {
        spoken = `${source} से ${destination} के लिए कोई सीधी बस नहीं मिली। आप मेजेस्टिक या सिल्क बोर्ड से ट्रांसफर कर सकते हैं।`;
      } else {
        spoken = res?.spoken_summary || `No direct bus found between ${source} and ${destination}. You can transfer at Majestic or Central Silk Board.`;
      }
    }

    ctx.actions.setBusResult?.({
      type: 'trip_plan',
      source,
      destination,
      routes: res?.routes || [],
      spoken_summary: spoken,
    });

    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    ctx.actions.navigateTo(`/bmtc?tab=planner&source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}`);

    return {
      intent: parsed.intent,
      spoken,
      status: res?.routes?.length > 0 ? 'found' : 'no_direct',
      data: res,
    };
  } catch (err) {
    const spoken = normLang === 'kn'
      ? 'ಬಿಎಂಟಿಸಿ ಮಾರ್ಗಗಳನ್ನು ಪರಿಶೀಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
      : 'Could not fetch BMTC bus routes between the requested stops.';
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'error', error: err?.message };
  }
}

export async function handleBmtcRouteStopsIntent(parsed, ctx) {
  const state = ctx.getState();
  const lang = parsed?.detectedLang || state.language || 'en-IN';
  const normLang = normalizeLangCode(lang);
  const routeNumber = parsed?.slots?.routeNumber;

  const coords = await ctx.actions.resolveBestGps();
  const lat = coords?.latitude ?? 12.9716;
  const lng = coords?.longitude ?? 77.5946;

  // Case A: User requested Stop Explorer without specific route number
  if (!routeNumber) {
    let nearestStopName = 'your location';
    let nearestStopDist = null;
    try {
      const nearRes = await findNearestBusStop(lat, lng, { assistantApi: ctx.services.assistantService });
      if (nearRes?.nearest_stop?.name) {
        nearestStopName = nearRes.nearest_stop.name;
        nearestStopDist = nearRes.nearest_stop.distance_m;
      }
    } catch {
      // ignore
    }

    const distStr = nearestStopDist ? ` (~${nearestStopDist}m away)` : '';
    const spoken = {
      kn: `ಬಿಎಂಟಿಸಿ ಸ್ಟಾಪ್ ಎಕ್ಸ್‌ಪ್ಲೋರರ್ ತೆರೆಯಲಾಗಿದೆ. ನಿಮ್ಮ ಸಮೀಪದ ನಿಲ್ದಾಣ ${nearestStopName}${distStr}. ಯಾವುದೇ ಮಾರ್ಗದ ಸಂಪೂರ್ಣ ನಿಲ್ದಾಣಗಳ ಪಟ್ಟಿಗಾಗಿ "500D ಬಸ್ ನಿಲ್ದಾಣಗಳು" ಅಥವಾ "335E ಸ್ಟಾಪ್ಸ್" ಎಂದು ಕೇಳಿ.`,
      hi: `बीएमटीसी स्टॉप एक्सप्लोरर खुल गया है। आपका नजदीकी स्टॉप ${nearestStopName}${distStr} है। पूरा रूट जानने के लिए "500D के स्टॉप" या "335E स्टॉप्स" कहें।`,
      ta: `BMTC நிறுத்தங்கள் எக்ஸ்ப்ளோரர் திறக்கப்பட்டது. உங்கள் அருகிலுள்ள நிறுத்தம் ${nearestStopName}${distStr}. வழித்தட நிறுத்தங்களை அறிய "500D பஸ் நிறுத்தங்கள்" என்று கேளுங்கள்.`,
      te: `BMTC స్టాప్ ఎక్స్‌ప్లోరర్ తెరవబడింది. మీ సమీప స్టాప్ ${nearestStopName}${distStr}. పూర్తి స్టాప్‌ల కోసం "500D బస్ స్టాప్‌లు" అని అడగండి.`,
      en: `BMTC Stop Explorer opened. Your nearest stop is ${nearestStopName}${distStr}. Ask "Stops for route 500D" or "Explore stops for 335E" to hear all intermediate stops.`,
    }[normLang] || `BMTC Stop Explorer opened. Your nearest stop is ${nearestStopName}${distStr}. Ask "Stops for route 500D" or "Explore stops for 335E" to hear all intermediate stops.`;

    ctx.actions.setBusResult?.({
      type: 'stop_explorer_menu',
      nearest_stop_name: nearestStopName,
      nearest_stop_dist: nearestStopDist,
      spoken_summary: spoken,
    });

    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    ctx.actions.navigateTo('/bmtc?tab=stops');

    return { intent: parsed.intent, spoken, status: 'menu_opened' };
  }

  // Case B: Route number provided (e.g. 500D, 335E, 400)
  try {
    const res = await bmtcService.getRouteStops(routeNumber, lat, lng);

    let spoken = '';
    if (res?.success && Array.isArray(res.stops) && res.stops.length > 0) {
      if (normLang === 'kn') {
        spoken = `ಮಾರ್ಗ ${res.route_number} ${res.source} ನಿಂದ ${res.destination} ವರೆಗೆ ಒಟ್ಟು ${res.total_stops} ನಿಲ್ದಾಣಗಳನ್ನು ಹೊಂದಿದೆ. ಸಾಮಾನ್ಯ ದರ ₹${res.fare_ordinary_inr}, ವಜ್ರ ಎಸಿ ₹${res.fare_vajra_ac_inr}.`;
        if (res.nearest_user_stop) {
          spoken += ` ನಿಮ್ಮ ಸಮೀಪದ ನಿಲ್ದಾಣ ${res.nearest_user_stop.name}, ಸುಮಾರು ${res.nearest_user_stop.distance_m} ಮೀಟರ್ ದೂರದಲ್ಲಿದೆ.`;
        }
      } else if (normLang === 'hi') {
        spoken = `रूट ${res.route_number} ${res.source} से ${res.destination} तक कुल ${res.total_stops} स्टॉप कवर करता है। साधारण किराया ₹${res.fare_ordinary_inr}, वज्र एसी ₹${res.fare_vajra_ac_inr}।`;
        if (res.nearest_user_stop) {
          spoken += ` आपका नजदीकी स्टॉप ${res.nearest_user_stop.name} (~${res.nearest_user_stop.distance_m} मीटर) है।`;
        }
      } else {
        spoken = `Route ${res.route_number} runs from ${res.source} to ${res.destination} with ${res.total_stops} stops. Ordinary fare is ₹${res.fare_ordinary_inr}, Vajra AC is ₹${res.fare_vajra_ac_inr}.`;
        if (res.nearest_user_stop) {
          spoken += ` Your nearest stop on this route is ${res.nearest_user_stop.name}, ${res.nearest_user_stop.distance_m} meters away.`;
        }
      }
    } else {
      if (normLang === 'kn') {
        spoken = `${routeNumber} ಮಾರ್ಗದ ನಿಲ್ದಾಣಗಳ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. 500D ಅಥವಾ 335E ಪ್ರಯತ್ನಿಸಿ.`;
      } else {
        spoken = `Could not retrieve stop sequence for route ${routeNumber}. Try popular routes like 500D, 335E, or 400.`;
      }
    }

    ctx.actions.setBusResult?.({
      type: 'route_stops',
      route_number: res.route_number || routeNumber,
      source: res.source,
      destination: res.destination,
      total_stops: res.total_stops,
      fare_ordinary_inr: res.fare_ordinary_inr,
      fare_vajra_ac_inr: res.fare_vajra_ac_inr,
      nearest_user_stop: res.nearest_user_stop,
      stops: res.stops || [],
      spoken_summary: spoken,
    });

    ctx.playCue?.('confirm');
    ctx.vibrate?.('confirm');
    ctx.actions.speak(spoken, { lang });
    ctx.actions.navigateTo(`/bmtc?tab=stops&route=${encodeURIComponent(routeNumber)}`);

    return {
      intent: parsed.intent,
      spoken,
      status: res?.success ? 'found' : 'not_found',
      data: res,
    };
  } catch (err) {
    const spoken = normLang === 'kn'
      ? 'ನಿಲ್ದಾಣಗಳ ವಿವರಗಳನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.'
      : `Unable to get bus stops for route ${routeNumber}.`;
    ctx.vibrate?.('error');
    ctx.actions.speak(spoken, { lang });
    return { intent: parsed.intent, spoken, status: 'error', error: err?.message };
  }
}
