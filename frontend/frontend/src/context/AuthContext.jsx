import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  authService,
  familyService,
  getApiBase,
  getCookie,
  setAuthToken,
} from '../services/api';

const AuthContext = createContext(null);

const USER_CACHE_KEY = 'sightlink_user_cache';

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState('');
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [sharingSession, setSharingSession] = useState(null);

  // Accessibility states mirrored to <html data-*>
  const [osReducedMotion, setOsReducedMotion] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
  const [userReducedMotion, setUserReducedMotion] = useState(
    () => localStorage.getItem('sightlink_reduced_motion') === 'true'
  );
  const [largeText, setLargeTextState] = useState(
    () => localStorage.getItem('sightlink_large_text') === 'true'
  );
  const [highContrast, setHighContrastState] = useState(
    () => localStorage.getItem('sightlink_high_contrast') === 'true'
  );

  const reducedMotion = osReducedMotion || userReducedMotion;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const onChange = (e) => setOsReducedMotion(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    document.documentElement.dataset.largeText = String(largeText);
    document.documentElement.dataset.highContrast = String(highContrast);
  }, [reducedMotion, largeText, highContrast]);

  const setLargeText = useCallback((val) => {
    setLargeTextState(Boolean(val));
    localStorage.setItem('sightlink_large_text', String(Boolean(val)));
  }, []);

  const setHighContrast = useCallback((val) => {
    setHighContrastState(Boolean(val));
    localStorage.setItem('sightlink_high_contrast', String(Boolean(val)));
  }, []);

  const setReducedMotionPref = useCallback((val) => {
    setUserReducedMotion(Boolean(val));
    localStorage.setItem('sightlink_reduced_motion', String(Boolean(val)));
  }, []);

  const syncServiceWorkerAuth = useCallback((tok) => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({
            type: 'SET_AUTH_CONTEXT',
            token: tok || '',
            csrfToken: getCookie('sightlink_csrf') || '',
            apiBase: getApiBase(),
          });
        })
        .catch(() => {});
    }
  }, []);

  const refreshSharing = useCallback(async (roleOverride) => {
    const activeRole = roleOverride || user?.role;
    if (activeRole !== 'blind_user') {
      setSharingSession(null);
      return null;
    }
    try {
      const s = await familyService.getSharing();
      setSharingSession(s);
      return s;
    } catch {
      return null;
    }
  }, [user?.role]);

  const refreshUser = useCallback(async (tok = token) => {
    try {
      if (!getCookie('sightlink_csrf')) {
        await authService.getCsrf().catch(() => {});
      }
      const profile = await authService.me();
      setUser(profile);
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile));
      syncServiceWorkerAuth(tok);
      if (profile.role === 'blind_user' && profile.email_verified !== false) {
        await refreshSharing('blind_user');
      } else {
        setSharingSession(null);
      }
      setLoading(false);
      return profile;
    } catch {
      setAuthToken('');
      setTokenState('');
      setUser(null);
      setSharingSession(null);
      localStorage.removeItem(USER_CACHE_KEY);
      setLoading(false);
      return null;
    }
  }, [token, syncServiceWorkerAuth, refreshSharing]);

  useEffect(() => {
    refreshUser(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyAuthSuccess = useCallback(
    async (tokenResp) => {
      const tok = tokenResp?.access_token || '';
      setAuthToken(tok);
      setTokenState(tok);
      syncServiceWorkerAuth(tok);
      const profile = await refreshUser(tok);
      return {
        ...(profile || {}),
        user_id: profile?.id ?? tokenResp?.user_id,
        role: profile?.role ?? tokenResp?.role,
        full_name: profile?.full_name ?? tokenResp?.full_name,
        email: profile?.email ?? tokenResp?.email,
        email_verified: profile?.email_verified ?? tokenResp?.email_verified ?? false,
        needs_role_selection: Boolean(profile?.needs_role_selection ?? tokenResp?.needs_role_selection),
        message: tokenResp?.message,
      };
    },
    [refreshUser, syncServiceWorkerAuth]
  );

  const login = useCallback(
    async (username, password) => {
      const res = await authService.login(username, password);
      return applyAuthSuccess(res);
    },
    [applyAuthSuccess]
  );

  const register = useCallback(
    async (payload) => {
      const res = await authService.register(payload);
      return applyAuthSuccess(res);
    },
    [applyAuthSuccess]
  );

  const voiceLogin = useCallback(
    async (payload) => {
      const res = await authService.voiceLogin(payload);
      return applyAuthSuccess(res);
    },
    [applyAuthSuccess]
  );

  const googleLogin = useCallback(
    async (credential) => {
      const res = await authService.googleLogin(credential);
      return applyAuthSuccess(res);
    },
    [applyAuthSuccess]
  );

  const selectRole = useCallback(
    async (payload) => {
      const res = await authService.selectRole(payload);
      return applyAuthSuccess(res);
    },
    [applyAuthSuccess]
  );

  const sendEmailCode = useCallback(
    async (email) => {
      const res = await authService.sendEmailCode(email);
      return res;
    },
    []
  );

  const verifyEmailCode = useCallback(
    async (payload) => {
      const res = await authService.verifyEmailCode(payload);
      return applyAuthSuccess(res);
    },
    [applyAuthSuccess]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Clear local state even if backend unreachable
    }
    setAuthToken('');
    setTokenState('');
    setUser(null);
    setSharingSession(null);
    localStorage.removeItem(USER_CACHE_KEY);
    syncServiceWorkerAuth('');
  }, [syncServiceWorkerAuth]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        sharingSession,
        setSharingSession,
        refreshSharing,
        refreshUser,
        login,
        register,
        voiceLogin,
        googleLogin,
        selectRole,
        sendEmailCode,
        verifyEmailCode,
        logout,
        reducedMotion,
        setReducedMotionPref,
        largeText,
        setLargeText,
        highContrast,
        setHighContrast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

