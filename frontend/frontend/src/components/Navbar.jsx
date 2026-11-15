import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, Menu, X, LogIn, LogOut, ShieldCheck, Headphones } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const primaryLinks = [
  { label: 'Home', to: '/' },
  { label: 'Get Help', to: '/assist' },
  { label: 'Eyes on Demand', to: '/live-assist' },
  { label: 'Volunteers', to: '/volunteers' },
  { label: 'Family Tracking', to: '/contacts' },
  { label: 'Health', to: '/health' },
  { label: 'Dashboard', to: '/dashboard' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, largeText, setLargeText } = useAuth();

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('theme');
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="relative z-50">
      <nav
        aria-label="Main navigation"
        className={`theme-nav fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#FAF7F0]/95 backdrop-blur-xl border-b border-[#DCD2BF] shadow-card'
            : 'bg-[#FAF7F0]/80 backdrop-blur-md border-b border-[#E5DEC9]/70'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-16">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Brand Logo */}
            <Link
              to="/"
              className="flex items-center gap-3 group min-h-[44px] pr-2 rounded-xl focus-visible-ring"
            >
              <div className="w-10 h-10 rounded-xl bg-[#065F46]/10 border border-[#065F46]/25 flex items-center justify-center shadow-glow-sm">
                <Eye className="w-5 h-5 text-[#065F46]" aria-hidden="true" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight text-[#12231B]">
                SIGHTLINK <span className="text-[#065F46]">AI</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {primaryLinks.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={active ? 'page' : undefined}
                    className={`px-3 xl:px-4 py-2.5 text-sm font-medium rounded-xl transition-colors min-h-[44px] flex items-center whitespace-nowrap focus-visible-ring ${
                      active
                        ? 'bg-[#065F46]/10 text-[#065F46] font-semibold border border-[#065F46]/20'
                        : 'text-[#354B40] hover:text-[#12231B] hover:bg-[#EFE8DA]/75'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            {/* Utility Controls & Auth */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setLargeText(!largeText)}
                aria-pressed={largeText}
                aria-label="Toggle large accessible text"
                title="Toggle large accessible text"
                className={`hidden sm:flex items-center justify-center min-h-[44px] px-3 rounded-xl border text-xs font-mono font-semibold transition-colors focus-visible-ring ${
                  largeText
                    ? 'border-[#C59B42]/50 bg-[#FBF3DF] text-[#7D5B1C]'
                    : 'border-[#D7CEBC] bg-white/75 text-[#354B40] hover:text-[#12231B] hover:bg-[#EFE8DA]/75'
                }`}
              >
                Aa+
              </button>

              {user ? (
                <div className="hidden md:flex items-center gap-2">
                  {user.email && !user.email_verified && (
                    <Link
                      to="/verify-email"
                      className="px-3 py-1.5 rounded-full bg-[#FBF3DF] border border-[#C59B42]/60 text-[#7D5B1C] text-xs font-bold hover:bg-[#F4E3BC] min-h-[38px] flex items-center"
                    >
                      Verify Email
                    </Link>
                  )}
                  <Link
                    to={
                      user.needs_role_selection
                        ? '/login'
                        : user.role === 'volunteer'
                        ? '/volunteers'
                        : user.role === 'family'
                        ? '/family/track'
                        : '/assist'
                    }
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/85 border border-[#DCD2BF] text-xs text-[#12231B] hover:border-[#065F46]/40 min-h-[44px]"
                  >
                    {user.photo_url && (
                      <img
                        src={user.photo_url}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full object-cover border border-[#DCD2BF] shrink-0"
                      />
                    )}
                    {user.is_verified && (
                      <ShieldCheck className="w-4 h-4 text-[#065F46] shrink-0" aria-label="Verified" />
                    )}
                    <span className="font-medium max-w-[130px] truncate">{user.full_name}</span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#FBF3DF] border border-[#C59B42]/35 text-[#7D5B1C]">
                      {user.role === 'blind_user' ? 'User' : user.role}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="Sign out"
                    className="min-h-[44px] px-3 rounded-xl border border-[#DCD2BF] bg-white/75 text-xs font-medium text-[#354B40] hover:text-red-700 hover:border-red-300 hover:bg-red-50/75 flex items-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-[#065F46] text-white rounded-full text-sm font-semibold hover:bg-[#054D39] transition-colors min-h-[44px] shadow-glow-sm focus-visible-ring"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>Sign In</span>
                </Link>
              )}

              <Link
                to="/assist"
                aria-label="Voice Assistance"
                className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#065F46]/10 border border-[#065F46]/25 text-[#065F46]"
              >
                <Headphones className="w-5 h-5" />
              </Link>

              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#DCD2BF] bg-white/80 text-[#354B40] hover:text-[#12231B] transition-colors focus-visible-ring"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav-drawer"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          id="mobile-nav-drawer"
          className="theme-mobile-menu fixed inset-0 z-40 pt-20 bg-[#EFE8DA]/95 backdrop-blur-2xl lg:hidden overflow-y-auto"
        >
          <div className="flex flex-col gap-2 p-6">
            {primaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="w-full py-4 px-4 rounded-xl text-lg font-medium text-[#12231B] bg-[#FAF7F0] border border-[#DCD2BF] hover:border-[#065F46]/40 flex items-center justify-between min-h-[52px]"
              >
                <span>{link.label}</span>
              </Link>
            ))}

            <button
              type="button"
              onClick={() => setLargeText(!largeText)}
              className="w-full py-3.5 px-4 rounded-xl text-base font-medium text-[#7D5B1C] bg-[#FBF3DF] border border-[#C59B42]/40 text-left min-h-[48px]"
            >
              {largeText ? 'Large Text Mode: ON' : 'Enable Large Text Mode'}
            </button>

            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 w-full py-4 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold min-h-[52px]"
              >
                Sign Out ({user.full_name})
              </button>
            ) : (
              <Link
                to="/login"
                className="mt-2 w-full py-4 rounded-full bg-[#065F46] text-white font-bold text-center text-base min-h-[52px] flex items-center justify-center shadow-glow-sm"
              >
                Sign In / Create Account
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
