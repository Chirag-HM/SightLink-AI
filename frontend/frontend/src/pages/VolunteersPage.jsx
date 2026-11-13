import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  BellRing,
  CheckCircle2,
  XCircle,
  MapPin,
  Clock,
  ToggleLeft,
  ToggleRight,
  Flag,
  LogIn,
  History,
  IdCard,
  Phone,
  Video,
  VideoOff,
  Flashlight,
  Volume2,
  Navigation,
  PhoneIncoming,
  PhoneOff,
  Send,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import LiveAssistanceMap from '../components/LiveAssistanceMap';
import { useAuth } from '../context/AuthContext';
import useWebSocket from '../hooks/useWebSocket';
import usePushNotifications from '../hooks/usePushNotifications';
import {
  volunteerService,
  assistanceService,
  liveAssistService,
  authService,
  safetyApiService,
} from '../services/api';
import { getIceServers, startRingtoneLoop } from '../utils/webrtc';

const TIMELINE_STEPS = ['PENDING', 'ACCEPTED', 'ARRIVED', 'COMPLETED'];

const QUICK_REPLIES = [
  'Path is clear',
  'Wait, vehicle approaching',
  'Crosswalk clear ahead',
  'Step down carefully',
  'Stop — obstacle ahead',
];

function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(622.25, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.18);
    gain2.gain.setValueAtTime(0.3, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.6);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

