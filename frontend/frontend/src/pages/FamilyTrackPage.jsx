import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Battery,
  Clock,
  ShieldAlert,
  BellRing,
  Lock,
  Search,
  CheckCircle2,
  PauseCircle,
  HeartHandshake,
  Home,
  Route,
  Sparkles,
  UserCheck,
  Map as MapIcon,
  EyeOff,
  ExternalLink,
  Mail,
  Send,
  Bell,
  RefreshCw,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import TelegramConnectCard from '../components/TelegramConnectCard';
import LiveAssistanceMap from '../components/LiveAssistanceMap';
import { useAuth } from '../context/AuthContext';
import { familyService } from '../services/api';
import useWebSocket from '../hooks/useWebSocket';
import usePushNotifications from '../hooks/usePushNotifications';

function formatRelativeTime(isoString) {
  if (!isoString) return 'Not updated yet';
  const normalized = /(Z|[+-]\d{2}:\d{2})$/.test(isoString) ? isoString : `${isoString}Z`;
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return 'Recently';
  const diffMin = Math.round((Date.now() - dt.getTime()) / 60000);
  const clock = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffMin < 1) return `Just now · ${clock}`;
  if (diffMin < 60) return `${diffMin}m ago · ${clock}`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago · ${clock}`;
  return `${dt.toLocaleDateString()} · ${clock}`;
}

function getCategoryMeta(category, urgent) {
  if (urgent || category === 'sos') {
    return {
      icon: ShieldAlert,
      pillClass: 'bg-red-50 border-red-200 text-red-800',
      iconWrap: 'bg-red-100 text-red-700',
      label: 'Urgent Safety',
    };
  }
  switch (category) {
    case 'arrival_departure':
      return {
        icon: Home,
        pillClass: 'bg-[#ECF7F2] border-[#065F46]/25 text-[#065F46]',
        iconWrap: 'bg-[#065F46]/10 text-[#065F46]',
        label: 'Place Update',
      };
    case 'unusual_route':
    case 'long_stop':
      return {
        icon: Route,
        pillClass: 'bg-[#FBF3DF] border-[#C59B42]/40 text-[#7D5B1C]',
        iconWrap: 'bg-[#FBF3DF] text-[#8C6A23]',
        label: category === 'long_stop' ? 'Pause Notice' : 'Route Change',
      };
    case 'help_request':
      return {
        icon: HeartHandshake,
        pillClass: 'bg-[#ECF7F2] border-[#065F46]/30 text-[#064E3B]',
        iconWrap: 'bg-[#065F46]/15 text-[#065F46]',
        label: 'Assistance',
      };
    default:
      return {
        icon: Sparkles,
        pillClass: 'bg-[#F6F1E6] border-[#DCD2BF] text-[#4F6358]',
        iconWrap: 'bg-[#EFE8DA] text-[#354B40]',
        label: 'Calm Update',
      };
  }
}

export default function FamilyTrackPage() {
  const { inviteCode: paramCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [codeInput, setCodeInput] = useState(paramCode || '');
  const [activeCode, setActiveCode] = useState(paramCode ? paramCode.toUpperCase() : '');
  const [snapshot, setSnapshot] = useState(null);
  const [linkedUsers, setLinkedUsers] = useState([]);
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { permission, enableNotifications, showLocalNotification } = usePushNotifications({
    role: 'family',
    inviteCode: activeCode || null,
  });

  const loadSnapshot = useCallback(async (code) => {
    if (!code) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await familyService.trackByCode(code);
      setSnapshot(data);
    } catch (e) {
      setSnapshot(null);
      setErrorMsg(e.message || 'Could not load family updates for this code.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paramCode) {
      const clean = paramCode.trim().toUpperCase();
      setCodeInput(clean);
      setActiveCode(clean);
      setShowLiveMap(false);
      loadSnapshot(clean);
    }
  }, [paramCode, loadSnapshot]);

  const loadDeliveryLogs = useCallback(() => {
    if (user?.role !== 'family') return;
    familyService
      .getDeliveryLogs()
      .then((rows) => setDeliveryLogs(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [user?.role]);

  const loadLinkedUsers = useCallback(() => {
    if (user?.role !== 'family') return;
    familyService
      .getLinked()
      .then((list) => {
        if (Array.isArray(list)) {
          setLinkedUsers(list);
          if (!paramCode && list[0]?.invite_code && !activeCode) {
            const firstCode = list[0].invite_code;
            setCodeInput(firstCode);
            setActiveCode(firstCode);
            loadSnapshot(firstCode);
          }
        }
      })
      .catch(() => {});
    loadDeliveryLogs();
  }, [user?.role, paramCode, activeCode, loadSnapshot, loadDeliveryLogs]);

  const handleToggleMyPref = async (linkId, field, currentVal) => {
    setErrorMsg('');
    try {
      const updated = await familyService.updateMyLinkPreferences(linkId, {
        [field]: !currentVal,
      });
      setLinkedUsers((prev) =>
        prev.map((lnk) =>
          lnk.link_id === linkId
            ? {
                ...lnk,
                notify_email: updated.notify_email,
                notify_telegram: updated.notify_telegram,
                notify_web_push: updated.notify_web_push,
                receive_sos: updated.receive_sos,
                receive_no_volunteer: updated.receive_no_volunteer,
                receive_volunteer_accepted: updated.receive_volunteer_accepted,
                receive_help_completed: updated.receive_help_completed,
                receive_place_arrival: updated.receive_place_arrival,
              }
            : lnk
        )
      );
      setStatusNote('Updated your family alert channel preferences.');
    } catch (err) {
      setErrorMsg(err.message || 'Could not update alert preferences.');
    }
  };

  useEffect(() => {
    loadLinkedUsers();
  }, [loadLinkedUsers]);

  // Live WebSocket Calm Update Feed on /ws/family/{invite_code}
  const handleFamilyEvent = useCallback(
    (msg) => {
      if (!msg?.type) return;
      const calmOrUrgent = [
        'FAMILY_CALM_EVENT',
        'HELP_REQUEST_STARTED',
        'HELP_REQUEST_ACCEPTED',
        'HELP_REQUEST_COMPLETED',
        'HELP_REQUEST_ESCALATED_SOS',
        'GEOFENCE_EXIT_ALERT',
        'SOS_TRIGGERED',
        'FAMILY_INVITE_CONFIRMED',
      ];
      if (calmOrUrgent.includes(msg.type)) {
        const urgent = Boolean(
          msg.urgent ||
            msg.type === 'SOS_TRIGGERED' ||
            msg.type === 'HELP_REQUEST_ESCALATED_SOS' ||
            msg.type === 'GEOFENCE_EXIT_ALERT'
        );
        showLocalNotification({
          title: msg.title || 'SightLink Family Update',
          body: msg.summary || msg.body || 'A calm status update is available.',
          tag: msg.event_type || msg.type,
          requireInteraction: urgent,
          data: { invite_code: activeCode, event_type: msg.type, url: `/family/track/${activeCode}` },
        });
      }
      loadSnapshot(activeCode);
    },
    [activeCode, showLocalNotification, loadSnapshot]
  );

  useWebSocket(activeCode ? `/ws/family/${activeCode}` : null, {
    enabled: Boolean(activeCode),
    onMessage: handleFamilyEvent,
  });

  // Periodic polling every 12s
  useEffect(() => {
    if (!activeCode) return undefined;
    const t = setInterval(() => loadSnapshot(activeCode), 12000);
    return () => clearInterval(t);
  }, [activeCode, loadSnapshot]);

  const handleLookupSubmit = (e) => {
    e.preventDefault();
    const clean = codeInput.trim().toUpperCase();
    if (!clean) return;
    setActiveCode(clean);
    setShowLiveMap(false);
    navigate(`/family/track/${encodeURIComponent(clean)}`, { replace: true });
    loadSnapshot(clean);
  };

  const handleAcceptInvite = async () => {
    if (!activeCode) return;
    setErrorMsg('');
    try {
      const res = await familyService.linkUser(activeCode, 'Family Guardian');
      setStatusNote(res.message || 'Invite accepted! Waiting for user confirmation.');
      loadLinkedUsers();
      loadSnapshot(activeCode);
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const timelineEvents = snapshot?.timeline || [];
  const canLinkThisCode =
    user?.role === 'family' &&
    activeCode &&
    !linkedUsers.some((lnk) => lnk.invite_code === activeCode);

  return (
    <DashboardShell
      title="Calm Family Updates (Read-Only)"
      subtitle="Human-readable timeline of safe arrivals, departures, and help status — keeping privacy first without constant tracking feel"
      icon={HeartHandshake}
    >
      <EmailVerificationBanner className="mb-6" />

      {/* Invite Lookup + Family Account Actions */}
      <div className="glass-card p-5 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <form onSubmit={handleLookupSubmit} className="flex flex-1 gap-2.5 max-w-xl">
          <label htmlFor="family-code-input" className="sr-only">
            Family Invite Code
          </label>
          <input
            id="family-code-input"
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Enter Invite Code (e.g. SL-A1B2-C3D4)"
            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono uppercase text-[#12231B] placeholder:text-[#697D72]"
          />
          <button
            type="submit"
            disabled={loading}
            className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#065F46] text-white font-bold text-sm flex items-center gap-2 hover:bg-[#054D39] shadow-glow-sm"
          >
            <Search className="w-4 h-4" />
            <span>{loading ? 'Loading…' : 'Open Updates'}</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2.5">
          {canLinkThisCode && (
            <button
              type="button"
              onClick={handleAcceptInvite}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#065F46] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <UserCheck className="w-4 h-4" /> Accept Invite & Request Confirm
            </button>
          )}

          {linkedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {linkedUsers.map((lnk) => (
                <button
                  key={lnk.invite_code}
                  type="button"
                  onClick={() => {
                    setCodeInput(lnk.invite_code);
                    setActiveCode(lnk.invite_code);
                    setShowLiveMap(false);
                    loadSnapshot(lnk.invite_code);
                  }}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-medium border ${
                    activeCode === lnk.invite_code
                      ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                      : 'bg-white border-[#D7CEBC] text-[#4F6358]'
                  }`}
                >
                  {lnk.user_name} ({lnk.status === 'pending_confirmation' ? 'Pending Confirm' : lnk.invite_code})
                </button>
              ))}
            </div>
          )}

          {permission !== 'granted' && (
            <button
              type="button"
              onClick={enableNotifications}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/40 text-[#7D5B1C] text-xs font-semibold flex items-center gap-2"
            >
              <BellRing className="w-4 h-4" /> Enable Family Alerts
            </button>
          )}
        </div>
      </div>

      {statusNote && (
        <div role="status" className="mb-5 p-4 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-sm text-[#064E3B] font-medium">
          {statusNote}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {!snapshot ? (
        <div className="glass-card p-10 text-center space-y-3">
          <Lock className="w-10 h-10 text-[#065F46] mx-auto" aria-hidden="true" />
          <h2 className="font-display text-xl font-bold text-[#12231B]">Open a Family Invite Link or Code</h2>
          <p className="text-sm text-[#4F6358] max-w-lg mx-auto">
            Your loved one controls exactly what is shared — from gentle arrival &amp; departure summaries only to optional live map access.
          </p>
        </div>
      ) : snapshot.awaiting_user_confirmation ? (
        <div className="glass-card p-10 text-center space-y-4 border border-[#C59B42]/40">
          <UserCheck className="w-12 h-12 text-[#8C6A23] mx-auto" aria-hidden="true" />
          <h2 className="font-display text-2xl font-bold text-[#12231B]">
            Waiting for {snapshot.user_name}’s Confirmation
          </h2>
          <p className="text-sm text-[#354B40] max-w-md mx-auto">
            Your invite has been accepted. For safety, {snapshot.user_name} must confirm this family connection once by voice (“confirm family member”) or in Family Sharing settings.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Emergency SOS Banner (Bypasses Quiet Hours) */}
          {snapshot.sos_active && (
            <div
              role="alert"
              className="p-5 rounded-2xl bg-red-600 border-2 border-red-700 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 sos-pulse"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-8 h-8 text-white shrink-0 animate-bounce" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-xl font-black text-white">
                    EMERGENCY SOS ACTIVE — {snapshot.user_name}
                  </h2>
                  <p className="text-sm text-red-100">
                    {snapshot.sos_alert?.notes || 'Emergency SOS triggered!'}
                    {snapshot.sos_alert?.latitude != null &&
                      ` Coordinates: ${snapshot.sos_alert.latitude.toFixed(5)}, ${snapshot.sos_alert.longitude.toFixed(5)}`}
                  </p>
                </div>
              </div>
              {snapshot.sos_alert?.latitude != null && (
                <a
                  href={`https://maps.google.com/?q=${snapshot.sos_alert.latitude},${snapshot.sos_alert.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2 rounded-full bg-white text-red-700 font-bold text-xs inline-flex items-center gap-1.5 shrink-0 shadow-sm hover:bg-red-50"
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  <span>View Live Location</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}

          {/* Last Known Place & Time + Current Help Status Summary Cards */}
          <div className="grid md:grid-cols-12 gap-5">
            <div className="md:col-span-7 glass-card p-6 border border-[#DCD2BF] flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-bold text-[#12231B]">{snapshot.user_name}</h2>
                    {snapshot.caregiver_managed && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#FBF3DF] border border-[#C59B42]/40 text-[#7D5B1C]">
                        Managed by Caregiver{snapshot.caregiver_name ? ` (${snapshot.caregiver_name})` : ''}
                      </span>
                    )}
                    {snapshot.quiet_hours_enabled && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-[#F6F1E6] border border-[#DCD2BF] text-[#4F6358]">
                        Quiet Hours Configured
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[#55685E] mt-1">
                    Last Known Place &amp; Time · Read-only code {snapshot.invite_code}
                  </p>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border ${
                    snapshot.sharing_status === 'live'
                      ? 'bg-[#ECF7F2] border-[#065F46]/30 text-[#065F46]'
                      : snapshot.sharing_status === 'paused'
                      ? 'bg-[#FBF3DF] border-[#C59B42]/40 text-[#7D5B1C]'
                      : 'bg-[#F4EFE4] border-[#DCD2BF] text-[#4F6358]'
                  }`}
                >
                  {snapshot.sharing_status === 'live'
                    ? '● Sharing Calm Updates'
                    : snapshot.sharing_status === 'paused'
                    ? `⏸ Paused${snapshot.paused_minutes_remaining ? ` (${snapshot.paused_minutes_remaining}m left)` : ''}`
                    : '○ Sharing Off'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#ECF7F2]/75 border border-[#065F46]/20">
                  <span className="text-[11px] font-mono text-[#065F46] flex items-center gap-1 mb-1">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Last Known Place
                  </span>
                  <strong className="text-sm text-[#12231B] block truncate">
                    {snapshot.last_place_name || 'Out and about'}
                  </strong>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F1E6] border border-[#E2D9C8]">
                  <span className="text-[11px] font-mono text-[#4F6358] flex items-center gap-1 mb-1">
                    <Clock className="w-3.5 h-3.5 text-[#065F46]" aria-hidden="true" /> Last Updated
                  </span>
                  <strong className="text-xs font-mono text-[#12231B] block">
                    {formatRelativeTime(snapshot.last_seen_at)}
                  </strong>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F6F1E6] border border-[#E2D9C8]">
                  <span className="text-[11px] font-mono text-[#4F6358] flex items-center gap-1 mb-1">
                    <Battery className="w-3.5 h-3.5 text-[#8C6A23]" aria-hidden="true" /> Phone Battery
                  </span>
                  <strong className="text-sm font-mono text-[#12231B] block">
                    {snapshot.battery_level != null ? `${snapshot.battery_level}%` : '--'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Current Help Status Card */}
            <div className="md:col-span-5 glass-card p-6 border border-[#DCD2BF] flex flex-col justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#8C6A23] font-semibold">
                  Current Help Status
                </span>
                <h3 className="font-display text-lg font-bold text-[#12231B] mt-1 flex items-center gap-2">
                  <HeartHandshake className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
                  <span>{snapshot.help_status?.label || 'All calm — no active help request'}</span>
                </h3>
                {snapshot.active_request ? (
                  <p className="text-xs text-[#354B40] mt-2">
                    {snapshot.active_request.accepted_volunteer
                      ? `Verified volunteer ${snapshot.active_request.accepted_volunteer.full_name} is assisting (${snapshot.active_request.accepted_volunteer.eta_minutes || 3} min away).`
                      : `Searching within ${snapshot.active_request.radius_km} km for a nearby verified volunteer.`}
                  </p>
                ) : (
                  <p className="text-xs text-[#4F6358] mt-2">
                    Repeated routine notices are grouped politely, while urgent SOS alerts always come through immediately.
                  </p>
                )}
              </div>

              {/* Optional Live Map Toggle (Respects User Consent & Defaults to OFF) */}
              <div className="pt-3 border-t border-[#E3DCCB] flex items-center justify-between gap-3">
                {snapshot.sharing_status !== 'live' ? (
                  <span className="text-xs text-[#4F6358] flex items-center gap-1.5">
                    <PauseCircle className="w-4 h-4 text-[#8C6A23]" />
                    Map hidden while sharing is paused or stopped
                  </span>
                ) : !snapshot.live_map_allowed ? (
                  <span className="text-xs text-[#4F6358] flex items-center gap-1.5">
                    <EyeOff className="w-4 h-4 text-[#8C6A23]" />
                    Calm Timeline Mode — User disabled live map access for you
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-[#354B40]">Live map view allowed by user</span>
                    <button
                      type="button"
                      onClick={() => setShowLiveMap((prev) => !prev)}
                      aria-expanded={showLiveMap}
                      className="min-h-[42px] px-4 py-2 rounded-full bg-[#FAF7F0] border border-[#065F46]/35 text-[#065F46] text-xs font-bold hover:bg-[#ECF7F2] flex items-center gap-1.5 shrink-0"
                    >
                      <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{showLiveMap ? 'Hide Live Map' : 'Show Optional Live Map'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Optional Gated Live Map (Hidden by Default — Calm Timeline is Primary) */}
          {showLiveMap && snapshot.live_map_allowed && snapshot.sharing_status === 'live' && (
            <div className="glass-card p-4 border border-[#065F46]/25">
              <LiveAssistanceMap
                userLocation={snapshot.current_location}
                volunteerLocation={
                  snapshot.active_request?.accepted_volunteer?.latitude != null
                    ? {
                        name: snapshot.active_request.accepted_volunteer.full_name,
                        latitude: snapshot.active_request.accepted_volunteer.latitude,
                        longitude: snapshot.active_request.accepted_volunteer.longitude,
                      }
                    : null
                }
                trail={snapshot.trail || []}
                safeZone={snapshot.safe_zone || null}
                heightClass="h-80 md:h-[400px]"
                label="Optional read-only family live map"
              />
            </div>
          )}

          {/* Default Primary View: Calm Timeline */}
          <section aria-labelledby="calm-timeline-heading" className="glass-card p-6 sm:p-8 border border-[#DCD2BF] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id="calm-timeline-heading" className="font-display text-xl font-bold text-[#12231B]">
                  Calm Journey Timeline
                </h3>
                <p className="text-xs text-[#4F6358] mt-0.5">
                  Meaningful updates from saved places, route checks, and assistance sessions.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-[#F6F1E6] border border-[#E2D9C8] text-[#4F6358]">
                {timelineEvents.length} {timelineEvents.length === 1 ? 'update' : 'updates'}
              </span>
            </div>

            {timelineEvents.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#FAF7F0] border border-[#E2D9C8] text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#065F46] mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#12231B]">Everything looks calm right now</p>
                <p className="text-xs text-[#4F6358]">
                  Updates like arriving safely at Clinic or starting a help session appear here automatically.
                </p>
              </div>
            ) : (
              <ol className="space-y-3">
                {timelineEvents.map((ev) => {
                  const meta = getCategoryMeta(ev.category, ev.urgent);
                  const Icon = meta.icon;
                  return (
                    <li
                      key={ev.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#FAF7F0]/90 border border-[#E2D9C8] hover:border-[#065F46]/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconWrap}`}>
                          <Icon className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${meta.pillClass}`}>
                              {meta.label}
                            </span>
                            {ev.grouped_count > 1 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white border border-[#DCD2BF] text-[#4F6358]">
                                Grouped ×{ev.grouped_count}
                              </span>
                            )}
                            {ev.suppressed_by_quiet_hours && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#FBF3DF] border border-[#C59B42]/35 text-[#7D5B1C]">
                                Quiet Hours Held Push
                              </span>
                            )}
                          </div>
                          <p className="text-base font-semibold text-[#12231B] leading-snug">
                            {ev.summary}
                          </p>
                        </div>
                      </div>

                      <div className="sm:text-right shrink-0 pl-13 sm:pl-0">
                        <span className="text-xs font-mono text-[#55685E] block">
                          {formatRelativeTime(ev.updated_at || ev.created_at)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}

      {/* Family Guardian Multi-Channel Alert Settings (Telegram + Email + Push + Logs) */}
      {user?.role === 'family' && (
        <div className="mt-8 space-y-6">
          <TelegramConnectCard
            title="Connect Family Telegram Alerts (Free)"
            subtitle="Link your Telegram chat to receive instant free notifications when SOS is pressed, no volunteer is available, a volunteer accepts, or safe place arrivals occur."
          />

          {linkedUsers.length > 0 && (
            <section className="glass-card p-6 sm:p-8 border border-[#DCD2BF] space-y-4">
              <div>
                <h3 className="font-display text-lg font-bold text-[#12231B]">
                  My Notification Channels &amp; Event Preferences
                </h3>
                <p className="text-xs text-[#4F6358]">
                  Choose which channels and events you receive for each linked family member. Urgent SOS always bypasses quiet hours.
                </p>
              </div>
              <div className="space-y-4">
                {linkedUsers.map((lnk) => (
                  <div
                    key={lnk.link_id}
                    className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#E2D9C8] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-sm text-[#12231B]">
                        {lnk.user_name}{' '}
                        <span className="font-mono text-xs text-[#8C6A23]">({lnk.invite_code})</span>
                      </span>
                      <span className="text-[11px] font-mono text-[#065F46]">
                        {lnk.status === 'pending_confirmation' ? 'Waiting user confirm' : 'Active guardian link'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={Boolean(lnk.notify_email)}
                        onClick={() => handleToggleMyPref(lnk.link_id, 'notify_email', lnk.notify_email)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                          lnk.notify_email
                            ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                            : 'bg-white border-[#D7CEBC] text-[#697D72]'
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5" /> Email {lnk.notify_email ? 'ON' : 'OFF'}
                      </button>
                      <button
                        type="button"
                        aria-pressed={Boolean(lnk.notify_telegram)}
                        onClick={() => handleToggleMyPref(lnk.link_id, 'notify_telegram', lnk.notify_telegram)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                          lnk.notify_telegram
                            ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                            : 'bg-white border-[#D7CEBC] text-[#697D72]'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" /> Telegram {lnk.notify_telegram ? 'ON' : 'OFF'}
                      </button>
                      <button
                        type="button"
                        aria-pressed={Boolean(lnk.notify_web_push)}
                        onClick={() => handleToggleMyPref(lnk.link_id, 'notify_web_push', lnk.notify_web_push)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                          lnk.notify_web_push
                            ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                            : 'bg-white border-[#D7CEBC] text-[#697D72]'
                        }`}
                      >
                        <Bell className="w-3.5 h-3.5" /> Web Push {lnk.notify_web_push ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ['receive_sos', 'SOS Urgent'],
                        ['receive_no_volunteer', 'No Volunteer Warning'],
                        ['receive_volunteer_accepted', 'Volunteer Accepted'],
                        ['receive_help_completed', 'Help Completed'],
                        ['receive_place_arrival', 'Safe Place Arrival'],
                      ].map(([field, label]) => (
                        <button
                          key={field}
                          type="button"
                          aria-pressed={Boolean(lnk[field])}
                          onClick={() => handleToggleMyPref(lnk.link_id, field, lnk[field])}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                            lnk[field]
                              ? 'bg-[#FBF3DF] border-[#C59B42]/50 text-[#7D5B1C]'
                              : 'bg-white border-[#DCD2BF] text-[#697D72]'
                          }`}
                        >
                          {label}: {lnk[field] ? 'On' : 'Off'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="glass-card p-6 sm:p-8 border border-[#DCD2BF] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-[#12231B]">
                Recent Alerts Delivered to Me
              </h3>
              <button
                type="button"
                onClick={loadDeliveryLogs}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white border border-[#D7CEBC] text-xs font-semibold text-[#354B40] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
              </button>
            </div>
            {deliveryLogs.length === 0 ? (
              <p className="text-xs text-[#4F6358]">
                No Email or Telegram alerts logged for your guardian account yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {deliveryLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-[#FAF7F0] border border-[#E2D9C8] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-[#12231B]">{log.event_type}</span>
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-white border border-[#DCD2BF] font-mono text-[10px] uppercase">
                        {log.channel}
                      </span>
                      {log.error_detail && (
                        <p className="text-[11px] text-red-700 mt-0.5">{log.error_detail}</p>
                      )}
                    </div>
                    <span
                      className={`font-mono px-2 py-0.5 rounded-full text-[10px] border ${
                        log.status === 'sent'
                          ? 'bg-[#ECF7F2] border-[#065F46]/30 text-[#065F46]'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      {log.status.toUpperCase()} · {formatRelativeTime(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
