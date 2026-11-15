import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Eye,
  Radio,
  MapPin,
  Bus,
  Mic,
  ShieldCheck,
  Navigation,
  Clock,
  Activity,
  Heart,
  Wifi,
  ChevronRight,
  AlertTriangle,
  Volume2,
  Users,
  History,
  Settings,
  Bell,
  RefreshCw,
  Send,
  Search,
  X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import {
  systemService,
  bmtcService,
  assistanceService,
  liveAssistService,
  familyService,
  telegramService,
  volunteerService,
} from '../services/api';

const sidebarItems = [
  { icon: Activity, label: 'Overview', active: true },
  { icon: Heart, label: 'Health Monitoring', href: '/health' },
  { icon: Volume2, label: 'Get Help Now', href: '/assist' },
  { icon: Eye, label: 'Eyes on Demand', href: '/live-assist' },
  { icon: Users, label: 'Volunteers', href: '/volunteers' },
  { icon: ShieldCheck, label: 'Family Sharing', href: '/contacts' },
  { icon: MapPin, label: 'Family Live Track', href: '/family/track' },
  { icon: Eye, label: 'AI Vision', href: '/vision' },
  { icon: MapPin, label: 'Live Location', href: '/location' },
  { icon: Bus, label: 'BMTC Live', href: '/bmtc' },
  { icon: Navigation, label: 'Navigation', href: '/navigation' },
  { icon: Mic, label: 'Voice Assistant', href: '/voice' },
  { icon: AlertTriangle, label: 'SOS & Safety', href: '/safety' },
  { icon: History, label: 'Activity Log', href: '/history' },
  { icon: Settings, label: 'Accessibility', href: '/accessibility' },
];

function StatusBadge({ status, children }) {
  const colors = {
    safe: 'bg-[#065F46]/10 text-[#065F46] border-[#065F46]/25',
    warning: 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]/35',
    danger: 'bg-red-50 text-red-700 border-red-200',
    active: 'bg-[#065F46]/10 text-[#065F46] border-[#065F46]/25',
    online: 'bg-[#065F46]/10 text-[#065F46] border-[#065F46]/25',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${
        colors[status] || colors.active
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {children}
    </span>
  );
}