export default function VolunteersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const isVolunteer = user?.role === 'volunteer';

  const [statusInfo, setStatusInfo] = useState(null);
  const [onDuty, setOnDuty] = useState(false);
  const [myCoords, setMyCoords] = useState({ latitude: 12.9722, longitude: 77.5952 });
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [pendingLiveSessions, setPendingLiveSessions] = useState([]);
  const [activeLiveSession, setActiveLiveSession] = useState(null);
  const [liveHistoryList, setLiveHistoryList] = useState([]);
  const [incomingLiveCall, setIncomingLiveCall] = useState(null);
  const [liveRemainingSec, setLiveRemainingSec] = useState(30);
  const [liveFlashOn, setLiveFlashOn] = useState(false);
  const [customQuickReply, setCustomQuickReply] = useState('');
  const [activeTab, setActiveTab] = useState('incoming'); // 'incoming' | 'history'
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const remoteVideoRef = useRef(null);
  const volunteerPcRef = useRef(null);
  const volunteerMicStreamRef = useRef(null);
  const sendJsonRef = useRef(() => false);
  const stopRingtoneRef = useRef(null);

  // Quick verification modal for legacy unverified volunteer accounts
  const [showVerifyBox, setShowVerifyBox] = useState(false);
  const [verMethod, setVerMethod] = useState('id');
  const [verPhone, setVerPhone] = useState('');
  const [verOtp, setVerOtp] = useState('');
  const [verIdNum, setVerIdNum] = useState('');
  const [demoOtp, setDemoOtp] = useState('');

  // Report/block dialog
  const [reportTarget, setReportTarget] = useState(null);
  const [reportText, setReportText] = useState('');

  const cleanupVolunteerRtc = useCallback(() => {
    if (volunteerPcRef.current) {
      try {
        volunteerPcRef.current.close();
      } catch {
        // ignore
      }
      volunteerPcRef.current = null;
    }
    if (volunteerMicStreamRef.current) {
      volunteerMicStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      volunteerMicStreamRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setLiveFlashOn(false);
  }, []);

  const stopIncomingRing = useCallback(() => {
    if (stopRingtoneRef.current) {
      stopRingtoneRef.current();
      stopRingtoneRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupVolunteerRtc();
      stopIncomingRing();
    };
  }, [cleanupVolunteerRtc, stopIncomingRing]);

  const handleNotificationAction = useCallback(async (actionPayload) => {
    try {
      if (actionPayload?.live_assist_id) {
        if (actionPayload.action === 'accept_live_assist' || actionPayload.action === 'accept') {
          const accepted = await liveAssistService.accept(actionPayload.live_assist_id);
          setActiveLiveSession(accepted);
          setIncomingLiveCall(null);
          stopIncomingRing();
          setFeedback('Accepted Eyes on Demand live video session!');
        } else if (actionPayload.action === 'decline_live_assist' || actionPayload.action === 'decline') {
          await liveAssistService.decline(actionPayload.live_assist_id);
          setIncomingLiveCall(null);
          stopIncomingRing();
          setFeedback('Declined live video session.');
        }
        return;
      }
      if (!actionPayload?.request_id) return;
      if (actionPayload.action === 'accept') {
        await assistanceService.accept(actionPayload.request_id);
        setFeedback('Accepted assistance request via notification!');
      } else if (actionPayload.action === 'decline') {
        await assistanceService.decline(actionPayload.request_id);
        setFeedback('Declined request.');
      }
    } catch (e) {
      setErrorMsg(e.message);
    }
  }, [stopIncomingRing]);

  const { permission, enableNotifications, showLocalNotification } = usePushNotifications({
    role: 'volunteer',
    onNotificationAction: handleNotificationAction,
  });

  const loadVolunteerData = useCallback(async () => {
    if (!isVolunteer) return;
    try {
      const [st, pend, active, hist, livePend, liveAct, liveHist] = await Promise.all([
        volunteerService.getStatus(),
        volunteerService.getPendingRequests(),
        assistanceService.getActive(),
        volunteerService.getHistory(),
        liveAssistService.getPending().catch(() => []),
        liveAssistService.getActive().catch(() => null),
        liveAssistService.getHistory().catch(() => []),
      ]);
      setStatusInfo(st);
      setOnDuty(Boolean(st?.is_available));
      if (st?.last_latitude != null && st?.last_longitude != null) {
        setMyCoords({ latitude: st.last_latitude, longitude: st.last_longitude });
      }
      setPendingRequests(Array.isArray(pend) ? pend : []);
      setActiveAssignment(active || null);
      setHistoryList(Array.isArray(hist) ? hist : []);
      setPendingLiveSessions(Array.isArray(livePend) ? livePend : []);
      setActiveLiveSession(liveAct || null);
      if (liveAct?.remaining_sec != null) {
        setLiveRemainingSec(liveAct.remaining_sec);
      }
      setLiveHistoryList(Array.isArray(liveHist) ? liveHist : []);
    } catch (e) {
      setErrorMsg(e.message);
    }
  }, [isVolunteer]);

  useEffect(() => {
    loadVolunteerData();
  }, [loadVolunteerData]);

  // Countdown tick on volunteer overlay during active live-assist call
  useEffect(() => {
    if (!activeLiveSession || activeLiveSession.status !== 'CONNECTED') return undefined;
    const id = setInterval(() => {
      setLiveRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [activeLiveSession]);

  // Handle Accept/Decline passed via Push Notification URL (?action=accept&requestId=... or ?liveAssistAction=accept&liveAssistId=...)
  useEffect(() => {
    const action = searchParams.get('action');
    const requestId = searchParams.get('requestId');
    const liveAction = searchParams.get('liveAssistAction');
    const liveId = searchParams.get('liveAssistId');

    if (isVolunteer && ((action && requestId) || (liveAction && liveId))) {
      (async () => {
        try {
          if (liveAction && liveId) {
            if (liveAction === 'accept' || liveAction === 'accept_live_assist') {
              const accepted = await liveAssistService.accept(liveId);
              setActiveLiveSession(accepted);
              setFeedback('Accepted Eyes on Demand live video session.');
            } else {
              await liveAssistService.decline(liveId);
              setFeedback('Declined live video session.');
            }
          } else if (action && requestId) {
            if (action === 'accept') await assistanceService.accept(requestId);
            if (action === 'decline') await assistanceService.decline(requestId);
            setFeedback(`Executed ${action} from notification.`);
          }
          loadVolunteerData();
        } catch (err) {
          setErrorMsg(err.message);
        } finally {
          setSearchParams({});
        }
      })();
    }
  }, [isVolunteer, searchParams, setSearchParams, loadVolunteerData]);

  // Real-time WebSocket Alerts + Incoming Live Assist Call + WebRTC Answerer Bridge
  const handleWsEvent = useCallback(
    async (msg) => {
      if (!msg?.type) return;
      if (msg.type === 'NEW_ASSISTANCE_REQUEST') {
        playNotificationChime();
        setFeedback(`🚨 New assistance request: ${msg.blind_user_name} needs ${(msg.assistance_type || 'assistance').replace('_', ' ')} (${msg.approx_distance_text || 'nearby'})`);
        showLocalNotification({
          title: 'Blind User Needs Assistance Nearby',
          body: `${msg.blind_user_name} needs ${(msg.assistance_type || 'assistance').replace('_', ' ')} (${msg.approx_distance_text || 'nearby'})`,
          tag: msg.request_id,
          requireInteraction: true,
          data: { request_id: msg.request_id, url: '/volunteers' },
          actions: [
            { action: 'accept', title: 'Accept' },
            { action: 'decline', title: 'Decline' },
          ],
        });
        loadVolunteerData();
      } else if (msg.type === 'NEW_LIVE_ASSIST_SESSION') {
        setIncomingLiveCall(msg);
        stopIncomingRing();
        stopRingtoneRef.current = startRingtoneLoop();
        showLocalNotification({
          title: 'Eyes on Demand: Live Video Needed',
          body: `${msg.blind_user_name} needs live camera help (${msg.approx_distance_text || 'Remote video'})`,
          tag: `live-${msg.session_id}`,
          requireInteraction: true,
          data: { live_assist_id: msg.session_id, url: '/volunteers' },
          actions: [
            { action: 'accept_live_assist', title: 'Accept' },
            { action: 'decline_live_assist', title: 'Decline' },
          ],
        });
        loadVolunteerData();
      } else if (msg.type === 'LIVE_ASSIST_CLAIMED_BY_OTHER') {
        setIncomingLiveCall((prev) => (prev?.session_id === msg.session_id ? null : prev));
        stopIncomingRing();
        setFeedback('Live assist session was already taken by another volunteer.');
        loadVolunteerData();
      } else if (msg.type === 'LIVE_ASSIST_EXTENDED') {
        setLiveRemainingSec(msg.remaining_sec ?? 30);
        setFeedback(msg.voice_announcement || 'User extended video timer by 30 seconds.');
      } else if (msg.type === 'LIVE_ASSIST_AUDIO_FALLBACK') {
        setActiveLiveSession((prev) =>
          prev ? { ...prev, connection_mode: 'audio_only' } : prev
        );
        setFeedback('Connection switched to audio-only mode.');
      } else if (msg.type === 'LIVE_ASSIST_ENDED' || msg.type === 'LIVE_ASSIST_ESCALATED') {
        cleanupVolunteerRtc();
        stopIncomingRing();
        setIncomingLiveCall(null);
        setActiveLiveSession(null);
        setFeedback(
          msg.type === 'LIVE_ASSIST_ESCALATED'
            ? 'Session escalated to an in-person help request nearby.'
            : 'Eyes on Demand session ended.'
        );
        loadVolunteerData();
      } else if (msg.type === 'WEBRTC_OFFER' && msg.sdp && msg.from_user_id) {
        if (typeof RTCPeerConnection === 'undefined') return;
        cleanupVolunteerRtc();
        const pc = new RTCPeerConnection({ iceServers: getIceServers() });
        volunteerPcRef.current = pc;

        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            volunteerMicStreamRef.current = mic;
            mic.getTracks().forEach((track) => pc.addTrack(track, mic));
          }
        } catch {
          // Proceed receive-only if volunteer browser lacks mic permission
        }

        pc.ontrack = (ev) => {
          if (remoteVideoRef.current && ev.streams?.[0]) {
            remoteVideoRef.current.srcObject = ev.streams[0];
          }
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sendJsonRef.current({
              type: 'WEBRTC_ICE_CANDIDATE',
              session_id: msg.session_id,
              target_user_id: msg.from_user_id,
              candidate: ev.candidate,
            });
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendJsonRef.current({
            type: 'WEBRTC_ANSWER',
            session_id: msg.session_id,
            target_user_id: msg.from_user_id,
            sdp: answer,
          });
        } catch {
          // ignore invalid SDP
        }
      } else if (msg.type === 'WEBRTC_ICE_CANDIDATE' && volunteerPcRef.current && msg.candidate) {
        try {
          await volunteerPcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          // ignore candidate errors
        }
      } else if (msg.type === 'REQUEST_CLAIMED_BY_OTHER' || msg.type === 'REQUEST_CANCELLED') {
        loadVolunteerData();
      } else if (msg.type === 'LIVE_LOCATION_UPDATE' && msg.party === 'blind_user') {
        setActiveAssignment((prev) =>
          prev ? { ...prev, lat: msg.latitude, lng: msg.longitude, latitude: msg.latitude, longitude: msg.longitude } : prev
        );
      } else if (msg.type === 'REQUEST_COMPLETED') {
        setFeedback('Session completed! Thank you for helping.');
        loadVolunteerData();
      }
    },
    [showLocalNotification, loadVolunteerData, stopIncomingRing, cleanupVolunteerRtc]
  );

  const { sendJson } = useWebSocket(isVolunteer && user?.id ? `/ws/${user.id}/volunteer` : null, {
    enabled: Boolean(isVolunteer && user?.id),
    onMessage: handleWsEvent,
  });
  sendJsonRef.current = sendJson;

  // Live location sharing ONLY while On duty!
  const pushCurrentLocation = useCallback(async () => {
    if (!isVolunteer || !onDuty) return;
    const send = async (lat, lng) => {
      try {
        await volunteerService.updateLocation({ latitude: lat, longitude: lng, share_consent: true });
        setMyCoords({ latitude: lat, longitude: lng });
        if (activeAssignment) {
          await assistanceService.updateLocation(activeAssignment.id, { latitude: lat, longitude: lng });
        }
      } catch {
        // ignore transient network failure
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => send(pos.coords.latitude, pos.coords.longitude),
        () => send(myCoords.latitude, myCoords.longitude),
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      send(myCoords.latitude, myCoords.longitude);
    }
  }, [isVolunteer, onDuty, myCoords.latitude, myCoords.longitude, activeAssignment]);

  useEffect(() => {
    if (!isVolunteer || !onDuty) return undefined;
    pushCurrentLocation();
    const interval = setInterval(pushCurrentLocation, 10000);
    return () => clearInterval(interval);
  }, [isVolunteer, onDuty, pushCurrentLocation]);

  // Background polling backup for pending requests while On Duty
  useEffect(() => {
    if (!isVolunteer || !onDuty) return undefined;
    const pollPending = async () => {
      try {
        const [pend, livePend] = await Promise.all([
          volunteerService.getPendingRequests(),
          liveAssistService.getPending().catch(() => []),
        ]);
        if (Array.isArray(pend)) setPendingRequests(pend);
        if (Array.isArray(livePend)) setPendingLiveSessions(livePend);
      } catch {
        // ignore background poll errors
      }
    };
    const interval = setInterval(pollPending, 4000);
    return () => clearInterval(interval);
  }, [isVolunteer, onDuty]);

  const handleToggleDuty = async () => {
    setErrorMsg('');
    setBusy(true);
    try {
      const next = !onDuty;
      const res = await volunteerService.setAvailability(next);
      setOnDuty(next);
      setFeedback(res.message);
      if (next) {
        enableNotifications().catch(() => {});
        // Push initial coords immediately when going on duty
        const pos = await new Promise((resolve) => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
              () => resolve(myCoords),
              { timeout: 3000 }
            );
          } else {
            resolve(myCoords);
          }
        });
        await volunteerService.updateLocation({ ...pos, share_consent: true });
        setMyCoords(pos);
      }
      await loadVolunteerData();
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (requestId) => {
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await assistanceService.accept(requestId);
      setActiveAssignment(res);
      setFeedback('Request accepted! Follow the live map below to meet the user.');
      await loadVolunteerData();
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async (requestId) => {
    try {
      await assistanceService.decline(requestId);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleAcceptLive = async (sessionId) => {
    setErrorMsg('');
    setBusy(true);
    try {
      const accepted = await liveAssistService.accept(sessionId);
      stopIncomingRing();
      setIncomingLiveCall(null);
      setActiveLiveSession(accepted);
      setLiveRemainingSec(accepted.remaining_sec ?? 30);
      setFeedback('Eyes on Demand live video connected!');
      await loadVolunteerData();
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineLive = async (sessionId) => {
    stopIncomingRing();
    setIncomingLiveCall(null);
    try {
      await liveAssistService.decline(sessionId);
      setPendingLiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleQuickReply = async (text) => {
    if (!activeLiveSession?.id || !text?.trim()) return;
    try {
      await liveAssistService.quickReply(activeLiveSession.id, text.trim());
      setFeedback(`Spoke to user: "${text.trim()}"`);
      setCustomQuickReply('');
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleToggleLiveFlash = async () => {
    if (!activeLiveSession?.id) return;
    const next = !liveFlashOn;
    try {
      await liveAssistService.toggleFlash(activeLiveSession.id, next);
      setLiveFlashOn(next);
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  const handleEscalateLiveToInPerson = async () => {
    if (!activeLiveSession?.id) return;
    setBusy(true);
    try {
      const res = await liveAssistService.escalateToInPerson(activeLiveSession.id);
      cleanupVolunteerRtc();
      setActiveLiveSession(null);
      setFeedback(
        `Converted to in-person help request (${res.assistance_request_id?.slice(0, 8)}). User heard: "${res.voice_announcement}".`
      );
      await loadVolunteerData();
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEndLiveSession = async () => {
    if (!activeLiveSession?.id) return;
    setBusy(true);
    try {
      await liveAssistService.endSession(activeLiveSession.id, 'completed');
      cleanupVolunteerRtc();
      setActiveLiveSession(null);
      setFeedback('Live video assist ended safely.');
      await loadVolunteerData();
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await volunteerService.verifyIdentity({
        verification_method: verMethod,
        phone_number: verMethod === 'phone' ? verPhone : undefined,
        otp_code: verMethod === 'phone' ? verOtp : undefined,
        id_number: verMethod === 'id' ? verIdNum : undefined,
      });
      setShowVerifyBox(false);
      setFeedback('Identity verified! Verified Volunteer badge is now active.');
      await refreshUser();
      await loadVolunteerData();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!reportTarget) return;
    try {
      await safetyApiService.reportUser({
        reported_user_id: reportTarget.userId || reportTarget.blind_user_id,
        request_id: reportTarget.id,
        reason: reportText.trim() || 'Inappropriate or abusive request',
        block_user: true,
      });
      setReportTarget(null);
      setReportText('');
      setFeedback('User reported and blocked from sending future requests to you.');
      await loadVolunteerData();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  if (!isVolunteer) {
    return (
      <DashboardShell
        title="Volunteer Assistance Dashboard"
        subtitle="Verify via ID or phone OTP, toggle On duty to receive nearby requests, and guide blind users safely"
        icon={Users}
      >
        <EmailVerificationBanner className="mb-6" />

        <div className="glass-card p-8 max-w-2xl mx-auto text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-[#FBF3DF] border border-[#C59B42]/30 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-[#8C6A23]" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[#12231B]">
            Volunteer Sign In & Identity Verification Required
          </h2>
          <p className="text-sm sm:text-base text-[#354B40] leading-relaxed">
            Your GPS is never tracked Off duty. Sign up or sign in as a Volunteer with ID or phone verification to earn a Verified Badge, accept nearby requests via WebSocket/Web Push, and view live route maps.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/signup?role=volunteer&redirect=/volunteers"
              className="min-h-[52px] px-7 py-3 rounded-full bg-[#065F46] text-white hover:bg-[#054D39] font-bold text-sm inline-flex items-center gap-2 shadow-glow-sm focus-visible-ring"
            >
              <span>Become a Verified Volunteer</span>
            </Link>
            <Link
              to="/login?role=volunteer&redirect=/volunteers"
              className="min-h-[52px] px-7 py-3 rounded-full border border-[#D7CEBC] bg-white text-[#12231B] hover:border-[#065F46]/40 font-semibold text-sm inline-flex items-center gap-2 focus-visible-ring"
            >
              <LogIn className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
              <span>Volunteer Sign In</span>
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Volunteer Dashboard"
      subtitle="Live location sharing runs strictly while On duty. Toggle Off duty anytime to stop sharing."
      icon={Users}
    >
      <EmailVerificationBanner className="mb-6" />

      {/* Top Status & Duty Toggle Card */}
      <div className="glass-card p-6 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 border border-[#DCD2BF]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-bold text-[#12231B]">{user.full_name}</h2>
            {statusInfo?.is_verified || user.is_verified ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#ECF7F2] border border-[#065F46]/25 text-[#065F46] text-xs font-mono font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Verified Volunteer
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowVerifyBox(true)}
                className="px-3 py-1 rounded-full bg-[#FBF3DF] border border-[#C59B42]/40 text-[#7D5B1C] text-xs font-mono font-semibold"
              >
                Verify ID / Phone to get badge
              </button>
            )}
            {user.email && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
                  user.email_verified
                    ? 'bg-[#ECF7F2] border-[#065F46]/25 text-[#065F46]'
                    : 'bg-[#FBF3DF] border-[#C59B42]/45 text-[#7D5B1C]'
                }`}
              >
                {user.email_verified ? 'Email Verified' : 'Email Unverified'}
              </span>
            )}
            <span className="text-xs font-mono font-semibold text-[#8C6A23]">
              ★ {statusInfo?.avg_rating ?? 5.0} · {statusInfo?.completed_count ?? 0} helped
            </span>
          </div>
          <p className="text-sm text-[#4F6358]">
            {onDuty
              ? `On Duty — Sharing live coordinates (${myCoords.latitude.toFixed(4)}, ${myCoords.longitude.toFixed(4)})`
              : 'Off Duty — Live location sharing is disabled.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {permission !== 'granted' && (
            <button
              type="button"
              onClick={enableNotifications}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-xs font-semibold text-[#12231B] hover:border-[#065F46]/40 flex items-center gap-2 shadow-sm"
            >
              <BellRing className="w-4 h-4 text-[#8C6A23]" aria-hidden="true" />
              <span>Enable Push Alerts</span>
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            aria-pressed={onDuty}
            onClick={handleToggleDuty}
            className={`min-h-[52px] px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2.5 transition-all focus-visible-ring ${
              onDuty
                ? 'bg-[#065F46] text-white shadow-glow-md'
                : 'bg-[#FAF7F0] text-[#354B40] border border-[#D7CEBC] hover:border-[#065F46]'
            }`}
          >
            {onDuty ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
            <span>{onDuty ? 'ON DUTY (Tap to go Off)' : 'OFF DUTY (Tap to go On)'}</span>
          </button>
        </div>
      </div>

      {/* Feedback / Error Banners */}
      {feedback && (
        <div role="status" className="mb-5 p-4 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-sm text-[#064E3B] font-medium">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Optional inline ID/Phone Verification Box */}
      {showVerifyBox && (
        <form onSubmit={handleVerifySubmit} className="mb-6 glass-card p-6 border border-[#C59B42]/35 space-y-4">
          <h3 className="font-display text-lg font-bold text-[#12231B]">Complete Volunteer Verification</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => setVerMethod('id')} className={`px-4 py-2 rounded-xl text-xs font-semibold border ${verMethod === 'id' ? 'border-[#C59B42] bg-[#FBF3DF] text-[#7D5B1C]' : 'border-[#D7CEBC] bg-white text-[#4F6358]'}`}>
              <IdCard className="w-4 h-4 inline mr-1" /> ID Verification
            </button>
            <button type="button" onClick={() => setVerMethod('phone')} className={`px-4 py-2 rounded-xl text-xs font-semibold border ${verMethod === 'phone' ? 'border-[#065F46] bg-[#ECF7F2] text-[#065F46]' : 'border-[#D7CEBC] bg-white text-[#4F6358]'}`}>
              <Phone className="w-4 h-4 inline mr-1" /> Phone OTP
            </button>
          </div>
          {verMethod === 'id' ? (
            <input required minLength={6} value={verIdNum} onChange={(e) => setVerIdNum(e.target.value)} placeholder="Enter Govt / NGO ID number" className="w-full min-h-[46px] px-4 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]" />
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input required value={verPhone} onChange={(e) => setVerPhone(e.target.value)} placeholder="+91 98765 43210" className="flex-1 min-h-[46px] px-4 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]" />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await authService.requestOtp(verPhone);
                    setDemoOtp(r.demo_otp || '');
                    setVerOtp(r.demo_otp || '');
                  }}
                  className="px-4 rounded-xl bg-[#065F46] text-white text-xs font-bold"
                >
                  Send OTP
                </button>
              </div>
              {demoOtp && <p className="text-xs font-mono text-[#065F46]">Demo OTP: {demoOtp}</p>}
              <input required value={verOtp} onChange={(e) => setVerOtp(e.target.value)} placeholder="Enter 6-digit OTP" className="w-full min-h-[46px] px-4 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]" />
            </div>
          )}
          <div className="flex gap-3">
            <button type="submit" className="px-5 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-xs">Verify Now</button>
            <button type="button" onClick={() => setShowVerifyBox(false)} className="px-4 py-2.5 rounded-full border border-[#D7CEBC] bg-white text-xs text-[#354B40]">Close</button>
          </div>
        </form>
      )}

      {/* Active Eyes on Demand Live Video Glass Overlay Panel */}
      {activeLiveSession && (
        <section
          aria-label="Active Eyes on Demand Video Session"
          className="mb-8 glass-card p-6 border-2 border-[#065F46]/45 space-y-5 shadow-glow-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono uppercase text-[#065F46] font-bold">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                Eyes on Demand · {activeLiveSession.connection_mode === 'audio_only' ? 'Audio-Only' : 'Live Rear Camera'}
              </span>
              <h3 className="font-display text-2xl font-bold text-[#12231B] mt-1">
                Guiding {activeLiveSession.blind_user_name || 'SightLink User'}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="px-4 py-2 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/45 text-sm font-mono font-bold text-[#7D5B1C] flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>
                  {String(Math.floor(liveRemainingSec / 60)).padStart(2, '0')}:
                  {String(liveRemainingSec % 60).padStart(2, '0')}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleLiveFlash}
                aria-pressed={liveFlashOn}
                className={`min-h-[46px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  liveFlashOn
                    ? 'bg-[#FBF3DF] border-[#C59B42] text-[#7D5B1C]'
                    : 'bg-white border-[#D7CEBC] text-[#12231B]'
                }`}
              >
                <Flashlight className="w-4 h-4" />
                <span>{liveFlashOn ? 'Flash ON' : 'Request Flash'}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleEscalateLiveToInPerson}
                className="min-h-[46px] px-5 py-2 rounded-xl bg-[#FBF3DF] border-2 border-[#C59B42] text-[#7D5B1C] font-bold text-xs flex items-center gap-1.5 hover:bg-[#F5E8C5]"
              >
                <Navigation className="w-4 h-4" />
                <span>Needs in-person help</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleEndLiveSession}
                className="min-h-[46px] px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-red-700"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Video</span>
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-5 items-stretch">
            {/* Live Remote Rear Camera Feed */}
            <div className="lg:col-span-7 relative rounded-2xl overflow-hidden bg-[#172C24] border border-[#065F46]/30 min-h-[260px] flex items-center justify-center">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                aria-label="Blind user rear camera feed"
                className={`w-full h-full max-h-[360px] object-cover ${
                  activeLiveSession.connection_mode === 'audio_only' ? 'hidden' : ''
                }`}
              />
              {activeLiveSession.connection_mode === 'audio_only' && (
                <div className="p-6 text-center text-[#FAF7F0] space-y-2">
                  <VideoOff className="w-10 h-10 mx-auto text-[#F4E3BC]" />
                  <p className="font-semibold">Weak Connection — Audio-Only Active</p>
                </div>
              )}
              <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-[#12231B]/75 backdrop-blur-md text-xs font-mono text-[#FAF7F0]">
                Two-way audio active · Recording OFF
              </div>
            </div>

            {/* Small Context Map of User Location */}
            <div className="lg:col-span-5 space-y-3">
              <LiveAssistanceMap
                userLocation={{
                  latitude: activeLiveSession.lat,
                  longitude: activeLiveSession.lng,
                }}
                volunteerLocation={{ name: user.full_name, ...myCoords }}
                heightClass="h-56"
                label="User location during Eyes on Demand session"
              />
            </div>
          </div>

          {/* Quick-Reply Voice Prompts */}
          <div className="pt-3 border-t border-[#E3DCCB] space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-[#4F6358] font-semibold flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-[#065F46]" />
              Tap to Speak Immediately to User
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_REPLIES.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleQuickReply(prompt)}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-[#ECF7F2] hover:bg-[#DCEFE6] border border-[#065F46]/30 text-[#065F46] text-xs font-bold transition-colors"
                >
                  “{prompt}”
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customQuickReply}
                onChange={(e) => setCustomQuickReply(e.target.value)}
                placeholder="Type custom spoken prompt…"
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]"
              />
              <button
                type="button"
                onClick={() => handleQuickReply(customQuickReply)}
                className="min-h-[44px] px-5 rounded-xl bg-[#065F46] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Speak
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Active Accepted Assignment View */}
      {activeAssignment && (
        <div className="mb-8 glass-card p-6 border border-[#065F46]/25 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase text-[#8C6A23] font-semibold">Active Assistance Session · {activeAssignment.status}</span>
              <h3 className="font-display text-2xl font-bold text-[#12231B] mt-1">
                Assisting {activeAssignment.blind_user_name || 'User'} ({activeAssignment.type})
              </h3>
              {activeAssignment.notes && <p className="text-sm text-[#4F6358] mt-1">Note: {activeAssignment.notes}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              {activeAssignment.status === 'ACCEPTED' && (
                <button
                  type="button"
                  onClick={async () => {
                    await assistanceService.markArrived(activeAssignment.id);
                    loadVolunteerData();
                  }}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#FBF3DF] border border-[#C59B42] text-[#7D5B1C] font-bold text-sm"
                >
                  Mark Arrived
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  await assistanceService.complete(activeAssignment.id);
                  loadVolunteerData();
                }}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39]"
              >
                Mark Completed
              </button>
              <button
                type="button"
                onClick={async () => {
                  await assistanceService.cancel(activeAssignment.id, 'Volunteer cancelled');
                  loadVolunteerData();
                }}
                className="min-h-[48px] px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setReportTarget(activeAssignment)}
                className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[#D7CEBC] bg-white text-[#4F6358] hover:text-red-700 text-xs inline-flex items-center gap-1"
              >
                <Flag className="w-3.5 h-3.5" /> Report / Block
              </button>
            </div>
          </div>

          {/* Status Timeline */}
          <ol
            aria-label="Assignment status timeline"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {TIMELINE_STEPS.map((step, idx) => {
              const reached = idx <= Math.max(0, TIMELINE_STEPS.indexOf(activeAssignment.status));
              return (
                <li
                  key={step}
                  className={`p-3 rounded-xl border flex items-center gap-2 ${
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

          <LiveAssistanceMap
            userLocation={{
              latitude: activeAssignment.lat ?? activeAssignment.latitude,
              longitude: activeAssignment.lng ?? activeAssignment.longitude,
            }}
            volunteerLocation={{ name: user.full_name, ...myCoords }}
          />
        </div>
      )}

      {/* Tabs: Incoming Requests & History */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setActiveTab('incoming')}
          className={`min-h-[44px] px-5 py-2 rounded-full text-sm font-semibold border ${
            activeTab === 'incoming'
              ? 'bg-[#065F46] text-white border-[#065F46]'
              : 'bg-white border-[#D7CEBC] text-[#354B40] hover:text-[#12231B]'
          }`}
        >
          Incoming Requests ({pendingLiveSessions.length + pendingRequests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`min-h-[44px] px-5 py-2 rounded-full text-sm font-semibold border flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-[#065F46] text-white border-[#065F46]'
              : 'bg-white border-[#D7CEBC] text-[#354B40] hover:text-[#12231B]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>History ({historyList.length + liveHistoryList.length})</span>
        </button>
      </div>

      {activeTab === 'incoming' ? (
        <div className="space-y-6">
          {/* Live Assist (Eyes on Demand) Cards */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-[#12231B] flex items-center gap-2">
                <Video className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                Live Assist — Eyes on Demand ({pendingLiveSessions.length})
              </h3>
              {!statusInfo?.is_verified && !user?.is_verified && (
                <span className="text-xs font-mono text-[#8C6A23] bg-[#FBF3DF] border border-[#C59B42]/40 px-3 py-1 rounded-full">
                  ID / phone verification required for Live Video
                </span>
              )}
            </div>

            {onDuty && pendingLiveSessions.length === 0 && (
              <div className="glass-card p-5 text-xs text-[#4F6358] border border-[#DCD2BF]">
                No pending live camera requests right now.
              </div>
            )}

            {pendingLiveSessions.map((sess) => (
              <div
                key={sess.id}
                className="glass-card p-6 border-2 border-[#065F46]/30 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-[#12231B]">{sess.blind_user_name || 'User'}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] font-semibold">
                      Live Camera · 30s
                    </span>
                    {sess.is_remote_match && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-[#FBF3DF] border border-[#C59B42]/35 text-[#7D5B1C]">
                        Remote Capable
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#4F6358]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#065F46]" />
                      {sess.approx_distance_text || 'Remote Video'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#8C6A23]" />
                      Scan radius {sess.radius_km} km
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAcceptLive(sess.id)}
                    className="min-h-[48px] px-6 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-sm flex items-center gap-1.5 hover:bg-[#054D39] shadow-glow-sm"
                  >
                    <Video className="w-4 h-4" /> Accept Video
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineLive(sess.id)}
                    className="min-h-[48px] px-5 py-2.5 rounded-full bg-white border border-[#D7CEBC] text-[#354B40] text-sm flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-display text-base font-bold text-[#12231B]">
            In-Person Assistance Requests ({pendingRequests.length})
          </h3>
          {!onDuty ? (
            <div className="glass-card p-8 text-center text-[#4F6358]">
              Switch to <strong className="text-[#065F46]">On Duty</strong> above to share live coordinates and receive nearby help requests.
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="glass-card p-8 text-center text-[#4F6358]">
              No pending assistance requests in your active scan radius right now. Stay On Duty to receive real-time alerts.
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div
                key={req.id}
                className="glass-card p-6 border border-[#DCD2BF] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-[#12231B]">{req.blind_user_name || 'User Nearby'}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-[#FBF3DF] border border-[#C59B42]/35 text-[#7D5B1C] capitalize">
                      {req.type}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#4F6358]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#065F46]" />
                      {req.approx_distance_text || 'Nearby'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#8C6A23]" />
                      ~{req.eta_minutes || 3} min walk
                    </span>
                  </div>
                  {req.notes && <p className="text-sm text-[#354B40]">{req.notes}</p>}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAccept(req.id)}
                    className="min-h-[48px] px-6 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-sm flex items-center gap-1.5 hover:bg-[#054D39]"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecline(req.id)}
                    className="min-h-[48px] px-5 py-2.5 rounded-full bg-white border border-[#D7CEBC] text-[#354B40] hover:text-[#12231B] text-sm flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportTarget(req)}
                    className="min-h-[48px] px-4 py-2.5 rounded-full border border-[#D7CEBC] bg-white text-[#55685E] hover:text-red-700 text-xs flex items-center gap-1"
                  >
                    <Flag className="w-3.5 h-3.5" /> Report
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-3">
            <h3 className="font-display text-base font-bold text-[#12231B]">Eyes on Demand Video History</h3>
            {liveHistoryList.length === 0 ? (
              <p className="text-sm text-[#4F6358]">No Eyes on Demand video sessions yet.</p>
            ) : (
              liveHistoryList.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#ECF7F2]/60 border border-[#065F46]/20 flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <span className="font-semibold text-[#12231B]">{item.blind_user_name || 'User'}</span>
                    <span className="text-[#4F6358] ml-2">· {item.durationSec || 30}s · {item.outcome || item.status}</span>
                    <span className="block text-xs font-mono text-[#55685E]">
                      {new Date(item.createdAt || item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.rating && <span className="text-xs font-mono text-[#8C6A23] font-semibold">★ {item.rating}/5</span>}
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-white border border-[#065F46]/25 text-[#065F46]">
                      {item.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="glass-card p-6 space-y-3">
            <h3 className="font-display text-base font-bold text-[#12231B]">In-Person Assistance History</h3>
          {historyList.length === 0 ? (
            <p className="text-sm text-[#4F6358]">No completed or past volunteer sessions yet.</p>
          ) : (
            historyList.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-[#F6F1E6] border border-[#E2D9C8] flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <span className="font-semibold text-[#12231B]">{item.blind_user_name || 'User'}</span>
                  <span className="text-[#4F6358] ml-2 capitalize">· {item.type}</span>
                  <span className="block text-xs font-mono text-[#55685E]">
                    {new Date(item.createdAt || item.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {item.rating && <span className="text-xs font-mono text-[#8C6A23] font-semibold">★ {item.rating}/5</span>}
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-[#ECF7F2] border border-[#065F46]/20 text-[#065F46]">
                    {item.status}
                  </span>
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      )}

      {/* Incoming-Call Style Full-Screen Live Assist Alert */}
      {incomingLiveCall && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="incoming-live-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#063B2C]/85 backdrop-blur-xl"
        >
          <div className="glass-card max-w-md w-full p-8 text-center space-y-6 border-2 border-[#E6CB8F]">
            <div className="w-20 h-20 rounded-full bg-[#065F46] text-white flex items-center justify-center mx-auto shadow-glow-lg animate-pulse">
              <PhoneIncoming className="w-10 h-10 text-[#F4E3BC]" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-[#8C6A23] font-bold">
                Incoming Eyes on Demand Call
              </span>
              <h2 id="incoming-live-title" className="font-display text-2xl font-black text-[#12231B] mt-2">
                {incomingLiveCall.blind_user_name || 'SightLink User'}
              </h2>
              <p className="text-sm text-[#354B40] mt-2">
                {incomingLiveCall.approx_distance_text || 'Live Video Request'} · 30s default
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDeclineLive(incomingLiveCall.session_id)}
                className="min-h-[56px] rounded-2xl bg-white border-2 border-red-300 text-red-700 font-bold text-base hover:bg-red-50 flex items-center justify-center gap-2"
              >
                <XCircle className="w-5 h-5" /> Decline
              </button>
              <button
                type="button"
                onClick={() => handleAcceptLive(incomingLiveCall.session_id)}
                className="min-h-[56px] rounded-2xl bg-[#065F46] text-white font-bold text-base hover:bg-[#054D39] shadow-glow-md flex items-center justify-center gap-2"
              >
                <Video className="w-5 h-5" /> Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report/Block Dialog */}
      {reportTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#12231B]/35 backdrop-blur-sm">
          <form onSubmit={handleReportSubmit} className="glass-card max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#12231B]">Report & Block User</h3>
            <p className="text-xs text-[#4F6358]">
              Future help requests from this account will be automatically filtered out of your queue.
            </p>
            <textarea
              required
              rows={3}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Reason for reporting abuse/spam…"
              className="w-full p-3 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] placeholder:text-[#697D72]"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setReportTarget(null)} className="flex-1 min-h-[44px] rounded-xl border border-[#D7CEBC] bg-white text-[#354B40] text-sm">Cancel</button>
              <button type="submit" className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm">Report & Block</button>
            </div>
          </form>
        </div>
      )}
    </DashboardShell>
  );
}
