import { motion } from 'framer-motion';
import { useState } from 'react';
import { Shield, Phone, MapPin, Share2, KeyRound, Check } from 'lucide-react';
import { mockTrustedContacts } from '../../utils/mockData';
import { viewportConfig } from '../../utils/animations';

export default function TrustedContactsSection() {
  const [sharingActive, setSharingActive] = useState(true);
  const [contacts, setContacts] = useState(mockTrustedContacts);

  const toggleEmergencyAccess = (id) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, hasAccess: !c.hasAccess } : c))
    );
  };

  return (
    <section id="contacts" className="relative section-gap section-padding overflow-hidden">
      <div className="absolute top-1/3 left-0 w-[500px] h-[500px] bg-accent-blue/05 rounded-full blur-[170px] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest border border-accent-blue/30 bg-accent-blue/5 text-accent-blue mb-4">
            <Shield className="w-3.5 h-3.5" />
            Inner Circle Guardians
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Trusted Contacts.{' '}
            <span className="text-gradient-cyan">Always in the loop.</span>
          </h2>
          <p className="text-dark-200 text-lg mt-4 max-w-2xl mx-auto">
            Family and caregivers receive automated battery status, departure/arrival triggers, and emergency location pinging with zero friction.
          </p>
        </motion.div>

        {/* Global Live Location Sharing Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.6 }}
          className="mb-10 p-5 rounded-2xl glass-card flex flex-col sm:flex-row items-center justify-between gap-4 border-accent-cyan/20"
        >
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-xl bg-accent-cyan/15 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-accent-cyan" />
            </div>
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-sm font-semibold text-white">Continuous GPS Beacon Sharing</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-xs text-dark-300 mt-0.5">
                Transmitting encrypted live coordinate updates to authorized family devices
              </p>
            </div>
          </div>

          <button
            onClick={() => setSharingActive(!sharingActive)}
            className={`px-5 py-2.5 rounded-full text-xs font-mono font-medium transition-all ${
              sharingActive
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-dark-700 text-dark-300 border border-white/10'
            }`}
          >
            {sharingActive ? '● SHARING LIVE' : '○ PAUSED'}
          </button>
        </motion.div>

        {/* Contact Cards Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {contacts.map((contact, idx) => (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportConfig}
              transition={{ delay: idx * 0.1, duration: 0.6 }}
              className="glass-card p-6 md:p-8 flex flex-col justify-between relative group hover:border-accent-cyan/30 transition-all duration-300"
            >
              <div>
                {/* Header with Avatar and Online Status */}
                <div className="flex items-center justify-between mb-5">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-dark-700 border border-white/10 flex items-center justify-center text-2xl shadow-inner">
                      {contact.avatar}
                    </div>
                    <div
                      className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-dark-900 ${
                        contact.online ? 'bg-emerald-400' : 'bg-dark-400'
                      }`}
                    />
                  </div>

                  <span
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-full ${
                      contact.online
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-dark-800 text-dark-400'
                    }`}
                  >
                    {contact.online ? 'ONLINE' : 'AWAY'}
                  </span>
                </div>

                {/* Name & Relation */}
                <h3 className="font-display text-xl font-bold text-white">{contact.name}</h3>
                <span className="text-xs font-medium text-accent-cyan block mb-4">{contact.relation}</span>

                {/* Location & Phone info */}
                <div className="space-y-2 text-xs text-dark-200 mb-6">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-dark-400" />
                    <span>{contact.distance} from stick</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-dark-300">
                    <Phone className="w-3.5 h-3.5 text-dark-400" />
                    <span>{contact.phone}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2">
                <button
                  onClick={() => toggleEmergencyAccess(contact.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-900 text-dark-200 hover:text-white border border-white/[0.06] text-xs font-mono transition-colors"
                >
                  <KeyRound className="w-3 h-3 text-accent-cyan" />
                  <span>SOS Override</span>
                </button>

                <a
                  href={`tel:${contact.phone}`}
                  className="p-2 rounded-lg bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan transition-colors"
                  aria-label={`Call ${contact.name}`}
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
