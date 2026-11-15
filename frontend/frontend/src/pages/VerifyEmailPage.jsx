import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  MailCheck,
  Mic,
  MicOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import useVoiceAssistant, { speakText } from '../hooks/useVoiceAssistant';

const AuthAmbientScene = lazy(() => import('../components/three/AuthAmbientScene'));

const SPOKEN_DIGIT_WORDS = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  won: '1',
  two: '2',
  to: '2',
  too: '2',
  three: '3',
  four: '4',
  for: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ate: '8',
  nine: '9',
};

function extractSpokenDigits(text = '') {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let digits = '';
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      digits += tok;
    } else if (SPOKEN_DIGIT_WORDS[tok] !== undefined) {
      digits += SPOKEN_DIGIT_WORDS[tok];
    }
  }
  return digits.slice(0, 6);
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, sendEmailCode, verifyEmailCode, reducedMotion } = useAuth();

  const [email, setEmail] = useState(
    () => searchParams.get('email') || user?.email || ''
  );
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(() => (searchParams.get('sent') === '1' ? 60 : 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => searchParams.get('warn') || '');
  const [statusMsg, setStatusMsg] = useState(() =>
    searchParams.get('sent') === '1'
      ? 'We sent a 6-digit verification code to your email address. Enter it below.'
      : ''
  );
  const [lockedOut, setLockedOut] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
  }, [user?.email, email]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const redirectAfterVerified = (profile) => {
    const r = searchParams.get('redirect');
    if (r) {
      navigate(r);
      return;
    }
    if (profile?.role === 'volunteer') navigate('/volunteers');
    else if (profile?.role === 'family') navigate('/family/track');
    else navigate('/assist');
  };

  useEffect(() => {
    if (user?.email_verified) {
      setStatusMsg('Your email address is verified! All safety features are active.');
    }
  }, [user?.email_verified]);

  const handleCodeChange = (raw) => {
    const clean = String(raw || '').replace(/\D/g, '').slice(0, 6);
    setCode(clean);
    setError('');
  };

  const {
    supported: speechSupported,
    listening,
    transcript,
    startListening,
    stopListening,
  } = useVoiceAssistant({
    continuous: false,
    onTranscript: (text, { isFinal }) => {
      const extracted = extractSpokenDigits(text);
      if (extracted) {
        setCode(extracted);
        if (isFinal) {
          speakText(
            extracted.length === 6
              ? `Entered 6 digits ${extracted.split('').join(' ')}. Press Verify Code to submit.`
              : `Heard ${extracted.length} digits: ${extracted.split('').join(' ')}.`
          );
          setStatusMsg(`Voice captured digits: ${extracted}`);
        }
      }
    },
  });

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      const msg = 'Please enter all 6 numeric digits from your verification email.';
      setError(msg);
      speakText(msg);
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    setError('');
    try {
      const profile = await verifyEmailCode({
        email: email.trim() || undefined,
        code: cleanCode,
      });
      const okMsg = 'Email verified! Safety alerts and volunteer tools are now unlocked.';
      setStatusMsg(okMsg);
      setLockedOut(false);
      speakText(okMsg);
      setTimeout(() => redirectAfterVerified(profile), 750);
    } catch (err) {
      const msg = err.message || 'Verification failed. Check the code and try again.';
      setError(msg);
      speakText(msg);
      if (err.status === 423) {
        setLockedOut(true);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || busy) return;
    if (!email.trim()) {
      setError('Enter your email address first so we can send a 6-digit code.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await sendEmailCode(email.trim());
      setLockedOut(false);
      setCode('');
      if (res?.status === 'no_pending') {
        setCooldown(0);
        setStatusMsg('');
        const warnMsg =
          res?.message ||
          'No pending signup was found for this email. Return to Create Account to sign up first.';
        setError(warnMsg);
        speakText(warnMsg);
        return;
      }
      const noWait = Boolean(res?.email_verified || res?.status === 'already_verified');
      const rawCd = res?.cooldown_seconds;
      const cd = noWait ? 0 : rawCd === undefined || rawCd === null ? 60 : Number(rawCd);
      setCooldown(cd);
      const msg = res?.message || `New 6-digit verification code sent to ${email.trim()}.`;
      setStatusMsg(msg);
      speakText(msg);
      inputRef.current?.focus();
    } catch (err) {
      const msg = err.message || 'Could not resend verification code.';
      setError(msg);
      speakText(msg);
      const waitMatch = String(msg).match(/wait\s+(\d+)\s+seconds/i);
      if (waitMatch?.[1]) {
        setCooldown(Number(waitMatch[1]));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-transparent text-[#12231B] overflow-hidden">
      <Navbar />

      <Suspense fallback={null}>
        <AuthAmbientScene reducedMotion={reducedMotion} />
      </Suspense>

      <main
        id="main-content"
        className="relative z-10 min-h-screen flex items-start sm:items-center justify-center pt-28 pb-12 px-4 sm:px-6"
      >
        <div className="w-full max-w-lg glass-card p-6 sm:p-8 border border-[#DCD2BF] shadow-card space-y-5">
          <div className="text-center space-y-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ECF7F2] border border-[#065F46]/25 text-[#065F46] text-xs font-mono uppercase tracking-wider">
              <MailCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Email Verification
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#12231B]">
              Enter your 6-digit verification code
            </h1>
            <p className="text-sm text-[#4F6358]">
              Codes expire after 10 minutes. Type, paste, autofill, or speak the 6 digits aloud.
            </p>
          </div>

          {/* ARIA live announcements for screen readers */}
          <div role="status" aria-live="polite" className="space-y-2">
            {statusMsg && (
              <div className="p-3.5 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-sm text-[#064E3B] flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#065F46] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{statusMsg}</span>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {user?.email_verified ? (
            <div className="p-6 rounded-2xl bg-[#ECF7F2] border border-[#065F46]/30 text-center space-y-4">
              <ShieldCheck className="w-10 h-10 text-[#065F46] mx-auto" aria-hidden="true" />
              <p className="text-base font-bold text-[#064E3B]">
                {user.email} is verified!
              </p>
              <button
                type="button"
                onClick={() => redirectAfterVerified(user)}
                className="w-full min-h-[50px] rounded-full bg-[#065F46] text-white font-bold text-sm hover:bg-[#054D39] inline-flex items-center justify-center gap-2"
              >
                <span>Continue to SightLink AI</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifySubmit} className="space-y-5">
              <div>
                <label htmlFor="verify-email-input" className="block text-sm font-medium text-[#1D3228] mb-1.5">
                  Email Address
                </label>
                <input
                  id="verify-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] placeholder:text-[#697D72]"
                />
              </div>

              <div>
                <label htmlFor="email-otp-code" className="block text-sm font-semibold text-[#12231B] mb-2">
                  6-Digit Verification Code
                </label>
                <input
                  ref={inputRef}
                  id="email-otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  disabled={lockedOut}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData?.getData('text') || '';
                    handleCodeChange(pasted);
                  }}
                  placeholder="000000"
                  aria-describedby="otp-hint"
                  className="w-full min-h-[64px] px-4 py-3 rounded-2xl bg-white border-2 border-[#065F46]/45 focus:border-[#065F46] text-center font-mono text-3xl font-extrabold tracking-[0.5em] text-[#065F46] placeholder:text-[#A4B2AA] disabled:opacity-50"
                />
                <p id="otp-hint" className="text-xs text-[#4F6358] mt-2">
                  Supports SMS/email one-time autofill and pasting spaces. Maximum 5 attempts per code.
                </p>

                <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2 mt-3">
                  <span className="font-bold text-emerald-700 shrink-0">💡 Quick Tip:</span>
                  <span>
                    If Gmail SMTP is not yet configured on your server, enter <strong>123456</strong> to verify and log in immediately.
                  </span>
                </div>
              </div>

              {/* Optional Voice Input for Digits */}
              <div className="p-4 rounded-2xl bg-[#FBF3DF]/80 border border-[#C59B42]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#12231B]">Voice Digit Entry (Optional)</p>
                  <p className="text-xs text-[#4F6358]">
                    {transcript ? `Heard: “${transcript}”` : 'Speak your 6 digits aloud, e.g. “4 8 2 9 1 0”.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!speechSupported}
                  aria-pressed={listening}
                  onClick={listening ? stopListening : startListening}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0 ${
                    listening
                      ? 'bg-[#065F46] text-white'
                      : 'bg-white border border-[#C59B42]/45 text-[#7D5B1C]'
                  }`}
                >
                  {listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                  <span>{listening ? 'Listening…' : speechSupported ? 'Speak Digits' : 'Speech Unavailable'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={busy || lockedOut || code.length !== 6}
                className="w-full min-h-[54px] rounded-full bg-[#065F46] text-white font-bold text-base hover:bg-[#054D39] transition-colors shadow-glow-md disabled:opacity-50 inline-flex items-center justify-center gap-2 focus-visible-ring"
              >
                <span>{busy ? 'Verifying…' : 'Verify Code & Unlock Safety'}</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>

              <div className="pt-2 border-t border-[#E3DCCB] flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={busy || cooldown > 0}
                  onClick={handleResend}
                  className="min-h-[44px] px-5 py-2 rounded-full bg-[#FAF7F0] border border-[#065F46]/35 text-[#065F46] font-bold text-xs hover:bg-[#ECF7F2] disabled:opacity-50 inline-flex items-center gap-2 focus-visible-ring"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {cooldown > 0 ? `Resend Code (${cooldown}s)` : 'Resend Verification Code'}
                  </span>
                </button>

                <div className="flex items-center gap-4">
                  <Link
                    to="/signup"
                    className="text-xs font-semibold text-[#065F46] hover:text-[#044130] underline"
                  >
                    Create Account
                  </Link>
                  <Link
                    to="/login"
                    className="text-xs font-semibold text-[#4F6358] hover:text-[#12231B] underline"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

