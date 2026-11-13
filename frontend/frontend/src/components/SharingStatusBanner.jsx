import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Pause, Play, Square, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { familyService } from '../services/api';

export default function SharingStatusBanner() {
  const { user, sharingSession, setSharingSession } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user || user.role !== 'blind_user' || !sharingSession?.is_sharing) {
    return null;
  }

  const paused = sharingSession.is_paused;

  const handleTogglePause = async () => {
    setBusy(true);
    try {
      const updated = await familyService.updateConsent({
        consent_given: true,
        is_sharing: true,
        is_paused: !paused,
      });
      setSharingSession(updated);
    } catch {
      // handled gracefully
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const updated = await familyService.updateConsent({
        consent_given: false,
        is_sharing: false,
        is_paused: false,
      });
      setSharingSession(updated);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 max-w-md bg-white/95 backdrop-blur-xl border px-4 py-3 rounded-2xl shadow-card flex flex-wrap items-center gap-3 ${
        paused ? 'border-[#C59B42]/45' : 'border-[#065F46]/25'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            paused ? 'bg-[#B88E3D]' : 'bg-[#065F46] animate-pulse'
          }`}
          aria-hidden="true"
        />
        <div>
          <p className="text-xs font-semibold text-[#12231B] flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-[#065F46]" />
            {paused
              ? `Sharing paused${sharingSession.paused_minutes_remaining ? ` (${sharingSession.paused_minutes_remaining}m)` : ''}`
              : 'Sharing with family'}
          </p>
          <p className="text-[11px] font-mono text-[#4F6358]">
            Code: {sharingSession.invite_code}
            {sharingSession.caregiver_managed ? ' · Caregiver' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={busy}
          aria-label={paused ? 'Resume family location sharing' : 'Pause family location sharing'}
          className="px-2.5 py-1.5 rounded-lg bg-[#F4EFE4] hover:bg-[#EAE2D2] border border-[#DCD2BF] text-xs font-medium text-[#12231B] flex items-center gap-1 transition-colors min-h-[36px]"
        >
          {paused ? <Play className="w-3.5 h-3.5 text-[#065F46]" /> : <Pause className="w-3.5 h-3.5 text-[#8C6A23]" />}
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>

        <button
          type="button"
          onClick={handleStop}
          disabled={busy}
          aria-label="Stop sharing location with family"
          className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-medium text-red-700 flex items-center gap-1 transition-colors min-h-[36px]"
        >
          <Square className="w-3 h-3" />
          <span>Stop</span>
        </button>

        <Link
          to="/contacts"
          aria-label="Open family sharing settings"
          className="p-2 rounded-lg bg-[#065F46]/10 hover:bg-[#065F46]/20 text-[#065F46] transition-colors min-h-[36px] flex items-center"
        >
          <Shield className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

