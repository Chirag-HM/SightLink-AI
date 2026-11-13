import { Link } from 'react-router-dom';
import { MailWarning, ArrowRight, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function EmailVerificationBanner({ className = '' }) {
  const { user } = useAuth();

  if (!user || !user.email || user.email_verified) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Email verification required"
      className={`p-5 rounded-2xl bg-[#FBF3DF] border-2 border-[#C59B42]/60 text-[#12231B] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-[#C59B42]/20 border border-[#C59B42]/45 flex items-center justify-center shrink-0">
          <MailWarning className="w-6 h-6 text-[#7D5B1C]" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-base sm:text-lg font-bold text-[#12231B] flex items-center gap-2">
            <span>Verify your email address to unlock safety alerts</span>
            <ShieldAlert className="w-4 h-4 text-[#8C6A23] shrink-0" aria-hidden="true" />
          </h2>
          <p className="text-sm text-[#354B40] mt-1 leading-relaxed">
            Your account <strong className="font-mono text-[#12231B]">{user.email}</strong> is not verified yet. Until verified with the 6-digit code, sending SOS alerts to family and volunteer actions are paused.
          </p>
        </div>
      </div>

      <Link
        to="/verify-email"
        className="min-h-[48px] px-5 py-2.5 rounded-full bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39] transition-colors inline-flex items-center justify-center gap-2 shrink-0 shadow-glow-sm focus-visible-ring"
      >
        <span>Enter 6-Digit Code</span>
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

