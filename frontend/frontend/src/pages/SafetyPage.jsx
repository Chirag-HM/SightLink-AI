import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, AlertCircle, Share2, Users, PhoneCall,
  BellRing, Check, Plus, Trash2, Phone, Volume2, VolumeX,
  Radio, X, ExternalLink, MapPin, MessageSquare, CheckCircle2,
  XCircle, Send, Mail
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useAuth } from '../context/AuthContext';
import useStickGps from '../hooks/useStickGps';
import { sosSiren } from '../utils/sosSound';
import { triggerHaptic } from '../utils/haptics';
import { safetyApiService, telegramService, familyService, systemService } from '../services/api';

const INITIAL_CONTACTS = [
  {
    id: 'c-1',
    name: 'Amma (Mother)',
    category: 'Parents',
    phone: '+91 98765 43210',
    priority: true,
    autoSms: true,
    avatar: '👩',
    color: '#065F46'
  },
  {
    id: 'c-2',
    name: 'Appa (Father)',
    category: 'Parents',
    phone: '+91 98765 43211',
    priority: true,
    autoSms: true,
    avatar: '👨',
    color: '#047857'
  },
  {
    id: 'c-3',
    name: 'Raj (Brother)',
    category: 'Family',
    phone: '+91 87654 32109',
    priority: false,
    autoSms: true,
    avatar: '👦',
    color: '#8C6A23'
  },
  {
    id: 'c-police',
    name: 'Police Emergency Response',
    category: 'Police',
    phone: '112',
    priority: true,
    autoSms: false,
    avatar: '🚓',
    color: '#8C6A23'
  },
  {
    id: 'c-fire',
    name: 'Fire & Rescue Services',
    category: 'Firefighters',
    phone: '101',
    priority: false,
    autoSms: false,
    avatar: '🚒',
    color: '#dc2626'
  },
  {
    id: 'c-ambulance',
    name: 'Ambulance & Medical Emergency',
    category: 'Ambulance',
    phone: '108',
    priority: false,
    autoSms: false,
    avatar: '🚑',
    color: '#065F46'
  }
];

const CATEGORY_COLORS = {
  Parents: 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/25',
  Family: 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]/30',
  Police: 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]/30',
  Firefighters: 'bg-red-50 text-red-700 border-red-200',
  Ambulance: 'bg-[#ECF7F2] text-[#047857] border-[#065F46]/25',
  Doctor: 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/25',
  Other: 'bg-[#F4EFE4] text-[#354B40] border-[#DCD2BF]'
};

