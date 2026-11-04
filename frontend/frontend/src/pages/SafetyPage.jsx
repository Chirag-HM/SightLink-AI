import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, AlertCircle, Share2, Users, PhoneCall,
  BellRing, Check, Plus, Trash2, Phone, Volume2, VolumeX,
  Flame, ShieldAlert, HeartPulse, UserCheck, Radio, X,
  ExternalLink, MapPin
} from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { mockVolunteers, mockGPS } from '../utils/mockData';
import { sosSiren } from '../utils/sosSound';

const INITIAL_CONTACTS = [
  {
    id: 'c-1',
    name: 'Amma (Mother)',
    category: 'Parents',
    phone: '+91 98765 43210',
    priority: true,
    autoSms: true,
    avatar: '👩',
    color: '#00d4ff'
  },
  {
    id: 'c-2',
    name: 'Appa (Father)',
    category: 'Parents',
    phone: '+91 98765 43211',
    priority: true,
    autoSms: true,
    avatar: '👨',
    color: '#3b82f6'
  },
  {
    id: 'c-3',
    name: 'Raj (Brother)',
    category: 'Family',
    phone: '+91 87654 32109',
    priority: false,
    autoSms: true,
    avatar: '👦',
    color: '#8b5cf6'
  },
  {
    id: 'c-police',
    name: 'Police Emergency Response',
    category: 'Police',
    phone: '112',
    priority: true,
    autoSms: true,
    avatar: '🚓',
    color: '#3b82f6'
  },
  {
    id: 'c-fire',
    name: 'Fire & Rescue Services',
    category: 'Firefighters',
    phone: '101',
    priority: false,
    autoSms: true,
    avatar: '🚒',
    color: '#ef4444'
  },
  {
    id: 'c-ambulance',
    name: 'Ambulance & Medical Emergency',
    category: 'Ambulance',
    phone: '108',
    priority: false,
    autoSms: true,
    avatar: '🚑',
    color: '#10b981'
  }
];

const CATEGORY_COLORS = {
  Parents: 'bg-cyan-500/10 text-accent-cyan border-cyan-500/30',
  Family: 'bg-violet-500/10 text-accent-violet border-violet-500/30',
  Police: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  Firefighters: 'bg-red-500/10 text-red-400 border-red-500/30',
  Ambulance: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  Doctor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  Other: 'bg-white/10 text-white border-white/20'
};

