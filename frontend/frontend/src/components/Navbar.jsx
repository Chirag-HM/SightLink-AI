import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Menu, Moon, Sun, X, Zap } from 'lucide-react';

const navLinks = [
  { label: 'Home', href: '/#home' },
  { label: 'How It Works', href: '/#solution' },
  { label: 'AI Vision', href: '/#ai-vision' },
  { label: 'Live Mobility', href: '/#bmtc' },
  { label: 'Safety', href: '/#sos' },
  { label: 'Technology', href: '/#architecture' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const handleNavClick = (e, href) => {
    if (href.startsWith('/#')) {
      e.preventDefault();
      const id = href.replace('/#', '');
      if (location.pathname !== '/') {
        window.location.href = href;
        return;
      }
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`theme-nav fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[rgba(6,6,18,0.8)] backdrop-blur-xl border-b border-white/[0.06]'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 lg:px-16">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-accent-cyan/20 rounded-lg blur-md group-hover:bg-accent-cyan/30 transition-all duration-300" />
                <Eye className="w-5 h-5 text-accent-cyan relative z-10" />
              </div>
              <span className="font-display font-bold text-lg tracking-tight text-white">
                SIGHTLINK <span className="text-gradient">AI</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="px-4 py-2 text-sm text-dark-200 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/[0.04] focus-visible-ring"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* CTA + Mobile Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2.5 rounded-full border border-white/[0.08] text-dark-200 hover:text-white hover:bg-white/[0.04] transition-colors focus-visible-ring"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <Link
                to="/dashboard"
                className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent-cyan/10 to-accent-violet/10 border border-accent-cyan/20 rounded-full text-sm font-medium text-white hover:border-accent-cyan/40 hover:from-accent-cyan/15 hover:to-accent-violet/15 transition-all duration-300 focus-visible-ring magnetic-btn"
              >
                <Zap className="w-4 h-4 text-accent-cyan" />
                Launch Dashboard
              </Link>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 text-dark-200 hover:text-white transition-colors focus-visible-ring"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="theme-mobile-menu fixed inset-0 z-40 pt-20 bg-[rgba(6,6,18,0.95)] backdrop-blur-2xl lg:hidden"
          >
            <div className="flex flex-col items-center gap-2 p-8">
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="w-full text-center py-4 text-lg text-dark-100 hover:text-white transition-colors border-b border-white/[0.04]"
                >
                  {link.label}
                </motion.a>
              ))}
              <Link
                to="/dashboard"
                className="mt-6 flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-accent-cyan to-accent-violet rounded-full text-sm font-semibold text-dark-900"
              >
                <Zap className="w-4 h-4" />
                Launch Dashboard
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
