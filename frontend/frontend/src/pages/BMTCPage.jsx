import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bus, MapPin, Search, Mic, Volume2, Loader2 } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { bmtcService } from '../services/api';

export default function BMTCPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [buses, setBuses] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Convert FastAPI BMTC response into the format used by the UI
  const normalizeBus = (bus, route) => {
    const latitude = Number(bus.latitude);
    const longitude = Number(bus.longitude);

    return {
      id: bus.vehicle_id,
      route: route,
      busNumber: bus.bus_number || `Vehicle ${bus.vehicle_id}`,
      latitude,
      longitude,
      location: bus.location || 'Location unavailable',
      heading: Number(bus.heading || 0),
      serviceType: bus.service_type || 'BMTC',
      lastRefresh: bus.last_refresh || '',
      distance: 'Live',
      direction: getDirection(Number(bus.heading || 0)),
      eta: 'Live',
      status: 'Tracked',
    };
  };

  // Convert heading into a readable direction
  const getDirection = (heading) => {
    if (heading >= 337.5 || heading < 22.5) return 'North';
    if (heading >= 22.5 && heading < 67.5) return 'North-East';
    if (heading >= 67.5 && heading < 112.5) return 'East';
    if (heading >= 112.5 && heading < 157.5) return 'South-East';
    if (heading >= 157.5 && heading < 202.5) return 'South';
    if (heading >= 202.5 && heading < 247.5) return 'South-West';
    if (heading >= 247.5 && heading < 292.5) return 'West';
    return 'North-West';
  };

  const handleSearch = async () => {
    const route = searchQuery.trim();

    if (!route) {
      setError('Enter a BMTC route number');
      setBuses([]);
      setSelectedBus(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await bmtcService.searchRoute(route);

      console.log('BMTC API response:', data);

      if (!data) {
        setError('Unable to connect to BMTC server');
        setBuses([]);
        setSelectedBus(null);
        return;
      }

      if (!data.success || !Array.isArray(data.buses) || data.buses.length === 0) {
        setError(data.message || `No live buses found for route ${route}`);
        setBuses([]);
        setSelectedBus(null);
        return;
      }

      const normalizedBuses = data.buses.map((bus) =>
        normalizeBus(bus, data.route_number || route)
      );

      setBuses(normalizedBuses);
      setSelectedBus(normalizedBuses[0]);
    } catch (err) {
      console.error('BMTC search error:', err);
      setError('Failed to search BMTC route');
      setBuses([]);
      setSelectedBus(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <DashboardShell
      title="BMTC Live"
      subtitle="Real-time Bengaluru bus tracking and voice search"
      icon={Bus}
    >
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Bus List */}
        <div className="lg:col-span-1 space-y-4">

          {/* Search */}
          <div className="glass-card p-1.5 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3">
              <Search className="w-4 h-4 text-dark-400" />

              <input
                type="text"
                placeholder="Enter route e.g. 305"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-transparent border-none outline-none text-sm text-white placeholder:text-dark-400 w-full py-2"
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="p-2.5 rounded-xl bg-accent-violet/10 border border-accent-violet/20 text-accent-violet hover:bg-accent-violet/20 transition-colors disabled:opacity-50"
              aria-label="Search route"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-1">
            <div
              className={`w-2 h-2 rounded-full ${
                buses.length > 0
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-dark-500'
              }`}
            />

            <span
              className={`text-[10px] font-mono ${
                buses.length > 0 ? 'text-red-400' : 'text-dark-400'
              }`}
            >
              {buses.length > 0 ? 'LIVE BMTC FEED' : 'BMTC FEED'}
            </span>

            <span className="text-[10px] text-dark-400 ml-auto">
              {buses.length} buses
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="glass-card p-4 border-red-500/20">
              <p className="text-xs text-red-400">
                {error}
              </p>
            </div>
          )}

          {/* Bus Cards */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">

            {buses.map((bus, i) => (
              <motion.button
                key={bus.id}
                onClick={() => setSelectedBus(bus)}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`w-full glass-card p-4 text-left transition-all ${
                  selectedBus?.id === bus.id
                    ? 'border-accent-blue/40 shadow-glow-sm'
                    : 'hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-3">

                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedBus?.id === bus.id
                          ? 'bg-accent-blue/15 border border-accent-blue/30'
                          : 'bg-dark-700'
                      }`}
                    >
                      <Bus
                        className={`w-4 h-4 ${
                          selectedBus?.id === bus.id
                            ? 'text-accent-blue'
                            : 'text-dark-300'
                        }`}
                      />
                    </div>

                    <div>
                      <span className="font-display font-bold text-white block">
                        BUS {bus.route}
                      </span>

                      <span className="text-[10px] text-dark-300 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        {bus.location}
                      </span>
                    </div>

                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono text-emerald-400">
                      {bus.direction}
                    </span>

                    <span className="block text-xs font-mono text-accent-cyan">
                      LIVE
                    </span>
                  </div>

                </div>
              </motion.button>
            ))}

            {!loading && buses.length === 0 && !error && (
              <div className="text-center py-12 text-dark-300">
                <Bus className="w-8 h-8 mx-auto mb-2 opacity-30" />

                <span className="text-sm">
                  Search a BMTC route to see live buses
                </span>
              </div>
            )}

          </div>
        </div>

        {/* Selected Bus Detail */}
        <div className="lg:col-span-2 space-y-4">

          {selectedBus ? (
            <>

              {/* Map Area */}
              <div className="aspect-video bg-dark-700 rounded-2xl border border-white/[0.06] relative overflow-hidden map-grid">

                {/* Route line */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 800 400"
                >
                  <motion.path
                    d="M 100 300 Q 250 350 400 250 Q 550 150 700 100"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2 }}
                  />
                </svg>

                {/* User marker */}
                <div className="absolute bottom-[25%] left-[12%]">
                  <div className="w-4 h-4 bg-accent-cyan rounded-full border-2 border-white shadow-glow-sm map-marker-pulse" />

                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[9px] font-mono text-accent-cyan whitespace-nowrap">
                    YOU
                  </span>
                </div>

                {/* Bus marker */}
                <motion.div
                  className="absolute"
                  style={{
                    left: '55%',
                    top: '40%',
                  }}
                >
                  <div className="w-8 h-8 rounded-xl bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center shadow-glow-sm">
                    <Bus className="w-4 h-4 text-accent-blue" />
                  </div>

                  <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[9px] font-mono text-accent-blue whitespace-nowrap font-bold">
                    {selectedBus.busNumber}
                  </span>
                </motion.div>

                {/* Info overlay */}
                <div className="absolute top-4 left-4 glass-card px-4 py-3 backdrop-blur-md">

                  <span className="text-[10px] font-mono text-dark-300">
                    SELECTED ROUTE
                  </span>

                  <h3 className="font-display text-2xl font-bold text-white">
                    BUS {selectedBus.route}
                  </h3>

                  <span className="text-[10px] text-accent-cyan">
                    {selectedBus.busNumber}
                  </span>

                </div>
              </div>

              {/* Bus stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                {[
                  {
                    label: 'Location',
                    value: selectedBus.location,
                    color: '#00d4ff',
                  },
                  {
                    label: 'Direction',
                    value: selectedBus.direction,
                    color: '#22c55e',
                  },
                  {
                    label: 'Heading',
                    value: `${selectedBus.heading.toFixed(0)}°`,
                    color: '#8b5cf6',
                  },
                  {
                    label: 'Status',
                    value: selectedBus.status,
                    color: '#3b82f6',
                  },
                ].map((s) => (
                  <div key={s.label} className="glass-card p-4">

                    <span className="text-[10px] text-dark-300 uppercase tracking-wider block mb-1">
                      {s.label}
                    </span>

                    <span
                      className="text-sm font-semibold font-display"
                      style={{ color: s.color }}
                    >
                      {s.value}
                    </span>

                  </div>
                ))}

              </div>

              {/* Voice confirmation */}
              <div className="glass-card p-4 flex items-center gap-3 border-accent-cyan/20">

                <div className="w-8 h-8 rounded-lg bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
                  <Volume2 className="w-4 h-4 text-accent-cyan" />
                </div>

                <span className="text-sm text-white italic">
                  "Bus {selectedBus.route}, vehicle {selectedBus.busNumber},
                  is currently at {selectedBus.location}, heading{' '}
                  {selectedBus.direction.toLowerCase()}."
                </span>

              </div>

            </>
          ) : (
            <div className="flex items-center justify-center h-64 glass-card">
              <span className="text-dark-300 text-sm">
                Search a bus route to view live details
              </span>
            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  );
}