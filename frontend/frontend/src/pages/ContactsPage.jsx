import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  Shield,
  Phone,
  MapPin,
  Share2,
  Copy,
  Check,
  QrCode,
  Pause,
  Play,
  Square,
  Radar,
  LogIn,
  ExternalLink,
  Navigation,
  Home,
  Moon,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  UserCheck,
  Clock,
  Plus,
  Mail,
  Send,
  BellRing,
  RefreshCw,
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import TelegramConnectCard from '../components/TelegramConnectCard';
import { useAuth } from '../context/AuthContext';
import { familyService } from '../services/api';
import useStickGps from '../hooks/useStickGps';
import useVoiceAssistant, {
  speakText,
  parseFamilyVoiceCommand,
} from '../hooks/useVoiceAssistant';

const FALLBACK_EMERGENCY_DIRECTORY = [
  { id: 'c-1', name: 'Amma (Mother)', category: 'Parents', phone: '+91 98765 43210', avatar: '👩' },
  { id: 'c-police', name: 'Police Emergency Response', category: 'Police', phone: '112', avatar: '🚓' },
  { id: 'c-ambulance', name: 'Ambulance & Medical Emergency', category: 'Ambulance', phone: '108', avatar: '🚑' },
];

function loadSavedEmergencyDirectory() {
  try {
    const raw = localStorage.getItem('sightlink_sos_contacts');
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // ignore storage errors
  }
  return FALLBACK_EMERGENCY_DIRECTORY;
}

const PLACE_PRESETS = ['Home', 'Clinic', 'Work', 'Market'];

