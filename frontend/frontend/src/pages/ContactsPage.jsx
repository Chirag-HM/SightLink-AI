import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Phone, MapPin, Share2, Plus, KeyRound } from 'lucide-react';
import DashboardShell from '../components/DashboardShell';
import { mockTrustedContacts } from '../utils/mockData';

export default function ContactsPage() {
  const [contacts] = useState(mockTrustedContacts);
  const [sharingActive, setSharingActive] = useState(true);

  return (
    <DashboardShell title="Trusted Contacts" subtitle="Manage your inner circle of guardians and location sharing" icon={Shield}>
      {/* Live Sharing Banner */}
      <div className="mb-8 glass-card p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-accent-cyan/20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent-cyan/15 flex items-center justify-center"><Share2 className="w-5 h-5 text-accent-cyan" /></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">GPS Location Sharing</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-xs text-dark-300">Encrypted coordinate updates to authorized devices</p>
          </div>
        </div>
        <button onClick={() => setSharingActive(!sharingActive)} className={`px-5 py-2.5 rounded-full text-xs font-mono font-medium transition-all ${sharingActive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-dark-700 text-dark-300 border border-white/10'}`}>
          {sharingActive ? '● SHARING LIVE' : '○ PAUSED'}
        </button>
      </div>

      {/* Contact Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {contacts.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="glass-card p-6 flex flex-col justify-between group hover:border-accent-cyan/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-dark-700 border border-white/10 flex items-center justify-center text-2xl">{c.avatar}</div>
                  <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-dark-900 ${c.online ? 'bg-emerald-400' : 'bg-dark-400'}`} />
                </div>
                <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full ${c.online ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-dark-800 text-dark-400'}`}>
                  {c.online ? 'ONLINE' : 'AWAY'}
                </span>
              </div>
              <h3 className="font-display text-xl font-bold text-white">{c.name}</h3>
              <span className="text-xs font-medium text-accent-cyan block mb-4">{c.relation}</span>
              <div className="space-y-2 text-xs text-dark-200 mb-6">
                <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-dark-400" />{c.distance} away</div>
                <div className="flex items-center gap-2 font-mono text-dark-300"><Phone className="w-3.5 h-3.5 text-dark-400" />{c.phone}</div>
              </div>
            </div>
            <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-900 text-dark-200 hover:text-white border border-white/[0.06] text-xs font-mono transition-colors">
                <KeyRound className="w-3 h-3 text-accent-cyan" />SOS Override
              </button>
              <a href={`tel:${c.phone}`} className="p-2 rounded-lg bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan transition-colors" aria-label={`Call ${c.name}`}>
                <Phone className="w-4 h-4" />
              </a>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Contact */}
      <button className="w-full glass-card p-6 flex items-center justify-center gap-3 text-dark-300 hover:text-white hover:border-accent-cyan/30 transition-all group">
        <div className="w-10 h-10 rounded-xl bg-dark-700 border border-white/[0.06] flex items-center justify-center group-hover:bg-accent-cyan/10 group-hover:border-accent-cyan/20 transition-colors">
          <Plus className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium">Add Trusted Contact</span>
      </button>
    </DashboardShell>
  );
}
