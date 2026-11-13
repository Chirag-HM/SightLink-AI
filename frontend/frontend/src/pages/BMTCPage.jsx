import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Bus,
  MapPin,
  Search,
  Mic,
  MicOff,
  Volume2,
  Loader2,
  RefreshCw,
  LocateFixed,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import LiveAssistanceMap from '../components/LiveAssistanceMap';
import useStickGps from '../hooks/useStickGps';
import useVoiceAssistant, { speakText } from '../hooks/useVoiceAssistant';
import { triggerHaptic } from '../utils/haptics';
import { bmtcService, busUnifiedService } from '../services/api';

const QUICK_ROUTES = ['400', '500D', '335E', '507', '401', '365', 'V-500C'];
const DEFAULT_ORIGIN = { latitude: 12.9716, longitude: 77.5946, source: 'Majestic Default' };

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
  const { location: stickGps } = useStickGps();

  const [searchQuery, setSearchQuery] = useState(() => {
    try {
      return localStorage.getItem('sightlink_last_bmtc_route') || '';
    } catch {
      return '';
    }
  });
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [userOrigin, setUserOrigin] = useState(DEFAULT_ORIGIN);
  const [gpsNotice, setGpsNotice] = useState('');

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
            setGpsNotice(`GPS unavailable (${geoErr.message}); using Majestic, Bengaluru reference.`);
            resolve(DEFAULT_ORIGIN);
          },
          { enableHighAccuracy: true, timeout: 4500 }
        );
      } else {
        setGpsNotice('Browser geolocation unavailable; using Majestic, Bengaluru reference.');
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
      // Optional stop-name enrichment
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
          if (unified?.spoken_summary) {
            setError(unified.spoken_summary);
            speakText(unified.spoken_summary);
            return false;
          }
        } catch {
          // Ignore unified fallback error and surface original message below
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
          // Fallback to route discovery when coordinate matching found no buses
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
            ? `BMTC upstream government portal is temporarily unavailable/blocking requests (${raw}).`
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

  return (
    <DashboardShell
      title="BMTC Live Bus Tracker"
      subtitle="Real-time Bengaluru bus distances, approaching direction, and voice-announced arrival updates"
      icon={Bus}
    >
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
                className="bg-transparent border-none outline-none text-sm text-[#12231B] placeholder:text-[#697D72] w-full py-2"
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

          {/* Origin / GPS indicator */}
          <div className="p-3 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-center justify-between gap-2 text-[11px]">
            <div className="min-w-0">
              <span className="font-mono font-semibold text-[#065F46] block">
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
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {buses.map((bus, i) => (
              <motion.button
                key={bus.id}
                type="button"
                onClick={() => handleSelectBus(bus)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`w-full glass-card p-4 text-left transition-all ${
                  selectedBus?.id === bus.id
                    ? 'border-[#065F46]/45 ring-1 ring-[#065F46]/20 shadow-glow-sm'
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
                <span className="text-sm">Choose or enter a BMTC route number to see live buses</span>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Live Interactive Map + Details */}
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
                userLabel="Origin"
                peerLegendLabel="Selected Bus"
                heightClass="h-80 md:h-[400px]"
                label="Live BMTC bus map"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Stop / Road', value: selectedBus.location, color: '#12231B' },
                  { label: 'Distance', value: selectedBus.distance, color: '#065F46' },
                  {
                    label: 'Heading',
                    value: `${selectedBus.direction} (${selectedBus.heading.toFixed(0)}°)`,
                    color: '#8C6A23',
                  },
                  { label: 'Status', value: selectedBus.status, color: '#047857' },
                ].map((s) => (
                  <div key={s.label} className="glass-card p-4">
                    <span className="text-[10px] text-[#4F6358] uppercase tracking-wider block mb-1">
                      {s.label}
                    </span>
                    <span className="text-sm font-semibold font-display" style={{ color: s.color }}>
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
                  <span className="text-sm text-[#12231B] italic">
                    “{announcement || `Bus ${selectedBus.route}, ${selectedBus.busNumber}, is ${selectedBus.distance} away at ${selectedBus.location}.`}”
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    speakText(
                      announcement ||
                        `Bus ${selectedBus.route}, vehicle ${selectedBus.busNumber}, is ${selectedBus.distance} away at ${selectedBus.location}.`
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] shrink-0"
                >
                  Speak Update
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-72 glass-card p-6 text-center space-y-2">
              <Bus className="w-9 h-9 text-[#065F46]" />
              <p className="text-sm font-semibold text-[#12231B]">Search a BMTC Route to Track Live Buses</p>
              <p className="text-xs text-[#4F6358] max-w-md">
                Enter any Bengaluru BMTC route such as 500D, 335E, or 507 (or tap the microphone icon to speak it).
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