export default function SafetyPage() {
  const { user } = useAuth();
  const { location: stickGps } = useStickGps();

  const [sosActive, setSosActive] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sosResult, setSosResult] = useState(null);
  const [sosError, setSosError] = useState('');
  const [capturedCoords, setCapturedCoords] = useState(null);
  const [channelStatus, setChannelStatus] = useState({
    loaded: false,
    telegramConnected: false,
    telegramUsername: null,
    approvedGuardians: 0,
    pendingGuardians: 0,
    gmailConfigured: false,
    hubHealthy: null,
  });

  const stepTimerRef = useRef(null);

  const [contacts, setContacts] = useState(() => {
    try {
      const saved = localStorage.getItem('sightlink_sos_contacts');
      return saved ? JSON.parse(saved) : INITIAL_CONTACTS;
    } catch {
      return INITIAL_CONTACTS;
    }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    category: 'Parents',
    phone: '',
    priority: false,
    autoSms: true
  });

  // Load real backend notification readiness (Telegram + Family Guardians + Mail)
  useEffect(() => {
    let active = true;
    const loadReadiness = async () => {
      try {
        const [health, tg, members] = await Promise.all([
          systemService.getHealth().catch(() => null),
          user ? telegramService.getStatus().catch(() => null) : Promise.resolve(null),
          user?.role === 'blind_user' ? familyService.getMembers().catch(() => []) : Promise.resolve([]),
        ]);
        if (!active) return;
        const memberList = Array.isArray(members) ? members : [];
        setChannelStatus({
          loaded: true,
          telegramConnected: Boolean(tg?.connected),
          telegramUsername: tg?.telegram_username || null,
          approvedGuardians: memberList.filter((m) => m.status === 'approved').length,
          pendingGuardians: memberList.filter((m) => m.status === 'pending_confirmation').length,
          gmailConfigured: Boolean(health?.gmail_configured),
          hubHealthy: health?.status === 'healthy',
        });
      } catch {
        if (active) setChannelStatus((prev) => ({ ...prev, loaded: true }));
      }
    };
    loadReadiness();
    return () => {
      active = false;
    };
  }, [user]);

  // Save contacts to localStorage & notify sibling pages
  useEffect(() => {
    try {
      localStorage.setItem('sightlink_sos_contacts', JSON.stringify(contacts));
      window.dispatchEvent(new Event('sightlink:contacts-updated'));
    } catch (e) {
      console.error(e);
    }
  }, [contacts]);

  // Clean up siren and step interval if unmounting
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      sosSiren.stopSiren();
    };
  }, []);

  const buildLocalFallback = (lat, lng, batteryVal) => {
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const mapsUrl = hasCoords ? `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}` : null;
    const body = `EMERGENCY SOS! Need help immediately.${mapsUrl ? ` Live location: ${mapsUrl}` : ''}${
      batteryVal != null ? ` (Battery: ${batteryVal}%)` : ''
    }`;
    const encoded = encodeURIComponent(body);
    return {
      google_maps_url: mapsUrl,
      sms_body: body,
      sms_fallback_url: `sms:?body=${encoded}`,
      whatsapp_fallback_url: `https://wa.me/?text=${encoded}`,
    };
  };

  const resolveSosCoords = () => {
    return new Promise((resolve) => {
      if (stickGps?.fix && Number.isFinite(stickGps.latitude) && Number.isFinite(stickGps.longitude)) {
        resolve({ latitude: stickGps.latitude, longitude: stickGps.longitude, accuracy: null, source: 'Smart Stick GPS' });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              source: 'Browser GPS',
            }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 3500 }
        );
      } else {
        resolve(null);
      }
    });
  };

  const triggerSOS = async () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setSosError('');
    setSosResult(null);
    setSosActive(true);
    setActiveStep(0);
    triggerHaptic('sos');
    if (soundEnabled) {
      sosSiren.startSiren(0.35);
    }

    let s = 0;
    stepTimerRef.current = setInterval(() => {
      s += 1;
      setActiveStep(s);
      triggerHaptic('tap');
      if (soundEnabled) {
        sosSiren.playStepChime(880 + s * 120);
      }
      if (s >= 4 && stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    }, 800);

    let batteryLevel = null;
    try {
      if (navigator.getBattery) {
        const bat = await navigator.getBattery();
        batteryLevel = Math.round((bat.level || 0) * 100);
      }
    } catch {
      // battery API optional
    }

    const coords = await resolveSosCoords();
    if (coords) {
      setCapturedCoords(coords);
    }

    const localFallback = buildLocalFallback(coords?.latitude, coords?.longitude, batteryLevel);
    setSosResult(localFallback);

    try {
      const res = await safetyApiService.triggerSos({
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        battery_level: batteryLevel,
        source: 'safety_page',
        notes: 'SOS emergency triggered from Safety Mesh page',
      });
      setSosResult({ ...localFallback, ...res });
      setChannelStatus((prev) => ({
        ...prev,
        approvedGuardians: res.approved_guardians_count ?? prev.approvedGuardians,
        pendingGuardians: res.pending_guardians_count ?? prev.pendingGuardians,
        telegramConnected: res.self_telegram_connected ?? prev.telegramConnected,
        telegramUsername: res.self_telegram_username ?? prev.telegramUsername,
      }));
    } catch (err) {
      setSosError(err.message || 'Unable to send cloud SOS alerts. Use the SMS or WhatsApp emergency links below.');
    }
  };

  const resetSOS = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setSosActive(false);
    setActiveStep(0);
    setSosError('');
    triggerHaptic('cancel');
    sosSiren.stopSiren();
    safetyApiService.resolveSos().catch(() => {});
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (!next && sosActive) {
      sosSiren.stopSiren();
    } else if (next && sosActive) {
      sosSiren.startSiren(0.35);
    }
  };

  const handleAddContact = (e) => {
    e.preventDefault();
    if (!newContact.name.trim() || !newContact.phone.trim()) return;

    const avatars = {
      Parents: '👨‍👩‍👧',
      Family: '🤝',
      Police: '🚓',
      Firefighters: '🚒',
      Ambulance: '🚑',
      Doctor: '🩺',
      Other: '👤'
    };

    const contact = {
      id: `c-${Date.now()}`,
      name: newContact.name.trim(),
      category: newContact.category,
      phone: newContact.phone.trim(),
      priority: newContact.priority,
      autoSms: newContact.autoSms,
      avatar: avatars[newContact.category] || '👤',
      color: '#065F46'
    };

    setContacts(prev => [contact, ...prev]);
    setNewContact({
      name: '',
      category: 'Parents',
      phone: '',
      priority: false,
      autoSms: true
    });
    setIsModalOpen(false);
  };

  const handleDeleteContact = (id) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const handleAddPreset = (preset) => {
    const exists = contacts.some(c => c.phone === preset.phone);
    if (exists) {
      setSosError(`${preset.name} (${preset.phone}) is already in your emergency contacts list.`);
      return;
    }
    setContacts(prev => [...prev, { ...preset, id: `c-${Date.now()}` }]);
  };

  const sentDeliveries = (sosResult?.channel_deliveries || []).filter((d) => d.status === 'sent');
  const failedDeliveries = (sosResult?.channel_deliveries || []).filter((d) => d.status === 'failed');

  const steps = [
    {
      icon: Share2,
      title: 'GPS Coordinates Captured',
      desc: capturedCoords
        ? `${capturedCoords.source}: ${capturedCoords.latitude.toFixed(4)}° N, ${capturedCoords.longitude.toFixed(4)}° E${
            capturedCoords.accuracy ? ` (±${Math.round(capturedCoords.accuracy)}m)` : ''
          }`
        : 'Using last saved cloud location (enable GPS or stick fix for live pin)'
    },
    {
      icon: BellRing,
      title: 'Telegram & Email Dispatch',
      desc: sosResult?.message
        ? sosResult.message
        : `Ready for ${channelStatus.telegramConnected ? `Telegram (@${channelStatus.telegramUsername || 'linked'})` : 'Email'}${
            channelStatus.approvedGuardians > 0 ? ` + ${channelStatus.approvedGuardians} guardian(s)` : ''
          }`
    },
    {
      icon: Users,
      title: 'Family Guardian Network',
      desc: channelStatus.approvedGuardians > 0
        ? `Notifying ${channelStatus.approvedGuardians} approved family guardian(s)`
        : '0 approved family guardians linked yet — alerts sent to your own connected channels'
    },
    {
      icon: PhoneCall,
      title: 'Manual SMS & Voice Escalation',
      desc: `Primary speed dial: ${contacts.find(c => c.priority)?.name || 'Police (112)'}`
    },
  ];

  return (
    <DashboardShell
      title="SOS & Safety Mesh"
      subtitle="Coordinate emergency siren, real Telegram/Email/Push alerts, and free SMS or WhatsApp location fallbacks"
      icon={ShieldCheck}
    >
      <EmailVerificationBanner className="mb-6" />

      {sosError && (
        <div role="alert" className="mb-6 p-4 rounded-2xl bg-red-50 border-2 border-red-300 text-sm text-red-900 font-medium flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{sosError}</span>
        </div>
      )}

      {/* Real Alert Channel Readiness Banner */}
      {channelStatus.loaded && (
        <div className="mb-6 glass-card p-4 border-[#DCD2BF] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-mono font-bold uppercase tracking-wider text-[#4F6358]">Alert Readiness:</span>
            <span className={`px-2.5 py-1 rounded-full font-mono border inline-flex items-center gap-1 ${
              channelStatus.telegramConnected
                ? 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/25'
                : 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]/35'
            }`}>
              <Send className="w-3 h-3" />
              {channelStatus.telegramConnected
                ? `Telegram Linked${channelStatus.telegramUsername ? ` (@${channelStatus.telegramUsername})` : ''}`
                : 'Telegram Not Linked'}
            </span>
            <span className={`px-2.5 py-1 rounded-full font-mono border inline-flex items-center gap-1 ${
              channelStatus.approvedGuardians > 0
                ? 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/25'
                : 'bg-[#FBF3DF] text-[#7D5B1C] border-[#C59B42]/35'
            }`}>
              <Users className="w-3 h-3" />
              {channelStatus.approvedGuardians} Approved Guardian{channelStatus.approvedGuardians === 1 ? '' : 's'}
              {channelStatus.pendingGuardians > 0 ? ` (${channelStatus.pendingGuardians} pending)` : ''}
            </span>
            <span className={`px-2.5 py-1 rounded-full font-mono border inline-flex items-center gap-1 ${
              channelStatus.gmailConfigured
                ? 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/25'
                : 'bg-[#F4EFE4] text-[#4F6358] border-[#DCD2BF]'
            }`}>
              <Mail className="w-3 h-3" />
              Email {channelStatus.gmailConfigured ? 'Ready' : 'Not Configured'}
            </span>
          </div>
          <Link
            to="/contacts"
            className="px-3.5 py-1.5 rounded-full bg-[#065F46] text-white text-xs font-semibold hover:bg-[#054D39] transition-colors"
          >
            {channelStatus.approvedGuardians === 0 || !channelStatus.telegramConnected ? 'Configure Guardians & Telegram →' : 'Manage Guardians →'}
          </Link>
        </div>
      )}

      {/* Sound & Siren Banner */}
      <div className="glass-card p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-red-200 bg-red-50/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
            <Radio className="w-5 h-5 text-red-600 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#12231B] flex items-center gap-2">
              Audible Emergency Siren
              {sosActive && (
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              )}
            </h3>
            <p className="text-xs text-[#4F6358]">
              High-intensity dual-frequency acoustic alarm for nearby bystander awareness
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleSound}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all border ${
              soundEnabled
                ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                : 'bg-[#F6F1E6] text-[#4F6358] border-[#DCD2BF] hover:text-[#12231B]'
            }`}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-4 h-4" /> Siren: ON
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4" /> Siren: MUTED
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Interactive SOS Trigger (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card p-8 text-center relative overflow-hidden border-red-200">
            {sosActive && (
              <motion.div
                className="absolute inset-0 bg-red-500/10 pointer-events-none"
                animate={{ opacity: [0.1, 0.25, 0.1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}

            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] font-mono text-[#4F6358] uppercase tracking-widest">
                TACTILE EMERGENCY TRIGGER
              </span>
              <span className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
                sosActive
                  ? 'bg-red-600 text-white border-red-600 animate-pulse'
                  : 'bg-[#F6F1E6] text-[#4F6358] border-[#DCD2BF]'
              }`}>
                {sosActive ? '● BROADCASTING LIVE' : '○ STANDBY'}
              </span>
            </div>

            {/* Pulsing Emergency SOS Button */}
            <div className="relative w-48 h-48 mx-auto mb-6">
              {sosActive && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-red-500/40"
                    animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border border-red-500/30"
                    animate={{ scale: [1, 2.3], opacity: [0.5, 0] }}
                    transition={{ duration: 1.8, delay: 0.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                </>
              )}

              <button
                type="button"
                onClick={sosActive ? resetSOS : triggerSOS}
                className={`relative z-10 w-full h-full rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-lg focus:outline-none focus:ring-4 focus:ring-red-500/40 group ${
                  sosActive
                    ? 'bg-gradient-to-b from-red-600 via-rose-600 to-red-700 text-white shadow-[0_0_50px_rgba(220,38,38,0.45)] scale-105'
                    : 'bg-red-50 hover:bg-red-100 border-2 border-red-300 hover:border-red-500 text-red-700 hover:shadow-[0_0_25px_rgba(220,38,38,0.2)]'
                }`}
                aria-label={sosActive ? 'Deactivate SOS Emergency' : 'Activate SOS Emergency'}
              >
                <AlertCircle className={`w-12 h-12 mb-1 transition-transform group-hover:scale-110 ${
                  sosActive ? 'text-white animate-bounce' : 'text-red-600'
                }`} />
                <span className={`font-display font-black text-2xl tracking-wider ${sosActive ? 'text-white' : 'text-red-800'}`}>
                  {sosActive ? 'ACTIVE' : 'SOS'}
                </span>
                <span className={`text-[10px] font-mono tracking-widest mt-1 ${sosActive ? 'text-white/90' : 'text-red-700/80'}`}>
                  {sosActive ? 'TAP TO RESET' : 'TAP TO TRIGGER'}
                </span>
              </button>
            </div>

            {/* Live Sequential Response Protocol */}
            <div className="space-y-2 text-left pt-2">
              {steps.map((s, i) => {
                const Icon = s.icon;
                const done = sosActive && activeStep > i;
                const current = sosActive && activeStep === i + 1;
                return (
                  <motion.div
                    key={s.title}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      done
                        ? 'bg-red-50 border-red-300 text-[#12231B]'
                        : current
                        ? 'bg-red-100/70 border-red-400 shadow-sm'
                        : 'bg-[#F6F1E6] border-[#E2D9C8] opacity-75'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                        done
                          ? 'bg-red-600 text-white'
                          : current
                          ? 'bg-red-200 text-red-700 animate-pulse'
                          : 'bg-white border border-[#DCD2BF] text-[#697D72]'
                      }`}
                    >
                      {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-[#12231B] block">
                        {s.title}
                      </span>
                      <span className="text-[11px] text-[#4F6358] leading-tight">
                        {s.desc}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Real Backend Channel Delivery Breakdown */}
            {sosResult?.channel_deliveries && (
              <div className="mt-5 pt-4 border-t border-[#E2D9C8] text-left space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#12231B] font-semibold">
                    Live Cloud Delivery Report
                  </span>
                  <span className="text-[11px] font-mono text-[#065F46]">
                    {sentDeliveries.length} sent · {failedDeliveries.length} failed
                  </span>
                </div>
                {sosResult.channel_deliveries.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/40 text-xs text-[#7D5B1C]">
                    No automated external channels fired.{' '}
                    <Link to="/contacts" className="underline font-bold text-[#065F46]">
                      Connect Telegram or approve a Family Guardian
                    </Link>
                    , or use SMS / WhatsApp below.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {sosResult.channel_deliveries.map((d, idx) => (
                      <div
                        key={`${d.channel}-${d.recipient_user_id}-${idx}`}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                          d.status === 'sent'
                            ? 'bg-[#ECF7F2] border-[#065F46]/25 text-[#065F46]'
                            : d.status === 'failed'
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : 'bg-[#F6F1E6] border-[#DCD2BF] text-[#4F6358]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {d.status === 'sent' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span className="font-mono font-bold uppercase">{d.channel}</span>
                          <span className="truncate text-[11px]">
                            ({d.recipient_scope === 'self' ? 'Your Account' : 'Guardian'}{d.destination && d.destination !== 'none' ? ` · ${d.destination}` : ''})
                          </span>
                        </div>
                        <span className="font-mono text-[10px] uppercase shrink-0 font-bold">
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Free Emergency Fallback Actions (SMS, WhatsApp, Google Maps) */}
            {(sosActive || sosResult) && (
              <div className="mt-5 pt-4 border-t border-[#E2D9C8] text-left space-y-2.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#7D5B1C] font-semibold block">
                  Free Device Fallbacks (SMS · WhatsApp · Live Maps)
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {sosResult?.sms_fallback_url && (
                    <a
                      href={sosResult.sms_fallback_url}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#065F46] text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#054D39] shadow-sm"
                    >
                      <MessageSquare className="w-4 h-4" aria-hidden="true" />
                      <span>Send Free SMS with Live Location</span>
                    </a>
                  )}
                  {sosResult?.whatsapp_fallback_url && (
                    <a
                      href={sosResult.whatsapp_fallback_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#FBF3DF] border border-[#C59B42]/50 text-[#7D5B1C] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#F5E8C6]"
                    >
                      <Share2 className="w-4 h-4" aria-hidden="true" />
                      <span>Share Live Location via WhatsApp</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                  {sosResult?.google_maps_url && (
                    <a
                      href={sosResult.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-[#D7CEBC] text-[#12231B] font-semibold text-xs flex items-center justify-center gap-2 hover:border-[#065F46]"
                    >
                      <MapPin className="w-3.5 h-3.5 text-[#065F46]" aria-hidden="true" />
                      <span>Open Google Maps Pin</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Emergency Phone Directory & Contacts (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#E2D9C8]">
              <div>
                <h3 className="font-display font-bold text-[#12231B] text-lg flex items-center gap-2">
                  Emergency Phone Directory
                  <span className="text-xs font-mono font-semibold text-[#065F46] bg-[#ECF7F2] px-2.5 py-0.5 rounded-full border border-[#065F46]/25">
                    {contacts.length} Saved
                  </span>
                </h3>
                <p className="text-xs text-[#4F6358]">
                  Tap Call or SMS to message personal speed-dial numbers directly from your device
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#065F46] hover:bg-[#054D39] text-white font-semibold text-xs transition-all shadow-glow-sm shrink-0"
              >
                <Plus className="w-4 h-4 text-white" /> Add Number
              </button>
            </div>

            {/* Quick-Add Official Emergency Presets */}
            <div className="mb-6">
              <span className="text-[10px] font-mono text-[#697D72] uppercase tracking-wider block mb-2">
                Quick-Add Official Emergency Authorities:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleAddPreset({
                    name: 'Police Emergency Response',
                    category: 'Police',
                    phone: '112',
                    priority: true,
                    autoSms: false,
                    avatar: '🚓',
                    color: '#8C6A23'
                  })}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-[#FBF3DF] hover:bg-[#F5E8C6] border border-[#C59B42]/30 text-[#7D5B1C] text-xs font-mono transition-all text-left"
                >
                  <span className="text-base">🚓</span>
                  <div>
                    <span className="font-bold block">Police (112)</span>
                    <span className="text-[9px] text-[#4F6358]">Emergency Dispatch</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset({
                    name: 'Fire & Rescue Service',
                    category: 'Firefighters',
                    phone: '101',
                    priority: false,
                    autoSms: false,
                    avatar: '🚒',
                    color: '#dc2626'
                  })}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-mono transition-all text-left"
                >
                  <span className="text-base">🚒</span>
                  <div>
                    <span className="font-bold block">Fire Rescue (101)</span>
                    <span className="text-[9px] text-[#4F6358]">Hazard Response</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset({
                    name: 'Ambulance & Paramedics',
                    category: 'Ambulance',
                    phone: '108',
                    priority: false,
                    autoSms: false,
                    avatar: '🚑',
                    color: '#065F46'
                  })}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-[#ECF7F2] hover:bg-[#DCF1E7] border border-[#065F46]/25 text-[#065F46] text-xs font-mono transition-all text-left"
                >
                  <span className="text-base">🚑</span>
                  <div>
                    <span className="font-bold block">Ambulance (108)</span>
                    <span className="text-[9px] text-[#4F6358]">Medical Trauma</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Contacts Cards List */}
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {contacts.map((contact) => {
                const cleanPhone = String(contact.phone || '').replace(/\s+/g, '');
                const smsHref = sosResult?.sms_body
                  ? `sms:${cleanPhone}?body=${encodeURIComponent(sosResult.sms_body)}`
                  : `sms:${cleanPhone}`;
                return (
                  <div
                    key={contact.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      sosActive
                        ? 'border-red-300 bg-red-50/70'
                        : 'bg-[#F6F1E6] border-[#E2D9C8] hover:border-[#065F46]/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-[#DCD2BF] flex items-center justify-center text-xl shrink-0">
                        {contact.avatar}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#12231B]">
                            {contact.name}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            CATEGORY_COLORS[contact.category] || CATEGORY_COLORS.Other
                          }`}>
                            {contact.category}
                          </span>
                          {contact.priority && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#FBF3DF] text-[#7D5B1C] border border-[#C59B42]/35">
                              Primary
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs font-mono text-[#4F6358]">
                          <span>{contact.phone}</span>
                          {contact.autoSms && (
                            <span className="text-[10px] text-[#065F46] font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Quick-SMS Ready
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Call, SMS & Remove */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {contact.autoSms && (
                        <a
                          href={smsHref}
                          className="p-2 rounded-lg bg-[#FBF3DF] hover:bg-[#F5E8C6] border border-[#C59B42]/40 text-[#7D5B1C] transition-all flex items-center gap-1 text-xs font-mono"
                          title={`Send SMS to ${contact.name}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">SMS</span>
                        </a>
                      )}
                      <a
                        href={`tel:${contact.phone}`}
                        className="p-2 rounded-lg bg-[#065F46] hover:bg-[#054D39] text-white transition-all flex items-center gap-1 text-xs font-mono"
                        title={`Call ${contact.name}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Call</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-2 rounded-lg bg-white border border-[#DCD2BF] hover:bg-red-50 hover:border-red-200 hover:text-red-700 text-[#697D72] transition-colors"
                        title="Remove contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Community & Cloud Hub status */}
          <div className="glass-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#065F46]" />
              </div>
              <div>
                <span className="text-sm font-semibold text-[#12231B] block">
                  SightLink Cloud &amp; Volunteer Dispatch
                </span>
                <span className="text-xs text-[#4F6358]">
                  {channelStatus.hubHealthy === false
                    ? 'Backend unreachable — device SMS/Call fallbacks active'
                    : 'Request nearby volunteer escort anytime on the Assistance page'}
                </span>
              </div>
            </div>
            <Link
              to="/assist"
              className={`px-3 py-1.5 rounded-full text-xs font-mono font-semibold border ${
                channelStatus.hubHealthy === false
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-[#ECF7F2] text-[#065F46] border-[#065F46]/25 hover:bg-[#DCF1E7]'
              }`}
            >
              {channelStatus.hubHealthy === false ? '○ OFFLINE' : '● OPEN ASSIST'}
            </Link>
          </div>
        </div>
      </div>

      {/* Add Contact Modal Dialog */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#12231B]/35 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="glass-card max-w-md w-full p-6 md:p-8 border-[#DCD2BF] bg-[#FAF7F0] shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-[#E2D9C8]">
                <h4 className="font-display font-bold text-[#12231B] text-lg">
                  Add Emergency Contact
                </h4>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-[#697D72] hover:text-[#12231B]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddContact} className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-[#4F6358] block mb-1">
                    Contact Name / Authority
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mom, Dad, Police Station, Doctor"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    className="w-full bg-white border border-[#D7CEBC] rounded-xl px-4 py-2.5 text-sm text-[#12231B] placeholder:text-[#697D72] outline-none focus:border-[#065F46]"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-[#4F6358] block mb-1">
                    Relationship / Authority Category
                  </label>
                  <select
                    value={newContact.category}
                    onChange={(e) => setNewContact({ ...newContact, category: e.target.value })}
                    className="w-full bg-white border border-[#D7CEBC] rounded-xl px-4 py-2.5 text-sm text-[#12231B] outline-none focus:border-[#065F46]"
                  >
                    <option value="Parents">Parents (Mom / Dad)</option>
                    <option value="Family">Family Member / Guardian</option>
                    <option value="Police">Police Department (112 / 100)</option>
                    <option value="Firefighters">Firefighters &amp; Rescue (101)</option>
                    <option value="Ambulance">Ambulance &amp; Paramedics (108)</option>
                    <option value="Doctor">Personal Doctor / Clinic</option>
                    <option value="Other">Other Emergency Contact</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-[#4F6358] block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +91 98765 43210 or 112"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    className="w-full bg-white border border-[#D7CEBC] rounded-xl px-4 py-2.5 text-sm text-[#12231B] placeholder:text-[#697D72] outline-none focus:border-[#065F46] font-mono"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-[#E2D9C8]">
                  <label className="flex items-center gap-3 cursor-pointer text-xs text-[#354B40]">
                    <input
                      type="checkbox"
                      checked={newContact.autoSms}
                      onChange={(e) => setNewContact({ ...newContact, autoSms: e.target.checked })}
                      className="accent-[#065F46] w-4 h-4 rounded"
                    />
                    <span>Show Quick-SMS location link for this contact during SOS</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer text-xs text-[#354B40]">
                    <input
                      type="checkbox"
                      checked={newContact.priority}
                      onChange={(e) => setNewContact({ ...newContact, priority: e.target.checked })}
                      className="accent-[#8C6A23] w-4 h-4 rounded"
                    />
                    <span>Set as primary voice call contact</span>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[#F6F1E6] hover:bg-[#EBE3D3] border border-[#DCD2BF] text-[#354B40] text-xs font-mono transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-[#065F46] hover:bg-[#054D39] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-glow-sm"
                  >
                    Save Contact
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}
