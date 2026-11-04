import React, { useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken } from './api';
import { BlindUserDashboard } from './BlindUserDashboard';
import { VolunteerDashboard } from './VolunteerDashboard';
import { UserCheck, Eye, HeartHandshake, LogOut, ShieldAlert } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState('blind_user');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Auto-login or register demo session
  const authenticateDemoUser = async (targetRole) => {
    setLoading(true);
    setAuthError(null);
    const password = import.meta.env.VITE_DEMO_PASSWORD;
    if (!password) {
      setAuthError('Set VITE_DEMO_PASSWORD in the frontend environment to use the demo dashboard.');
      setLoading(false);
      return;
    }

    const username = targetRole === 'blind_user' ? 'demo_blind_user' : 'demo_volunteer';
    const fullName = targetRole === 'blind_user' ? 'Ramesh (Blind User)' : 'Anita (Nearby Volunteer)';

    try {
      // Try login
      const res = await api.login({ username, password });
      setAuthToken(res.access_token);
      setCurrentUser({ id: res.user_id, role: res.role, full_name: res.full_name });
      setRole(res.role);
    } catch (e) {
      // Register if not existing
      try {
        const regRes = await api.register({
          username,
          password,
          full_name: fullName,
          role: targetRole,
          phone_number: '+91 98765 43210'
        });
        setAuthToken(regRes.access_token);
        setCurrentUser({ id: regRes.user_id, role: regRes.role, full_name: regRes.full_name });
        setRole(regRes.role);
      } catch (err) {
        console.error('Demo auth failed:', err);
        setAuthError('Demo sign-in failed. Check the API connection and demo credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if token exists
    const token = getAuthToken();
    if (token) {
      api.getProfile()
        .then((prof) => {
          setCurrentUser(prof);
          setRole(prof.role);
          setLoading(false);
        })
        .catch(() => {
          authenticateDemoUser('blind_user');
        });
    } else {
      authenticateDemoUser('blind_user');
    }
  }, []);

  const handleSwitchRole = (newRole) => {
    authenticateDemoUser(newRole);
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Top Application Navbar */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        background: '#131b2e',
        borderRadius: '20px',
        border: '2px solid #2d3b5d',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            padding: '10px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldAlert size={28} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
              SMART BLIND STICK
            </h1>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
              Nearby Volunteer Assistance Hub • 1 km Real-Time Dispatch
            </div>
          </div>
        </div>

        {/* Role Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0a0e17', padding: '6px', borderRadius: '14px', border: '1px solid #1e293b' }}>
          <button
            onClick={() => handleSwitchRole('blind_user')}
            style={{
              background: role === 'blind_user' ? '#ef4444' : 'transparent',
              color: role === 'blind_user' ? '#fff' : '#94a3b8',
              padding: '8px 16px',
              fontWeight: 700,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Eye size={16} /> Blind User
          </button>

          <button
            onClick={() => handleSwitchRole('volunteer')}
            style={{
              background: role === 'volunteer' ? '#10b981' : 'transparent',
              color: role === 'volunteer' ? '#064e3b' : '#94a3b8',
              padding: '8px 16px',
              fontWeight: 800,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <HeartHandshake size={16} /> Volunteer
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main>
        {authError ? (
          <div role="alert" style={{ textAlign: 'center', padding: '80px 20px', color: '#fca5a5', fontSize: '1.1rem', fontWeight: 600 }}>
            {authError}
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8', fontSize: '1.2rem', fontWeight: 600 }}>
            Initializing Assistance Hub...
          </div>
        ) : role === 'blind_user' ? (
          <BlindUserDashboard user={currentUser} />
        ) : (
          <VolunteerDashboard user={currentUser} />
        )}
      </main>

      {/* Footer Info */}
      <footer style={{ marginTop: '48px', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', lineHeight: '1.6' }}>
        Smart Blind Stick Assistive System • Preserving ESP8266 Firmware & ESP32-CAM AI Stream • WCAG AAA Accessible
      </footer>
    </div>
  );
}
