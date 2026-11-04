import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import { 
  Bell, CheckCircle, Navigation, ShieldCheck, MapPin, 
  Check, X, Radio, AlertTriangle, PhoneCall, Clock
} from 'lucide-react';

export function VolunteerDashboard({ user }) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [locationStatus, setLocationStatus] = useState('Syncing location...');
  const [volunteerCoords, setVolunteerCoords] = useState(null);
  const [fcmStatus, setFcmStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // 1. Sync GPS Location of Volunteer
  const syncLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setVolunteerCoords({ lat, lon });
          setLocationStatus(`Live Location: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
          try {
            await api.updateLocation(lat, lon, true);
          } catch (e) {
            console.warn('Location sync failed:', e);
          }
        },
        (err) => {
          // Fallback for development/demo (nearby blind user location in Bangalore)
          const lat = 12.9730;
          const lon = 77.5960;
          setVolunteerCoords({ lat, lon });
          setLocationStatus('Demo Location (~200m from Blind User)');
          api.updateLocation(lat, lon, true).catch(console.warn);
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // 2. Fetch volunteer profile status and initial pending list
  useEffect(() => {
    syncLocation();
    const interval = setInterval(syncLocation, 30000); // sync every 30s

    api.getVolunteerStatus().then((st) => {
      setIsAvailable(st.is_available);
      setFcmStatus(st.fcm_status);
    }).catch(console.warn);

    api.getActiveRequest().then((active) => {
      if (active && active.status === 'ACCEPTED') {
        setActiveSession(active);
      }
    }).catch(console.warn);

    api.getPendingRequests().then((reqs) => {
      setPendingRequests(reqs);
    }).catch(console.warn);

    return () => clearInterval(interval);
  }, [syncLocation]);

  // 3. Handle incoming WebSocket alerts in real-time
  const handleWSMessage = useCallback((msg) => {
    if (msg.type === 'NEW_ASSISTANCE_REQUEST') {
      // Add incoming request to pending list
      setPendingRequests((prev) => {
        if (prev.find((r) => r.id === msg.request_id)) return prev;
        return [
          {
            id: msg.request_id,
            blind_user_name: msg.blind_user_name,
            assistance_type: msg.assistance_type,
            notes: msg.notes,
            approx_distance_km: msg.approx_distance_km,
            approx_distance_text: msg.approx_distance_text,
            created_at: msg.created_at,
            latitude: msg.fuzzed_latitude,
            longitude: msg.fuzzed_longitude,
            radius_km: msg.radius_km
          },
          ...prev
        ];
      });

      // Play subtle chime or browser notification
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 587.33; // D5 note
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.6);
      } catch (e) {
        // AudioContext not allowed before user interaction
      }
    } else if (msg.type === 'REQUEST_CLAIMED_BY_OTHER') {
      // Another volunteer claimed it first; remove from pending list
      setPendingRequests((prev) => prev.filter((r) => r.id !== msg.request_id));
    } else if (msg.type === 'REQUEST_CANCELLED') {
      setPendingRequests((prev) => prev.filter((r) => r.id !== msg.request_id));
      if (activeSession && activeSession.id === msg.request_id) {
        setActiveSession(null);
        setStatusMessage('The blind user cancelled this assistance request.');
      }
    } else if (msg.type === 'REQUEST_COMPLETED') {
      setActiveSession(null);
      setStatusMessage('Assistance request was completed.');
    }
  }, [activeSession]);

  const { isConnected } = useWebSocket(user.id, 'volunteer', handleWSMessage);

  // Toggle availability
  const handleToggleAvailability = async (e) => {
    const nextVal = e.target.checked;
    setIsAvailable(nextVal);
    try {
      await api.updateAvailability(nextVal);
      if (nextVal) {
        const reqs = await api.getPendingRequests();
        setPendingRequests(reqs);
      } else {
        setPendingRequests([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Accept a request atomically
  const handleAccept = async (requestId) => {
    try {
      const res = await api.acceptRequest(requestId);
      setActiveSession(res);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setStatusMessage(`You accepted ${res.blind_user_name}'s request.`);
    } catch (e) {
      if (e.status === 409) {
        alert('This request was already accepted by another nearby volunteer.');
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      } else {
        alert(`Error: ${e.message}`);
      }
    }
  };

  // Decline request (dismiss locally)
  const handleDecline = (requestId) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  // Complete session
  const handleComplete = async () => {
    if (!activeSession) return;
    try {
      await api.completeRequest(activeSession.id);
      setActiveSession(null);
      setStatusMessage('Assistance session completed. Thank you for volunteering!');
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Availability Header Card */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Volunteer Control Hub</h2>
            <Radio size={16} color={isConnected ? '#10b981' : '#f59e0b'} />
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            {locationStatus}
          </div>
        </div>

        {/* Big Availability Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#0f172a', padding: '10px 18px', borderRadius: '16px', border: '1px solid #334155' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: isAvailable ? '#34d399' : '#94a3b8' }}>
            {isAvailable ? 'AVAILABLE (1 KM)' : 'OFFLINE'}
          </span>
          <label className="toggle-switch">
            <input type="checkbox" checked={isAvailable} onChange={handleToggleAvailability} />
            <span className="slider"></span>
          </label>
        </div>
      </div>

      {/* Background FCM / WebSocket status indicator */}
      {fcmStatus && !fcmStatus.configured && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.88rem', color: '#fde68a' }}>
          <AlertTriangle size={18} color="#f59e0b" />
          <span>{fcmStatus.message}</span>
        </div>
      )}

      {statusMessage && (
        <div className="card" style={{ background: '#1e293b', padding: '12px 20px', color: '#93c5fd', fontSize: '0.95rem' }}>
          {statusMessage}
        </div>
      )}

      {/* ACTIVE CLAIMED ASSISTANCE SESSION */}
      {activeSession && (
        <div className="card" style={{ border: '3px solid #10b981', background: 'linear-gradient(180deg, #064e3b 0%, #062f26 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className="status-badge accepted">
              <CheckCircle size={16} /> Active Assistance Session
            </span>
            <span style={{ color: '#a7f3d0', fontSize: '0.9rem' }}>
              ID: {activeSession.id.slice(0, 8)}...
            </span>
          </div>

          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f0fdf4', marginBottom: '8px' }}>
            {activeSession.assistance_type}
          </h3>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ecfdf5' }}>
              Assisting: {activeSession.blind_user_name || 'Blind User'}
            </div>
            <div style={{ color: '#6ee7b7', marginTop: '4px' }}>
              Approx Distance: {activeSession.approx_distance_text || 'Nearby'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '6px' }}>
              Coordinates: {activeSession.latitude.toFixed(5)}, {activeSession.longitude.toFixed(5)}
            </div>
            {activeSession.notes && (
              <div style={{ marginTop: '10px', color: '#cbd5e1', fontSize: '0.95rem' }}>
                Note: "{activeSession.notes}"
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleComplete}
              style={{ flex: 1, background: '#10b981', color: '#064e3b', fontWeight: 800, fontSize: '1.05rem', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <CheckCircle size={20} /> Mark As Completed
            </button>
            <button
              onClick={async () => {
                await api.cancelRequest(activeSession.id, 'Cancelled by volunteer');
                setActiveSession(null);
              }}
              style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid #ef4444', fontWeight: 700, padding: '14px 20px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* REAL-TIME INCOMING ASSISTANCE REQUESTS */}
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={20} color="#3b82f6" />
          Nearby Assistance Requests
          <span style={{ fontSize: '0.85rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '999px' }}>
            {pendingRequests.length}
          </span>
        </h3>

        {!isAvailable ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <ShieldCheck size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>You Are Currently Offline</div>
            <p style={{ marginTop: '6px', fontSize: '0.95rem' }}>
              Toggle the availability switch above to receive real-time alerts from blind users within 1 km.
            </p>
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <Radio size={48} style={{ margin: '0 auto 12px', opacity: 0.4, color: '#10b981' }} />
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>Radar Active — No Active Help Requests</div>
            <p style={{ marginTop: '6px', fontSize: '0.95rem' }}>
              Listening for nearby blind users within 1.0 km. You will hear an alert the moment someone requests help.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pendingRequests.map((req) => (
              <div key={req.id} className="card" style={{ border: '2px solid #3b82f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <span className="status-badge pending" style={{ marginBottom: '8px' }}>
                      <Clock size={14} /> Pending Request
                    </span>
                    <h4 style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '4px' }}>
                      {req.assistance_type}
                    </h4>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      Requested by {req.blind_user_name || 'Blind User'} • {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ background: '#1e3a8a', color: '#93c5fd', padding: '6px 12px', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem' }}>
                      {req.approx_distance_text}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Within {req.radius_km} km radius
                    </div>
                  </div>
                </div>

                {req.notes && (
                  <p style={{ color: '#cbd5e1', fontSize: '0.95rem', background: '#0f172a', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
                    "{req.notes}"
                  </p>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => handleAccept(req.id)}
                    style={{ flex: 2, background: '#10b981', color: '#064e3b', fontWeight: 800, fontSize: '1rem', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Check size={18} /> ACCEPT ASSISTANCE REQUEST
                  </button>
                  <button
                    onClick={() => handleDecline(req.id)}
                    style={{ flex: 1, background: '#334155', color: '#cbd5e1', fontWeight: 600, padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <X size={16} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
