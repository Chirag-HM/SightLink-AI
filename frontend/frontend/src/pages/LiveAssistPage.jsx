import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Clock,
  AlertTriangle,
  PlusCircle,
  Navigation,
  Star,
  Flag,
  Flashlight,
  Volume2,
  LogIn,
  Radio,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import useVoiceAssistant, {
  speakText,
  parseLiveAssistCommand,
} from '../hooks/useVoiceAssistant';
import useWebSocket from '../hooks/useWebSocket';
import { liveAssistService, safetyApiService } from '../services/api';
import { sosSiren } from '../utils/sosSound';
import { getIceServers, playCueTone, vibrateHaptic } from '../utils/webrtc';

export default function LiveAssistPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { location: stickGps } = useStickGps();
  const isBlindUser = user?.role === 'blind_user';

  const [sessionConsent, setSessionConsent] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [remainingSec, setRemainingSec] = useState(30);
  const [lastPrompt, setLastPrompt] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [userCoords, setUserCoords] = useState({ latitude: 12.9716, longitude: 77.5946 });
  const [sosActive, setSosActive] = useState(false);
  const [sosFallbacks, setSosFallbacks] = useState(null);
  const [noJoinFallback, setNoJoinFallback] = useState(false);

  // Post-session rating & anti-abuse
  const [sessionToRate, setSessionToRate] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const pcRef = useRef(null);
  const peerOfferSentForRef = useRef('');
  const lastTenSecSpokenRef = useRef('');
  const statsIntervalRef = useRef(null);
  const voiceAutoStartedRef = useRef(false);

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
            const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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

  const cleanupMediaAndRtc = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    peerOfferSentForRef.current = '';
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setCameraLive(false);
    setTorchOn(false);
  }, []);

  const acquireCameraMedia = useCallback(
    async ({ forceAudioOnly = false } = {}) => {
      if (localStreamRef.current) return localStreamRef.current;
      if (!navigator.mediaDevices?.getUserMedia) {
        setAudioOnly(true);
        return null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          forceAudioOnly
            ? { audio: true, video: false }
            : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: true }
        );
        localStreamRef.current = stream;
        const hasVideo = stream.getVideoTracks().length > 0;
        setCameraLive(hasVideo);
        setAudioOnly(!hasVideo);
        if (localVideoRef.current && hasVideo) {
          localVideoRef.current.srcObject = stream;
        }
        if (hasVideo) {
          playCueTone('camera_live');
          vibrateHaptic([90, 40, 90]);
        }
        return stream;
      } catch {
        // Gracefully fall back to audio-only if camera denied or unavailable
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = audioStream;
          setCameraLive(false);
          setAudioOnly(true);
          return audioStream;
        } catch {
          setCameraLive(false);
          setAudioOnly(true);
          return null;
        }
      }
    },
    []
  );

  const fetchActive = useCallback(async () => {
    if (!isBlindUser) return;
    try {
      const act = await liveAssistService.getActive();
      setActiveSession(act || null);
      if (act?.remaining_sec != null) {
        setRemainingSec(act.remaining_sec);
      }
      if (act?.connection_mode === 'audio_only') {
        setAudioOnly(true);
      }
    } catch {
      // ignore poll failure
    }
  }, [isBlindUser]);

  useEffect(() => {
    fetchActive();
    return () => {
      cleanupMediaAndRtc();
      sosSiren.stopSiren();
    };
  }, [fetchActive, cleanupMediaAndRtc]);

  // Countdown tick synced to server remaining/expiry
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'CONNECTED') return undefined;
    const t = setInterval(() => {
      setRemainingSec((prev) => {
        const next = Math.max(0, prev - 1);
        const key = `${activeSession.id}-10s`;
        if (next === 10 && lastTenSecSpokenRef.current !== key) {
          lastTenSecSpokenRef.current = key;
          speakText('10 seconds remaining. Say keep going to add 30 seconds.');
          vibrateHaptic([60]);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeSession]);

  const switchToAudioFallback = useCallback(
    async (reasonText = 'Weak connection — dropped to audio only') => {
      setAudioOnly(true);
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.enabled = false;
          t.stop();
        });
      }
      setCameraLive(false);
      speakText('Connection is poor. Dropped to audio only.');
      setStatusMessage('Dropped to audio-only mode to preserve clear voice.');
      if (activeSession?.id) {
        liveAssistService.audioFallback(activeSession.id, reasonText).catch(() => {});
      }
    },
    [activeSession?.id]
  );

  const startWebRtcPeer = useCallback(
    async (sessionId, volunteerId, sendJsonFn) => {
      if (!volunteerId || !sessionConsent) return;
      const peerKey = `${sessionId}:${volunteerId}`;
      if (peerOfferSentForRef.current === peerKey && pcRef.current) return;
      peerOfferSentForRef.current = peerKey;

      const stream = await acquireCameraMedia({ forceAudioOnly: audioOnly });
      if (typeof RTCPeerConnection === 'undefined') return;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      pcRef.current = pc;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.ontrack = (ev) => {
        if (remoteAudioRef.current && ev.streams?.[0]) {
          remoteAudioRef.current.srcObject = ev.streams[0];
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendJsonFn({
            type: 'WEBRTC_ICE_CANDIDATE',
            session_id: sessionId,
            target_user_id: volunteerId,
            candidate: ev.candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          switchToAudioFallback(`ICE state ${pc.iceConnectionState}`);
        }
      };

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        sendJsonFn({
          type: 'WEBRTC_OFFER',
          session_id: sessionId,
          target_user_id: volunteerId,
          sdp: offer,
        });
      } catch {
        // Peer offer gracefully skipped if media unsupported
      }

      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = setInterval(async () => {
        if (!pcRef.current) return;
        try {
          const stats = await pcRef.current.getStats();
          stats.forEach((rep) => {
            if (rep.type === 'remote-inbound-rtp' && typeof rep.fractionLost === 'number') {
              if (rep.fractionLost > 0.25) {
                switchToAudioFallback('High packet loss detected');
              }
            }
          });
        } catch {
          // ignore stats failure
        }
      }, 4000);
    },
    [sessionConsent, acquireCameraMedia, audioOnly, switchToAudioFallback]
  );

  const sendJsonRef = useRef(() => false);

  const handleWsMessage = useCallback(
    async (msg) => {
      if (!msg?.type) return;

      if (msg.type === 'LIVE_ASSIST_ACCEPTED') {
        const volName = msg.volunteer?.first_name || 'a verified volunteer';
        const announcement =
          msg.voice_announcement || `Connected with ${volName}, verified volunteer. Camera is live.`;
        setStatusMessage(announcement);
        setNoJoinFallback(false);
        playCueTone('camera_live');
        vibrateHaptic([100, 50, 100]);
        speakText(announcement);
        await fetchActive();
        if (msg.volunteer?.id && sessionConsent) {
          startWebRtcPeer(msg.session_id, msg.volunteer.id, sendJsonRef.current);
        }
      } else if (msg.type === 'WEBRTC_ANSWER' && pcRef.current && msg.sdp) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        } catch {
          // ignore duplicate answer
        }
      } else if (msg.type === 'WEBRTC_ICE_CANDIDATE' && pcRef.current && msg.candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          // ignore early/invalid candidate
        }
      } else if (msg.type === 'LIVE_ASSIST_QUICK_REPLY') {
        setLastPrompt(msg.prompt_text);
        setStatusMessage(`${msg.from_volunteer || 'Volunteer'}: "${msg.prompt_text}"`);
        vibrateHaptic([80, 40, 80]);
        speakText(msg.prompt_text);
      } else if (msg.type === 'LIVE_ASSIST_FLASH_TOGGLE') {
        const nextTorch = Boolean(msg.flash_on);
        setTorchOn(nextTorch);
        try {
          const track = localStreamRef.current?.getVideoTracks()?.[0];
          if (track?.applyConstraints) {
            await track.applyConstraints({ advanced: [{ torch: nextTorch }] });
          }
        } catch {
          // Device camera may not expose torch API
        }
        speakText(nextTorch ? 'Camera flash turned on.' : 'Camera flash turned off.');
      } else if (msg.type === 'LIVE_ASSIST_EXTENDED') {
        setRemainingSec(msg.remaining_sec ?? 30);
        setStatusMessage(msg.voice_announcement || 'Session extended by 30 seconds.');
        speakText(msg.voice_announcement || 'Extended by 30 seconds.');
      } else if (msg.type === 'LIVE_ASSIST_AUDIO_FALLBACK') {
        setAudioOnly(true);
        speakText(msg.voice_announcement || 'Dropped to audio only.');
      } else if (msg.type === 'LIVE_ASSIST_RADIUS_ESCALATED') {
        setStatusMessage(msg.message);
        speakText(msg.message);
      } else if (msg.type === 'LIVE_ASSIST_NO_JOIN_FALLBACK') {
        setNoJoinFallback(true);
        setStatusMessage(msg.message);
        vibrateHaptic([180, 80, 180]);
        speakText(msg.message);
      } else if (msg.type === 'LIVE_ASSIST_ESCALATED') {
        cleanupMediaAndRtc();
        playCueTone('escalated');
        vibrateHaptic([120, 60, 120]);
        speakText(msg.voice_announcement || 'Someone is on the way.');
        setStatusMessage('Someone is on the way. Opening your in-person help tracker…');
        setActiveSession(null);
        setTimeout(() => navigate('/assist'), 1400);
      } else if (msg.type === 'LIVE_ASSIST_ENDED') {
        cleanupMediaAndRtc();
        speakText(msg.voice_announcement || 'Live video session ended safely.');
        setSessionToRate((prev) => prev || activeSession);
        setActiveSession(null);
      }
    },
    [fetchActive, sessionConsent, startWebRtcPeer, cleanupMediaAndRtc, navigate, activeSession]
  );

  const { sendJson } = useWebSocket(isBlindUser && user?.id ? `/ws/${user.id}/blind_user` : null, {
    enabled: Boolean(isBlindUser && user?.id),
    onMessage: handleWsMessage,
  });
  sendJsonRef.current = sendJson;

  // Ensure WebRTC starts if re-opening connected page with consent granted
  useEffect(() => {
    if (
      activeSession?.status === 'CONNECTED' &&
      activeSession.accepted_volunteer?.id &&
      sessionConsent
    ) {
      startWebRtcPeer(activeSession.id, activeSession.accepted_volunteer.id, sendJson);
    }
  }, [activeSession, sessionConsent, startWebRtcPeer, sendJson]);

  const handleStartLiveAssist = useCallback(async () => {
    setErrorMessage('');
    if (!isBlindUser) {
      setErrorMessage('Please sign in with a User account to start Eyes on Demand.');
      return;
    }
    if (!sessionConsent) {
      setErrorMessage('Please confirm per-session camera consent before connecting.');
      speakText('Please confirm camera consent first before connecting.');
      return;
    }

    setBusy(true);
    speakText('Connecting you to a volunteer.');
    setStatusMessage('Connecting you to a volunteer…');
    try {
      await acquireCameraMedia({ forceAudioOnly: false });
      const coords = await resolveBestGps();
      const created = await liveAssistService.createSession({
        latitude: coords.latitude,
        longitude: coords.longitude,
        allow_remote: true,
        consent_confirmed: true,
      });
      setActiveSession(created);
      setRemainingSec(created.remaining_sec ?? 30);
      setNoJoinFallback(false);
    } catch (err) {
      setErrorMessage(err.message || 'Could not start Eyes on Demand session.');
      speakText(err.message || 'Unable to start live camera session.');
    } finally {
      setBusy(false);
    }
  }, [isBlindUser, sessionConsent, acquireCameraMedia, resolveBestGps]);

  const handleExtend = useCallback(async () => {
    if (!activeSession?.id) return;
    setBusy(true);
    try {
      const res = await liveAssistService.extend(activeSession.id, 30);
      setRemainingSec(res.remaining_sec);
      vibrateHaptic([60]);
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setBusy(false);
    }
  }, [activeSession?.id]);

  const handleEscalateInPerson = useCallback(async () => {
    if (!activeSession?.id) return;
    setBusy(true);
    try {
      const res = await liveAssistService.escalateToInPerson(activeSession.id);
      cleanupMediaAndRtc();
      playCueTone('escalated');
      speakText(res.voice_announcement || 'Someone is on the way.');
      setActiveSession(null);
      setStatusMessage('Someone is on the way. Switching to in-person help tracker.');
      setTimeout(() => navigate('/assist'), 1200);
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setBusy(false);
    }
  }, [activeSession?.id, cleanupMediaAndRtc, navigate]);

  const handleEndSession = useCallback(async () => {
    if (!activeSession?.id) return;
    const finished = activeSession;
    setBusy(true);
    try {
      await liveAssistService.endSession(finished.id, 'completed');
      cleanupMediaAndRtc();
      speakText('Live video session ended safely.');
      if (finished.accepted_volunteer) {
        setSessionToRate(finished);
      }
      setActiveSession(null);
    } catch (e) {
      setErrorMessage(e.message);
    } finally {
      setBusy(false);
    }
  }, [activeSession, cleanupMediaAndRtc]);

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
      // battery API optional
    }
    const coords = await resolveBestGps();
    const mapsUrl = `https://maps.google.com/?q=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`;
    const encoded = encodeURIComponent(
      `EMERGENCY SOS! Need urgent help. Live location: ${mapsUrl}${
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
        source: 'live_assist_no_join_fallback',
        notes: 'Triggered after 45s Eyes on Demand fallback',
      });
      setSosFallbacks({ ...localFallbacks, ...res });
    } catch (err) {
      setErrorMessage(err.message || 'Could not dispatch cloud family SOS alert.');
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

  const handleSubmitRating = async (e) => {
    e.preventDefault();
    if (!sessionToRate) return;
    setBusy(true);
    try {
      await liveAssistService.rate(sessionToRate.id, ratingValue, ratingComment.trim() || undefined);
      setStatusMessage(`Submitted ${ratingValue}-star rating. Thank you!`);
      speakText('Rating submitted.');
      setSessionToRate(null);
      setRatingComment('');
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    const targetId = activeSession?.accepted_volunteer?.id || sessionToRate?.accepted_volunteer?.id;
    if (!targetId) return;
    try {
      await safetyApiService.reportUser({
        reported_user_id: targetId,
        reason: reportReason.trim() || 'Safety concern during Eyes on Demand video call',
        block_user: true,
      });
      setShowReportModal(false);
      setReportReason('');
      setStatusMessage('Volunteer reported and permanently blocked.');
      if (activeSession) await handleEndSession();
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  // Voice commands: "Show someone my camera", "I need eyes", "keep going", "send someone", "confirm camera", "end camera"
  const {
    supported: speechSupported,
    listening,
    transcript,
    error: voiceErr,
    startListening,
    stopListening,
  } = useVoiceAssistant({
    continuous: false,
    onTranscript: (text, { isFinal }) => {
      if (!isFinal) return;
      const cmd = parseLiveAssistCommand(text);
      if (!cmd) return;
      if (cmd.action === 'consent') {
        setSessionConsent(true);
        speakText('Camera consent confirmed. Tap Start Live Camera or say I need eyes.');
      } else if (cmd.action === 'extend' && activeSession?.status === 'CONNECTED') {
        handleExtend();
      } else if (cmd.action === 'escalate' && activeSession) {
        handleEscalateInPerson();
      } else if (cmd.action === 'end' && activeSession) {
        handleEndSession();
      }
    },
    onLiveAssistTrigger: () => {
      if (activeSession) return;
      setSessionConsent(true);
      speakText('Connecting you to a volunteer.');
      // Defer slightly so state commits before call
      setTimeout(() => {
        if (!isBlindUser) return;
        setBusy(true);
        acquireCameraMedia({ forceAudioOnly: false })
          .then(() => resolveBestGps())
          .then((coords) =>
            liveAssistService.createSession({
              latitude: coords.latitude,
              longitude: coords.longitude,
              allow_remote: true,
              consent_confirmed: true,
            })
          )
          .then((created) => {
            setActiveSession(created);
            setRemainingSec(created.remaining_sec ?? 30);
          })
          .catch((e) => setErrorMessage(e.message))
          .finally(() => setBusy(false));
      }, 150);
    },
  });

  // Auto-announce or start directly when arriving via ?autostart=1 (&voice_start=1)
  useEffect(() => {
    if (searchParams.get('autostart') !== '1' || !isBlindUser || activeSession) return;
    if (searchParams.get('voice_start') === '1' && !voiceAutoStartedRef.current) {
      voiceAutoStartedRef.current = true;
      setSessionConsent(true);
      setBusy(true);
      speakText('Connecting you to a volunteer with Eyes on Demand.');
      setStatusMessage('Voice command started Eyes on Demand camera stream…');
      acquireCameraMedia({ forceAudioOnly: false })
        .then(() => resolveBestGps())
        .then((coords) =>
          liveAssistService.createSession({
            latitude: coords.latitude,
            longitude: coords.longitude,
            allow_remote: true,
            consent_confirmed: true,
          })
        )
        .then((created) => {
          setActiveSession(created);
          setRemainingSec(created.remaining_sec ?? 30);
          setNoJoinFallback(false);
        })
        .catch((err) => {
          setErrorMessage(err?.message || 'Could not auto-start Eyes on Demand session.');
        })
        .finally(() => setBusy(false));
      return;
    }
    speakText('Eyes on Demand ready. Check camera consent and tap Start Live Video Help.');
  }, [searchParams, isBlindUser, activeSession, acquireCameraMedia, resolveBestGps]);

  return (
    <DashboardShell
      title="Eyes on Demand — Live Camera Help"
      subtitle="Say “Show someone my camera” or “I need eyes” to stream rear video to a verified volunteer, escalating to in-person help anytime"
      icon={Video}
    >
      <EmailVerificationBanner className="mb-6" />

      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />

      {!isBlindUser && (
        <div className="mb-6 glass-card p-6 border border-[#C59B42]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#12231B]">Sign in as a User to start Eyes on Demand</h2>
            <p className="text-sm text-[#354B40] mt-1">
              Only ID/phone-verified volunteers can view your rear camera, with explicit per-session consent and zero recording.
            </p>
          </div>
          <Link
            to="/login?role=blind_user&redirect=/live-assist"
            className="min-h-[52px] px-6 py-3 rounded-full bg-[#065F46] text-white hover:bg-[#054D39] font-bold text-sm inline-flex items-center justify-center gap-2 shrink-0 shadow-glow-sm focus-visible-ring"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>Sign In / Voice Login</span>
          </Link>
        </div>
      )}

      {/* Persistent Safety Indicators */}
      <div className="mb-5 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
        <span
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-mono font-bold ${
            cameraLive
              ? 'bg-red-50 border-red-300 text-red-800'
              : audioOnly && activeSession
              ? 'bg-[#FBF3DF] border-[#C59B42]/45 text-[#7D5B1C]'
              : 'bg-[#ECF7F2] border-[#065F46]/25 text-[#065F46]'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              cameraLive ? 'bg-red-600 animate-pulse' : 'bg-[#065F46]'
            }`}
            aria-hidden="true"
          />
          {cameraLive ? 'CAMERA IS LIVE' : audioOnly && activeSession ? 'AUDIO-ONLY FALLBACK' : 'CAMERA OFF'}
        </span>

        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FAF7F0] border border-[#DCD2BF] text-xs font-mono text-[#354B40]">
          <ShieldCheck className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
          Recording: OFF · Verified Volunteers Only
        </span>

        {torchOn && (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FBF3DF] border border-[#C59B42] text-xs font-mono font-bold text-[#7D5B1C]">
            <Flashlight className="w-4 h-4" aria-hidden="true" />
            Torch Requested ON
          </span>
        )}
      </div>

      {statusMessage && (
        <div role="status" className="mb-5 p-4 rounded-2xl bg-[#ECF7F2] border border-[#065F46]/25 text-[#064E3B] text-base font-semibold flex items-center gap-3">
          <Radio className="w-5 h-5 text-[#065F46] shrink-0 animate-pulse" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {(errorMessage || voiceErr) && (
        <div role="alert" className="mb-5 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
          <span>{errorMessage || voiceErr}</span>
        </div>
      )}

      {!activeSession ? (
        <div className="grid lg:grid-cols-12 gap-6 mb-8">
          <div className="lg:col-span-7 glass-card p-6 sm:p-8 space-y-6">
            {/* Explicit Per-Session Camera Consent */}
            <label className="p-5 rounded-2xl bg-[#F6F1E6] border-2 border-[#DCD2BF] flex items-start gap-4 cursor-pointer hover:border-[#065F46]/45 transition-colors">
              <input
                type="checkbox"
                checked={sessionConsent}
                onChange={(e) => setSessionConsent(e.target.checked)}
                className="mt-1 w-6 h-6 accent-[#065F46] rounded shrink-0"
              />
              <span className="text-base text-[#12231B] leading-relaxed">
                <strong>Explicit Per-Session Consent:</strong> Turn on my rear camera and microphone for a 30-second live video check with one verified SightLink volunteer. Recording is OFF.
              </span>
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={handleStartLiveAssist}
              className="w-full min-h-[120px] p-6 rounded-3xl bg-[#065F46] text-white font-display font-black text-2xl sm:text-3xl tracking-tight border-4 border-[#E6CB8F] shadow-glow-lg hover:bg-[#054D39] transition-all flex items-center justify-center gap-4 focus-visible-ring disabled:opacity-50"
            >
              <Video className="w-10 h-10 shrink-0 text-[#F4E3BC]" aria-hidden="true" />
              <span>{busy ? 'CONNECTING VOLUNTEER…' : 'I NEED EYES (LIVE VIDEO)'}</span>
            </button>

            <p className="text-xs text-[#4F6358] leading-relaxed">
              Scans within <strong>1 km</strong> first, widens to <strong>3 km</strong> (15s), then <strong>10 km + remote verified helpers</strong> (30s). If no volunteer joins within <strong>45s</strong>, family contacts are alerted and SOS is offered.
            </p>
          </div>

          <div className="lg:col-span-5 glass-card p-6 sm:p-8 flex flex-col justify-between items-center text-center space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#12231B]">Hands-Free Voice Commands</h2>
              <p className="text-sm text-[#354B40] mt-1">
                Say <strong className="text-[#065F46]">“Show someone my camera”</strong> or{' '}
                <strong className="text-[#065F46]">“I need eyes”</strong>. During a call say{' '}
                <strong className="text-[#8C6A23]">“keep going”</strong> or{' '}
                <strong className="text-[#8C6A23]">“send someone”</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={!speechSupported}
              aria-pressed={listening}
              aria-label={listening ? 'Stop voice listener' : 'Start Eyes on Demand voice listener'}
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
              {transcript ? `Heard: "${transcript}"` : 'Ready for “I need eyes”…'}
            </div>
          </div>
        </div>
      ) : (
        /* Active Full-Height Accessible Live Camera Screen */
        <div className="space-y-6 mb-8">
          <div className="glass-card p-5 sm:p-6 border border-[#065F46]/30 space-y-5">
            {/* Top Volunteer + Countdown Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#065F46] font-semibold">
                  {activeSession.status === 'WAITING'
                    ? `Scanning within ${activeSession.radius_km} km (${activeSession.escalation_stage >= 2 ? 'incl. Remote Verified' : 'Nearby'})`
                    : 'Connected Live Video Session'}
                </span>
                <h2 className="font-display text-2xl font-bold text-[#12231B] mt-1 flex flex-wrap items-center gap-2">
                  {activeSession.accepted_volunteer ? (
                    <>
                      <span>Connected with {activeSession.accepted_volunteer.full_name}</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46] text-xs font-mono">
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Verified Volunteer
                      </span>
                    </>
                  ) : (
                    <span>Connecting you to a volunteer…</span>
                  )}
                </h2>
              </div>

              <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#FBF3DF] border border-[#C59B42]/40">
                <Clock className="w-5 h-5 text-[#8C6A23]" aria-hidden="true" />
                <span className="text-2xl font-mono font-black text-[#7D5B1C]">
                  {String(Math.floor(remainingSec / 60)).padStart(2, '0')}:
                  {String(remainingSec % 60).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Latest Spoken Quick Reply Banner */}
            {lastPrompt && (
              <div className="p-4 rounded-2xl bg-[#ECF7F2] border-2 border-[#065F46]/40 text-[#064E3B] text-xl font-bold flex items-center gap-3">
                <Volume2 className="w-6 h-6 text-[#065F46] shrink-0" aria-hidden="true" />
                <span>Volunteer Guidance: “{lastPrompt}”</span>
              </div>
            )}

            {/* Full-Width Rear Camera Viewport */}
            <div className="relative rounded-3xl overflow-hidden bg-[#162921] border-2 border-[#065F46]/30 aspect-video max-h-[460px] flex items-center justify-center">
              {!audioOnly ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  aria-label="Your live rear camera preview sent to the volunteer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-8 text-[#FAF7F0] space-y-2">
                  <VideoOff className="w-12 h-12 mx-auto text-[#F4E3BC]" aria-hidden="true" />
                  <p className="font-display text-xl font-bold">Audio-Only Mode Active</p>
                  <p className="text-sm text-[#E5DEC9]">Two-way voice continues without video.</p>
                </div>
              )}

              <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-mono font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {audioOnly ? 'AUDIO LIVE' : 'CAMERA IS LIVE'}
              </div>
            </div>

            {/* 45s No-Join Fallback Banner */}
            {noJoinFallback && activeSession.status === 'WAITING' && (
              <div className="p-5 rounded-2xl bg-red-50 border-2 border-red-300 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-red-900">
                      No volunteer joined in 45s — Family Contacts Notified
                    </h3>
                    <p className="text-sm text-red-800 mt-1">
                      You can stay connected waiting or trigger the Emergency SOS siren now.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={sosActive ? handleStopSos : handleTriggerSos}
                    className="min-h-[56px] px-7 py-3 rounded-full bg-red-600 text-white font-bold text-base hover:bg-red-700 shrink-0"
                  >
                    {sosActive ? 'Stop SOS Siren' : 'Activate Emergency SOS'}
                  </button>
                </div>
                {sosFallbacks && (
                  <div className="space-y-2.5 pt-2 border-t border-red-200">
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
                    <div className="flex flex-wrap gap-2">
                      {sosFallbacks.sms_fallback_url && (
                        <a href={sosFallbacks.sms_fallback_url} className="min-h-[40px] px-4 py-2 rounded-full bg-[#065F46] text-white font-bold text-xs inline-flex items-center">
                          Send Free SMS
                        </a>
                      )}
                      {sosFallbacks.whatsapp_fallback_url && (
                        <a href={sosFallbacks.whatsapp_fallback_url} target="_blank" rel="noopener noreferrer" className="min-h-[40px] px-4 py-2 rounded-full bg-[#FBF3DF] border border-[#C59B42] text-[#7D5B1C] font-bold text-xs inline-flex items-center">
                          Share via WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Huge High-Contrast Controls */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                disabled={busy}
                onClick={handleExtend}
                className="min-h-[82px] px-5 py-4 rounded-2xl bg-[#ECF7F2] border-2 border-[#065F46] text-[#065F46] font-display font-bold text-lg hover:bg-[#DDF0E7] flex items-center justify-center gap-2.5 focus-visible-ring"
              >
                <PlusCircle className="w-6 h-6 shrink-0" aria-hidden="true" />
                <span>Keep Going (+30s)</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleEscalateInPerson}
                className="min-h-[82px] px-5 py-4 rounded-2xl bg-[#FBF3DF] border-2 border-[#C59B42] text-[#7D5B1C] font-display font-bold text-lg hover:bg-[#F5E7C3] flex items-center justify-center gap-2.5 focus-visible-ring"
              >
                <Navigation className="w-6 h-6 shrink-0" aria-hidden="true" />
                <span>Send Someone In Person</span>
              </button>

              <button
                type="button"
                disabled={busy || audioOnly}
                onClick={() => switchToAudioFallback('User switched to audio-only')}
                className="min-h-[82px] px-5 py-4 rounded-2xl bg-white border-2 border-[#D7CEBC] text-[#12231B] font-display font-bold text-base hover:border-[#065F46] flex items-center justify-center gap-2 focus-visible-ring disabled:opacity-50"
              >
                <VideoOff className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{audioOnly ? 'Audio Only ON' : 'Drop to Audio'}</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleEndSession}
                className="min-h-[82px] px-5 py-4 rounded-2xl bg-red-600 text-white font-display font-bold text-lg hover:bg-red-700 flex items-center justify-center gap-2.5 focus-visible-ring"
              >
                <PhoneOff className="w-6 h-6 shrink-0" aria-hidden="true" />
                <span>End Live Video</span>
              </button>
            </div>

            {/* Voice Command Bar + Report */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E3DCCB]">
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                disabled={!speechSupported}
                className="min-h-[48px] px-5 py-2.5 rounded-full bg-[#065F46] text-white text-sm font-semibold flex items-center gap-2"
              >
                {listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                <span>{listening ? 'Listening (“keep going” / “send someone”)…' : 'Voice Command Mic'}</span>
              </button>

              {activeSession.accepted_volunteer && (
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-white border border-[#DCD2BF] text-xs font-semibold text-[#4F6358] hover:text-red-700 hover:border-red-300 flex items-center gap-1.5"
                >
                  <Flag className="w-4 h-4" aria-hidden="true" />
                  <span>Report / Block Volunteer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post-Session Rating Card */}
      {sessionToRate && (
        <form onSubmit={handleSubmitRating} className="mb-8 glass-card p-6 border border-[#C59B42]/40 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#12231B]">
            Rate Eyes on Demand Volunteer ({sessionToRate.accepted_volunteer?.full_name || 'Volunteer'})
          </h2>
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Session star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatingValue(n)}
                aria-label={`${n} stars`}
                aria-pressed={ratingValue >= n}
                className={`min-w-[48px] min-h-[48px] rounded-xl border flex items-center justify-center ${
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
            placeholder="Optional feedback…"
            className="w-full min-h-[48px] px-4 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]"
          />
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="min-h-[48px] px-6 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-sm">
              Submit Rating
            </button>
            {sessionToRate.accepted_volunteer && (
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="min-h-[48px] px-5 py-2.5 rounded-full border border-red-200 bg-red-50 text-red-700 text-sm font-semibold"
              >
                Report / Block
              </button>
            )}
            <button
              type="button"
              onClick={() => setSessionToRate(null)}
              className="min-h-[48px] px-5 py-2.5 rounded-full border border-[#D7CEBC] bg-white text-[#354B40] text-sm"
            >
              Skip
            </button>
          </div>
        </form>
      )}

      {/* Report / Block Dialog */}
      {showReportModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#12231B]/40 backdrop-blur-sm"
        >
          <form onSubmit={handleReportSubmit} className="glass-card max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#12231B]">Report & Block Volunteer</h3>
            <p className="text-xs text-[#4F6358]">
              This volunteer will never be matched with your video or in-person requests again.
            </p>
            <textarea
              required
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe what happened…"
              className="w-full p-3 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="flex-1 min-h-[44px] rounded-xl border border-[#D7CEBC] bg-white text-[#354B40] text-sm"
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 min-h-[44px] rounded-xl bg-red-600 text-white font-bold text-sm">
                Report & Block
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardShell>
  );
}