function readLocalContactsCount() {
  try {
    const raw = localStorage.getItem('sightlink_sos_contacts');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    // ignore
  }
  return 0;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { location: stickLocation, connection: gpsConnection } = useStickGps();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [health, setHealth] = useState(null);
  const [apiPingMs, setApiPingMs] = useState(null);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [guardiansCount, setGuardiansCount] = useState(0);
  const [pendingVolunteersCount, setPendingVolunteersCount] = useState(0);
  const [activeAssist, setActiveAssist] = useState(null);
  const [activeLive, setActiveLive] = useState(null);
  const [recentItems, setRecentItems] = useState([]);
  const [alertLogs, setAlertLogs] = useState([]);
  const [localContactsCount, setLocalContactsCount] = useState(() => readLocalContactsCount());
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Interactive BMTC quick route lookup
  const [bmtcRouteInput, setBmtcRouteInput] = useState(() => {
    try {
      return localStorage.getItem('sightlink_last_bmtc_route') || '500D';
    } catch {
      return '500D';
    }
  });
  const [bmtcBuses, setBmtcBuses] = useState([]);
  const [bmtcLoading, setBmtcLoading] = useState(false);
  const [bmtcError, setBmtcError] = useState('');

  const speechRecSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncCount = () => setLocalContactsCount(readLocalContactsCount());
    window.addEventListener('storage', syncCount);
    window.addEventListener('sightlink:contacts-updated', syncCount);
    return () => {
      window.removeEventListener('storage', syncCount);
      window.removeEventListener('sightlink:contacts-updated', syncCount);
    };
  }, []);

  const loadDashboardTelemetry = useCallback(async () => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const h = await systemService.getHealth();
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setHealth(h);
    setApiPingMs(h ? Math.max(1, Math.round(t1 - t0)) : null);

    if (!user) {
      setTelegramStatus(null);
      setGuardiansCount(0);
      setActiveAssist(null);
      setActiveLive(null);
      setRecentItems([]);
      setAlertLogs([]);
      return;
    }

    try {
      const [tg, activeA, activeL, logs, histA, timeline, famMembers, volPend] = await Promise.all([
        telegramService.getStatus().catch(() => null),
        user.role === 'family' ? Promise.resolve(null) : assistanceService.getActive().catch(() => null),
        user.role === 'family' ? Promise.resolve(null) : liveAssistService.getActive().catch(() => null),
        user.role === 'blind_user' || user.role === 'family'
          ? familyService.getDeliveryLogs().catch(() => [])
          : Promise.resolve([]),
        user.role === 'family' ? Promise.resolve([]) : assistanceService.getHistory().catch(() => []),
        user.role === 'blind_user' ? familyService.getMyTimeline().catch(() => []) : Promise.resolve([]),
        user.role === 'blind_user' ? familyService.getMembers().catch(() => []) : Promise.resolve([]),
        user.role === 'volunteer' ? volunteerService.getPendingRequests().catch(() => []) : Promise.resolve([]),
      ]);

      setTelegramStatus(tg);
      setActiveAssist(activeA);
      setActiveLive(activeL);
      setPendingVolunteersCount(Array.isArray(volPend) ? volPend.length : 0);

      if (Array.isArray(famMembers)) {
        setGuardiansCount(famMembers.filter((m) => m.status === 'approved').length);
      }

      const dLogs = Array.isArray(logs) ? logs : [];
      setAlertLogs(dLogs);

      const merged = [
        ...(Array.isArray(timeline) ? timeline : []).map((ev) => ({
          id: `t-${ev.id}`,
          time: ev.updated_at || ev.created_at,
          label: ev.summary || ev.title,
        })),
        ...dLogs.map((l) => ({
          id: `d-${l.id}`,
          time: l.created_at,
          label: `${l.event_type} · ${String(l.channel).toUpperCase()} (${l.status})`,
        })),
        ...(Array.isArray(histA) ? histA : []).map((a) => ({
          id: `a-${a.id}`,
          time: a.created_at,
          label: `${(a.assistance_type || 'Help').replace(/_/g, ' ')} (${a.status})`,
        })),
      ]
        .sort((x, y) => Date.parse(y.time || 0) - Date.parse(x.time || 0))
        .slice(0, 4);

      setRecentItems(merged);
    } catch {
      // Individual queries degrade gracefully
    }
  }, [user]);

  useEffect(() => {
    loadDashboardTelemetry();
  }, [loadDashboardTelemetry]);

  const handleQuickBmtcCheck = async (e) => {
    e?.preventDefault();
    const route = bmtcRouteInput.trim().toUpperCase();
    if (!route) return;
    setBmtcLoading(true);
    setBmtcError('');
    try {
      localStorage.setItem('sightlink_last_bmtc_route', route);
    } catch {
      // ignore
    }

    const lat = stickLocation?.fix && Number.isFinite(stickLocation.latitude) ? stickLocation.latitude : 12.9716;
    const lng = stickLocation?.fix && Number.isFinite(stickLocation.longitude) ? stickLocation.longitude : 77.5946;

    try {
      const res = await bmtcService.getNearbyBus(route, lat, lng);
      if (res?.success && Array.isArray(res.all_buses) && res.all_buses.length > 0) {
        setBmtcBuses(res.all_buses.slice(0, 3));
      } else {
        setBmtcBuses([]);
        setBmtcError(res?.message || `No live buses reported for route ${route}.`);
      }
    } catch (err) {
      setBmtcBuses([]);
      setBmtcError(
        err?.status === 502
          ? 'BMTC government upstream temporarily unavailable (HTTP 502).'
          : err?.message || 'BMTC route check failed.'
      );
    } finally {
      setBmtcLoading(false);
    }
  };

  const isBackendHealthy = health?.status === 'healthy' || health?.status === 'ok';
  const gmailConfigured = Boolean(health?.gmail_configured ?? health?.gmail_smtp_configured);
  const telegramConfigured = Boolean(health?.telegram_configured ?? health?.telegram_bot_configured);

  const quickStats = [
    {
      title: 'Stick & Sensor',
      href: '/vision',
      value:
        stickLocation?.distance_cm != null && stickLocation.distance_cm < 900
          ? `${(stickLocation.distance_cm / 100).toFixed(1)}m`
          : gpsConnection === 'connected'
          ? 'Connected'
          : 'Standby',
      subtext:
        gpsConnection === 'connected'
          ? 'ESP8266 stick telemetry active'
          : 'Hardware offline — browser tools ready',
      status: gpsConnection === 'connected' ? 'Live Hardware' : 'Configure Stick / Cam',
      icon: Radio,
      color: '#065F46',
    },
    {
      title: 'GPS Lock',
      href: '/location',
      value: stickLocation?.fix ? `${stickLocation.satellites} Sat` : '--',
      subtext:
        stickLocation?.fix && Number.isFinite(stickLocation.latitude)
          ? `${Math.abs(stickLocation.latitude).toFixed(5)}°${stickLocation.latitude >= 0 ? 'N' : 'S'}`
          : gpsConnection === 'connected'
          ? 'Waiting for NEO-6M fix'
          : 'Stick GPS offline',
      status: stickLocation?.fix ? 'Live NEO-6M Fix' : 'Open Location Setup',
      icon: MapPin,
      color: '#8C6A23',
    },
    {
      title: 'Alert Dispatch',
      href: '/safety',
      value: telegramStatus?.connected
        ? `@${telegramStatus.telegram_username || 'Linked'}`
        : telegramConfigured
        ? 'Bot Ready'
        : 'Needs Setup',
      subtext: user
        ? `${guardiansCount} family guardian${guardiansCount === 1 ? '' : 's'} · ${localContactsCount} SOS contacts`
        : `${localContactsCount} saved SOS contacts`,
      status: telegramStatus?.connected ? 'Telegram Active' : 'Link Telegram / SOS',
      icon: ShieldCheck,
      color: '#047857',
    },
    {
      title: 'Active Sessions',
      href: user?.role === 'volunteer' ? '/volunteers' : '/assist',
      value: activeLive
        ? 'Video Live'
        : activeAssist
        ? activeAssist.status
        : user?.role === 'volunteer'
        ? `${pendingVolunteersCount} Nearby`
        : 'Ready',
      subtext: activeLive
        ? `Eyes on Demand · ${activeLive.connection_mode}`
        : activeAssist
        ? `${(activeAssist.assistance_type || 'help').replace(/_/g, ' ')}`
        : 'Voice & Volunteer Hub standby',
      status: activeLive || activeAssist ? 'Session in Progress' : 'Request Assistance',
      icon: Users,
      color: '#0F766E',
    },
  ];

  return (
    <div className="min-h-screen bg-transparent text-[#12231B]">
      <Navbar />

      <div className="flex pt-20">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 min-h-[calc(100vh-5rem)] bg-[#EFE8DA]/95 backdrop-blur-xl border-r border-[#DCD2BF] p-4 sticky top-20 transition-all">
          <div className="flex items-center gap-2 px-3 py-2 mb-4">
            <div
              className={`w-2 h-2 rounded-full ${
                isBackendHealthy ? 'bg-[#065F46] animate-pulse' : 'bg-[#9CA89E]'
              }`}
            />
            <span className="text-xs font-mono font-semibold text-[#065F46]">
              {isBackendHealthy ? 'HUB CONNECTED' : 'CHECK BACKEND'}
            </span>
          </div>

          <nav className="flex flex-col gap-1 flex-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.href || '/dashboard'}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    item.active
                      ? 'bg-[#065F46] text-white font-semibold shadow-glow-sm'
                      : 'text-[#354B40] hover:text-[#12231B] hover:bg-[#FAF7F0]/80 font-medium'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${item.active ? 'text-[#F4E3BC]' : 'text-[#065F46]/80'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Real Hardware & API Diagnostics */}
          <div className="mt-auto p-3.5 rounded-xl bg-[#FAF7F0] border border-[#DCD2BF] space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#4F6358]">
                <Wifi className="w-3.5 h-3.5 text-[#065F46]" /> Stick Link
              </span>
              <span
                className={`font-mono font-semibold ${
                  gpsConnection === 'connected' ? 'text-[#065F46]' : 'text-[#8C6A23]'
                }`}
              >
                {gpsConnection === 'connected' ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#4F6358]">
                <Radio className="w-3.5 h-3.5 text-[#047857]" /> Ultrasonic
              </span>
              <span className="text-[#12231B] font-mono font-semibold">
                {stickLocation?.distance_cm != null && stickLocation.distance_cm < 900
                  ? `${stickLocation.distance_cm.toFixed(0)} cm`
                  : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[#4F6358]">
                <Clock className="w-3.5 h-3.5 text-[#8C6A23]" /> API Ping
              </span>
              <span className="text-[#12231B] font-mono font-semibold">
                {apiPingMs != null ? `${apiPingMs} ms` : 'Offline'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 md:p-8 max-w-[1400px]">
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 relative">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-[#12231B]">
                Command Center
              </h1>
              <p className="text-sm text-[#4F6358] mt-1 font-mono">
                {currentTime.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}{' '}
                · {user ? `Signed in as ${user.full_name}` : 'Guest Preview'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={isBackendHealthy ? 'online' : 'warning'}>
                {isBackendHealthy ? 'BACKEND ONLINE' : 'BACKEND UNREACHABLE'}
              </StatusBadge>

              <button
                type="button"
                onClick={loadDashboardTelemetry}
                aria-label="Refresh dashboard status"
                className="p-2.5 rounded-xl bg-white/90 border border-[#DCD2BF] hover:border-[#065F46]/40 text-[#354B40] hover:text-[#065F46] transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  aria-expanded={notificationsOpen}
                  aria-label="Notifications"
                  className="relative p-2.5 rounded-xl bg-white/90 border border-[#DCD2BF] hover:border-[#065F46]/40 text-[#354B40] hover:text-[#065F46] transition-colors shadow-sm"
                >
                  <Bell className="w-4 h-4" />
                  {alertLogs.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#065F46] text-white text-[9px] font-mono font-bold flex items-center justify-center">
                      {Math.min(9, alertLogs.length)}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 glass-card p-4 shadow-xl border border-[#DCD2BF] z-40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#12231B]">
                        Recent Alert Deliveries
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        aria-label="Close notifications"
                        className="text-[#4F6358] hover:text-[#12231B]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {!user ? (
                      <p className="text-xs text-[#4F6358]">
                        Sign in to see live Telegram, Email, and Web Push delivery receipts.
                      </p>
                    ) : alertLogs.length === 0 ? (
                      <p className="text-xs text-[#4F6358]">
                        No alert deliveries logged yet. Trigger SOS or send a calm update to verify.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {alertLogs.slice(0, 5).map((log) => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded-lg bg-[#F6F1E6] border border-[#E2D9C8] text-[11px]"
                          >
                            <div className="flex items-center justify-between font-mono font-semibold">
                              <span>{log.event_type}</span>
                              <span
                                className={
                                  log.status === 'sent'
                                    ? 'text-[#065F46]'
                                    : log.status === 'skipped'
                                    ? 'text-[#8C6A23]'
                                    : 'text-red-700'
                                }
                              >
                                {String(log.status).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-[#4F6358] block mt-0.5">
                              {log.channel} → {log.destination_masked || log.recipient_scope}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Link
                      to="/history"
                      className="block text-center text-xs font-semibold text-[#065F46] hover:underline pt-1"
                    >
                      Open Full Activity History →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {quickStats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.title}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link
                    to={stat.href}
                    className="block glass-card p-5 group hover:border-[#065F46]/40 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: `${stat.color}14`, border: `1px solid ${stat.color}28` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: stat.color }} />
                      </div>
                      <span className="text-[10px] font-mono text-[#55685E] font-semibold uppercase tracking-wider">
                        {stat.title}
                      </span>
                    </div>
                    <h3 className="font-display text-2xl font-bold text-[#12231B] mb-0.5 truncate">
                      {stat.value}
                    </h3>
                    <p className="text-xs text-[#4F6358] mb-2 truncate">{stat.subtext}</p>
                    <div className="pt-2 border-t border-[#E3DCCB] text-[11px] font-mono font-semibold" style={{ color: stat.color }}>
                      {stat.status}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Live Hub & Quick Actions Panel */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 glass-card p-6 border-[#DCD2BF] space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-[#065F46]" />
                  <h3 className="font-display font-bold text-[#12231B]">
                    Live Assist &amp; Safety Operations
                  </h3>
                </div>
                <span className="text-xs font-mono text-[#4F6358]">
                  Email SMTP: {gmailConfigured ? 'Configured' : 'Unconfigured'} · Bot:{' '}
                  {telegramConfigured ? 'Configured' : 'Unconfigured'}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Link
                  to="/assist"
                  className="p-5 rounded-2xl bg-[#ECF7F2] border border-[#065F46]/30 hover:border-[#065F46] transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Volume2 className="w-5 h-5 text-[#065F46]" />
                    <span className="text-[10px] font-mono font-bold text-[#065F46]">
                      {activeAssist ? activeAssist.status : 'VOICE OR TAP'}
                    </span>
                  </div>
                  <h4 className="font-display font-bold text-[#12231B]">Get Volunteer Assistance</h4>
                  <p className="text-xs text-[#4F6358]">
                    Broadcast your live GPS request to nearby verified volunteers with automatic escalation.
                  </p>
                </Link>

                <Link
                  to="/live-assist"
                  className="p-5 rounded-2xl bg-[#FBF3DF]/70 border border-[#C59B42]/40 hover:border-[#8C6A23] transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Eye className="w-5 h-5 text-[#8C6A23]" />
                    <span className="text-[10px] font-mono font-bold text-[#7D5B1C]">
                      {activeLive ? activeLive.status : 'WEBRTC VIDEO'}
                    </span>
                  </div>
                  <h4 className="font-display font-bold text-[#12231B]">Eyes on Demand (Live Camera)</h4>
                  <p className="text-xs text-[#4F6358]">
                    Share rear camera &amp; audio with a volunteer for quick visual help with instant spoken replies.
                  </p>
                </Link>

                <Link
                  to="/safety"
                  className="p-5 rounded-2xl bg-red-50/70 border border-red-200 hover:border-red-400 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <AlertTriangle className="w-5 h-5 text-red-700" />
                    <span className="text-[10px] font-mono font-bold text-red-700">
                      {telegramStatus?.connected ? 'TELEGRAM READY' : 'CONFIGURE ALERTS'}
                    </span>
                  </div>
                  <h4 className="font-display font-bold text-[#12231B]">Emergency SOS &amp; Dispatch</h4>
                  <p className="text-xs text-[#4F6358]">
                    Sends real Telegram, Email &amp; Push alerts with live location link and SMS/call shortcuts.
                  </p>
                </Link>

                <Link
                  to="/vision"
                  className="p-5 rounded-2xl bg-[#F6F1E6] border border-[#DCD2BF] hover:border-[#065F46]/40 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Eye className="w-5 h-5 text-[#065F46]" />
                    <span className="text-[10px] font-mono font-bold text-[#4F6358]">ESP32-CAM</span>
                  </div>
                  <h4 className="font-display font-bold text-[#12231B]">AI Vision &amp; Stick Camera</h4>
                  <p className="text-xs text-[#4F6358]">
                    Connect your ESP32-CAM LAN stream and inspect YOLOv8 obstacle feedback.
                  </p>
                </Link>
              </div>
            </motion.div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Voice Command Card */}
              <div className="glass-card p-5 border-[#DCD2BF] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Mic className="w-5 h-5 text-[#065F46]" />
                    <h3 className="font-display font-bold text-[#12231B] text-sm">Voice Assistant</h3>
                  </div>
                  <StatusBadge status={speechRecSupported ? 'active' : 'warning'}>
                    {speechRecSupported ? 'MIC READY' : 'TEXT MODE'}
                  </StatusBadge>
                </div>
                <p className="text-xs text-[#4F6358]">
                  Ask “Where am I?”, “Bus 500D”, “Show someone my camera”, or “I need assistance”.
                </p>
                <div className="flex gap-2">
                  <Link
                    to="/voice"
                    className="flex-1 py-2.5 rounded-xl bg-[#065F46] text-white text-xs font-bold text-center hover:bg-[#054D39]"
                  >
                    Open Assistant
                  </Link>
                  <Link
                    to="/accessibility"
                    className="px-3.5 py-2.5 rounded-xl bg-[#F6F1E6] border border-[#DCD2BF] text-xs font-semibold text-[#12231B] hover:border-[#065F46]"
                  >
                    Audio Profile
                  </Link>
                </div>
              </div>

              {/* Interactive Quick BMTC Lookup */}
              <div className="glass-card p-5 border-[#DCD2BF] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Bus className="w-5 h-5 text-[#065F46]" />
                    <h3 className="font-display font-bold text-[#12231B] text-sm">BMTC Quick Check</h3>
                  </div>
                  <Link to="/bmtc" className="text-[11px] font-semibold text-[#065F46] hover:underline">
                    Full Map →
                  </Link>
                </div>

                <form onSubmit={handleQuickBmtcCheck} className="flex gap-2">
                  <input
                    type="text"
                    aria-label="Quick BMTC route"
                    value={bmtcRouteInput}
                    onChange={(e) => setBmtcRouteInput(e.target.value)}
                    placeholder="500D"
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#D7CEBC] text-xs font-mono text-[#12231B]"
                  />
                  <button
                    type="submit"
                    disabled={bmtcLoading}
                    className="px-3.5 py-2 rounded-xl bg-[#065F46] text-white text-xs font-bold hover:bg-[#054D39] inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{bmtcLoading ? '...' : 'Check'}</span>
                  </button>
                </form>

                {bmtcError && <p className="text-[11px] text-red-700">{bmtcError}</p>}

                {bmtcBuses.length > 0 ? (
                  <div className="space-y-2">
                    {bmtcBuses.map((bus) => (
                      <div
                        key={bus.vehicle_id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]"
                      >
                        <div>
                          <span className="text-xs font-display font-bold text-[#12231B]">
                            {bus.bus_number || bus.route}
                          </span>
                          <span
                            className={`block text-[10px] font-mono ${
                              bus.approaching ? 'text-[#065F46] font-semibold' : 'text-[#4F6358]'
                            }`}
                          >
                            {bus.approaching ? 'Approaching' : 'Moving away'}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-[#8C6A23]">
                          {bus.distance_km < 1
                            ? `${Math.round(bus.distance_km * 1000)}m`
                            : `${bus.distance_km.toFixed(1)}km`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  !bmtcError && (
                    <p className="text-xs text-[#4F6358]">
                      Enter a route number and click Check for live BMTC telemetry.
                    </p>
                  )
                )}
              </div>

              {/* Safety Mesh Real Counters */}
              <div className="glass-card p-5 border-[#DCD2BF]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#065F46]" />
                    <h3 className="font-display font-bold text-[#12231B] text-sm">Safety Mesh</h3>
                  </div>
                  <Link to="/contacts" className="text-[11px] font-semibold text-[#065F46] hover:underline">
                    Manage →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] text-center">
                    <span className="text-lg font-display font-bold text-[#12231B]">{localContactsCount}</span>
                    <span className="block text-[10px] text-[#4F6358]">SOS Contacts</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] text-center">
                    <span className="text-lg font-display font-bold text-[#065F46]">{guardiansCount}</span>
                    <span className="block text-[10px] text-[#4F6358]">Family Links</span>
                  </div>
                </div>
                <div className="mt-2.5 px-3 py-2 rounded-xl bg-[#FAF7F0] border border-[#E2D9C8] flex items-center justify-between text-[11px] font-mono">
                  <span className="flex items-center gap-1.5 text-[#4F6358]">
                    <Send className="w-3 h-3 text-[#065F46]" /> Telegram
                  </span>
                  <span className={telegramStatus?.connected ? 'text-[#065F46] font-semibold' : 'text-[#8C6A23]'}>
                    {telegramStatus?.connected
                      ? `@${telegramStatus.telegram_username || 'Connected'}`
                      : 'Not linked'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Real Recent Activity */}
          <div className="mt-6 glass-card p-6 border-[#DCD2BF]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-[#065F46]" />
                <h3 className="font-display font-bold text-[#12231B]">Recent Activity</h3>
              </div>
              <Link
                to="/history"
                className="text-xs font-semibold text-[#065F46] hover:text-[#044432] transition-colors flex items-center gap-1"
              >
                View All <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {recentItems.length === 0 ? (
              <p className="text-xs text-[#4F6358]">
                No recent sessions or alerts recorded yet.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {recentItems.map((item) => {
                  const normalized = /(Z|[+-]\d{2}:\d{2})$/.test(item.time || '')
                    ? item.time
                    : `${item.time}Z`;
                  const t = new Date(normalized);
                  const clock = Number.isNaN(t.getTime())
                    ? '--:--'
                    : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8]"
                    >
                      <span className="text-xs font-mono font-bold text-[#065F46] bg-[#065F46]/10 px-2 py-1 rounded shrink-0">
                        {clock}
                      </span>
                      <span className="text-xs text-[#354B40] truncate">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
