import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bus,
  MapPin,
  Search,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  RefreshCw,
  LocateFixed,
  ArrowRight,
  ArrowLeftRight,
  Clock,
  IndianRupee,
  Navigation,
  ListOrdered,
  CheckCircle2,
  ChevronRight,
  X,
  Sparkles,
  Info,
  Footprints,
  Route as RouteIcon,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import LiveAssistanceMap from '../components/LiveAssistanceMap';
import useStickGps from '../hooks/useStickGps';
import useVoiceAssistant, { speakText } from '../hooks/useVoiceAssistant';
import { triggerHaptic } from '../utils/haptics';
import { bmtcService, busUnifiedService } from '../services/api';

const QUICK_ROUTES = ['500D', '335E', '400', '401', '365', '507', 'V-500C'];
const DEFAULT_ORIGIN = { latitude: 12.9716, longitude: 77.5946, source: 'Majestic Default' };

const POPULAR_HUBS = [
  { name: 'Majestic', query: 'Majestic', kannada: 'ಮೆಜೆಸ್ಟಿಕ್' },
  { name: 'Hebbal', query: 'Hebbal', kannada: 'ಹೆಬ್ಬಾಳ' },
  { name: 'Silk Board', query: 'Silk Board', kannada: 'ಸಿಲ್ಕ್ ಬೋರ್ಡ್' },
  { name: 'Whitefield', query: 'Whitefield', kannada: 'ವೈಟ್‌ಫೀಲ್ಡ್' },
  { name: 'Electronic City', query: 'Electronic City', kannada: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ ಸಿಟಿ' },
  { name: 'Marathahalli', query: 'Marathahalli', kannada: 'ಮಾರತಹಳ್ಳಿ' },
  { name: 'Banashankari', query: 'Banashankari', kannada: 'ಬನಶಂಕರಿ' },
  { name: 'MS Palya', query: 'MS Palya', kannada: 'ಎಂ.ಎಸ್. ಪಾಳ್ಯ' },
  { name: 'Yeshwanthpur', query: 'Yeshwanthpur', kannada: 'ಯಶವಂತಪುರ' },
  { name: 'Airport (KIA)', query: 'Airport', kannada: 'ವಿಮಾನ ನಿಲ್ದಾಣ' },
];

function getDirection(heading) {
  const h = ((Number(heading) || 0) % 360 + 360) % 360;
  if (h >= 337.5 || h < 22.5) return 'North';
  if (h >= 22.5 && h < 67.5) return 'North-East';
  if (h >= 67.5 && h < 112.5) return 'East';
  if (h >= 112.5 && h < 157.5) return 'South-East';
  if (h >= 157.5 && h < 202.5) return 'South';
  if (h >= 202.5 && h < 247.5) return 'South-West';
  if (h >= 247.5 && h < 292.5) return 'West';
  return 'North-West';
}

function formatDistanceLabel(km) {
  if (km == null || !Number.isFinite(Number(km))) return 'Live';
  const meters = Math.round(Number(km) * 1000);
  if (meters < 1000) return `${meters}m`;
  return `${Number(km).toFixed(1)} km`;
}

function extractRouteFromVoice(text = '') {
  const cleaned = text
    .toUpperCase()
    .replace(/\b(BUS|ROUTE|NUMBER|FIND|SEARCH|CHECK|THE|FOR|BMTC|NEARBY)\b/g, ' ')
    .trim();
  const match = cleaned.match(/[A-Z0-9]+(?:-[A-Z0-9]+)?/);
  return match ? match[0] : '';
}

export default function BMTCPage() {
  const [searchParams] = useSearchParams();
  const { location: stickGps } = useStickGps();

  // Mode: 'tracker' (Live Route Bus Tracker) | 'planner' (Source to Destination Planner)
  const [activeTab, setActiveTab] = useState('tracker');

  // --- Live Tracker State ---
  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem('sightlink_last_bmtc_route') || '500D';
    } catch {
      return '500D';
    }
  });
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [userOrigin, setUserOrigin] = useState(DEFAULT_ORIGIN);
  const [gpsNotice, setGpsNotice] = useState('');

  // --- Trip Planner (Source -> Destination) State ---
  const [sourceInput, setSourceInput] = useState('Hebbal');
  const [destinationInput, setDestinationInput] = useState('Central Silk Board');
  const [tripResults, setTripResults] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState('');
  const [selectedTripRoute, setSelectedTripRoute] = useState(null);

  // --- Stop Sequence Modal / Drawer State ---
  const [stopsModalOpen, setStopsModalOpen] = useState(false);
  const [routeStopsData, setRouteStopsData] = useState(null);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopsError, setStopsError] = useState('');
  const [isSpeakingStops, setIsSpeakingStops] = useState(false);
  const stopSpeechTimerRef = useRef(null);

  // --- Fare Calculator Drawer / Helper ---
  const [fareCalcKm, setFareCalcKm] = useState(15);
  const [fareEstimate, setFareEstimate] = useState(null);

  // Detect Stick GPS or Browser GPS
  useEffect(() => {
    if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
      setUserOrigin({
        latitude: Number(stickGps.latitude),
        longitude: Number(stickGps.longitude),
        source: 'Smart Stick GPS',
      });
    }
  }, [stickGps]);

  const detectBrowserGps = useCallback(() => {
    setGpsNotice('');
    if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
      const origin = {
        latitude: Number(stickGps.latitude),
        longitude: Number(stickGps.longitude),
        source: 'Smart Stick GPS',
      };
      setUserOrigin(origin);
      return Promise.resolve(origin);
    }
    return new Promise((resolve) => {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const origin = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              source: 'Browser GPS',
            };
            setUserOrigin(origin);
            resolve(origin);
          },
          (geoErr) => {
            setGpsNotice(`GPS unavailable (${geoErr.message}); using Majestic reference.`);
            resolve(DEFAULT_ORIGIN);
          },
          { enableHighAccuracy: true, timeout: 4500 }
        );
      } else {
        setGpsNotice('Browser geolocation unavailable; using Majestic reference.');
        resolve(DEFAULT_ORIGIN);
      }
    });
  }, [stickGps]);

  useEffect(() => {
    detectBrowserGps();
  }, [detectBrowserGps]);

  const enrichBusStopLocation = useCallback(async (bus) => {
    if (!bus || (bus.location && bus.location !== 'Location unavailable')) return;
    if (!bus.id) return;
    try {
      const detail = await bmtcService.getBusDetails(bus.id);
      if (detail?.success && detail.location) {
        setSelectedBus((prev) =>
          prev && prev.id === bus.id
            ? {
                ...prev,
                location: detail.location,
                lastRefresh: detail.last_refresh || prev.lastRefresh,
              }
            : prev
        );
        setBuses((prev) =>
          prev.map((item) =>
            item.id === bus.id
              ? { ...item, location: detail.location, lastRefresh: detail.last_refresh || item.lastRefresh }
              : item
          )
        );
      }
    } catch {
      // Optional enrichment
    }
  }, []);

  const normalizeBus = (bus, route) => {
    const latitude = Number(bus.latitude);
    const longitude = Number(bus.longitude);
    const heading = Number(bus.heading || 0);
    const distanceKm = bus.distance_km != null ? Number(bus.distance_km) : null;

    return {
      id: bus.vehicle_id,
      route: bus.route || route,
      busNumber: bus.bus_number || `Vehicle ${bus.vehicle_id}`,
      latitude,
      longitude,
      location: bus.location || 'Location unavailable',
      heading,
      serviceType: bus.service_type || 'BMTC',
      lastRefresh: bus.last_refresh || '',
      distanceKm,
      distance: formatDistanceLabel(distanceKm),
      approaching: typeof bus.approaching === 'boolean' ? bus.approaching : null,
      direction: getDirection(heading),
      status:
        typeof bus.approaching === 'boolean'
          ? bus.approaching
            ? 'Approaching You'
            : 'Moving Away'
          : 'Tracked Live',
    };
  };

  // Run Route Search
  const runSearch = useCallback(
    async (explicitRoute) => {
      const route = (explicitRoute ?? searchQuery).trim().toUpperCase();
      if (!route) {
        setError('Enter a BMTC route number (e.g. 500D or 335E).');
        setBuses([]);
        setSelectedBus(null);
        return;
      }

      setSearchQuery(route);
      try {
        localStorage.setItem('sightlink_last_bmtc_route', route);
      } catch {
        // ignore
      }

      setLoading(true);
      setError('');
      setAnnouncement('');

      const tryUnifiedFallback = async (upstreamErrorMsg = '') => {
        try {
          const unified = await busUnifiedService.getArrivals(route, {
            latitude: userOrigin.latitude,
            longitude: userOrigin.longitude,
          });
          if (unified?.has_data && Array.isArray(unified.arrivals) && unified.arrivals.length > 0) {
            const mapped = unified.arrivals.map((arr, idx) => ({
              id: arr.vehicle_id || `unified-${route}-${idx}`,
              route: arr.route_number || route,
              busNumber: arr.bus_number || `Route ${route}`,
              latitude: Number(arr.latitude),
              longitude: Number(arr.longitude),
              location: `${arr.stop_name} → ${arr.direction} (${arr.eta_minutes} min)`,
              heading: Number(arr.heading || 0),
              serviceType: `${unified.provider?.toUpperCase() || 'TRANSIT'}`,
              lastRefresh: 'Now',
              distanceKm: arr.distance_km ?? null,
              distance: `${arr.eta_minutes} min`,
              approaching: arr.approaching ?? true,
              direction: arr.direction || 'Inbound',
              status: `ETA ${arr.eta_minutes} min`,
            }));
            setBuses(mapped);
            setSelectedBus(mapped[0]);
            const spoken = unified.spoken_summary || `Bus ${route} arrives in ${mapped[0].distance}.`;
            setAnnouncement(spoken);
            speakText(spoken);
            setError('');
            return true;
          }
        } catch {
          // ignore
        }
        if (upstreamErrorMsg) {
          setError(upstreamErrorMsg);
          speakText(upstreamErrorMsg);
        }
        return false;
      };

      try {
        let nearby = await bmtcService.getNearbyBus(route, userOrigin.latitude, userOrigin.longitude);
        let busList = [];
        let msg = '';

        if (nearby?.success && Array.isArray(nearby.all_buses) && nearby.all_buses.length > 0) {
          busList = nearby.all_buses.map((b) => normalizeBus(b, nearby.route_number || route));
          msg = nearby.message || '';
        } else {
          const routeRes = await bmtcService.searchRoute(route);
          if (!routeRes || !routeRes.success || !Array.isArray(routeRes.buses) || routeRes.buses.length === 0) {
            const failMsg =
              nearby?.message || routeRes?.message || `No live buses currently reported on route ${route}.`;
            const handled = await tryUnifiedFallback(failMsg);
            if (!handled) {
              setBuses([]);
              setSelectedBus(null);
            }
            return;
          }
          busList = routeRes.buses.map((b) => normalizeBus(b, routeRes.route_number || route));
          msg = `Found ${busList.length} live ${busList.length === 1 ? 'bus' : 'buses'} on route ${route}.`;
        }

        setBuses(busList);
        const top = busList[0];
        setSelectedBus(top);
        triggerHaptic('confirm');
        const spokenMsg =
          msg ||
          `Bus ${top.route}, ${top.busNumber}, is ${top.distance} away, heading ${top.direction.toLowerCase()}.`;
        setAnnouncement(spokenMsg);
        speakText(spokenMsg);
        enrichBusStopLocation(top);
      } catch (err) {
        console.error('BMTC search error:', err);
        const raw = err?.message || 'Failed to search BMTC route.';
        const friendly =
          err?.status === 502 || raw.includes('403')
            ? `BMTC upstream server is slow; using backup transit tracking.`
            : raw;
        const handled = await tryUnifiedFallback(friendly);
        if (!handled) {
          setBuses([]);
          setSelectedBus(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, userOrigin.latitude, userOrigin.longitude, enrichBusStopLocation]
  );

  // Run Trip Planner Search (Source to Destination)
  const handlePlanTrip = useCallback(
    async (src = sourceInput, dst = destinationInput) => {
      const cleanSrc = (src || '').trim();
      const cleanDst = (dst || '').trim();
      if (!cleanSrc || !cleanDst) {
        setTripError('Please enter both source and destination bus stops.');
        return;
      }

      setTripLoading(true);
      setTripError('');
      try {
        const res = await bmtcService.planTrip(
          cleanSrc,
          cleanDst,
          userOrigin.latitude,
          userOrigin.longitude
        );
        setTripResults(res);
        if (res?.routes && res.routes.length > 0) {
          setSelectedTripRoute(res.routes[0]);
          triggerHaptic('confirm');
          const summary = res.spoken_summary || `Found ${res.routes.length} direct route(s) from ${cleanSrc} to ${cleanDst}.`;
          speakText(summary);
        } else {
          const noRouteMsg = res?.message || `No direct bus found between ${cleanSrc} and ${cleanDst}.`;
          setTripError(noRouteMsg);
          speakText(noRouteMsg);
        }
      } catch (err) {
        console.error('Trip planner error:', err);
        const rawMsg = err?.message || '';
        const safeMsg =
          rawMsg && !rawMsg.includes('<html') && !rawMsg.includes('<!DOCTYPE') && !rawMsg.includes('/@vite/client')
            ? rawMsg
            : 'Transit service is temporarily unavailable. Please retry.';
        setTripError(safeMsg);
      } finally {
        setTripLoading(false);
      }
    },
    [sourceInput, destinationInput, userOrigin.latitude, userOrigin.longitude]
  );

  // Open Route Stops sequence modal
  const openRouteStopsSequence = useCallback(
    async (routeNum) => {
      const cleanRoute = (routeNum || searchQuery || '500D').trim().toUpperCase();
      setStopsModalOpen(true);
      setStopsLoading(true);
      setStopsError('');
      setRouteStopsData(null);
      try {
        const data = await bmtcService.getRouteStops(
          cleanRoute,
          userOrigin.latitude,
          userOrigin.longitude
        );
        if (data?.success) {
          setRouteStopsData(data);
          triggerHaptic('tap');
          const spoken = data.spoken_summary || `Route ${data.route_number} has ${data.total_stops} stops.`;
          speakText(spoken);
        } else {
          const detailMsg = typeof data?.detail === 'string' ? data.detail : '';
          setStopsError(
            detailMsg && !detailMsg.includes('<html') && !detailMsg.includes('<!DOCTYPE')
              ? detailMsg
              : 'Could not load stops for this route.'
          );
        }
      } catch (err) {
        const rawMsg = err?.message || '';
        const safeMsg =
          rawMsg && !rawMsg.includes('<html') && !rawMsg.includes('<!DOCTYPE') && !rawMsg.includes('/@vite/client')
            ? rawMsg
            : 'Could not connect to transit server. Please retry in a moment.';
        setStopsError(safeMsg);
      } finally {
        setStopsLoading(false);
      }
    },
    [searchQuery, userOrigin.latitude, userOrigin.longitude]
  );

  // Stop sequence audio announcer (speaks stops one-by-one with cancel option)
  const toggleSpeakAllStops = useCallback(() => {
    if (isSpeakingStops) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeakingStops(false);
      return;
    }

    if (!routeStopsData?.stops || routeStopsData.stops.length === 0) return;

    setIsSpeakingStops(true);
    const stops = routeStopsData.stops;
    let idx = 0;

    const speakNext = () => {
      if (idx >= stops.length) {
        setIsSpeakingStops(false);
        return;
      }
      const st = stops[idx];
      const text = `Stop ${st.sequence_number}: ${st.name}.`;
      idx += 1;
      speakText(text, { onEnd: speakNext });
    };

    speakText(
      `Announcing all ${stops.length} stops for route ${routeStopsData.route_number} from ${routeStopsData.source} to ${routeStopsData.destination}.`,
      { onEnd: speakNext }
    );
  }, [isSpeakingStops, routeStopsData]);

  // Fare estimation query
  useEffect(() => {
    bmtcService
      .getFareEstimate(fareCalcKm)
      .then((res) => {
        if (res?.success) setFareEstimate(res);
      })
      .catch(() => {});
  }, [fareCalcKm]);

  // Refs to allow stable deep-link execution without dependency feedback loops
  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;

  const handlePlanTripRef = useRef(handlePlanTrip);
  handlePlanTripRef.current = handlePlanTrip;

  const openRouteStopsSequenceRef = useRef(openRouteStopsSequence);
  openRouteStopsSequenceRef.current = openRouteStopsSequence;

  const lastProcessedParamsRef = useRef('');

  // Synchronize deep-link query parameters from Voice Assistant (executes strictly once per unique query)
  useEffect(() => {
    const rawSearch = searchParams.toString();
    if (!rawSearch) return;
    if (lastProcessedParamsRef.current === rawSearch) return;
    lastProcessedParamsRef.current = rawSearch;

    const tab = searchParams.get('tab');
    const route = searchParams.get('route');
    const src = searchParams.get('source');
    const dst = searchParams.get('destination');

    if (tab === 'planner' || tab === 'trip') {
      setActiveTab('planner');
      if (src && dst) {
        setSourceInput(src);
        setDestinationInput(dst);
        handlePlanTripRef.current?.(src, dst);
      }
    } else if (tab === 'stops' || tab === 'sequence') {
      const targetRoute = (route || '500D').toUpperCase().trim();
      setSearchQuery(targetRoute);
      openRouteStopsSequenceRef.current?.(targetRoute);
    } else if (route) {
      const targetRoute = route.toUpperCase().trim();
      setSearchQuery(targetRoute);
      runSearchRef.current?.(targetRoute);
    }
  }, [searchParams]);

  // Voice assistant for live route tracker
  const { supported: voiceSupported, listening, startListening, stopListening } = useVoiceAssistant({
    continuous: false,
    onTranscript: (text, { isFinal }) => {
      if (isFinal && text) {
        const extracted = extractRouteFromVoice(text);
        if (extracted) {
          runSearch(extracted);
        } else {
          setError(`Heard "${text}" — say a route number like "500D" or "335E".`);
        }
      }
    },
  });

  const handleSelectBus = (bus) => {
    setSelectedBus(bus);
    enrichBusStopLocation(bus);
    triggerHaptic('tap');
    const line = `Bus ${bus.route}, vehicle ${bus.busNumber}, is ${bus.distance} away, ${
      bus.approaching === true
        ? 'approaching you'
        : bus.approaching === false
        ? 'moving away from you'
        : `heading ${bus.direction.toLowerCase()}`
    }.`;
    setAnnouncement(line);
    speakText(line);
  };

  const swapSourceDestination = () => {
    triggerHaptic('tap');
    const temp = sourceInput;
    setSourceInput(destinationInput);
    setDestinationInput(temp);
  };

  // Convert stop sequence to trail coordinates for the map
  const routeStopsTrail = routeStopsData?.stops
    ? routeStopsData.stops
        .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
        .map((s) => ({ latitude: s.latitude, longitude: s.longitude }))
    : [];

  return (
    <DashboardShell
      title="BMTC Live Transit & Route Planner"
      subtitle="Real-time bus tracking, source-to-destination stop sequences, fares, and voice navigation"
      icon={Bus}
    >
      {/* Top Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-2 border-b border-[#E2D9C8]">
        <div className="flex items-center gap-1.5 p-1 bg-[#F6F1E6] rounded-xl border border-[#DCD2BF]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('tracker');
              triggerHaptic('tap');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'tracker'
                ? 'bg-[#065F46] text-white shadow-sm'
                : 'text-[#354B40] hover:text-[#065F46]'
            }`}
          >
            <Bus className="w-3.5 h-3.5" />
            <span>Live Bus Tracker</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('planner');
              triggerHaptic('tap');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'planner'
                ? 'bg-[#065F46] text-white shadow-sm'
                : 'text-[#354B40] hover:text-[#065F46]'
            }`}
          >
            <RouteIcon className="w-3.5 h-3.5" />
            <span>Trip Planner (Source → Destination)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              openRouteStopsSequence(searchQuery || '500D');
            }}
            className="px-4 py-2 rounded-lg text-xs font-bold text-[#354B40] hover:text-[#065F46] transition-all flex items-center gap-2"
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Stops Explorer</span>
          </button>
        </div>

        {/* Quick Fare helper badge */}
        <div className="flex items-center gap-2 text-xs font-mono bg-[#FAF7F0] px-3 py-1.5 rounded-xl border border-[#E2D9C8]">
          <IndianRupee className="w-3.5 h-3.5 text-[#065F46]" />
          <span className="text-[#354B40]">
            Ordinary: <strong>₹5–₹35</strong> | Vajra AC: <strong>₹15–₹100</strong>
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE BUS TRACKER                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'tracker' && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column: Search + Quick Routes + Live Buses */}
          <div className="lg:col-span-1 space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
              className="glass-card p-1.5 flex items-center gap-1.5"
            >
              <div className="flex-1 flex items-center gap-2 px-3">
                <Search className="w-4 h-4 text-[#697D72] shrink-0" />
                <input
                  type="text"
                  aria-label="BMTC route number"
                  placeholder="Enter route e.g. 500D, 335E"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm text-[#12231B] placeholder:text-[#697D72] w-full py-2 font-mono uppercase"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!voiceSupported) {
                    setError('Voice input is not supported in this browser.');
                    return;
                  }
                  if (listening) stopListening();
                  else startListening();
                }}
                aria-pressed={listening}
                aria-label={listening ? 'Stop voice route search' : 'Speak route number'}
                title={voiceSupported ? 'Speak route number' : 'Voice unsupported'}
                className={`p-2.5 rounded-xl border transition-colors ${
                  listening
                    ? 'bg-[#FBF3DF] border-[#C59B42] text-[#7D5B1C]'
                    : 'bg-[#F6F1E6] border-[#E2D9C8] text-[#354B40] hover:text-[#065F46]'
                }`}
              >
                {listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-3.5 py-2.5 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                aria-label="Search BMTC route"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Find</span>
              </button>
            </form>

            {/* Quick Popular Routes */}
            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_ROUTES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => runSearch(r)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
                    searchQuery.toUpperCase() === r
                      ? 'bg-[#065F46] border-[#065F46] text-white'
                      : 'bg-white border-[#D7CEBC] text-[#354B40] hover:border-[#065F46]/40'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* View Full Stop Sequence Link for Searched Route */}
            {searchQuery && (
              <button
                type="button"
                onClick={() => openRouteStopsSequence(searchQuery)}
                className="w-full py-2 px-3 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-[#065F46] text-xs font-bold flex items-center justify-between hover:bg-[#DDF1E7] transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <ListOrdered className="w-4 h-4" />
                  View All Stops for Route {searchQuery.toUpperCase()}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {/* Origin / GPS indicator */}
            <div className="p-3 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-center justify-between gap-2 text-[11px]">
              <div className="min-w-0">
                <span className="font-mono font-semibold text-[#065F46] block truncate">
                  Origin: {userOrigin.source}
                </span>
                <span className="font-mono text-[#4F6358]">
                  {userOrigin.latitude.toFixed(4)}, {userOrigin.longitude.toFixed(4)}
                </span>
              </div>
              <button
                type="button"
                onClick={detectBrowserGps}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DCD2BF] text-[#12231B] hover:border-[#065F46] flex items-center gap-1 font-semibold shrink-0"
              >
                <LocateFixed className="w-3.5 h-3.5 text-[#065F46]" /> Locate
              </button>
            </div>
            {gpsNotice && <p className="text-[11px] text-[#7D5B1C] font-mono px-1">{gpsNotice}</p>}

            {/* Live status strip */}
            <div className="flex items-center gap-2 px-1">
              <div className={`w-2 h-2 rounded-full ${buses.length > 0 ? 'bg-[#065F46] animate-pulse' : 'bg-[#9CA89E]'}`} />
              <span className={`text-[10px] font-mono font-semibold ${buses.length > 0 ? 'text-[#065F46]' : 'text-[#697D72]'}`}>
                {buses.length > 0 ? 'LIVE BMTC FEED' : 'BMTC FEED'}
              </span>
              <span className="text-[10px] text-[#697D72] ml-auto">
                {buses.length} {buses.length === 1 ? 'bus' : 'buses'}
              </span>
              {buses.length > 0 && (
                <button
                  type="button"
                  onClick={() => runSearch(searchQuery)}
                  disabled={loading}
                  aria-label="Refresh bus locations"
                  className="p-1 rounded-md hover:bg-[#EFE8DA] text-[#065F46]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            {error && (
              <div role="alert" className="glass-card p-4 border-red-300 bg-red-50">
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Bus Cards */}
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {buses.map((bus, i) => (
                <motion.button
                  key={bus.id}
                  type="button"
                  onClick={() => handleSelectBus(bus)}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`w-full glass-card p-3.5 text-left transition-all ${
                    selectedBus?.id === bus.id
                      ? 'border-[#065F46]/45 ring-1 ring-[#065F46]/20 shadow-glow-sm bg-white'
                      : 'hover:border-[#065F46]/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          selectedBus?.id === bus.id
                            ? 'bg-[#065F46] text-white'
                            : 'bg-[#F6F1E6] border border-[#E2D9C8] text-[#4F6358]'
                        }`}
                      >
                        <Bus className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <span className="font-display font-bold text-[#12231B] block truncate">
                          {bus.busNumber} · {bus.route}
                        </span>
                        <span className="text-[11px] text-[#4F6358] flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-[#8C6A23] shrink-0" />
                          {bus.location}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="block text-xs font-mono font-bold text-[#065F46]">
                        {bus.distance}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-semibold ${
                          bus.approaching === true
                            ? 'text-[#047857]'
                            : bus.approaching === false
                            ? 'text-[#8C6A23]'
                            : 'text-[#4F6358]'
                        }`}
                      >
                        {bus.approaching === true
                          ? 'Approaching'
                          : bus.approaching === false
                          ? 'Moving away'
                          : bus.direction}
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}

              {!loading && buses.length === 0 && !error && (
                <div className="text-center py-10 text-[#4F6358]">
                  <Bus className="w-8 h-8 mx-auto mb-2 text-[#8C6A23]/60" />
                  <span className="text-sm">Choose or enter a BMTC route number to track live buses</span>
                </div>
              )}
            </div>
          </div>

          {/* Right column: Live Interactive Map + Bus Specs */}
          <div className="lg:col-span-2 space-y-4">
            {selectedBus ? (
              <>
                <LiveAssistanceMap
                  userLocation={{
                    latitude: userOrigin.latitude,
                    longitude: userOrigin.longitude,
                    popupLabel: `Your Position (${userOrigin.source})`,
                  }}
                  volunteerLocation={
                    Number.isFinite(selectedBus.latitude) && Number.isFinite(selectedBus.longitude)
                      ? {
                          latitude: selectedBus.latitude,
                          longitude: selectedBus.longitude,
                          name: `${selectedBus.busNumber}`,
                          popupLabel: `Bus ${selectedBus.route} (${selectedBus.busNumber}) — ${selectedBus.distance}`,
                        }
                      : null
                  }
                  trail={routeStopsTrail}
                  userLabel="Origin"
                  peerLegendLabel="Selected Bus"
                  heightClass="h-80 md:h-[380px]"
                  label="Live BMTC bus map"
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Stop / Location', value: selectedBus.location, color: '#12231B' },
                    { label: 'Distance', value: selectedBus.distance, color: '#065F46' },
                    {
                      label: 'Heading',
                      value: `${selectedBus.direction} (${selectedBus.heading.toFixed(0)}°)`,
                      color: '#8C6A23',
                    },
                    { label: 'Status', value: selectedBus.status, color: '#047857' },
                  ].map((s) => (
                    <div key={s.label} className="glass-card p-3.5">
                      <span className="text-[10px] text-[#4F6358] uppercase tracking-wider block mb-1">
                        {s.label}
                      </span>
                      <span className="text-xs font-bold font-display block truncate" style={{ color: s.color }}>
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-[#ECF7F2] border border-[#065F46]/20 flex items-center justify-center shrink-0">
                      <Volume2 className="w-4 h-4 text-[#065F46]" />
                    </div>
                    <span className="text-xs sm:text-sm text-[#12231B] italic truncate">
                      “{announcement || `Bus ${selectedBus.route}, ${selectedBus.busNumber}, is ${selectedBus.distance} away.`}”
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openRouteStopsSequence(selectedBus.route)}
                      className="px-3 py-2 rounded-xl bg-white border border-[#DCD2BF] text-[#065F46] text-xs font-bold hover:bg-[#F6F1E6] flex items-center gap-1.5"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>Stops</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        speakText(
                          announcement ||
                            `Bus ${selectedBus.route}, vehicle ${selectedBus.busNumber}, is ${selectedBus.distance} away at ${selectedBus.location}.`
                        )
                      }
                      className="px-3.5 py-2 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39]"
                    >
                      Speak Update
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 glass-card p-6 text-center space-y-3">
                <Bus className="w-10 h-10 text-[#065F46]" />
                <p className="text-sm font-semibold text-[#12231B]">Search a BMTC Route to Track Live Buses</p>
                <p className="text-xs text-[#4F6358] max-w-md">
                  Enter any Bengaluru BMTC route such as 500D, 335E, or 401 (or tap the microphone icon to speak it).
                </p>
                <div className="flex flex-wrap gap-2 pt-2 justify-center">
                  {QUICK_ROUTES.slice(0, 4).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => runSearch(r)}
                      className="px-3 py-1.5 rounded-xl bg-[#F6F1E6] border border-[#DCD2BF] text-xs font-mono font-bold text-[#065F46] hover:bg-[#065F46] hover:text-white transition-colors"
                    >
                      Track Route {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRIP PLANNER (SOURCE TO DESTINATION)                              */}
      {/* ========================================================================= */}
      {activeTab === 'planner' && (
        <div className="space-y-6">
          {/* Search Inputs Card */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#12231B] flex items-center gap-2">
                  <RouteIcon className="w-4 h-4 text-[#065F46]" />
                  <span>Find BMTC Buses from Source to Destination</span>
                </h3>
                <p className="text-xs text-[#4F6358]">
                  Select your starting stop and destination to see all direct buses, intermediate stops, fares, and live ETAs.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSourceInput('Hebbal');
                  setDestinationInput('Central Silk Board');
                  handlePlanTrip('Hebbal', 'Central Silk Board');
                }}
                className="text-xs font-mono font-bold text-[#065F46] hover:underline"
              >
                Reset Demo
              </button>
            </div>

            <div className="grid md:grid-cols-11 gap-3 items-center">
              {/* Source Input */}
              <div className="md:col-span-5 relative">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#4F6358] block mb-1">
                  Starting Bus Stop (Source)
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#DCD2BF] focus-within:border-[#065F46]">
                  <MapPin className="w-4 h-4 text-[#065F46] shrink-0" />
                  <input
                    type="text"
                    placeholder="e.g. Majestic, Hebbal, Marathahalli"
                    value={sourceInput}
                    onChange={(e) => setSourceInput(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-xs sm:text-sm text-[#12231B] font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSourceInput('Kempegowda Bus Station (Majestic)');
                      triggerHaptic('tap');
                    }}
                    title="Use Majestic Hub"
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F6F1E6] text-[#065F46] shrink-0"
                  >
                    Majestic
                  </button>
                </div>
              </div>

              {/* Swap Button */}
              <div className="md:col-span-1 flex justify-center pt-5">
                <button
                  type="button"
                  onClick={swapSourceDestination}
                  title="Swap source and destination"
                  className="w-10 h-10 rounded-xl bg-[#F6F1E6] border border-[#DCD2BF] text-[#065F46] flex items-center justify-center hover:bg-[#ECF7F2] transition-colors"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              </div>

              {/* Destination Input */}
              <div className="md:col-span-5 relative">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#4F6358] block mb-1">
                  Destination Bus Stop
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-[#DCD2BF] focus-within:border-[#065F46]">
                  <MapPin className="w-4 h-4 text-[#8C6A23] shrink-0" />
                  <input
                    type="text"
                    placeholder="e.g. Silk Board, Whitefield, Electronic City"
                    value={destinationInput}
                    onChange={(e) => setDestinationInput(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-xs sm:text-sm text-[#12231B] font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDestinationInput('Whitefield');
                      triggerHaptic('tap');
                    }}
                    title="Use Whitefield Hub"
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F6F1E6] text-[#065F46] shrink-0"
                  >
                    Whitefield
                  </button>
                </div>
              </div>
            </div>

            {/* Popular Hub Quick Selection Chips */}
            <div>
              <span className="text-[10px] font-mono text-[#697D72] uppercase tracking-wider block mb-1.5">
                Quick Hubs (Tap to fill Destination or Source):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {POPULAR_HUBS.map((hub) => (
                  <button
                    key={hub.query}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      if (!sourceInput || sourceInput === destinationInput) {
                        setSourceInput(hub.query);
                      } else {
                        setDestinationInput(hub.query);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#DCD2BF] text-xs text-[#354B40] hover:border-[#065F46] hover:bg-[#ECF7F2] transition-all flex items-center gap-1"
                  >
                    <span>{hub.name}</span>
                    <span className="text-[10px] text-[#8C6A23]">({hub.kannada})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-mono text-[#4F6358] flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-[#065F46]" />
                <span>Supports voice queries: "Bus from Majestic to Whitefield"</span>
              </div>

              <button
                type="button"
                onClick={() => handlePlanTrip()}
                disabled={tripLoading}
                className="px-5 py-2.5 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {tripLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Find Direct Buses</span>
              </button>
            </div>
          </div>

          {tripError && (
            <div className="glass-card p-4 border-amber-300 bg-amber-50 text-amber-900 text-xs font-medium">
              {tripError}
            </div>
          )}

          {/* Trip Results List */}
          {tripResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-mono font-bold text-[#065F46]">
                  RESULTS: {tripResults.routes?.length || 0} DIRECT ROUTE(S) FOUND
                </span>
                <span className="text-xs text-[#4F6358]">
                  From <strong>{tripResults.source}</strong> to <strong>{tripResults.destination}</strong>
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {tripResults.routes?.map((route, i) => (
                  <motion.div
                    key={`${route.route_number}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass-card p-4 space-y-3 hover:border-[#065F46]/40 transition-all border border-[#DCD2BF]"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#065F46] text-white flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] font-mono leading-none opacity-80">BMTC</span>
                          <span className="font-display font-bold text-sm leading-tight">
                            {route.route_number}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-display font-bold text-sm text-[#12231B]">
                            {route.from_stop} → {route.to_stop}
                          </h4>
                          <span className="text-[11px] text-[#4F6358] block">
                            {route.name || `Route ${route.route_number}`}
                          </span>
                        </div>
                      </div>

                      {route.next_bus_eta_mins && (
                        <div className="px-2.5 py-1 rounded-full bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] text-[11px] font-mono font-bold shrink-0 animate-pulse">
                          Bus in ~{route.next_bus_eta_mins}m
                        </div>
                      )}
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] text-center">
                      <div>
                        <span className="text-[9px] font-mono uppercase text-[#697D72] block">Stops</span>
                        <span className="text-xs font-bold font-display text-[#12231B]">
                          {route.stops_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono uppercase text-[#697D72] block">Distance</span>
                        <span className="text-xs font-bold font-display text-[#065F46]">
                          {route.distance_km} km
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono uppercase text-[#697D72] block">Duration</span>
                        <span className="text-xs font-bold font-display text-[#8C6A23]">
                          ~{route.estimated_time_mins} min
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono uppercase text-[#697D72] block">Fare</span>
                        <span className="text-xs font-bold font-display text-[#047857]">
                          ₹{route.fare_ordinary_inr}
                        </span>
                      </div>
                    </div>

                    {/* Fare Stages Details */}
                    <div className="flex items-center justify-between text-[11px] font-mono px-1">
                      <span className="text-[#4F6358]">
                        Ordinary Non-AC: <strong>₹{route.fare_ordinary_inr}</strong>
                      </span>
                      <span className="text-[#8C6A23]">
                        Vajra Volvo AC: <strong>₹{route.fare_vajra_ac_inr}</strong>
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#EFE8DA]">
                      <button
                        type="button"
                        onClick={() => openRouteStopsSequence(route.route_number)}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] text-xs font-bold hover:bg-[#065F46] hover:text-white transition-all flex items-center justify-center gap-1.5"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                        <span>View All {route.stops_count} Stops</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('tracker');
                          runSearch(route.route_number);
                        }}
                        className="py-2 px-3 rounded-xl bg-[#F6F1E6] border border-[#DCD2BF] text-[#12231B] text-xs font-bold hover:bg-white transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <Bus className="w-3.5 h-3.5 text-[#065F46]" />
                        <span>Track Live</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const msg = `Route ${route.route_number} from ${route.from_stop} to ${route.to_stop} has ${route.stops_count} stops, taking approximately ${route.estimated_time_mins} minutes. Fare is ₹${route.fare_ordinary_inr}.`;
                          speakText(msg);
                        }}
                        title="Speak details"
                        className="p-2 rounded-xl bg-white border border-[#DCD2BF] text-[#065F46] hover:bg-[#F6F1E6]"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* STOP SEQUENCE MODAL / DRAWER                                             */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {stopsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#FAF7F0] border-2 border-[#065F46]/35 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Route Stops Sequence"
            >
              {/* Modal Header */}
              <div className="p-4 bg-white border-b border-[#E2D9C8] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#065F46] text-white flex items-center justify-center shrink-0">
                    <ListOrdered className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-sm sm:text-base text-[#12231B] truncate">
                      Route {routeStopsData?.route_number || searchQuery || 'Stops'} Sequence
                    </h3>
                    <span className="text-xs text-[#4F6358] block truncate">
                      {routeStopsData?.source} → {routeStopsData?.destination} ({routeStopsData?.total_stops || 0} stops)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSpeakAllStops}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isSpeakingStops
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-[#ECF7F2] text-[#065F46] border border-[#065F46]/30'
                    }`}
                  >
                    {isSpeakingStops ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isSpeakingStops ? 'Stop Speech' : 'Speak All Stops'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isSpeakingStops && typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                      setIsSpeakingStops(false);
                      setStopsModalOpen(false);
                    }}
                    className="p-2 rounded-xl bg-[#F6F1E6] hover:bg-[#EAE4D5] text-[#12231B]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body: Scrollable Stop Timeline */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {stopsLoading && (
                  <div className="py-12 flex flex-col items-center justify-center text-[#065F46] gap-2">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-mono">Loading stop sequence for route...</span>
                  </div>
                )}

                {stopsError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                    {stopsError}
                  </div>
                )}

                {routeStopsData && (
                  <>
                    {/* Summary Badges Strip */}
                    <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-white border border-[#DCD2BF]">
                      <div>
                        <span className="text-[10px] font-mono text-[#697D72] block">Total Stops</span>
                        <span className="text-xs font-bold font-display text-[#12231B]">
                          {routeStopsData.total_stops} Stops
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-[#697D72] block">Ordinary Fare</span>
                        <span className="text-xs font-bold font-display text-[#065F46]">
                          ₹{routeStopsData.fare_ordinary_inr}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono text-[#697D72] block">Vajra AC Fare</span>
                        <span className="text-xs font-bold font-display text-[#8C6A23]">
                          ₹{routeStopsData.fare_vajra_ac_inr}
                        </span>
                      </div>
                    </div>

                    {/* Nearest User Stop Banner */}
                    {routeStopsData.nearest_user_stop && (
                      <div className="p-3 rounded-xl bg-[#ECF7F2] border border-[#065F46]/35 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin className="w-4 h-4 text-[#065F46] shrink-0" />
                          <span className="text-[#12231B]">
                            Nearest stop to you: <strong>{routeStopsData.nearest_user_stop.name}</strong> (~{routeStopsData.nearest_user_stop.distance_m}m away)
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#065F46] text-white shrink-0">
                          Stop #{routeStopsData.nearest_user_stop.sequence_number ?? routeStopsData.nearest_user_stop.seq ?? 1}
                        </span>
                      </div>
                    )}

                    {/* Timeline List of Stops */}
                    <div className="relative pl-6 space-y-4 pt-2">
                      {/* Vertical line indicator */}
                      <div className="absolute left-[17px] top-3 bottom-3 w-0.5 bg-[#D7CEBC]" />

                      {routeStopsData.stops?.map((stop, i) => {
                        const isFirst = i === 0;
                        const isLast = i === routeStopsData.stops.length - 1;
                        const seqNum = stop.sequence_number ?? stop.seq ?? (i + 1);
                        const distKm = stop.distance_from_start_km ?? stop.dist_from_origin_km ?? stop.dist_km ?? (i * 1.1).toFixed(1);
                        const isNearest = Boolean(
                          routeStopsData.nearest_user_stop &&
                          (routeStopsData.nearest_user_stop.stop_id === stop.stop_id ||
                           (routeStopsData.nearest_user_stop.sequence_number ?? routeStopsData.nearest_user_stop.seq) === seqNum ||
                           routeStopsData.nearest_user_stop.name === stop.name)
                        );

                        return (
                          <div
                            key={`${seqNum}-${stop.name}`}
                            className={`relative flex items-start gap-3 p-3 rounded-xl transition-all ${
                              isNearest
                                ? 'bg-[#ECF7F2] border border-[#065F46]/45 ring-1 ring-[#065F46]/20'
                                : 'bg-white border border-[#E2D9C8]'
                            }`}
                          >
                            {/* Sequence number / marker dot */}
                            <div
                              className={`absolute -left-[30px] top-3.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold border-2 ${
                                isFirst || isLast
                                  ? 'bg-[#065F46] text-white border-white'
                                  : isNearest
                                  ? 'bg-[#B88E3D] text-white border-white animate-pulse'
                                  : 'bg-white text-[#4F6358] border-[#D7CEBC]'
                              }`}
                            >
                              {seqNum}
                            </div>

                            {/* Stop details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-display font-bold text-xs sm:text-sm text-[#12231B] truncate">
                                  {stop.name}
                                </span>
                                {isFirst && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#ECF7F2] text-[#065F46] font-bold">
                                    SOURCE
                                  </span>
                                )}
                                {isLast && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#FBF3DF] text-[#7D5B1C] font-bold">
                                    DESTINATION
                                  </span>
                                )}
                                {isNearest && !isFirst && !isLast && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#065F46] text-white font-bold">
                                    NEAREST TO YOU
                                  </span>
                                )}
                              </div>

                              {stop.kannada_name && (
                                <span className="text-[11px] text-[#8C6A23] block">
                                  {stop.kannada_name}
                                </span>
                              )}

                              <div className="flex items-center gap-3 text-[10px] font-mono text-[#697D72] mt-1">
                                <span>Dist from start: {distKm} km</span>
                                {stop.distance_to_user_m != null && (
                                  <span className="text-[#065F46] font-semibold">
                                    · {stop.distance_to_user_m}m from you
                                  </span>
                                )}
                              </div>

                              {/* If a live bus is at this stop */}
                              {Array.isArray(stop.live_buses_at_stop) && stop.live_buses_at_stop.length > 0 && (
                                <div className="mt-2 p-1.5 rounded-lg bg-[#FAF0D8] border border-[#C59B42]/50 text-[11px] font-mono text-[#7D5B1C] flex items-center gap-1.5">
                                  <Bus className="w-3.5 h-3.5 text-[#065F46] animate-bounce" />
                                  <span>
                                    Live Bus: {stop.live_buses_at_stop.map((b) => b.bus_number).join(', ')} currently here!
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Speak single stop button */}
                            <button
                              type="button"
                              onClick={() => {
                                const line = `Stop ${seqNum}: ${stop.name}.`;
                                speakText(line);
                              }}
                              title="Speak this stop"
                              className="p-1.5 rounded-lg text-[#697D72] hover:text-[#065F46] hover:bg-[#F6F1E6]"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-white border-t border-[#E2D9C8] flex items-center justify-between">
                <span className="text-xs font-mono text-[#4F6358]">
                  Accessible audio playback available in English & Kannada
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('tracker');
                    if (routeStopsData?.route_number) {
                      runSearch(routeStopsData.route_number);
                    }
                    setStopsModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] flex items-center gap-1.5"
                >
                  <Bus className="w-3.5 h-3.5" />
                  <span>Track Route Live</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