export default function ContactsPage() {
  const { user, sharingSession, setSharingSession, refreshSharing } = useAuth();
  const { location: stickGps } = useStickGps();
  const isBlindUser = user?.role === 'blind_user';

  const [consentChecked, setConsentChecked] = useState(Boolean(sharingSession?.consent_given));
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Calm Family Controls state
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [members, setMembers] = useState([]);
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [caregiverManaged, setCaregiverManaged] = useState(false);
  const [caregiverName, setCaregiverName] = useState('');

  // New Saved Place form
  const [placeName, setPlaceName] = useState('Home');
  const [placeCat, setPlaceCat] = useState('home');
  const [placeLat, setPlaceLat] = useState('12.9716');
  const [placeLng, setPlaceLng] = useState('77.5946');
  const [placeRadius, setPlaceRadius] = useState(150);

  // Safe zone geofence form
  const [zoneName, setZoneName] = useState('Home Safe Zone');
  const [zoneLat, setZoneLat] = useState('12.9716');
  const [zoneLng, setZoneLng] = useState('77.5946');
  const [directoryContacts, setDirectoryContacts] = useState(() => loadSavedEmergencyDirectory());

  useEffect(() => {
    const syncContacts = () => setDirectoryContacts(loadSavedEmergencyDirectory());
    window.addEventListener('storage', syncContacts);
    window.addEventListener('sightlink:contacts-updated', syncContacts);
    return () => {
      window.removeEventListener('storage', syncContacts);
      window.removeEventListener('sightlink:contacts-updated', syncContacts);
    };
  }, []);
  const [zoneRadius, setZoneRadius] = useState(250);

  const loadFamilyControls = useCallback(async () => {
    if (!isBlindUser) return;
    try {
      const [places, memberRows, logs] = await Promise.all([
        familyService.getSavedPlaces().catch(() => []),
        familyService.getMembers().catch(() => []),
        familyService.getDeliveryLogs().catch(() => []),
      ]);
      setSavedPlaces(Array.isArray(places) ? places : []);
      setMembers(Array.isArray(memberRows) ? memberRows : []);
      setDeliveryLogs(Array.isArray(logs) ? logs : []);
    } catch {
      // ignore initial errors
    }
  }, [isBlindUser]);

  // Sync sharing state & QR code generation
  useEffect(() => {
    if (!isBlindUser) return;
    refreshSharing('blind_user');
    loadFamilyControls();
  }, [isBlindUser, refreshSharing, loadFamilyControls]);

  useEffect(() => {
    if (!sharingSession) return;
    setConsentChecked(Boolean(sharingSession.consent_given));
    setQuietEnabled(Boolean(sharingSession.quiet_hours?.enabled));
    if (sharingSession.quiet_hours?.start) setQuietStart(sharingSession.quiet_hours.start);
    if (sharingSession.quiet_hours?.end) setQuietEnd(sharingSession.quiet_hours.end);
    setCaregiverManaged(Boolean(sharingSession.caregiver_managed));
    setCaregiverName(sharingSession.caregiver_name || '');

    if (sharingSession.safe_zone) {
      setZoneName(sharingSession.safe_zone.name || 'Home Safe Zone');
      setZoneLat(String(sharingSession.safe_zone.lat));
      setZoneLng(String(sharingSession.safe_zone.lng));
      setZoneRadius(Number(sharingSession.safe_zone.radius_m) || 250);
    }

    if (sharingSession.invite_code) {
      const shareUrl = `${window.location.origin}/family/track/${sharingSession.invite_code}`;
      QRCode.toDataURL(shareUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#065F46', light: '#FAF7F0' },
      })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(''));
    }
  }, [sharingSession]);

  const sendTelemetryPing = useCallback(async () => {
    if (!isBlindUser || !sharingSession?.is_sharing || sharingSession?.is_paused) return;

    let batteryLevel = null;
    try {
      if (navigator.getBattery) {
        const bat = await navigator.getBattery();
        batteryLevel = Math.round((bat.level || 0) * 100);
      }
    } catch {
      // battery API optional across browsers
    }

    const pushCoords = async (lat, lng, accuracy = 15) => {
      try {
        const resp = await familyService.sendTelemetry({
          latitude: lat,
          longitude: lng,
          accuracy,
          battery_level: batteryLevel,
        });
        if (resp?.geofence_breached) {
          setStatusMsg('Safe Zone exit detected — family alert sent.');
        }
        loadFamilyControls();
      } catch {
        // ignore transient error
      }
    };

    if (stickGps?.fix && Number.isFinite(stickGps.latitude)) {
      await pushCoords(stickGps.latitude, stickGps.longitude, 8);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => pushCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => pushCoords(Number(zoneLat) || 12.9716, Number(zoneLng) || 77.5946, 35),
        { timeout: 4000 }
      );
    } else {
      await pushCoords(Number(zoneLat) || 12.9716, Number(zoneLng) || 77.5946, 35);
    }
  }, [isBlindUser, sharingSession?.is_sharing, sharingSession?.is_paused, stickGps, zoneLat, zoneLng, loadFamilyControls]);

  useEffect(() => {
    if (!isBlindUser || !sharingSession?.is_sharing || sharingSession?.is_paused) return undefined;
    sendTelemetryPing();
    const id = setInterval(sendTelemetryPing, 12000);
    return () => clearInterval(id);
  }, [isBlindUser, sharingSession?.is_sharing, sharingSession?.is_paused, sendTelemetryPing]);

  const handleConsentChange = useCallback(async ({
    isSharing,
    isPaused = false,
    pauseMinutes = null,
    regenerateCode = false,
    extra = {},
  }) => {
    setErrMsg('');
    if (isSharing && !consentChecked && !extra.consent_given) {
      setErrMsg('Please check the explicit consent box first before starting live family sharing.');
      return null;
    }
    setBusy(true);
    try {
      const updated = await familyService.updateConsent({
        consent_given: extra.consent_given ?? (isSharing ? true : consentChecked),
        is_sharing: isSharing,
        is_paused: isPaused,
        pause_minutes: pauseMinutes,
        regenerate_code: regenerateCode,
        ...extra,
      });
      setSharingSession(updated);
      setStatusMsg(
        pauseMinutes
          ? `Family sharing paused for ${pauseMinutes} minutes. Live updates will resume automatically.`
          : isPaused
          ? 'Sharing paused. Family members cannot see your coordinates until you resume.'
          : isSharing
          ? 'Sharing with family enabled with your explicit consent.'
          : 'Family sharing stopped.'
      );
      return updated;
    } catch (e) {
      setErrMsg(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [consentChecked, setSharingSession]);

  const handleSavePrivacyAndCaregiver = async (e) => {
    e?.preventDefault?.();
    setErrMsg('');
    const updated = await handleConsentChange({
      isSharing: Boolean(sharingSession?.is_sharing),
      isPaused: Boolean(sharingSession?.is_paused),
      extra: {
        consent_given: Boolean(consentChecked || sharingSession?.consent_given),
        quiet_hours_enabled: quietEnabled,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
        quiet_hours_tz_offset_min: -new Date().getTimezoneOffset(),
        caregiver_managed: caregiverManaged,
        caregiver_name: caregiverName.trim() || undefined,
      },
    });
    if (updated) {
      setStatusMsg('Saved Quiet Hours and Caregiver settings.');
    }
  };

  const handleSavePlace = async (e) => {
    e.preventDefault();
    setErrMsg('');
    setBusy(true);
    try {
      await familyService.savePlace({
        name: placeName.trim() || 'Home',
        category: placeCat.trim().toLowerCase() || 'home',
        latitude: parseFloat(placeLat),
        longitude: parseFloat(placeLng),
        radius_m: parseFloat(placeRadius) || 150,
      });
      setStatusMsg(`Saved place "${placeName}". Family gets calm arrival & departure updates here.`);
      await loadFamilyControls();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePlace = async (id) => {
    try {
      await familyService.deletePlace(id);
      setSavedPlaces((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setErrMsg(err.message);
    }
  };

  const handleConfirmMember = async (linkId, approved) => {
    setBusy(true);
    try {
      await familyService.confirmMember(linkId, approved);
      setStatusMsg(approved ? 'Family member approved.' : 'Family invite declined.');
      speakText(approved ? 'Family member confirmed.' : 'Family invite declined.');
      await loadFamilyControls();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateMemberPerm = async (linkId, patch) => {
    try {
      const updated = await familyService.updateMemberPermissions(linkId, patch);
      setMembers((prev) => prev.map((m) => (m.id === linkId ? updated : m)));
      setStatusMsg(`Updated sharing permissions for ${updated.family_name}.`);
    } catch (err) {
      setErrMsg(err.message);
    }
  };

  const handleRemoveMember = async (linkId, name) => {
    setBusy(true);
    try {
      await familyService.removeMember(linkId);
      setMembers((prev) => prev.filter((m) => m.id !== linkId));
      setStatusMsg(`Removed ${name || 'family member'} cleanly.`);
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHistory = useCallback(async () => {
    setBusy(true);
    try {
      const res = await familyService.deleteLocationHistory();
      setStatusMsg(res.message || 'Your raw location history has been deleted.');
      speakText('Your raw location history has been permanently deleted. Event summaries were preserved.');
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  const readSettingsAloud = useCallback(() => {
    if (!sharingSession) {
      speakText('Family sharing settings are loading.');
      return;
    }
    const statusWord = !sharingSession.is_sharing
      ? 'stopped'
      : sharingSession.is_paused
      ? `paused${sharingSession.paused_minutes_remaining ? ` for ${sharingSession.paused_minutes_remaining} more minutes` : ''}`
      : 'active and sharing with family';
    const quietWord = sharingSession.quiet_hours?.enabled
      ? `Quiet hours are on from ${sharingSession.quiet_hours.start} to ${sharingSession.quiet_hours.end}`
      : 'Quiet hours are off';
    const caregiverWord = sharingSession.caregiver_managed
      ? `Caregiver mode is on${sharingSession.caregiver_name ? ` managed by ${sharingSession.caregiver_name}` : ''}`
      : '';
    const line = `Family sharing is currently ${statusWord}. ${quietWord}. ${caregiverWord}. You have ${savedPlaces.length} saved places and ${members.length} linked family members.`;
    setStatusMsg(line);
    speakText(line);
  }, [sharingSession, savedPlaces.length, members.length]);

  const {
    supported: speechSupported,
    listening: voiceListening,
    transcript: voiceTranscript,
    startListening: startVoiceSettings,
    stopListening: stopVoiceSettings,
  } = useVoiceAssistant({
    continuous: false,
    onTranscript: async (text, { isFinal }) => {
      if (!isFinal || !isBlindUser) return;
      const cmd = parseFamilyVoiceCommand(text);
      if (!cmd) return;
      if (cmd.action === 'read_settings') {
        readSettingsAloud();
      } else if (cmd.action === 'pause_1h') {
        setConsentChecked(true);
        await handleConsentChange({ isSharing: true, isPaused: true, pauseMinutes: 60, extra: { consent_given: true } });
        speakText('Family sharing paused for one hour.');
      } else if (cmd.action === 'pause') {
        setConsentChecked(true);
        await handleConsentChange({ isSharing: true, isPaused: true, extra: { consent_given: true } });
        speakText('Family sharing paused.');
      } else if (cmd.action === 'resume') {
        setConsentChecked(true);
        await handleConsentChange({ isSharing: true, isPaused: false, extra: { consent_given: true } });
        speakText('Family sharing resumed.');
      } else if (cmd.action === 'stop') {
        await handleConsentChange({ isSharing: false, isPaused: false });
        speakText('Family sharing stopped.');
      } else if (cmd.action === 'quiet_on' || cmd.action === 'quiet_off') {
        const nextQ = cmd.action === 'quiet_on';
        setQuietEnabled(nextQ);
        await handleConsentChange({
          isSharing: Boolean(sharingSession?.is_sharing),
          isPaused: Boolean(sharingSession?.is_paused),
          extra: {
            consent_given: Boolean(consentChecked || sharingSession?.consent_given),
            quiet_hours_enabled: nextQ,
            quiet_hours_start: quietStart,
            quiet_hours_end: quietEnd,
            quiet_hours_tz_offset_min: -new Date().getTimezoneOffset(),
          },
        });
        speakText(nextQ ? 'Quiet hours turned on.' : 'Quiet hours turned off.');
      } else if (cmd.action === 'map_off' || cmd.action === 'map_on') {
        const allowMap = cmd.action === 'map_on';
        for (const m of members) {
          await familyService.updateMemberPermissions(m.id, { share_live_map: allowMap });
        }
        await loadFamilyControls();
        speakText(allowMap ? 'Live map enabled for linked family members.' : 'Live map turned off for family members. Calm timeline only.');
      } else if (cmd.action === 'arrival_only') {
        for (const m of members) {
          await familyService.updateMemberPermissions(m.id, { arrival_departure_only: true });
        }
        await loadFamilyControls();
        speakText('Updated family permissions to arrival and departure summaries only.');
      } else if (cmd.action === 'confirm_invite' || cmd.action === 'decline_invite') {
        try {
          await familyService.confirmLatestInvite(cmd.action === 'confirm_invite');
          speakText(cmd.action === 'confirm_invite' ? 'Family invite confirmed.' : 'Family invite declined.');
          await loadFamilyControls();
        } catch (err) {
          speakText(err.message || 'No pending invite found.');
        }
      } else if (cmd.action === 'delete_history') {
        await handleDeleteHistory();
      }
    },
  });

  const handleSaveZone = async (e) => {
    e.preventDefault();
    setErrMsg('');
    setBusy(true);
    try {
      const updated = await familyService.saveSafeZone({
        safe_zone_name: zoneName.trim() || 'Home Safe Zone',
        safe_zone_lat: parseFloat(zoneLat),
        safe_zone_lng: parseFloat(zoneLng),
        safe_zone_radius_m: parseFloat(zoneRadius),
      });
      setSharingSession(updated);
      setStatusMsg(`Saved safe zone "${zoneName}" (${zoneRadius} m radius). Family will be alerted if exited.`);
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = sharingSession?.invite_code
    ? `${window.location.origin}/family/track/${sharingSession.invite_code}`
    : '';

  const copyInviteLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <DashboardShell
      title="Calm Family Updates & Privacy Controls"
      subtitle="Share meaningful arrival, departure, and help summaries — manage per-member consent, Telegram/email channels, quiet hours, saved places, and history"
      icon={Shield}
    >
      <EmailVerificationBanner className="mb-6" />

      {statusMsg && (
        <div role="status" className="mb-5 p-4 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-sm text-[#064E3B] font-medium">
          {statusMsg}
        </div>
      )}
      {errMsg && (
        <div role="alert" className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {errMsg}
        </div>
      )}

      {user && (
        <TelegramConnectCard
          className="mb-8"
          title="Telegram Instant Alerts (Free)"
          subtitle="Optionally connect your own Telegram chat, or have family guardians connect theirs in Family Updates to get instant SOS & safety alerts."
        />
      )}

      {/* Family Live Sharing Section */}
      {isBlindUser ? (
        <div className="space-y-6 mb-10">
          {/* Voice Controls Bar (Read & Modify All Sharing Settings by Voice) */}
          <div className="glass-card p-5 border border-[#065F46]/25 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[#12231B] flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                Voice Control for Family Settings
              </h2>
              <p className="text-xs text-[#4F6358]">
                Say “read my sharing settings”, “pause for one hour”, “turn on quiet hours”, “turn off live map”, “confirm family member”, or “delete my location history”.
              </p>
              {voiceTranscript && (
                <p className="text-xs font-mono text-[#065F46]">Heard: “{voiceTranscript}”</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={readSettingsAloud}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#FAF7F0] border border-[#DCD2BF] text-xs font-semibold text-[#12231B] hover:border-[#065F46]/40 flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4 text-[#065F46]" /> Read Settings Aloud
              </button>
              <button
                type="button"
                disabled={!speechSupported}
                onClick={voiceListening ? stopVoiceSettings : startVoiceSettings}
                aria-pressed={voiceListening}
                className={`min-h-[44px] px-5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  voiceListening
                    ? 'bg-[#C59B42] text-white'
                    : 'bg-[#065F46] text-white hover:bg-[#054D39]'
                }`}
              >
                {voiceListening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                <span>{voiceListening ? 'Listening…' : 'Speak Command'}</span>
              </button>
            </div>
          </div>

          <div className="glass-card p-6 md:p-8 border border-[#DCD2BF] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#065F46]/10 border border-[#065F46]/25 flex items-center justify-center">
                  <Share2 className="w-6 h-6 text-[#065F46]" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-[#12231B] flex items-center gap-2 flex-wrap">
                    Family Sharing
                    <span
                      className={`text-xs font-mono px-2.5 py-0.5 rounded-full border ${
                        sharingSession?.is_sharing && !sharingSession?.is_paused
                          ? 'bg-[#ECF7F2] border-[#065F46]/25 text-[#065F46]'
                          : sharingSession?.is_paused
                          ? 'bg-[#FBF3DF] border-[#C59B42]/35 text-[#7D5B1C]'
                          : 'bg-[#F4EFE4] border-[#DCD2BF] text-[#4F6358]'
                      }`}
                    >
                      {sharingSession?.is_sharing && !sharingSession?.is_paused
                        ? '● SHARING WITH FAMILY'
                        : sharingSession?.is_paused
                        ? `⏸ PAUSED${sharingSession.paused_minutes_remaining ? ` (${sharingSession.paused_minutes_remaining}m)` : ''}`
                        : '○ STOPPED'}
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-[#4F6358]">
                    Calm timeline updates with encrypted coordinates &amp; optional read-only live map.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!sharingSession?.is_sharing ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleConsentChange({ isSharing: true, isPaused: false })}
                    className="min-h-[48px] px-6 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39] flex items-center gap-2 shadow-glow-sm"
                  >
                    <Play className="w-4 h-4" /> Start Sharing
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleConsentChange({ isSharing: true, isPaused: true, pauseMinutes: 60 })
                      }
                      className="min-h-[48px] px-4 py-2.5 rounded-full bg-[#FBF3DF] border border-[#C59B42]/45 text-[#7D5B1C] font-semibold text-sm flex items-center gap-1.5"
                    >
                      <Clock className="w-4 h-4" />
                      <span>Pause 1 Hour</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleConsentChange({ isSharing: true, isPaused: !sharingSession.is_paused })
                      }
                      className="min-h-[48px] px-5 py-2.5 rounded-full bg-[#FAF7F0] border border-[#D7CEBC] text-[#12231B] font-semibold text-sm flex items-center gap-1.5"
                    >
                      {sharingSession.is_paused ? <Play className="w-4 h-4 text-[#065F46]" /> : <Pause className="w-4 h-4 text-[#8C6A23]" />}
                      <span>{sharingSession.is_paused ? 'Resume' : 'Pause'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleConsentChange({ isSharing: false, isPaused: false })}
                      className="min-h-[48px] px-5 py-2.5 rounded-full bg-red-50 border border-red-200 text-red-700 font-semibold text-sm flex items-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" /> Stop Sharing
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Explicit Consent Checkbox */}
            <label className="p-4 rounded-2xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 w-5 h-5 accent-[#065F46] rounded shrink-0"
              />
              <span className="text-sm text-[#354B40] leading-relaxed">
                <strong className="text-[#12231B]">Explicit Consent:</strong> I understand and consent to sharing my real-time location trail, battery level, assistance status, and emergency SOS alerts with family members holding my invite code or QR link. I can pause or stop at any time.
              </span>
            </label>

            {/* Invite Code, Shareable Link & QR Code */}
            <div className="grid md:grid-cols-12 gap-6 items-center pt-2 border-t border-[#E3DCCB]">
              <div className="md:col-span-8 space-y-4">
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-[#4F6358] block mb-1">
                    Family Invite Code
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <code className="text-2xl font-mono font-bold text-[#065F46] bg-[#FAF7F0] px-4 py-2 rounded-xl border border-[#065F46]/25">
                      {sharingSession?.invite_code || 'Loading…'}
                    </code>
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#D7CEBC] text-xs font-semibold text-[#12231B] hover:border-[#065F46]/40 flex items-center gap-1.5"
                    >
                      {copied ? <Check className="w-4 h-4 text-[#065F46]" /> : <Copy className="w-4 h-4 text-[#065F46]" />}
                      <span>{copied ? 'Link Copied' : 'Copy Tracking Link'}</span>
                    </button>
                    <Link
                      to={sharingSession?.invite_code ? `/family/track/${sharingSession.invite_code}` : '/family/track'}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/35 text-xs font-semibold text-[#7D5B1C] flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Preview Tracker
                    </Link>
                  </div>
                </div>

                {shareUrl && (
                  <p className="text-xs font-mono text-[#4F6358] break-all bg-[#F6F1E6] p-3 rounded-xl border border-[#E2D9C8]">
                    {shareUrl}
                  </p>
                )}

                {sharingSession?.is_sharing && !sharingSession?.is_paused && (
                  <button
                    type="button"
                    onClick={sendTelemetryPing}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-xs font-mono text-[#065F46] inline-flex items-center gap-2"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Sync Location & Battery Now
                  </button>
                )}
              </div>

              <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-[#FAF7F0] border border-[#DCD2BF]">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for family live tracking invite ${sharingSession?.invite_code}`}
                    className="w-40 h-40 rounded-xl border border-[#E2D9C8]"
                  />
                ) : (
                  <QrCode className="w-24 h-24 text-[#065F46]/45" />
                )}
                <span className="text-[11px] font-mono text-[#4F6358] mt-2">
                  Scan for read-only family view
                </span>
              </div>
            </div>
          </div>

          {/* Saved Safe Zone (Geofence) Configuration */}
          <form onSubmit={handleSaveZone} className="glass-card p-6 md:p-8 border border-[#DCD2BF] space-y-5">
            <div className="flex items-center gap-3">
              <Radar className="w-5 h-5 text-[#8C6A23]" aria-hidden="true" />
              <div>
                <h3 className="font-display text-lg font-bold text-[#12231B]">Saved Safe Zone (Geofence Alerts)</h3>
                <p className="text-xs text-[#4F6358]">
                  Family members receive an immediate push alert if you leave this boundary while sharing.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="sz-name" className="text-xs text-[#4F6358] block mb-1">Zone Label</label>
                <input
                  id="sz-name"
                  type="text"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]"
                />
              </div>
              <div>
                <label htmlFor="sz-lat" className="text-xs text-[#4F6358] block mb-1">Center Latitude</label>
                <input
                  id="sz-lat"
                  type="number"
                  step="any"
                  value={zoneLat}
                  onChange={(e) => setZoneLat(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono text-[#12231B]"
                />
              </div>
              <div>
                <label htmlFor="sz-lng" className="text-xs text-[#4F6358] block mb-1">Center Longitude</label>
                <input
                  id="sz-lng"
                  type="number"
                  step="any"
                  value={zoneLng}
                  onChange={(e) => setZoneLng(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono text-[#12231B]"
                />
              </div>
              <div>
                <label htmlFor="sz-rad" className="text-xs text-[#4F6358] block mb-1">
                  Radius ({zoneRadius} m)
                </label>
                <input
                  id="sz-rad"
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={zoneRadius}
                  onChange={(e) => setZoneRadius(Number(e.target.value))}
                  className="w-full accent-[#065F46] mt-2.5"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy}
                className="min-h-[46px] px-6 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#054D39] shadow-glow-sm"
              >
                Save Safe Zone
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrMsg('');
                  if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
                    setZoneLat(stickGps.latitude.toFixed(6));
                    setZoneLng(stickGps.longitude.toFixed(6));
                    setStatusMsg('Filled Safe Zone coordinates from Smart Stick GPS.');
                    return;
                  }
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setZoneLat(pos.coords.latitude.toFixed(6));
                        setZoneLng(pos.coords.longitude.toFixed(6));
                        setStatusMsg('Filled Safe Zone coordinates from browser GPS.');
                      },
                      (err) => {
                        setErrMsg(err?.message || 'Unable to read browser GPS. Allow location permission or type coordinates manually.');
                      },
                      { enableHighAccuracy: true, timeout: 6000 }
                    );
                  } else {
                    setErrMsg('Geolocation is not supported in this browser.');
                  }
                }}
                className="min-h-[46px] px-4 py-2.5 rounded-full border border-[#D7CEBC] bg-white text-xs text-[#354B40] hover:text-[#12231B]"
              >
                Use Current GPS Coordinates
              </button>
            </div>
          </form>

          {/* Saved Places Editor (Home, Clinic, Work, Market, custom) */}
          <div className="glass-card p-6 md:p-8 border border-[#DCD2BF] space-y-5">
            <div className="flex items-center gap-3">
              <Home className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
              <div>
                <h3 className="font-display text-lg font-bold text-[#12231B]">Saved Places (Calm Arrival &amp; Departure Events)</h3>
                <p className="text-xs text-[#4F6358]">
                  Family members see friendly messages like “Reached Clinic safely” instead of raw coordinates.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {PLACE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setPlaceName(preset);
                    setPlaceCat(preset.toLowerCase());
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                    placeName === preset
                      ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                      : 'bg-white border-[#D7CEBC] text-[#4F6358]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <form onSubmit={handleSavePlace} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label htmlFor="sp-name" className="text-xs text-[#4F6358] block mb-1">Place Name</label>
                <input
                  id="sp-name"
                  required
                  value={placeName}
                  onChange={(e) => setPlaceName(e.target.value)}
                  placeholder="Home / Clinic"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]"
                />
              </div>
              <div>
                <label htmlFor="sp-lat" className="text-xs text-[#4F6358] block mb-1">Latitude</label>
                <input
                  id="sp-lat"
                  type="number"
                  step="any"
                  value={placeLat}
                  onChange={(e) => setPlaceLat(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono text-[#12231B]"
                />
              </div>
              <div>
                <label htmlFor="sp-lng" className="text-xs text-[#4F6358] block mb-1">Longitude</label>
                <input
                  id="sp-lng"
                  type="number"
                  step="any"
                  value={placeLng}
                  onChange={(e) => setPlaceLng(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono text-[#12231B]"
                />
              </div>
              <div>
                <label htmlFor="sp-rad" className="text-xs text-[#4F6358] block mb-1">Radius (m)</label>
                <input
                  id="sp-rad"
                  type="number"
                  min={40}
                  max={1500}
                  value={placeRadius}
                  onChange={(e) => setPlaceRadius(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono text-[#12231B]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrMsg('');
                    if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
                      setPlaceLat(stickGps.latitude.toFixed(6));
                      setPlaceLng(stickGps.longitude.toFixed(6));
                      setStatusMsg('Filled Saved Place coordinates from Smart Stick GPS.');
                      return;
                    }
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setPlaceLat(pos.coords.latitude.toFixed(6));
                          setPlaceLng(pos.coords.longitude.toFixed(6));
                          setStatusMsg('Filled Saved Place coordinates from browser GPS.');
                        },
                        (err) => {
                          setErrMsg(err?.message || 'Unable to read browser GPS. Allow location permission or enter coordinates manually.');
                        },
                        { enableHighAccuracy: true, timeout: 6000 }
                      );
                    } else {
                      setErrMsg('Geolocation is not supported in this browser.');
                    }
                  }}
                  className="min-h-[44px] px-3 rounded-xl border border-[#D7CEBC] bg-white text-xs text-[#354B40]"
                >
                  GPS
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#065F46] text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Save
                </button>
              </div>
            </form>

            {savedPlaces.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {savedPlaces.map((pl) => (
                  <div
                    key={pl.id}
                    className="p-3.5 rounded-2xl bg-[#FAF7F0] border border-[#E2D9C8] flex items-center justify-between gap-2"
                  >
                    <div>
                      <strong className="text-sm text-[#12231B] block">{pl.name}</strong>
                      <span className="text-[11px] font-mono text-[#4F6358]">
                        {pl.radius_m}m radius · {pl.is_currently_inside ? 'Inside now' : 'Outside'}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete saved place ${pl.name}`}
                      onClick={() => handleDeletePlace(pl.id)}
                      className="p-2 rounded-lg text-[#55685E] hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Family Members, Pending Confirmation & Granular Per-Member Permissions */}
          <div className="glass-card p-6 md:p-8 border border-[#DCD2BF] space-y-5">
            <div className="flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
              <div>
                <h3 className="font-display text-lg font-bold text-[#12231B]">Family Members &amp; Per-Member Consent</h3>
                <p className="text-xs text-[#4F6358]">
                  Confirm accepted invites and choose per family member what is shared (arrival/departure only, help alerts, unusual routes, live map).
                </p>
              </div>
            </div>

            {members.length === 0 ? (
              <p className="text-xs text-[#4F6358] bg-[#FAF7F0] p-4 rounded-xl border border-[#E2D9C8]">
                No linked family accounts yet. When a family member enters your code or scans your QR, they appear here for confirmation.
              </p>
            ) : (
              <div className="space-y-3">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-2xl bg-[#FAF7F0] border border-[#E2D9C8] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-[#12231B]">{m.family_name}</span>
                          <span className="text-xs font-mono text-[#8C6A23]">({m.relationship_label})</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                              m.status === 'pending_confirmation'
                                ? 'bg-[#FBF3DF] border-[#C59B42] text-[#7D5B1C]'
                                : m.status === 'approved'
                                ? 'bg-[#ECF7F2] border-[#065F46]/30 text-[#065F46]'
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}
                          >
                            {m.status === 'pending_confirmation' ? 'NEEDS CONFIRMATION' : m.status.toUpperCase()}
                          </span>
                          {m.telegram_connected && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#ECF7F2] border border-[#065F46]/30 text-[#065F46]">
                              <Send className="w-3 h-3" aria-hidden="true" /> Telegram Ready
                            </span>
                          )}
                        </div>
                        {m.family_email && (
                          <p className="text-xs font-mono text-[#4F6358] flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-[#065F46]" aria-hidden="true" />
                            <span>{m.family_email}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {m.status === 'pending_confirmation' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleConfirmMember(m.id, true)}
                              className="min-h-[40px] px-4 py-1.5 rounded-full bg-[#065F46] text-white text-xs font-bold"
                            >
                              Confirm Family Member
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmMember(m.id, false)}
                              className="min-h-[40px] px-4 py-1.5 rounded-full bg-white border border-red-200 text-red-700 text-xs font-semibold"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id, m.family_name)}
                          aria-label={`Remove ${m.family_name}`}
                          className="min-h-[38px] px-3 py-1.5 rounded-full bg-white border border-[#D7CEBC] text-[#55685E] hover:text-red-700 hover:border-red-200 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                        </button>
                      </div>
                    </div>

                    {m.status === 'approved' && (
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateMemberPerm(m.id, { arrival_departure_only: !m.arrival_departure_only })}
                            aria-pressed={m.arrival_departure_only}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                              m.arrival_departure_only
                                ? 'bg-[#065F46] text-white border-[#065F46]'
                                : 'bg-white border-[#D7CEBC] text-[#354B40]'
                            }`}
                          >
                            Arrival / Departure Only
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateMemberPerm(m.id, { share_arrival_departure: !m.share_arrival_departure })}
                            aria-pressed={m.share_arrival_departure}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                              m.share_arrival_departure
                                ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                                : 'bg-white border-[#D7CEBC] text-[#697D72]'
                            }`}
                          >
                            Arrivals &amp; Departures
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateMemberPerm(m.id, { share_help_requests: !m.share_help_requests })}
                            aria-pressed={m.share_help_requests}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                              m.share_help_requests
                                ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                                : 'bg-white border-[#D7CEBC] text-[#697D72]'
                            }`}
                          >
                            Help Requests
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateMemberPerm(m.id, { share_unusual_route: !m.share_unusual_route })}
                            aria-pressed={m.share_unusual_route}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                              m.share_unusual_route
                                ? 'bg-[#FBF3DF] border-[#C59B42] text-[#7D5B1C]'
                                : 'bg-white border-[#D7CEBC] text-[#697D72]'
                            }`}
                          >
                            Unusual Routes / Stops
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateMemberPerm(m.id, { share_live_map: !m.share_live_map })}
                            aria-pressed={m.share_live_map}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                              m.share_live_map
                                ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                                : 'bg-white border-[#D7CEBC] text-[#697D72]'
                            }`}
                          >
                            Live Map {m.share_live_map ? 'Allowed' : 'Hidden'}
                          </button>
                        </div>

                        <div className="pt-2 border-t border-[#E6DEC8] space-y-2">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-[#4F6358] block">
                            Delivery Channels &amp; Multi-Channel Events for {m.family_name}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              aria-pressed={m.notify_email}
                              onClick={() => handleUpdateMemberPerm(m.id, { notify_email: !m.notify_email })}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                                m.notify_email
                                  ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                                  : 'bg-white border-[#D7CEBC] text-[#697D72]'
                              }`}
                            >
                              <Mail className="w-3 h-3" /> Email {m.notify_email ? 'ON' : 'OFF'}
                            </button>
                            <button
                              type="button"
                              aria-pressed={m.notify_telegram}
                              onClick={() => handleUpdateMemberPerm(m.id, { notify_telegram: !m.notify_telegram })}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                                m.notify_telegram
                                  ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                                  : 'bg-white border-[#D7CEBC] text-[#697D72]'
                              }`}
                            >
                              <Send className="w-3 h-3" /> Telegram {m.notify_telegram ? 'ON' : 'OFF'}
                            </button>
                            <button
                              type="button"
                              aria-pressed={m.notify_web_push}
                              onClick={() => handleUpdateMemberPerm(m.id, { notify_web_push: !m.notify_web_push })}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1 ${
                                m.notify_web_push
                                  ? 'bg-[#ECF7F2] border-[#065F46] text-[#065F46]'
                                  : 'bg-white border-[#D7CEBC] text-[#697D72]'
                              }`}
                            >
                              <BellRing className="w-3 h-3" /> Push {m.notify_web_push ? 'ON' : 'OFF'}
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {[
                              ['receive_sos', 'SOS Urgent'],
                              ['receive_no_volunteer', 'No Volunteer Warning'],
                              ['receive_volunteer_accepted', 'Volunteer On Way'],
                              ['receive_help_completed', 'Help Completed'],
                              ['receive_place_arrival', 'Safe Place Arrival'],
                            ].map(([field, label]) => (
                              <button
                                key={field}
                                type="button"
                                aria-pressed={Boolean(m[field])}
                                onClick={() => handleUpdateMemberPerm(m.id, { [field]: !m[field] })}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                                  m[field]
                                    ? 'bg-[#FBF3DF] border-[#C59B42]/50 text-[#7D5B1C]'
                                    : 'bg-white border-[#DCD2BF] text-[#697D72]'
                                }`}
                              >
                                {label}: {m[field] ? 'On' : 'Off'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Multi-Channel Delivery Log (Email + Telegram + Push) */}
          <div className="glass-card p-6 md:p-8 border border-[#DCD2BF] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold text-[#12231B]">Recent Multi-Channel Alert Delivery Log</h3>
                <p className="text-xs text-[#4F6358]">
                  Audits every SOS, No-Volunteer warning, Volunteer Accepted, and Safe Place email/Telegram delivery.
                </p>
              </div>
              <button
                type="button"
                onClick={loadFamilyControls}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-[#D7CEBC] text-xs font-semibold text-[#354B40] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh Logs
              </button>
            </div>

            {deliveryLogs.length === 0 ? (
              <p className="text-xs text-[#4F6358] bg-[#FAF7F0] p-4 rounded-xl border border-[#E2D9C8]">
                No multi-channel alerts have been dispatched yet. Triggering SOS, volunteer notifications, or saved-place arrivals will log deliveries here.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {deliveryLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-[#FAF7F0] border border-[#E2D9C8] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-mono font-bold text-[#12231B]">{log.event_type}</span>
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-white border border-[#DCD2BF] font-mono text-[10px] uppercase text-[#354B40]">
                        {log.channel}
                      </span>
                      {log.destination_masked && (
                        <span className="ml-2 font-mono text-[#55685E]">{log.destination_masked}</span>
                      )}
                      {log.error_detail && (
                        <p className="text-[11px] text-red-700 mt-0.5">{log.error_detail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] border ${
                          log.status === 'sent'
                            ? 'bg-[#ECF7F2] border-[#065F46]/30 text-[#065F46]'
                            : log.status === 'failed'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-[#FBF3DF] border-[#C59B42]/40 text-[#7D5B1C]'
                        }`}
                      >
                        {log.status.toUpperCase()} ({log.attempt_count || 1}x)
                      </span>
                      <span className="text-[11px] text-[#55685E]">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quiet Hours, Caregiver Management & Privacy Data Retention */}
          <div className="grid lg:grid-cols-2 gap-6">
            <form onSubmit={handleSavePrivacyAndCaregiver} className="glass-card p-6 border border-[#DCD2BF] space-y-4">
              <div className="flex items-center gap-2.5">
                <Moon className="w-5 h-5 text-[#8C6A23]" aria-hidden="true" />
                <div>
                  <h3 className="font-display text-lg font-bold text-[#12231B]">Quiet Hours &amp; Caregiver Mode</h3>
                  <p className="text-xs text-[#4F6358]">
                    Routine updates stay quiet during rest hours. Urgent SOS, falls, &amp; no-reply alerts always bypass.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-[#FAF7F0] border border-[#E2D9C8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={quietEnabled}
                  onChange={(e) => setQuietEnabled(e.target.checked)}
                  className="w-5 h-5 accent-[#065F46]"
                />
                <span className="text-sm font-medium text-[#12231B]">Enable Quiet Hours</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="qh-start" className="text-xs text-[#4F6358] block mb-1">Start (24h)</label>
                  <input
                    id="qh-start"
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="qh-end" className="text-xs text-[#4F6358] block mb-1">End (24h)</label>
                  <input
                    id="qh-end"
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-[#FAF7F0] border border-[#E2D9C8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={caregiverManaged}
                  onChange={(e) => setCaregiverManaged(e.target.checked)}
                  className="w-5 h-5 accent-[#065F46]"
                />
                <span className="text-sm font-medium text-[#12231B]">Managed by Caregiver on user’s behalf</span>
              </label>

              {caregiverManaged && (
                <input
                  type="text"
                  value={caregiverName}
                  onChange={(e) => setCaregiverName(e.target.value)}
                  placeholder="Caregiver Name (shown transparently to family)"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B]"
                />
              )}

              <button
                type="submit"
                disabled={busy}
                className="min-h-[46px] px-6 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#054D39]"
              >
                Save Quiet Hours &amp; Caregiver Mode
              </button>
            </form>

            <div className="glass-card p-6 border border-[#DCD2BF] flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <h3 className="font-display text-lg font-bold text-[#12231B] flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
                  Location Encryption &amp; Data Retention
                </h3>
                <p className="text-sm text-[#354B40] leading-relaxed">
                  All stored GPS coordinates are <strong>encrypted at rest</strong>. Raw location points are automatically pruned after{' '}
                  <strong>{sharingSession?.raw_retention_days || 7} days</strong> — preserving only calm timeline summaries.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-red-50/75 border border-red-200 space-y-3">
                <p className="text-xs text-red-900 font-medium">
                  Want a clean slate right now? Delete every stored GPS breadcrumb and learned route corridor with one tap.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDeleteHistory}
                  className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete my location history</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-8 glass-card p-6 border border-[#DCD2BF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#12231B]">Configure Live Family Sharing & QR Code</h2>
            <p className="text-sm text-[#4F6358] mt-1">
              Sign in as a User to generate your family invite link & QR code, or open a tracking link directly.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/login?role=blind_user&redirect=/contacts"
              className="min-h-[46px] px-5 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-xs inline-flex items-center gap-2 hover:bg-[#054D39] shadow-glow-sm"
            >
              <LogIn className="w-4 h-4" /> User Sign In
            </Link>
            <Link
              to="/family/track"
              className="min-h-[46px] px-5 py-2.5 rounded-full border border-[#D7CEBC] bg-white text-[#12231B] text-xs font-semibold inline-flex items-center gap-2 hover:border-[#065F46]/40"
            >
              Open Family Tracker
            </Link>
          </div>
        </div>
      )}

      {/* Synced Emergency Contact Directory */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[#12231B]">Emergency Contact Directory</h2>
          <p className="text-xs text-[#4F6358]">Synced with your SOS Safety Mesh speed-dial numbers</p>
        </div>
        <Link
          to="/safety"
          className="px-4 py-2 rounded-full bg-white border border-[#D7CEBC] text-xs font-semibold text-[#065F46] hover:border-[#065F46]"
        >
          Manage Numbers on Safety Mesh →
        </Link>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {directoryContacts.map((c) => (
          <div
            key={c.id}
            className="glass-card p-6 flex flex-col justify-between group hover:border-[#065F46]/35 transition-all"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-[#F6F1E6] border border-[#E2D9C8] flex items-center justify-center text-2xl">
                  {c.avatar || '👤'}
                </div>
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-[#ECF7F2] text-[#065F46] border border-[#065F46]/25">
                  {c.priority ? 'PRIMARY' : 'SPEED DIAL'}
                </span>
              </div>
              <h3 className="font-display text-xl font-bold text-[#12231B]">{c.name}</h3>
              <span className="text-xs font-medium text-[#8C6A23] block mb-4">{c.category || c.relation || 'Emergency'}</span>
              <div className="space-y-2 text-xs text-[#4F6358] mb-5">
                <div className="flex items-center gap-2 font-mono text-[#354B40]">
                  <Phone className="w-3.5 h-3.5 text-[#065F46]" /> {c.phone}
                </div>
              </div>
            </div>
            <a
              href={`tel:${c.phone}`}
              className="w-full min-h-[44px] rounded-xl bg-[#065F46] hover:bg-[#054D39] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Phone className="w-4 h-4" /> Call {c.name}
            </a>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