export default function SafetyPage() {
  const [sosActive, setSosActive] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
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

  // Save contacts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sightlink_sos_contacts', JSON.stringify(contacts));
    } catch (e) {
      console.error(e);
    }
  }, [contacts]);

  // Clean up siren if unmounting
  useEffect(() => {
    return () => {
      sosSiren.stopSiren();
    };
  }, []);

  const triggerSOS = () => {
    setSosActive(true);
    if (soundEnabled) {
      sosSiren.startSiren(0.35);
    }

    let s = 0;
    const interval = setInterval(() => {
      s++;
      setActiveStep(s);
      if (soundEnabled) {
        sosSiren.playStepChime(880 + s * 120);
      }
      if (s >= 4) {
        clearInterval(interval);
      }
    }, 900);
  };

  const resetSOS = () => {
    setSosActive(false);
    setActiveStep(0);
    sosSiren.stopSiren();
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
      color: '#00d4ff'
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
      alert(`${preset.name} (${preset.phone}) is already in your emergency contacts list.`);
      return;
    }
    setContacts(prev => [...prev, { ...preset, id: `c-${Date.now()}` }]);
  };

  const steps = [
    {
      icon: Share2,
      title: 'GPS Coordinates Broadcast',
      desc: `Pinned at ${mockGPS.latitude.toFixed(4)}° N, ${mockGPS.longitude.toFixed(4)}° E with accuracy ±${mockGPS.accuracy}m`
    },
    {
      icon: BellRing,
      title: 'Emergency SMS Dispatched',
      desc: `Alerting ${contacts.filter(c => c.autoSms).length} emergency guardians & first responders`
    },
    {
      icon: Users,
      title: 'Volunteer Network Beacon',
      desc: 'Broadcasting to 4 verified volunteers within 1.5 km'
    },
    {
      icon: PhoneCall,
      title: 'First Responder Audio Bridge',
      desc: `Dialing primary contact: ${contacts.find(c => c.priority)?.name || 'Police 112'}`
    },
  ];

  return (
    <DashboardShell
      title="SOS & Safety Mesh"
      subtitle="Coordinate emergency siren, auto-broadcast live GPS to parents, family, police, and firefighters"
      icon={ShieldCheck}
    >
      {/* Sound & Siren Banner */}
      <div className="glass-card p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-red-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Radio className="w-5 h-5 text-red-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Audible Emergency Siren
              {sosActive && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              )}
            </h3>
            <p className="text-xs text-dark-300">
              High-intensity dual-frequency acoustic alarm for nearby bystander awareness
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleSound}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono transition-all border ${
              soundEnabled
                ? 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20'
                : 'bg-dark-800 text-dark-400 border-white/10 hover:text-white'
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
          <div className="glass-card p-8 text-center relative overflow-hidden border-red-500/20">
            {/* Animated Red Aura when Active */}
            {sosActive && (
              <motion.div
                className="absolute inset-0 bg-red-600/10 pointer-events-none"
                animate={{ opacity: [0.1, 0.25, 0.1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}

            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] font-mono text-dark-300 uppercase tracking-widest">
                TACTILE EMERGENCY TRIGGER
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                sosActive
                  ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                  : 'bg-dark-800 text-dark-400 border-white/10'
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
                className={`relative z-10 w-full h-full rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl focus:outline-none focus:ring-4 focus:ring-red-500/40 group ${
                  sosActive
                    ? 'bg-gradient-to-b from-red-600 via-rose-600 to-red-800 text-white shadow-[0_0_60px_rgba(239,68,68,0.6)] scale-105'
                    : 'bg-dark-800/90 hover:bg-dark-700 border-2 border-red-500/40 hover:border-red-500/80 text-red-400 hover:shadow-[0_0_30px_rgba(239,68,68,0.25)]'
                }`}
                aria-label={sosActive ? 'Deactivate SOS Emergency' : 'Activate SOS Emergency'}
              >
                <AlertCircle className={`w-12 h-12 mb-1 transition-transform group-hover:scale-110 ${
                  sosActive ? 'text-white animate-bounce' : 'text-red-400'
                }`} />
                <span className="font-display font-black text-2xl tracking-wider text-white">
                  {sosActive ? 'ACTIVE' : 'SOS'}
                </span>
                <span className="text-[10px] font-mono tracking-widest mt-1 text-white/80">
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
                        ? 'bg-red-950/30 border-red-500/40 text-white'
                        : current
                        ? 'bg-red-900/20 border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                        : 'bg-dark-900/30 border-white/[0.04] opacity-40'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                        done
                          ? 'bg-red-500 text-white'
                          : current
                          ? 'bg-red-500/30 text-red-400 animate-pulse'
                          : 'bg-dark-800 text-dark-400'
                      }`}
                    >
                      {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        {s.title}
                      </span>
                      <span className="text-[11px] text-dark-300 leading-tight">
                        {s.desc}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Emergency Phone Directory & Contacts (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Header & Add Button */}
          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.06]">
              <div>
                <h3 className="font-display font-bold text-white text-lg flex items-center gap-2">
                  Emergency Phone Directory
                  <span className="text-xs font-mono font-normal text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded-full border border-accent-cyan/20">
                    {contacts.length} Connected
                  </span>
                </h3>
                <p className="text-xs text-dark-300">
                  Parents, family guardians, and official response services notified during SOS
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-dark-950 font-semibold text-xs transition-all hover:opacity-90 shadow-glow-sm shrink-0"
              >
                <Plus className="w-4 h-4 text-dark-950" /> Add Number
              </button>
            </div>

            {/* Quick-Add Official Emergency Presets */}
            <div className="mb-6">
              <span className="text-[10px] font-mono text-dark-400 uppercase tracking-wider block mb-2">
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
                    autoSms: true,
                    avatar: '🚓',
                    color: '#3b82f6'
                  })}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 text-xs font-mono transition-all text-left"
                >
                  <span className="text-base">🚓</span>
                  <div>
                    <span className="font-bold block">Police (112)</span>
                    <span className="text-[9px] text-dark-400">Emergency Dispatch</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset({
                    name: 'Fire & Rescue Service',
                    category: 'Firefighters',
                    phone: '101',
                    priority: false,
                    autoSms: true,
                    avatar: '🚒',
                    color: '#ef4444'
                  })}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-mono transition-all text-left"
                >
                  <span className="text-base">🚒</span>
                  <div>
                    <span className="font-bold block">Fire Rescue (101)</span>
                    <span className="text-[9px] text-dark-400">Hazard Response</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddPreset({
                    name: 'Ambulance & Paramedics',
                    category: 'Ambulance',
                    phone: '108',
                    priority: false,
                    autoSms: true,
                    avatar: '🚑',
                    color: '#10b981'
                  })}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 text-xs font-mono transition-all text-left"
                >
                  <span className="text-base">🚑</span>
                  <div>
                    <span className="font-bold block">Ambulance (108)</span>
                    <span className="text-[9px] text-dark-400">Medical Trauma</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Contacts Cards List */}
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className={`p-3.5 rounded-xl bg-dark-800/40 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    sosActive
                      ? 'border-red-500/40 bg-red-950/10'
                      : 'border-white/[0.04] hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-dark-700/80 border border-white/10 flex items-center justify-center text-xl shrink-0">
                      {contact.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {contact.name}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          CATEGORY_COLORS[contact.category] || CATEGORY_COLORS.Other
                        }`}>
                          {contact.category}
                        </span>
                        {contact.priority && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Primary
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs font-mono text-dark-300">
                        <span>{contact.phone}</span>
                        {contact.autoSms && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Auto-SMS
                          </span>
                        )}
                        {sosActive && (
                          <span className="text-[10px] text-red-400 animate-pulse font-bold">
                            ALERT DELIVERED
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Call & Remove */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <a
                      href={`tel:${contact.phone}`}
                      className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all flex items-center gap-1 text-xs font-mono"
                      title={`Call ${contact.name}`}
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Call</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-2 rounded-lg bg-white/[0.03] hover:bg-red-500/15 hover:text-red-400 text-dark-400 transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Volunteers Quick Mesh status */}
          <div className="glass-card p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent-purple/15 border border-accent-purple/30 flex items-center justify-center">
                <Users className="w-4 h-4 text-accent-purple" />
              </div>
              <div>
                <span className="text-sm font-semibold text-white block">
                  Volunteer Community Mesh
                </span>
                <span className="text-xs text-dark-300">
                  {mockVolunteers.filter(v => v.available).length} nearby mobility helpers online
                </span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-mono border border-emerald-500/20">
              ● READY
            </span>
          </div>
        </div>
      </div>

      {/* Add Contact Modal Dialog */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="glass-card max-w-md w-full p-6 md:p-8 border-white/20 bg-dark-900 shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/[0.06]">
                <h4 className="font-display font-bold text-white text-lg">
                  Add Emergency Contact
                </h4>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-dark-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddContact} className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-dark-300 block mb-1">
                    Contact Name / Authority
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mom, Dad, Police Station, Doctor"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-dark-400 outline-none focus:border-accent-cyan"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-dark-300 block mb-1">
                    Relationship / Authority Category
                  </label>
                  <select
                    value={newContact.category}
                    onChange={(e) => setNewContact({ ...newContact, category: e.target.value })}
                    className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent-cyan"
                  >
                    <option value="Parents">Parents (Mom / Dad)</option>
                    <option value="Family">Family Member / Guardian</option>
                    <option value="Police">Police Department (112 / 100)</option>
                    <option value="Firefighters">Firefighters & Rescue (101)</option>
                    <option value="Ambulance">Ambulance & Paramedics (108)</option>
                    <option value="Doctor">Personal Doctor / Clinic</option>
                    <option value="Other">Other Emergency Contact</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-dark-300 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +91 98765 43210 or 112"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-dark-400 outline-none focus:border-accent-cyan font-mono"
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                  <label className="flex items-center gap-3 cursor-pointer text-xs text-dark-200">
                    <input
                      type="checkbox"
                      checked={newContact.autoSms}
                      onChange={(e) => setNewContact({ ...newContact, autoSms: e.target.checked })}
                      className="accent-accent-cyan w-4 h-4 rounded"
                    />
                    <span>Auto-send live GPS coordinates via SMS on SOS trigger</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer text-xs text-dark-200">
                    <input
                      type="checkbox"
                      checked={newContact.priority}
                      onChange={(e) => setNewContact({ ...newContact, priority: e.target.checked })}
                      className="accent-amber-400 w-4 h-4 rounded"
                    />
                    <span>Set as primary voice call contact</span>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-dark-300 hover:text-white text-xs font-mono transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue text-dark-950 font-bold text-xs uppercase tracking-wider transition-all hover:opacity-90 shadow-glow-sm"
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
