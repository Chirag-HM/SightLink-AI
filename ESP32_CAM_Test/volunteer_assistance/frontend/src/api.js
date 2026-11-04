const API_BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('assistance_auth_token') || '';
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('assistance_auth_token', token);
  } else {
    localStorage.removeItem('assistance_auth_token');
  }
}

async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorDetail = 'API request failed';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errorDetail;
    } catch (e) {
      errorDetail = response.statusText;
    }
    const error = new Error(errorDetail);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => request('/auth/me'),

  // Blind User Assistance
  createRequest: (data) => request('/assistance/request', { method: 'POST', body: JSON.stringify(data) }),
  getActiveRequest: () => request('/assistance/active'),
  cancelRequest: (requestId, reason = 'Cancelled by user') =>
    request(`/assistance/${requestId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  expandRadius: (requestId, newRadiusKm) =>
    request(`/assistance/${requestId}/expand-radius`, { method: 'POST', body: JSON.stringify({ new_radius_km: newRadiusKm }) }),
  completeRequest: (requestId) => request(`/assistance/${requestId}/complete`, { method: 'POST' }),

  // Volunteer
  updateAvailability: (isAvailable) =>
    request('/volunteer/availability', { method: 'PUT', body: JSON.stringify({ is_available: isAvailable }) }),
  updateLocation: (lat, lon, consent = true, fcmToken = null) =>
    request('/volunteer/location', {
      method: 'PUT',
      body: JSON.stringify({ latitude: lat, longitude: lon, share_consent: consent, fcm_token: fcmToken })
    }),
  getPendingRequests: () => request('/volunteer/pending-requests'),
  getVolunteerStatus: () => request('/volunteer/status'),
  acceptRequest: (requestId) => request(`/assistance/${requestId}/accept`, { method: 'POST' }),

  // ESP8266 Stick Gateway
  getStickGPS: (ip) => request(ip ? `/stick/gps?ip=${encodeURIComponent(ip)}` : '/stick/gps'),
};
