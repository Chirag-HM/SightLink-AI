import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mic,
  MicOff,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Phone,
  Star,
  Flag,
  Radio,
  LogIn,
  Volume2,
  Video,
  MessageSquare,
  Share2,
  ExternalLink,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import LiveAssistanceMap from '../components/LiveAssistanceMap';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import useVoiceAssistant, { speakText } from '../hooks/useVoiceAssistant';
import useWebSocket from '../hooks/useWebSocket';
import { assistanceService, safetyApiService } from '../services/api';
import { enqueueOfflineAction } from '../assistant/offlineQueue';
import { sosSiren } from '../utils/sosSound';
import { triggerHaptic } from '../utils/haptics';

const REQUEST_TYPES = [
  { id: 'crossing road', label: 'Crossing Road' },
  { id: 'navigation', label: 'Navigation Help' },
  { id: 'other', label: 'General Assistance' },
];

const TIMELINE_STEPS = ['PENDING', 'ACCEPTED', 'ARRIVED', 'COMPLETED'];

export default function AssistancePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { location: stickGps } = useStickGps();

  const [requestType, setRequestType] = useState(searchParams.get('type') || 'crossing road');
  const [notes, setNotes] = useState(searchParams.get('notes') || '');
  const [activeRequest, setActiveRequest] = useState(null);
  const [history, setHistory] = useState([]);
  const [userCoords, setUserCoords] = useState({ latitude: 12.9716, longitude: 77.5946 });
  const [escalationCountdown, setEscalationCountdown] = useState(60);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Post-completion rating & anti-abuse report states
  const [completedToRate, setCompletedToRate] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [sosActive, setSosActive] = useState(false);
  const [sosFallbacks, setSosFallbacks] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  const announcedAcceptRef = useRef('');
  const autoTriggeredRef = useRef(false);
  const inFlightRequestRef = useRef(false);

  const isBlindUser = user?.role === 'blind_user';

  const resolveBestGps = useCallback(() => {
    return new Promise((resolve) => {
      if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
        const coords = { latitude: stickGps.latitude, longitude: stickGps.longitude };
        setUserCoords(coords);
        resolve(coords);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setUserCoords(coords);
            resolve(coords);
          },
          () => resolve(userCoords),
          { enableHighAccuracy: true, timeout: 4000 }
        );
      } else {
        resolve(userCoords);
      }
    });
  }, [stickGps, userCoords]);

  const fetchActiveAndHistory = useCallback(async () => {
    if (!isBlindUser) return;
    try {
      const [active, hist] = await Promise.all([
        assistanceService.getActive(),
        assistanceService.getHistory(),
      ]);
      setActiveRequest(active);
      setHistory(Array.isArray(hist) ? hist : []);
      if (active?.accepted_volunteer && announcedAcceptRef.current !== `${active.id}-${active.status}`) {
        announcedAcceptRef.current = `${active.id}-${active.status}`;
        if (active.status === 'ACCEPTED') {
          const first = active.accepted_volunteer.full_name?.split(' ')[0] || 'A volunteer';
          const eta = active.accepted_volunteer.eta_minutes || 3;
          const line = `${first} is coming, ${eta} minute${eta === 1 ? '' : 's'} away`;
          setStatusMessage(line);
          speakText(line);
        }
      }
    } catch {
      // ignore initial poll errors
    }
  }, [isBlindUser]);

  useEffect(() => {
    fetchActiveAndHistory();
    resolveBestGps();
  }, [fetchActiveAndHistory, resolveBestGps]);

  const handleWsMessage = useCallback(
    (msg) => {
      if (!msg?.type) return;
      if (msg.type === 'REQUEST_ACCEPTED') {
        const line = msg.announcement || msg.message || 'A verified volunteer accepted your request.';
        setStatusMessage(line);
        triggerHaptic('confirm');
        speakText(line);
        fetchActiveAndHistory();
      } else if (msg.type === 'VOLUNTEER_ARRIVED') {
        setStatusMessage(msg.message);
        triggerHaptic('arrived');
        speakText(msg.message);
        fetchActiveAndHistory();
      } else if (msg.type === 'RADIUS_ESCALATED') {
        setStatusMessage(msg.message);
        triggerHaptic('tap');
        speakText(msg.message);
        setEscalationCountdown(60);
        fetchActiveAndHistory();
      } else if (msg.type === 'ESCALATED_TO_FAMILY_AND_SOS') {
        setStatusMessage(msg.message);
        triggerHaptic('sos');
        speakText(msg.message);
        fetchActiveAndHistory();
      } else if (msg.type === 'LIVE_LOCATION_UPDATE' && msg.party === 'volunteer') {
        setActiveRequest((prev) =>
          prev
            ? {
                ...prev,
                accepted_volunteer: prev.accepted_volunteer
                  ? {
                      ...prev.accepted_volunteer,
                      latitude: msg.latitude,
                      longitude: msg.longitude,
                      eta_minutes: msg.eta_minutes ?? prev.accepted_volunteer.eta_minutes,
                    }
                  : prev.accepted_volunteer,
              }
            : prev
        );
      } else if (msg.type === 'REQUEST_COMPLETED') {
        speakText('Assistance completed. Please rate your volunteer when ready.');
        setCompletedToRate(activeRequest);
        setActiveRequest(null);
        fetchActiveAndHistory();
      } else if (msg.type === 'REQUEST_CANCELLED' || msg.type === 'REQUEST_EXPIRED') {
        setStatusMessage(msg.message || 'Request ended.');
        speakText(msg.message || 'Your help request was updated.');
        setActiveRequest(null);
        fetchActiveAndHistory();
      }
    },
    [activeRequest, fetchActiveAndHistory]
  );

  useWebSocket(isBlindUser && user?.id ? `/ws/${user.id}/blind_user` : null, {
    enabled: Boolean(isBlindUser && user?.id),
    onMessage: handleWsMessage,
  });

  // Periodic polling backup + live GPS push while active
  useEffect(() => {
    if (!isBlindUser || !activeRequest) return undefined;
    const timer = setInterval(async () => {
      fetchActiveAndHistory();
      const coords = await resolveBestGps();
      assistanceService.updateLocation(activeRequest.id, coords).catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [isBlindUser, activeRequest, fetchActiveAndHistory, resolveBestGps]);

  // 60-second visual escalation countdown while pending
  useEffect(() => {
    if (!activeRequest || activeRequest.status !== 'PENDING' || (activeRequest.escalation_stage || 0) >= 3) {
      return undefined;
    }
    const tick = setInterval(() => {
      setEscalationCountdown((c) => (c <= 1 ? 60 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [activeRequest]);

  const handleRequestHelp = useCallback(
    async (overrideType, overrideNotes) => {
      if (inFlightRequestRef.current) return;
      inFlightRequestRef.current = true;

      const selectedType = overrideType || requestType;
      const selectedNotes = (overrideNotes ?? notes).trim() || undefined;
      setErrorMessage('');
      if (searchParams.get('from_voice') !== '1') {
        speakText('Looking for a volunteer nearby.');
      }
      setStatusMessage('Looking for a volunteer nearby.');

      if (!isBlindUser) {
        setErrorMessage('Please sign in with a User account so we can dispatch nearby volunteers.');
        inFlightRequestRef.current = false;
        return;
      }

      setBusy(true);
      const coords = await resolveBestGps();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        enqueueOfflineAction({
          kind: 'volunteer',
          label: `Volunteer help (${selectedType})`,
          payload: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            assistance_type: selectedType,
            notes: selectedNotes,
            radius_km: 0.5,
          },
        });
        setStatusMessage('Offline: Volunteer request queued and will dispatch automatically once connected.');
        setBusy(false);
        inFlightRequestRef.current = false;
        return;
      }

      try {
        const res = await assistanceService.createRequest({
          latitude: coords.latitude,
          longitude: coords.longitude,
          assistance_type: selectedType,
          notes: selectedNotes,
          radius_km: 0.5,
        });
        setStatusMessage(res.message);
        setEscalationCountdown(60);
        await fetchActiveAndHistory();
      } catch (err) {
        if (Number(err?.status || 0) === 0 || Number(err?.status) >= 500) {
          enqueueOfflineAction({
            kind: 'volunteer',
            label: `Volunteer help (${selectedType})`,
            payload: {
              latitude: coords.latitude,
              longitude: coords.longitude,
              assistance_type: selectedType,
              notes: selectedNotes,
              radius_km: 0.5,
            },
          });
          setStatusMessage('Network unreachable: Volunteer request queued for automatic retry.');
          speakText('Network unreachable. Volunteer assistance request queued.');
        } else {
          setErrorMessage(err.message || 'Could not create help request.');
          speakText(err.message || 'Unable to send assistance request.');
        }
      } finally {
        setBusy(false);
        inFlightRequestRef.current = false;
      }
    },
    [isBlindUser, notes, requestType, resolveBestGps, fetchActiveAndHistory, searchParams]
  );

  const { supported: speechSupported, listening, transcript, error: voiceErr, startListening, stopListening } =
    useVoiceAssistant({
      continuous: false,
      onHelpTrigger: (trigger) => {
        setRequestType(trigger.type);
        if (!activeRequest) {
          handleRequestHelp(trigger.type);
        }
      },
      onLiveAssistTrigger: () => {
        speakText('Opening Eyes on Demand.');
        navigate('/live-assist?autostart=1');
      },
    });

  // Trigger immediately if navigated from Hero CTA / voice trigger with ?autostart=1
  useEffect(() => {
    if (searchParams.get('offline_queued') === '1' && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      setStatusMessage('Offline mode: Your volunteer assistance request is saved and will dispatch automatically once connectivity returns.');
      return;
    }
    if (searchParams.get('autostart') === '1' && isBlindUser && !activeRequest && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      handleRequestHelp(
        searchParams.get('type') || 'crossing road',
        searchParams.get('notes') || undefined
      );
    }
  }, [searchParams, isBlindUser, activeRequest, handleRequestHelp]);

  const handleEscalateNow = async () => {
    if (!activeRequest) return;
    setBusy(true);
    try {
      const res = await assistanceService.escalate(activeRequest.id);
      if (res.stage === 3) {
        speakText('No volunteer accepted within 3 kilometers. Family contacts alerted. You can trigger SOS now.');
      }
      await fetchActiveAndHistory();
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRequest) return;
    setBusy(true);
    try {
      await assistanceService.cancel(activeRequest.id, 'Cancelled by user');
      speakText('Assistance request cancelled.');
      setStatusMessage('Assistance request cancelled.');
      setActiveRequest(null);
      await fetchActiveAndHistory();
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!activeRequest) return;
    const finished = activeRequest;
    setBusy(true);
    try {
      await assistanceService.complete(finished.id);
      speakText('Thank you! Assistance marked complete. You can submit a rating below.');
      setCompletedToRate(finished);
      setActiveRequest(null);
      await fetchActiveAndHistory();
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitRating = async (e) => {
    e.preventDefault();
    if (!completedToRate) return;
    setBusy(true);
    try {
      await assistanceService.rate(completedToRate.id, ratingValue, ratingComment.trim() || undefined);
      setStatusMessage(`Submitted ${ratingValue}-star rating. Thank you!`);
      speakText('Rating submitted. Stay safe!');
      setCompletedToRate(null);
      setRatingComment('');
      await fetchActiveAndHistory();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerSos = async () => {
    setErrorMessage('');
    setSosActive(true);
    sosSiren.startSiren(0.35);
    speakText('Emergency SOS activated. Alerting your family contacts.');
    let batteryLevel = null;
    try {
      if (navigator.getBattery) {
        const bat = await navigator.getBattery();
        batteryLevel = Math.round((bat.level || 0) * 100);
      }
    } catch {
      // optional battery API
    }
    const coords = await resolveBestGps();
    const mapsUrl = `https://maps.google.com/?q=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`;
    const encoded = encodeURIComponent(
      `EMERGENCY SOS! I need urgent help. Live location: ${mapsUrl}${
        batteryLevel != null ? ` (Battery: ${batteryLevel}%)` : ''
      }`
    );
    const localFallbacks = {
      google_maps_url: mapsUrl,
      sms_fallback_url: `sms:?body=${encoded}`,
      whatsapp_fallback_url: `https://wa.me/?text=${encoded}`,
    };
    setSosFallbacks(localFallbacks);
    try {
      const res = await safetyApiService.triggerSos({
        latitude: coords.latitude,
        longitude: coords.longitude,
        battery_level: batteryLevel,
        source: 'assistance_escalation',
        notes: 'Triggered from Voice Assistance page',
      });
      setSosFallbacks({ ...localFallbacks, ...res });
    } catch (err) {
      setErrorMessage(err.message || 'Could not dispatch cloud family SOS alert. Use the SMS or WhatsApp buttons below.');
    }
  };

  const handleStopSos = async () => {
    setSosActive(false);
    sosSiren.stopSiren();
    try {
      await safetyApiService.resolveSos();
    } catch {
      // ignore
    }
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    const targetId = activeRequest?.accepted_volunteer?.id || completedToRate?.accepted_volunteer?.id;
    if (!targetId) return;
    try {
      await safetyApiService.reportUser({
        reported_user_id: targetId,
        request_id: activeRequest?.id || completedToRate?.id,
        reason: reportReason.trim() || 'Safety concern reported by user',
        block_user: true,
      });
      setShowReportModal(false);
      setReportReason('');
      setStatusMessage('Volunteer reported and permanently blocked from future matching.');
      if (activeRequest) await handleCancel();
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  useEffect(() => () => sosSiren.stopSiren(), []);

  const currentStageIndex = activeRequest
    ? Math.max(0, TIMELINE_STEPS.indexOf(activeRequest.status))
    : -1;

  return (
    <DashboardShell
      title="Voice-Activated Assistance"
      subtitle="Say “I need assistance”, “help me cross the road”, or “need help” — or press the large accessible button"
      icon={Volume2}
    >
      <EmailVerificationBanner className="mb-6" />

      {/* Sign-in Prompt Banner if not logged in as Blind/Partially Blind User */}
      {!isBlindUser && (
        <div className="mb-6 glass-card p-6 border border-[#C59B42]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#12231B]">Sign in with a User account to dispatch live volunteers</h2>
            <p className="text-sm text-[#354B40] mt-1">
              Supports accessible voice login and instant matching with verified helpers within 500 meters.
            </p>
          </div>
          <Link
            to="/login?role=blind_user&redirect=/assist"
            className="min-h-[52px] px-6 py-3 rounded-full bg-[#065F46] text-white hover:bg-[#054D39] font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0 shadow-glow-sm focus-visible-ring"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>Sign In / Voice Login</span>
          </Link>
        </div>
      )}

      {/* Live Announcements */}
      <div role="status" aria-live="polite" className="space-y-3 mb-6">
        {statusMessage && (
          <div className="p-4 rounded-2xl bg-[#ECF7F2] border border-[#065F46]/25 text-[#064E3B] text-base font-medium flex items-center gap-3">
            <Radio className="w-5 h-5 text-[#065F46] shrink-0 animate-pulse" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
        )}
        {(errorMessage || voiceErr) && (
          <div role="alert" className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
            <span>{errorMessage || voiceErr}</span>
          </div>
        )}
      </div>

      {/* Primary Action Area when No Request Active */}
      {!activeRequest ? (
        <div className="grid lg:grid-cols-12 gap-6 mb-8">
          <div className="lg:col-span-7 glass-card p-6 sm:p-8 space-y-6">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-[#8C6A23] font-semibold block mb-2">
                1. Choose What You Need Help With
              </span>
              <div role="radiogroup" aria-label="Help request type" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {REQUEST_TYPES.map((t) => {
                  const selected = requestType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRequestType(t.id)}
                      className={`min-h-[54px] px-4 py-3 rounded-2xl border text-base font-semibold transition-all focus-visible-ring ${
                        selected
                          ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46] shadow-glow-sm'
                          : 'bg-[#FAF7F0] border-[#D7CEBC] text-[#354B40] hover:border-[#065F46]/35 hover:text-[#12231B]'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="assist-notes" className="text-xs font-mono uppercase tracking-wider text-[#4F6358] block mb-2">
                Optional Landmark Note
              </label>
              <input
                id="assist-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Outside Metro Gate 2 near crosswalk"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base text-[#12231B] placeholder:text-[#697D72] focus:border-[#065F46]"
              />
            </div>

            {/* Large High-Contrast Button Fallback for Partially Blind Users */}
            <button
              type="button"
              disabled={busy}
              onClick={() => handleRequestHelp()}
              className="w-full min-h-[112px] p-6 rounded-3xl bg-[#065F46] text-white font-display font-black text-2xl sm:text-3xl tracking-tight border-4 border-[#E6CB8F] shadow-glow-lg hover:bg-[#054D39] transition-all flex items-center justify-center gap-4 focus-visible-ring disabled:opacity-50"
            >
              <ShieldCheck className="w-9 h-9 shrink-0 text-[#F4E3BC]" aria-hidden="true" />
              <span>{busy ? 'REQUESTING…' : 'GET HELP NOW'}</span>
            </button>

            <Link
              to="/live-assist"
              className="w-full min-h-[64px] px-6 py-3 rounded-2xl bg-[#FBF3DF] border-2 border-[#C59B42] text-[#7D5B1C] font-display font-bold text-lg hover:bg-[#F5E7C3] transition-all flex items-center justify-center gap-3 focus-visible-ring"
            >
              <Video className="w-6 h-6 text-[#065F46]" aria-hidden="true" />
              <span>Need Live Video? Open Eyes on Demand</span>
            </Link>
          </div>

          {/* Web Speech API Voice Listener Panel */}
          <div className="lg:col-span-5 glass-card p-6 sm:p-8 flex flex-col justify-between items-center text-center space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#12231B]">Voice Activation</h2>
              <p className="text-sm text-[#354B40] mt-1">
                Tap below and say <strong className="text-[#065F46]">“I need assistance”</strong>,{' '}
                <strong className="text-[#065F46]">“help me cross the road”</strong>, or{' '}
                <strong className="text-[#065F46]">“need help”</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={!speechSupported}
              aria-pressed={listening}
              aria-label={listening ? 'Stop voice listener' : 'Start listening for help phrase'}
              className={`w-36 h-36 rounded-full flex flex-col items-center justify-center border-4 transition-all focus-visible-ring ${
                listening
                  ? 'bg-[#065F46] text-white border-[#E6CB8F] shadow-glow-lg scale-105'
                  : 'bg-[#FAF7F0] text-[#065F46] border-[#065F46]/45 hover:border-[#065F46] shadow-glow-sm'
              }`}
            >
              {listening ? <Mic className="w-12 h-12 animate-pulse" /> : <MicOff className="w-12 h-12" />}
              <span className="text-xs font-mono font-bold mt-2 uppercase">
                {listening ? 'Listening' : speechSupported ? 'Tap to Speak' : 'Unavailable'}
              </span>
            </button>

            <div className="w-full p-3.5 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] text-xs font-mono text-[#354B40] min-h-[52px] flex items-center justify-center">
              {transcript ? `Heard: "${transcript}"` : 'Waiting for spoken phrase…'}
            </div>
          </div>
        </div>
      ) : (
        /* Active Request Live Tracking + Timeline */
        <div className="space-y-6 mb-8">
          <div className="glass-card p-6 sm:p-8 border border-[#065F46]/25 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#065F46] font-semibold">
                  Active Request · {activeRequest.type}
                </span>
                <h2 className="font-display text-2xl font-bold text-[#12231B] mt-1">
                  {activeRequest.status === 'PENDING'
                    ? `Searching within ${activeRequest.radius_km < 1 ? `${Math.round(activeRequest.radius_km * 1000)} m` : `${activeRequest.radius_km} km`}`
                    : activeRequest.accepted_volunteer
                    ? `${activeRequest.accepted_volunteer.full_name} is on the way`
                    : 'Volunteer matched'}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeRequest.status === 'PENDING' && (activeRequest.escalation_stage || 0) < 3 && (
                  <button
                    type="button"
                    onClick={handleEscalateNow}
                    disabled={busy}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/40 text-[#7D5B1C] text-xs font-mono font-semibold hover:bg-[#F5E8C5]"
                  >
                    Widen Radius ({escalationCountdown}s)
                  </button>
                )}

                {activeRequest.status !== 'PENDING' && (
                  <button
                    type="button"
                    onClick={handleComplete}
                    disabled={busy}
                    className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39] shadow-glow-sm"
                  >
                    Mark Completed
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold text-sm hover:bg-red-100 flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Cancel Request</span>
                </button>
              </div>
            </div>

            {/* Status Timeline */}
            <ol
              aria-label="Assistance status timeline"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {TIMELINE_STEPS.map((step, idx) => {
                const reached = idx <= currentStageIndex;
                return (
                  <li
                    key={step}
                    className={`p-3.5 rounded-xl border flex items-center gap-2.5 ${
                      reached
                        ? 'bg-[#ECF7F2] border-[#065F46]/40 text-[#064E3B]'
                        : 'bg-[#FAF7F0] border-[#DCD2BF] text-[#697D72]'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${reached ? 'text-[#065F46]' : 'text-[#84958B]'}`}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-mono font-semibold">{step}</span>
                  </li>
                );
              })}
            </ol>

            {/* Escalation Stage 3 Family + SOS Alert Offer */}
            {activeRequest.status === 'PENDING' && (activeRequest.escalation_stage || 0) >= 3 && (
              <div className="p-5 rounded-2xl bg-red-50 border-2 border-red-300 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-red-900 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
                      No volunteer accepted within 3 km — Family Contacts Alerted
                    </h3>
                    <p className="text-sm text-red-800 mt-1">
                      You can trigger the audible Emergency SOS siren and beacon right now.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={sosActive ? handleStopSos : handleTriggerSos}
                    className="min-h-[54px] px-6 py-3 rounded-full bg-red-600 text-white font-bold text-sm hover:bg-red-700 shrink-0 shadow-glow-md"
                  >
                    {sosActive ? 'Stop SOS Siren' : 'Activate Emergency SOS'}
                  </button>
                </div>

                {sosFallbacks && (
                  <div className="space-y-3 pt-2 border-t border-red-200">
                    {sosFallbacks.message && (
                      <p className="text-xs font-semibold text-red-900">{sosFallbacks.message}</p>
                    )}
                    {Array.isArray(sosFallbacks.channel_deliveries) && sosFallbacks.channel_deliveries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sosFallbacks.channel_deliveries.map((d, idx) => (
                          <span
                            key={`${d.channel}-${d.recipient_user_id}-${idx}`}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                              d.status === 'sent'
                                ? 'bg-[#ECF7F2] border-[#065F46]/30 text-[#065F46]'
                                : d.status === 'failed'
                                ? 'bg-red-100 border-red-300 text-red-800'
                                : 'bg-white border-[#DCD2BF] text-[#4F6358]'
                            }`}
                          >
                            {d.channel.toUpperCase()} ({d.recipient_scope === 'self' ? 'You' : 'Guardian'}): {d.status}
                          </span>
                        ))}
                      </div>
                    )}
                    {sosFallbacks.approved_guardians_count === 0 && (
                      <p className="text-xs text-[#7D5B1C]">
                        0 approved family guardians linked yet.{' '}
                        <Link to="/contacts" className="underline font-bold text-[#065F46]">
                          Link guardians &amp; Telegram in Contacts
                        </Link>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {sosFallbacks.sms_fallback_url && (
                        <a
                          href={sosFallbacks.sms_fallback_url}
                          className="min-h-[42px] px-4 py-2 rounded-full bg-[#065F46] text-white font-bold text-xs inline-flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Send Free SMS</span>
                        </a>
                      )}
                      {sosFallbacks.whatsapp_fallback_url && (
                        <a
                          href={sosFallbacks.whatsapp_fallback_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[42px] px-4 py-2 rounded-full bg-[#FBF3DF] border border-[#C59B42] text-[#7D5B1C] font-bold text-xs inline-flex items-center gap-1.5"
                        >
                          <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Share via WhatsApp</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                      {sosFallbacks.google_maps_url && (
                        <a
                          href={sosFallbacks.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[42px] px-4 py-2 rounded-full bg-white border border-red-200 text-red-800 font-semibold text-xs inline-flex items-center gap-1.5"
                        >
                          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>View Google Maps Pin</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assigned Volunteer Info + Report/Block */}
            {activeRequest.accepted_volunteer && (
              <div className="p-5 rounded-2xl bg-[#F6F1E6] border border-[#DCD2BF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-[#12231B]">
                      {activeRequest.accepted_volunteer.full_name}
                    </span>
                    {activeRequest.accepted_volunteer.is_verified && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] text-xs font-mono">
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Verified Volunteer
                      </span>
                    )}
                    <span className="text-xs font-mono font-semibold text-[#8C6A23]">
                      ★ {activeRequest.accepted_volunteer.avg_rating || 5.0}
                    </span>
                  </div>
                  <p className="text-sm text-[#354B40] flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                      {activeRequest.accepted_volunteer.eta_minutes || 3} min away
                    </span>
                    {activeRequest.accepted_volunteer.approx_distance_text && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-[#8C6A23]" aria-hidden="true" />
                        {activeRequest.accepted_volunteer.approx_distance_text}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeRequest.accepted_volunteer.phone_number && (
                    <a
                      href={`tel:${activeRequest.accepted_volunteer.phone_number}`}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#065F46] text-white hover:bg-[#054D39] text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Phone className="w-4 h-4" aria-hidden="true" />
                      <span>Call Volunteer</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#DCD2BF] text-[#4F6358] hover:text-red-700 hover:border-red-300 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Report / Block</span>
                  </button>
                </div>
              </div>
            )}

            {/* Live Dual Map */}
            <LiveAssistanceMap
              userLocation={{
                latitude: activeRequest.lat ?? activeRequest.latitude,
                longitude: activeRequest.lng ?? activeRequest.longitude,
              }}
              volunteerLocation={
                activeRequest.accepted_volunteer?.latitude != null
                  ? {
                      name: activeRequest.accepted_volunteer.full_name,
                      latitude: activeRequest.accepted_volunteer.latitude,
                      longitude: activeRequest.accepted_volunteer.longitude,
                    }
                  : null
              }
            />
          </div>
        </div>
      )}

      {/* Rating Form after Completion */}
      {completedToRate && (
        <form onSubmit={handleSubmitRating} className="mb-8 glass-card p-6 border border-[#C59B42]/35 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#12231B]">
            Rate your volunteer ({completedToRate.accepted_volunteer?.full_name || 'Helper'})
          </h2>
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatingValue(n)}
                aria-label={`${n} stars`}
                aria-pressed={ratingValue >= n}
                className={`min-w-[48px] min-h-[48px] rounded-xl border flex items-center justify-center transition-colors ${
                  ratingValue >= n
                    ? 'bg-[#FBF3DF] border-[#C59B42] text-[#8C6A23]'
                    : 'bg-white border-[#D7CEBC] text-[#697D72]'
                }`}
              >
                <Star className={`w-6 h-6 ${ratingValue >= n ? 'fill-current' : ''}`} />
              </button>
            ))}
          </div>
          <input
            type="text"
            value={ratingComment}
            onChange={(e) => setRatingComment(e.target.value)}
            placeholder="Optional feedback comment…"
            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] placeholder:text-[#697D72]"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] px-6 py-2.5 rounded-full bg-[#065F46] text-white hover:bg-[#054D39] font-bold text-sm"
            >
              Submit Rating
            </button>
            <button
              type="button"
              onClick={() => setCompletedToRate(null)}
              className="min-h-[48px] px-5 py-2.5 rounded-full border border-[#D7CEBC] bg-white text-[#354B40] text-sm"
            >
              Skip
            </button>
          </div>
        </form>
      )}

      {/* Recent Requests History */}
      {history.length > 0 && (
        <section aria-labelledby="user-history-heading" className="glass-card p-6">
          <h2 id="user-history-heading" className="font-display text-lg font-bold text-[#12231B] mb-4">
            Recent Assistance History
          </h2>
          <div className="space-y-2.5">
            {history.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <span className="font-semibold text-[#12231B] capitalize">{item.type}</span>
                  <span className="text-xs font-mono text-[#4F6358] ml-3">
                    {new Date(item.createdAt || item.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {item.rating && <span className="text-xs font-mono text-[#8C6A23] font-semibold">★ {item.rating}/5</span>}
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-[#ECF7F2] border border-[#065F46]/20 text-[#065F46]">
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Report / Block Modal */}
      {showReportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#12231B]/35 backdrop-blur-sm"
        >
          <form onSubmit={handleSubmitReport} className="glass-card max-w-md w-full p-6 space-y-4">
            <h3 id="report-dialog-title" className="font-display text-lg font-bold text-[#12231B]">
              Report & Block Volunteer
            </h3>
            <p className="text-xs text-[#4F6358]">
              Blocking permanently prevents this volunteer from seeing or accepting your future requests.
            </p>
            <textarea
              required
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe what happened…"
              className="w-full p-3 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] placeholder:text-[#697D72]"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-[#D7CEBC] bg-white text-[#354B40] text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm"
              >
                Report & Block
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardShell>
  );
}

