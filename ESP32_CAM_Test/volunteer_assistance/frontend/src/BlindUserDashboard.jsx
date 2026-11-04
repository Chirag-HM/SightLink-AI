import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import { 
  AlertCircle, CheckCircle, Navigation, Volume2, VolumeX, 
  RefreshCw, XCircle, PhoneCall, Radio, Crosshair
} from 'lucide-react';

export function BlindUserDashboard({ user }) {
  const [activeRequest, setActiveRequest] = useState(null);
  const [assistanceType, setAssistanceType] = useState('General Assistance');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [gpsSource, setGpsSource] = useState('Detecting GPS...');
  const [coords, setCoords] = useState(null);
  const [voiceFeedback, setVoiceFeedback] = useState(true);

  // Web Speech API Voice synthesis helper
  const speak = useCallback((text) => {
    if (!voiceFeedback || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }, [voiceFeedback]);

  // Fetch coordinates: First tries ESP8266 Smart Blind Stick, then Browser Geolocation
  const updateGPS = useCallback(async () => {
    try {
      const stickData = await api.getStickGPS();
      if (stickData.fix && stickData.latitude && stickData.longitude) {
        setCoords({ lat: stickData.latitude, lon: stickData.longitude });
        setGpsSource(`ESP8266 Blind Stick (${stickData.satellites} Sats)`);
        return { lat: stickData.latitude, lon: stickData.longitude };
      }
    } catch (e) {
      // Stick query failed or offline
    }

    // Browser Geolocation fallback
    if (navigator.geolocation) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            setCoords(c);
            setGpsSource('Browser Device GPS');
            resolve(c);
          },
          (err) => {
            // Default demo fallback (Bangalore city center) if location permission is denied
            const fallback = { lat: 12.9716, lon: 77.5946 };
            setCoords(fallback);
            setGpsSource('Default Coordinates (Bangalore)');
            resolve(fallback);
          },
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });
    }
  }, []);

  // Initial load: check active request and GPS
  useEffect(() => {
    updateGPS();
    api.getActiveRequest().then((req) => {
      if (req) {
        setActiveRequest(req);
        if (req.status === 'PENDING') {
          setStatusMessage(`Searching for volunteers within ${req.radius_km} km...`);
        } else if (req.status === 'ACCEPTED') {
          setStatusMessage(`Accepted by ${req.accepted_volunteer?.full_name || 'Volunteer'}`);
        }
      }
    }).catch(console.warn);
  }, [updateGPS]);

  // Real-time WebSocket messages
  const handleWSMessage = useCallback((msg) => {
    if (msg.type === 'REQUEST_ACCEPTED') {
      setActiveRequest((prev) => ({
        ...prev,
        status: 'ACCEPTED',
        accepted_volunteer: msg.volunteer
      }));
      const text = `Good news! Volunteer ${msg.volunteer.name} has accepted your request and is heading your way.`;
      setStatusMessage(text);
      speak(text);
    } else if (msg.type === 'REQUEST_EXPIRED') {
      setActiveRequest(null);
      const text = 'Your help request timed out without a nearby volunteer. You can tap expand radius to search further.';
      setStatusMessage(text);
      speak(text);
    } else if (msg.type === 'REQUEST_CANCELLED') {
      setActiveRequest(null);
      const text = `Request cancelled by ${msg.cancelled_by || 'user'}.`;
      setStatusMessage(text);
      speak(text);
    } else if (msg.type === 'REQUEST_COMPLETED') {
      setActiveRequest(null);
      const text = 'Assistance session completed. Thank you!';
      setStatusMessage(text);
      speak(text);
    }
  }, [speak]);

  const { isConnected } = useWebSocket(user.id, 'blind_user', handleWSMessage);

  // Trigger assistance request
  const handleRequestHelp = async () => {
    setLoading(true);
    speak('Requesting assistance. Acquiring location.');
    try {
      const currentCoords = coords || await updateGPS();
      const res = await api.createRequest({
        latitude: currentCoords.lat,
        longitude: currentCoords.lon,
        assistance_type: assistanceType,
        radius_km: 1.0
      });

      if (res.volunteers_notified_count > 0) {
        const announcement = `Help request sent to ${res.volunteers_notified_count} nearby volunteer${res.volunteers_notified_count > 1 ? 's' : ''}. Please stand by.`;
        setStatusMessage(announcement);
        speak(announcement);
      } else {
        const announcement = 'No volunteers are currently available within 1 kilometer. You can expand your search radius.';
        setStatusMessage(announcement);
        speak(announcement);
      }

      // Refresh active request state
      const active = await api.getActiveRequest();
      setActiveRequest(active);
    } catch (e) {
      const errText = `Could not create request: ${e.message}`;
      setStatusMessage(errText);
      speak(errText);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRequest) return;
    try {
      await api.cancelRequest(activeRequest.id, 'Cancelled by blind user');
      setActiveRequest(null);
      speak('Assistance request cancelled.');
      setStatusMessage('Request cancelled.');
    } catch (e) {
      console.error(e);
    }
  };

  const handleExpandRadius = async (newRadius) => {
    if (!activeRequest) return;
    try {
      setLoading(true);
      const res = await api.expandRadius(activeRequest.id, newRadius);
      setActiveRequest((prev) => ({ ...prev, radius_km: newRadius }));
      const msg = `Search expanded to ${newRadius} km. ${res.volunteers_notified_count} volunteers found.`;
      setStatusMessage(msg);
      speak(msg);
    } catch (e) {
      speak('Failed to expand radius.');
    } finally {
      setLoading(false);
    }
  };

  const isPending = activeRequest?.status === 'PENDING';
  const isAccepted = activeRequest?.status === 'ACCEPTED';

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Accessibility & Status Banner */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Blind User Assistant</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            <Radio size={16} color={isConnected ? '#10b981' : '#f59e0b'} />
            <span>{isConnected ? 'Real-Time Dispatch Live' : 'Connecting to Dispatch...'}</span>
          </div>
        </div>

        <button
          onClick={() => {
            const next = !voiceFeedback;
            setVoiceFeedback(next);
            if (next) speak('Voice announcements enabled');
          }}
          style={{
            background: voiceFeedback ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            border: '2px solid',
            borderColor: voiceFeedback ? '#3b82f6' : '#475569',
            color: voiceFeedback ? '#60a5fa' : '#94a3b8',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.95rem',
            fontWeight: 700
          }}
          aria-label={voiceFeedback ? 'Mute voice announcements' : 'Enable voice announcements'}
        >
          {voiceFeedback ? <Volume2 size={20} /> : <VolumeX size={20} />}
          <span>{voiceFeedback ? 'Voice: ON' : 'Voice: OFF'}</span>
        </button>
      </div>

      {/* GPS Location Source Indicator */}
      <div className="card" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Crosshair size={22} color="#60a5fa" />
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Location Source</div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{gpsSource}</div>
          </div>
        </div>
        <button
          onClick={updateGPS}
          style={{ background: 'transparent', color: '#60a5fa', padding: '6px 12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={16} /> Refresh GPS
        </button>
      </div>

      {/* Assistance Type Selection (before request) */}
      {!activeRequest && (
        <div className="card">
          <label style={{ display: 'block', fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }} htmlFor="assist-select">
            Type of Assistance Needed:
          </label>
          <select
            id="assist-select"
            value={assistanceType}
            onChange={(e) => setAssistanceType(e.target.value)}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '1.1rem',
              fontWeight: 600,
              borderRadius: '12px',
              background: '#0f172a',
              color: '#f8fafc',
              border: '2px solid #334155'
            }}
          >
            <option value="General Assistance">General Assistance</option>
            <option value="Road / Zebra Crossing">Road / Zebra Crossing</option>
            <option value="Bus Boarding & Navigation">Bus Boarding & Navigation</option>
            <option value="Obstacle Guidance">Obstacle Guidance</option>
            <option value="Emergency Support">Emergency Support</option>
          </select>
        </div>
      )}

      {/* GIANT ACCESSIBLE HELP BUTTON */}
      {!activeRequest ? (
        <button
          className={`giant-help-btn ${loading ? 'requesting' : ''}`}
          onClick={handleRequestHelp}
          disabled={loading}
          aria-label="Request Nearby Volunteer Assistance"
        >
          <AlertCircle size={56} />
          <span>{loading ? 'Calling Volunteers...' : 'REQUEST HELP'}</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.9 }}>
            Notifies available volunteers within 1.0 km
          </span>
        </button>
      ) : (
        /* ACTIVE REQUEST HUD */
        <div className="card" style={{ border: `3px solid ${isAccepted ? '#10b981' : '#f59e0b'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className={`status-badge ${activeRequest.status.toLowerCase()}`}>
              {activeRequest.status === 'PENDING' ? <RefreshCw size={16} className="spin" /> : <CheckCircle size={16} />}
              Status: {activeRequest.status}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Radius: {activeRequest.radius_km} km
            </span>
          </div>

          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '8px' }}>
            {activeRequest.assistance_type}
          </h3>

          <p style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: '20px' }}>
            {statusMessage || 'Searching nearby volunteers...'}
          </p>

          {/* Accepted Volunteer Contact Card */}
          {isAccepted && activeRequest.accepted_volunteer && (
            <div style={{ background: '#064e3b', border: '2px solid #059669', borderRadius: '16px', padding: '18px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle size={32} color="#34d399" />
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ecfdf5' }}>
                    {activeRequest.accepted_volunteer.full_name}
                  </div>
                  <div style={{ color: '#a7f3d0', fontSize: '1rem' }}>
                    Distance: {activeRequest.accepted_volunteer.approx_distance_text || 'Nearby'}
                  </div>
                  {activeRequest.accepted_volunteer.phone_number && (
                    <div style={{ color: '#6ee7b7', fontSize: '0.95rem', marginTop: '4px' }}>
                      Phone: <a href={`tel:${activeRequest.accepted_volunteer.phone_number}`} style={{ color: '#fff', textDecoration: 'underline' }}>{activeRequest.accepted_volunteer.phone_number}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {isPending && (
              <>
                <button
                  onClick={() => handleExpandRadius(2.0)}
                  style={{ flex: 1, minWidth: '160px', background: '#3b82f6', color: '#fff', padding: '14px', fontSize: '1rem', fontWeight: 700 }}
                >
                  Expand to 2.0 km
                </button>
                <button
                  onClick={() => handleExpandRadius(5.0)}
                  style={{ flex: 1, minWidth: '160px', background: '#6366f1', color: '#fff', padding: '14px', fontSize: '1rem', fontWeight: 700 }}
                >
                  Expand to 5.0 km
                </button>
              </>
            )}

            <button
              onClick={handleCancel}
              style={{ flex: 1, minWidth: '160px', background: '#ef4444', color: '#fff', padding: '14px', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <XCircle size={20} /> Cancel Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
