import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  HeartHandshake,
  Users,
  Mic,
  MicOff,
  ShieldCheck,
  Phone,
  IdCard,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Mail,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import useVoiceAssistant, { speakText } from '../hooks/useVoiceAssistant';

const AuthAmbientScene = lazy(() => import('../components/three/AuthAmbientScene'));

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const ROLES = [
  {
    id: 'blind_user',
    label: 'User',
    hint: 'Blind / Partially Blind',
    icon: User,
  },
  {
    id: 'volunteer',
    label: 'Volunteer',
    hint: 'Verified Helper',
    icon: HeartHandshake,
  },
  {
    id: 'family',
    label: 'Family',
    hint: 'Live Guardian',
    icon: Users,
  },
];

export default function AuthPage({ initialMode = 'login' }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login, register, voiceLogin, googleLogin, selectRole, reducedMotion } = useAuth();

  const initialRoleParam = searchParams.get('role');
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState(
    initialRoleParam && ['blind_user', 'volunteer', 'family'].includes(initialRoleParam)
      ? initialRoleParam
      : 'blind_user'
  );

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [inviteCode, setInviteCode] = useState(searchParams.get('invite') || '');

  // First sign-in role selection state (after Google sign-in)
  const [pendingRoleUser, setPendingRoleUser] = useState(null);

  // Volunteer verification fields
  const [verifyMethod, setVerifyMethod] = useState('phone'); // 'phone' | 'id'
  const [otpCode, setOtpCode] = useState('');
  const [demoOtpHint, setDemoOtpHint] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [idNumber, setIdNumber] = useState('');

  // Voice login helper
  const [voiceMode, setVoiceMode] = useState(false);
  const [spokenPhrase, setSpokenPhrase] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const googleBtnRef = useRef(null);

  useEffect(() => {
    setMode(initialMode);
    setError('');
  }, [initialMode]);

  useEffect(() => {
    if (user?.needs_role_selection) {
      setPendingRoleUser(user);
    }
  }, [user]);

  const {
    supported: speechSupported,
    listening,
    transcript,
    startListening,
    stopListening,
  } = useVoiceAssistant({
    continuous: false,
    onTranscript: (text) => {
      setSpokenPhrase(text);
      const match = text.toLowerCase().match(/(?:login|sign in|user)\s+(?:as\s+)?([a-z0-9_.-]+)/);
      if (match?.[1]) {
        setUsername(match[1]);
      }
    },
  });

  const redirectAfterAuth = useCallback((userProfile) => {
    const customRedirect = searchParams.get('redirect');
    if (customRedirect) {
      navigate(customRedirect);
      return;
    }
    if (userProfile.role === 'volunteer') {
      navigate('/volunteers');
    } else if (userProfile.role === 'family') {
      navigate(inviteCode ? `/family/track/${encodeURIComponent(inviteCode)}` : '/family/track');
    } else {
      navigate('/assist');
    }
  }, [searchParams, navigate, inviteCode]);

  const handleGoogleCredential = useCallback(async (credentialResponse) => {
    if (!credentialResponse?.credential) return;
    setError('');
    setStatusMsg('');
    setBusy(true);
    try {
      const profile = await googleLogin(credentialResponse.credential);
      if (profile.needs_role_selection) {
        setPendingRoleUser(profile);
        setStatusMsg('Google account verified. Select your SightLink role below to continue.');
        speakText('Signed in with Google. Please choose your role.');
      } else {
        speakText(`Welcome back ${profile.full_name}.`);
        redirectAfterAuth(profile);
      }
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
      speakText(err.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  }, [googleLogin, redirectAfterAuth]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || pendingRoleUser) return undefined;
    let cancelled = false;

    const renderButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
        });
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 340,
          text: 'continue_with',
        });
      } catch {
        // Ignore GIS initialization issue in unsupported environments
      }
    };

    if (window.google?.accounts?.id) {
      renderButton();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector('script[data-sightlink-gsi="1"]');
    if (existing) {
      existing.addEventListener('load', renderButton);
      return () => {
        cancelled = true;
        existing.removeEventListener('load', renderButton);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.sightlinkGsi = '1';
    script.onload = renderButton;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.onload = null;
    };
  }, [pendingRoleUser, handleGoogleCredential]);

  const handleSaveSelectedRole = async (e) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    setBusy(true);
    try {
      const payload = {
        role,
        phone_number: phoneNumber.trim() || undefined,
        invite_code: role === 'family' && inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined,
      };
      if (role === 'volunteer' && (otpCode.trim() || idNumber.trim())) {
        if (verifyMethod === 'phone' && phoneNumber.trim() && otpCode.trim()) {
          payload.verification_method = 'phone';
          payload.verification_code = otpCode.trim();
        } else if (verifyMethod === 'id' && idNumber.trim().length >= 6) {
          payload.verification_method = 'id';
          payload.id_number = idNumber.trim();
        }
      }
      const updated = await selectRole(payload);
      setPendingRoleUser(null);
      speakText(`Role saved for ${updated.full_name}.`);
      redirectAfterAuth(updated);
    } catch (err) {
      setError(err.message || 'Could not save role selection.');
      speakText(err.message || 'Could not save role selection.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestOtp = async () => {
    setError('');
    if (!phoneNumber.trim() || phoneNumber.trim().length < 6) {
      setError('Enter a valid phone number first to receive your verification OTP.');
      return;
    }
    setBusy(true);
    try {
      const resp = await authService.requestOtp(phoneNumber.trim());
      setOtpSent(true);
      if (resp.demo_otp) {
        setDemoOtpHint(resp.demo_otp);
        setOtpCode(resp.demo_otp);
      }
      setStatusMsg('Verification OTP sent. Enter the 6-digit code below.');
      speakText('Verification code generated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    setBusy(true);

    try {
      let profile;
      if (mode === 'login') {
        if (voiceMode) {
          profile = await voiceLogin({
            spoken_phrase: spokenPhrase || `login as ${username}`,
            username: username.trim() || undefined,
            passcode: password,
          });
          speakText(`Welcome back ${profile.full_name}. Signed in by voice.`);
        } else {
          profile = await login(username.trim(), password);
          speakText(`Welcome back ${profile.full_name}.`);
        }
        if (profile.needs_role_selection) {
          setPendingRoleUser(profile);
          return;
        }
        redirectAfterAuth(profile);
      } else {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          throw new Error('Please enter a valid email address so we can send your 6-digit verification code.');
        }
        if (role === 'volunteer') {
          if (verifyMethod === 'phone' && (!phoneNumber.trim() || !otpCode.trim())) {
            throw new Error('Volunteers using Phone verification must request and enter their OTP code.');
          }
          if (verifyMethod === 'id' && idNumber.trim().length < 6) {
            throw new Error('Volunteers using ID verification must enter a valid ID (at least 6 characters).');
          }
        }

        profile = await register({
          username: username.trim(),
          email: cleanEmail,
          password,
          full_name: fullName.trim() || username.trim(),
          phone_number: phoneNumber.trim() || undefined,
          role,
          verification_method: role === 'volunteer' ? verifyMethod : undefined,
          verification_code: role === 'volunteer' && verifyMethod === 'phone' ? otpCode.trim() : undefined,
          id_number: role === 'volunteer' && verifyMethod === 'id' ? idNumber.trim() : undefined,
          invite_code: role === 'family' && inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined,
        });

        if (profile.email && !profile.email_verified) {
          const emailSent = !profile.message || profile.message.startsWith('6-digit verification code sent');
          speakText(
            emailSent
              ? 'Account created. Check your email for the 6-digit verification code.'
              : 'Account created, but the verification email could not be delivered yet.'
          );
          const redir = searchParams.get('redirect');
          const nextQs = new URLSearchParams({
            sent: emailSent ? '1' : '0',
            email: profile.email,
          });
          if (!emailSent && profile.message) {
            nextQs.set('warn', profile.message);
          }
          if (redir) nextQs.set('redirect', redir);
          navigate(`/verify-email?${nextQs.toString()}`);
          return;
        }

        speakText(`Account created for ${profile.full_name}.`);
        redirectAfterAuth(profile);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
      speakText(err.message || 'Authentication failed.');
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
        className="relative z-10 min-h-screen flex items-center justify-center pt-24 pb-16 px-4 sm:px-6"
      >
        <div className="w-full max-w-xl glass-card p-6 sm:p-10 border border-[#DCD2BF] shadow-card">
          {/* Header & Mode Switcher */}
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#065F46]/10 border border-[#065F46]/20 text-[#065F46] text-xs font-mono uppercase tracking-wider mb-3">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              SightLink Identity Portal
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#12231B]">
              {pendingRoleUser
                ? 'Choose Your Role'
                : mode === 'login'
                ? 'Sign in to SightLink'
                : 'Create your SightLink account'}
            </h1>
            <p className="text-sm text-[#4F6358] mt-1.5">
              Accessible by keyboard, screen reader, Google Sign-In, and hands-free voice command.
            </p>
          </div>

          {!pendingRoleUser && <EmailVerificationBanner className="mb-5" />}

          {/* Error & Status Alerts */}
          {error && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {statusMsg && (
            <div
              role="status"
              className="mb-4 p-3.5 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-sm text-[#064E3B] flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-5 h-5 text-[#065F46] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{statusMsg}</span>
            </div>
          )}

          {pendingRoleUser ? (
            <form onSubmit={handleSaveSelectedRole} className="space-y-5">
              <div className="p-4 rounded-2xl bg-[#ECF7F2]/80 border border-[#065F46]/25 flex items-center gap-3.5">
                {pendingRoleUser.photo_url ? (
                  <img
                    src={pendingRoleUser.photo_url}
                    alt={pendingRoleUser.full_name}
                    className="w-12 h-12 rounded-full border-2 border-[#065F46] object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#065F46] text-white flex items-center justify-center font-bold text-lg shrink-0">
                    {(pendingRoleUser.full_name || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#12231B] truncate">{pendingRoleUser.full_name}</p>
                  <p className="text-xs font-mono text-[#065F46] truncate">
                    {pendingRoleUser.email} · Verified via Google
                  </p>
                </div>
              </div>

              <div>
                <span id="post-google-role-label" className="text-xs font-mono uppercase tracking-wider text-[#4F6358] block mb-2.5">
                  How will you use SightLink AI?
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby="post-google-role-label"
                  className="grid grid-cols-3 gap-2.5"
                >
                  {ROLES.map((r) => {
                    const Icon = r.icon;
                    const active = role === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setRole(r.id)}
                        className={`min-h-[68px] p-3 rounded-2xl border text-left transition-all flex flex-col justify-between focus-visible-ring ${
                          active
                            ? 'bg-[#ECF7F2] border-[#065F46] text-[#12231B] shadow-glow-sm'
                            : 'bg-[#FAF7F0] border-[#DCD2BF] text-[#4F6358] hover:border-[#065F46]/40 hover:text-[#12231B]'
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 mb-1.5 ${active ? 'text-[#065F46]' : 'text-[#697D72]'}`}
                          aria-hidden="true"
                        />
                        <div>
                          <span className="text-sm font-bold block leading-tight">{r.label}</span>
                          <span className={`text-[11px] block ${active ? 'text-[#354B40]' : 'text-[#55685E]'}`}>{r.hint}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {role === 'volunteer' && (
                <div className="p-4 rounded-2xl bg-[#FBF3DF]/65 border border-[#C59B42]/35 space-y-2.5 text-xs text-[#4F6358]">
                  <p className="font-semibold text-[#12231B]">
                    Volunteers also complete Phone OTP or ID verification for a Verified Badge (you can finish here or on the Volunteer Dashboard).
                  </p>
                  <input
                    type="text"
                    value={idNumber}
                    onChange={(e) => {
                      setVerifyMethod('id');
                      setIdNumber(e.target.value);
                    }}
                    placeholder="Optional: Govt / NGO Volunteer ID (6+ chars)"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-[#D7CEBC] text-sm font-mono text-[#12231B]"
                  />
                </div>
              )}

              {role === 'family' && (
                <div>
                  <label htmlFor="google-fam-invite" className="block text-sm font-medium text-[#1D3228] mb-1.5">
                    Family Invite Code (Optional)
                  </label>
                  <input
                    id="google-fam-invite"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="e.g. SL-A1B2-C3D4"
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base font-mono text-[#12231B] uppercase"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[54px] rounded-full bg-[#065F46] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#054D39] shadow-glow-md disabled:opacity-50 focus-visible-ring"
              >
                <span>{busy ? 'Saving role…' : 'Save Role & Continue'}</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <div
                role="tablist"
                aria-label="Authentication mode"
                className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#EFE8DA] border border-[#DCD2BF] mb-6"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className={`min-h-[48px] rounded-xl text-sm font-bold transition-all focus-visible-ring ${
                    mode === 'login'
                      ? 'bg-[#065F46] text-white shadow-glow-sm'
                      : 'text-[#354B40] hover:text-[#12231B]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  className={`min-h-[48px] rounded-xl text-sm font-bold transition-all focus-visible-ring ${
                    mode === 'signup'
                      ? 'bg-[#065F46] text-white shadow-glow-sm'
                      : 'text-[#354B40] hover:text-[#12231B]'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Continue with Google */}
              <div className="mb-6">
                {GOOGLE_CLIENT_ID ? (
                  <div className="flex flex-col items-center gap-2">
                    <div ref={googleBtnRef} className="min-h-[44px] flex items-center justify-center" />
                    <span className="text-[11px] font-mono text-[#55685E]">
                      Verified Google accounts skip email OTP codes automatically
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setStatusMsg(
                        'Google Sign-In is ready once VITE_GOOGLE_CLIENT_ID & GOOGLE_CLIENT_ID are configured in .env.'
                      )
                    }
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-full bg-white border border-[#DCD2BF] hover:border-[#065F46]/45 text-[#12231B] font-semibold text-sm flex items-center justify-center gap-3 shadow-sm transition-all focus-visible-ring"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
                      <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.91 6.72-4.91z" />
                    </svg>
                    <span>Continue with Google</span>
                  </button>
                )}

                <div className="relative flex items-center justify-center mt-5">
                  <div className="border-t border-[#DCD2BF] w-full" />
                  <span className="px-3 text-[11px] font-mono uppercase tracking-wider text-[#55685E] bg-[#FAF7F0] rounded-full">
                    or continue with credentials
                  </span>
                  <div className="border-t border-[#DCD2BF] w-full" />
                </div>
              </div>

              {/* Role Selector (Signup mode) */}
              {mode === 'signup' && (
                <div className="mb-6">
                  <span id="role-select-label" className="text-xs font-mono uppercase tracking-wider text-[#4F6358] block mb-2.5">
                    Select Role
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="role-select-label"
                    className="grid grid-cols-3 gap-2.5"
                  >
                    {ROLES.map((r) => {
                      const Icon = r.icon;
                      const active = role === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setRole(r.id)}
                          className={`min-h-[68px] p-3 rounded-2xl border text-left transition-all flex flex-col justify-between focus-visible-ring ${
                            active
                              ? 'bg-[#ECF7F2] border-[#065F46] text-[#12231B] shadow-glow-sm'
                              : 'bg-[#FAF7F0] border-[#DCD2BF] text-[#4F6358] hover:border-[#065F46]/40 hover:text-[#12231B]'
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 mb-1.5 ${active ? 'text-[#065F46]' : 'text-[#697D72]'}`}
                            aria-hidden="true"
                          />
                          <div>
                            <span className="text-sm font-bold block leading-tight">{r.label}</span>
                            <span className={`text-[11px] block ${active ? 'text-[#354B40]' : 'text-[#55685E]'}`}>{r.hint}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Voice Login Toggle during Sign In */}
              {mode === 'login' && (
                <div className="mb-5 p-4 rounded-2xl bg-[#FBF3DF]/75 border border-[#C59B42]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#12231B]">Voice Login Option</p>
                    <p className="text-xs text-[#4F6358]">
                      Say “Login as your-username” and speak or enter your passcode.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={voiceMode}
                    onClick={() => {
                      const next = !voiceMode;
                      setVoiceMode(next);
                      if (next && speechSupported) {
                        speakText('Voice login ready. Say login as followed by your username.');
                        startListening();
                      } else if (!next && listening) {
                        stopListening();
                      }
                    }}
                    className={`min-h-[48px] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shrink-0 focus-visible-ring transition-colors ${
                      voiceMode
                        ? 'bg-[#065F46] text-white'
                        : 'bg-white text-[#7D5B1C] border border-[#C59B42]/35 hover:bg-[#FAF7F0]'
                    }`}
                  >
                    {listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
                    <span>{voiceMode ? (listening ? 'Listening…' : 'Voice Mode Active') : 'Use Voice Login'}</span>
                  </button>
                </div>
              )}

              {voiceMode && mode === 'login' && (
                <div className="mb-4 p-3 rounded-xl bg-[#ECF7F2] border border-[#065F46]/25 text-xs font-mono text-[#065F46]">
                  Spoken phrase: {transcript || spokenPhrase || 'Speak “login as <username>” or fill below'}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="auth-fullname" className="block text-sm font-medium text-[#1D3228] mb-1.5">
                        Full Name
                      </label>
                      <input
                        id="auth-fullname"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Rahul Verma"
                        className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base text-[#12231B] placeholder:text-[#697D72] focus:border-[#065F46]"
                      />
                    </div>

                    <div>
                      <label htmlFor="auth-email" className="block text-sm font-medium text-[#1D3228] mb-1.5 flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                        <span>Email Address (for 6-digit verification)</span>
                      </label>
                      <input
                        id="auth-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base text-[#12231B] placeholder:text-[#697D72] focus:border-[#065F46]"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="auth-username" className="block text-sm font-medium text-[#1D3228] mb-1.5">
                    {mode === 'login' ? 'Username or Email' : 'Username'}
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    required={!voiceMode}
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={mode === 'login' ? 'e.g. kiran_user or you@example.com' : 'e.g. kiran_user or rahul_volunteer'}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base text-[#12231B] placeholder:text-[#697D72] focus:border-[#065F46]"
                  />
                </div>

                <div>
                  <label htmlFor="auth-password" className="block text-sm font-medium text-[#1D3228] mb-1.5">
                    {voiceMode ? 'Voice Passcode / Password' : 'Password'}
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base text-[#12231B] placeholder:text-[#697D72] focus:border-[#065F46]"
                  />
                </div>

                {/* Volunteer ID or Phone Verification during Signup */}
                {mode === 'signup' && role === 'volunteer' && (
                  <div className="p-4 rounded-2xl bg-[#F6F1E6] border border-[#DCD2BF] space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#12231B]">
                      <ShieldCheck className="w-4 h-4 text-[#065F46]" aria-hidden="true" />
                      <span>Volunteer Identity Verification (Required for Verified Badge)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVerifyMethod('phone')}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          verifyMethod === 'phone'
                            ? 'bg-[#065F46]/15 border-[#065F46] text-[#065F46]'
                            : 'bg-white border-[#D7CEBC] text-[#4F6358]'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                        Phone OTP
                      </button>
                      <button
                        type="button"
                        onClick={() => setVerifyMethod('id')}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          verifyMethod === 'id'
                            ? 'bg-[#FBF3DF] border-[#C59B42] text-[#7D5B1C]'
                            : 'bg-white border-[#D7CEBC] text-[#4F6358]'
                        }`}
                      >
                        <IdCard className="w-3.5 h-3.5" aria-hidden="true" />
                        Government / NGO ID
                      </button>
                    </div>

                    {verifyMethod === 'phone' ? (
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="tel"
                            aria-label="Volunteer phone number"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="+91 98765 43210"
                            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] font-mono placeholder:text-[#697D72]"
                          />
                          <button
                            type="button"
                            onClick={handleRequestOtp}
                            disabled={busy}
                            className="min-h-[48px] px-4 rounded-xl bg-[#065F46] text-white font-bold text-xs whitespace-nowrap hover:bg-[#054D39]"
                          >
                            {otpSent ? 'Resend OTP' : 'Send OTP'}
                          </button>
                        </div>
                        {demoOtpHint && (
                          <p className="text-xs font-mono text-[#065F46]">
                            Dev Verification OTP: <strong>{demoOtpHint}</strong>
                          </p>
                        )}
                        <input
                          type="text"
                          aria-label="Enter 6-digit OTP code"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="Enter 6-digit OTP"
                          className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] font-mono placeholder:text-[#697D72]"
                        />
                      </div>
                    ) : (
                      <div>
                        <label htmlFor="vol-id-num" className="block text-xs text-[#4F6358] mb-1">
                          Government / Volunteer Organization ID Number
                        </label>
                        <input
                          id="vol-id-num"
                          type="text"
                          required
                          minLength={6}
                          value={idNumber}
                          onChange={(e) => setIdNumber(e.target.value)}
                          placeholder="e.g. DL-BLR-882491 or AADHAAR-LAST6"
                          className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-white border border-[#D7CEBC] text-sm text-[#12231B] font-mono placeholder:text-[#697D72]"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Family Invite Link Field during Signup */}
                {mode === 'signup' && role === 'family' && (
                  <div>
                    <label htmlFor="fam-invite" className="block text-sm font-medium text-[#1D3228] mb-1.5">
                      Family Invite Code (Optional)
                    </label>
                    <input
                      id="fam-invite"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="e.g. SL-A1B2-C3D4"
                      className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white border border-[#D7CEBC] text-base font-mono text-[#12231B] uppercase placeholder:text-[#697D72] focus:border-[#065F46]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[54px] mt-2 rounded-full bg-[#065F46] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#054D39] transition-colors shadow-glow-md disabled:opacity-50 focus-visible-ring"
                >
                  <span>
                    {busy
                      ? 'Please wait…'
                      : mode === 'login'
                      ? 'Sign In & Continue'
                      : 'Create Account'}
                  </span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

