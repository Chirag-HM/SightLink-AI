import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  Satellite,
  Share2,
  Clock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import useStickGps from '../hooks/useStickGps';

function formatCoordinate(value, positiveDirection, negativeDirection) {
  if (!Number.isFinite(value)) return '--';
  return `${Math.abs(value).toFixed(6)}° ${value >= 0 ? positiveDirection : negativeDirection}`;
}

function createMapUrl(latitude, longitude) {
  const mapLatitude = Number(latitude.toFixed(4));
  const mapLongitude = Number(longitude.toFixed(4));
  const latitudeOffset = 0.003;
  const longitudeOffset = 0.003 / Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  const bounds = [
    mapLongitude - longitudeOffset,
    mapLatitude - latitudeOffset,
    mapLongitude + longitudeOffset,
    mapLatitude + latitudeOffset,
  ].join(',');

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${mapLatitude},${mapLongitude}`;
}

function formatValue(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : '--';
}

export default function LocationPage() {
  const { deviceUrl, location, connection, error, lastUpdate, saveDeviceUrl } = useStickGps();
  const [deviceUrlInput, setDeviceUrlInput] = useState(deviceUrl);
  const [formError, setFormError] = useState('');
  const hasFix = location?.fix
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude);
  const mapUrl = useMemo(
    () => (hasFix ? createMapUrl(location.latitude, location.longitude) : ''),
    [hasFix, location?.latitude, location?.longitude],
  );

  const stats = [
    {
      icon: Satellite,
      label: 'Satellites',
      value: Number.isFinite(location?.satellites) ? location.satellites : '--',
      sub: hasFix ? 'GPS fix active' : 'Waiting for GPS fix',
      color: '#065F46',
    },
    {
      icon: Compass,
      label: 'HDOP',
      value: formatValue(location?.hdop),
      sub: 'Horizontal dilution',
      color: '#8C6A23',
    },
    {
      icon: Navigation,
      label: 'Heading',
      value: formatValue(location?.heading_degrees, '°'),
      sub: 'GPS course',
      color: '#047857',
    },
    {
      icon: Navigation,
      label: 'Speed',
      value: formatValue(location?.speed_mps, ' m/s'),
      sub: 'GPS measured',
      color: '#065F46',
    },
    {
      icon: MapPin,
      label: 'Altitude',
      value: formatValue(location?.altitude_m, ' m'),
      sub: 'GPS measured',
      color: '#8C6A23',
    },
    {
      icon: Clock,
      label: 'Last Update',
      value: lastUpdate ? lastUpdate.toLocaleTimeString() : '--',
      sub: connection === 'connected' ? 'Polling every 2 seconds' : 'Standby retry every 15s',
      color: '#0F766E',
    },
  ];

  function handleDeviceSubmit(event) {
    event.preventDefault();
    setFormError('');
    try {
      const savedUrl = saveDeviceUrl(deviceUrlInput);
      setDeviceUrlInput(savedUrl);
    } catch (saveError) {
      setFormError(saveError.message || 'Enter a valid smart stick address.');
    }
  }

  const ConnectionIcon = connection === 'connected' ? Wifi : WifiOff;
  const statusText = connection === 'connecting'
    ? 'CONNECTING'
    : connection === 'disconnected'
      ? 'DEVICE OFFLINE'
      : hasFix
        ? 'GPS LOCKED'
        : 'WAITING FOR GPS';

  return (
    <DashboardShell title="Live Location" subtitle="NEO-6M GPS satellite tracking and real-time positioning" icon={MapPin}>
      <div className="mb-6 glass-card p-4">
        <form onSubmit={handleDeviceSubmit} className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex-1">
            <span className="block text-xs text-[#4F6358] mb-2">Smart stick address (ESP8266)</span>
            <input
              type="text"
              value={deviceUrlInput}
              onChange={(event) => setDeviceUrlInput(event.target.value)}
              placeholder="http://10.192.24.89"
              className="w-full rounded-lg bg-white border border-[#D7CEBC] px-3 py-2.5 text-sm text-[#12231B] placeholder:text-[#697D72] outline-none focus:border-[#065F46]"
              aria-label="Smart stick address"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-[#065F46] hover:bg-[#054D39] px-5 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Connect
          </button>
        </form>
        {(formError || error) && (
          <p className="mt-3 text-xs text-red-700 font-medium" role="alert">{formError || error}</p>
        )}
        <p className="mt-2 text-[11px] text-[#4F6358]">
          Use the ESP8266 IP shown in the Arduino Serial Monitor. Your browser and stick must share a Wi-Fi network.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="aspect-[4/3] lg:aspect-video bg-[#EFEAD9] rounded-2xl border border-[#DCD2BF] relative overflow-hidden">
            {hasFix ? (
              <iframe
                key={mapUrl}
                title="Live smart stick GPS position"
                src={mapUrl}
                className="absolute inset-0 w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#4F6358]">
                <MapPin className="w-8 h-8 text-[#065F46]" />
                <span className="text-sm font-medium text-[#12231B]">
                  {connection === 'connected'
                    ? 'Stick connected. Waiting for a NEO-6M GPS fix…'
                    : connection === 'connecting'
                      ? 'Connecting to the smart stick…'
                      : 'Connect to the smart stick to load its location.'}
                </span>
                {connection === 'connected' && (
                  <span className="max-w-sm text-center text-xs text-[#4F6358]">
                    Take the GPS antenna outdoors with a clear view of the sky. The map appears when the module reports a valid fix.
                  </span>
                )}
              </div>
            )}

            <div className="absolute top-4 left-4 glass-card px-4 py-3 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${hasFix ? 'bg-[#065F46] animate-pulse' : 'bg-[#8C6A23]'}`} />
                <span className={`text-[10px] font-mono font-semibold tracking-wider ${hasFix ? 'text-[#065F46]' : 'text-[#8C6A23]'}`}>
                  {statusText}
                </span>
              </div>
              <div className="font-mono text-sm text-[#12231B] space-y-0.5">
                <div>{formatCoordinate(location?.latitude, 'N', 'S')}</div>
                <div>{formatCoordinate(location?.longitude, 'E', 'W')}</div>
              </div>
            </div>

            {hasFix && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-4 right-4 glass-card px-3 py-2 flex items-center gap-2 text-xs text-[#12231B] hover:text-[#065F46] font-medium"
              >
                Open exact pin <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="mt-4 glass-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Share2 className="w-4 h-4 text-[#065F46]" />
              <div>
                <span className="text-sm font-semibold text-[#12231B]">Smart Stick GPS</span>
                <span className="block text-xs text-[#4F6358]">
                  {connection === 'connected' ? deviceUrl : 'Waiting for device connection'}
                </span>
              </div>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-[10px] font-mono font-semibold border ${
              hasFix
                ? 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/30'
                : 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]/35'
            }`}>
              <ConnectionIcon className="inline w-3 h-3 mr-1" />
              {hasFix ? 'LIVE' : connection === 'connected' ? 'NO FIX' : 'OFFLINE'}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="glass-card p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${stat.color}14`, border: `1px solid ${stat.color}28` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: stat.color }} />
                  </div>
                  <span className="text-xs text-[#4F6358]">{stat.label}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-[#12231B]">{stat.value}</h3>
                <span className="text-xs text-[#697D72]">{stat.sub}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
