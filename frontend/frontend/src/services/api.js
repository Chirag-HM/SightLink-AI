// API service layer — preserves all existing hardware/BMTC endpoints and adds Auth, Assistance, Volunteer & Family Tracking

const rawApiBase = import.meta.env.VITE_API_BASE || '';
const rawWsBase = import.meta.env.VITE_WS_BASE || '';

export function getApiBase() {
  if (rawApiBase) return rawApiBase.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.protocol !== 'file:') {
    return ''; // Same-origin relative URLs (Vite proxy / FastAPI SPA serve) preserve httpOnly & CSRF cookies
  }
  return 'http://localhost:8000';
}

export function getWsBase() {
  if (rawWsBase) return rawWsBase.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:8000';
}

const LEGACY_TOKEN_KEY = 'sightlink_auth_token';
let inMemoryToken = '';

// Purge legacy localStorage JWT storage so sessions stay in httpOnly cookies
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
} catch {
  // ignore
}

export function getCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const prefix = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return '';
}

export function getAuthToken() {
  return inMemoryToken || '';
}

export function setAuthToken(token) {
  inMemoryToken = token || '';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

function buildAuthAndCsrfHeaders(options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const csrfToken = isMutation ? getCookie('sightlink_csrf') : '';
  // When using an explicit cross-origin VITE_API_BASE fallback, pass Bearer if in memory;
  // on same-origin use httpOnly session cookie + X-CSRF-Token header exclusively.
  const useCrossOriginBearer = Boolean(rawApiBase && inMemoryToken);

  return {
    'Content-Type': 'application/json',
    ...(useCrossOriginBearer ? { Authorization: `Bearer ${inMemoryToken}` } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...options.headers,
  };
}

// Legacy generic fetch wrapper with graceful null fallback (kept for existing hardware pollers)
async function apiFetch(endpoint, options = {}) {
  try {
    const response = await fetch(`${getApiBase()}${endpoint}`, {
      credentials: 'include',
      ...options,
      headers: buildAuthAndCsrfHeaders(options),
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`API call to ${endpoint} failed:`, error.message);
    return null;
  }
}

// Strict request helper that surfaces FastAPI `detail` error messages
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${getApiBase()}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers: buildAuthAndCsrfHeaders(options),
  });

  const text = await response.text();
  const trimmed = (text || '').trim();
  const isHtml = trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head');
  let data = null;
  try {
    data = (!isHtml && trimmed) ? JSON.parse(trimmed) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    let message = data?.detail || data?.message;
    if (!message || isHtml) {
      if (response.status === 404) {
        message = 'Requested transit stop or route was not found.';
      } else if (response.status >= 500) {
        message = 'Transit service is temporarily unavailable. Please retry.';
      } else {
        message = `Request failed (HTTP ${response.status}).`;
      }
    }
    const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (isHtml) {
    throw new Error('Received unexpected HTML response from server.');
  }

  return data;
}

// AI Vision
export const visionService = {
  getDetections: () => apiFetch('/api/vision/detections'),
  getCameraStatus: () => apiFetch('/api/vision/status'),
  getConfig: () => apiFetch('/api/vision/config'),
  setConfig: (cameraUrl, probe = true) =>
    apiRequest('/api/vision/config', {
      method: 'POST',
      body: JSON.stringify({ camera_url: cameraUrl, probe }),
    }),
  discover: (scanLan = true) =>
    apiRequest(`/api/vision/discover?scan_lan=${scanLan ? 'true' : 'false'}`, {
      method: 'POST',
    }),
  getCaptureUrl: (cameraUrl) => {
    const base = getApiBase();
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (cameraUrl) params.set('url', cameraUrl);
    return `${base}/api/vision/capture?${params.toString()}`;
  },
  getStream: (cameraUrl) => {
    const base = getApiBase();
    const q = cameraUrl ? `?url=${encodeURIComponent(cameraUrl)}` : '';
    return `${base}/api/vision/stream${q}`;
  },
};

// GPS
export const gpsService = {
  getLocation: () => apiFetch('/api/gps/location'),
  getHistory: () => apiFetch('/api/gps/history'),
  async getStickLocation(deviceUrl, signal) {
    const response = await fetch(`${deviceUrl.replace(/\/+$/, '')}/gps`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      throw new Error(`Smart stick returned HTTP ${response.status}.`);
    }

    const location = await response.json();
    if (typeof location.fix !== 'boolean') {
      throw new Error('Smart stick returned an invalid GPS response.');
    }
    return location;
  },
};

// BMTC Bus Tracking
export const bmtcService = {
  getAllRoutes: () => apiRequest('/routes'),
  searchRoute: (route) =>
    apiRequest(`/bus-route/${encodeURIComponent(route)}`),
  discoverBuses: (route) =>
    apiRequest(`/discover-buses/${encodeURIComponent(route)}`),
  getNearbyBus: (route, latitude, longitude) =>
    apiRequest(`/nearby-bus/${encodeURIComponent(route)}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`),
  getVoiceBus: (route, latitude, longitude) =>
    apiRequest(`/voice-bus/${encodeURIComponent(route)}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`),
  getBusDetails: (vehicleId) =>
    apiRequest(`/bus/${encodeURIComponent(vehicleId)}`),
  getRouteStops: (route, latitude, longitude) => {
    let q = `/route-stops/${encodeURIComponent(route)}`;
    if (latitude != null && longitude != null) {
      q += `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`;
    }
    return apiRequest(q);
  },
  planTrip: (source, destination, latitude, longitude) => {
    let q = `/trip-planner?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}`;
    if (latitude != null && longitude != null) {
      q += `&user_lat=${encodeURIComponent(latitude)}&user_lng=${encodeURIComponent(longitude)}`;
    }
    return apiRequest(q);
  },
  getPopularStops: () => apiRequest('/popular-stops'),
  getFareEstimate: (distanceKm) => apiRequest(`/fare-estimate?distance_km=${encodeURIComponent(distanceKm)}`),
};

// System Health
export const systemService = {
  getHealth: () => apiFetch('/api/health'),
};

// Ultrasonic Sensor
export const ultrasonicService = {
  getDistance: () => apiFetch('/api/ultrasonic/distance'),
};

// SOS & Safety (keeps legacy signature + new strict endpoints)
export const safetyService = {
  triggerSOS: (location) =>
    apiFetch('/api/safety/sos', { method: 'POST', body: JSON.stringify(location || {}) }),
  getContacts: () => apiFetch('/api/safety/contacts'),
  addContact: (contact) =>
    apiFetch('/api/safety/contacts', { method: 'POST', body: JSON.stringify(contact) }),
  getVolunteers: (lat, lng) => apiFetch(`/api/safety/volunteers?lat=${lat}&lng=${lng}`),
};

export const safetyApiService = {
  triggerSos: (payload) =>
    apiRequest('/api/safety/sos', { method: 'POST', body: JSON.stringify(payload || {}) }),
  resolveSos: () =>
    apiRequest('/api/safety/sos/resolve', { method: 'POST' }),
  reportUser: (payload) =>
    apiRequest('/api/safety/report', { method: 'POST', body: JSON.stringify(payload) }),
  getBlocked: () => apiRequest('/api/safety/blocked'),
  unblockUser: (userId) =>
    apiRequest(`/api/safety/block/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
};

// Voice Assistant, Transit Adapters, & Hardware Button Endpoints
export const busUnifiedService = {
  getProviders: () => apiRequest('/api/bus/providers'),
  getNearestStop: (latitude, longitude) =>
    apiRequest(
      `/api/bus/nearest-stop?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`
    ),
  getArrivals: (route, { latitude, longitude, city, provider } = {}) => {
    const params = new URLSearchParams({ route: String(route || '') });
    if (latitude != null && longitude != null) {
      params.set('latitude', String(latitude));
      params.set('longitude', String(longitude));
    }
    if (city) params.set('city', city);
    if (provider) params.set('provider', provider);
    return apiRequest(`/api/bus/arrivals?${params.toString()}`);
  },
};

export const assistantService = {
  getConfig: () => apiRequest('/api/assistant/config'),
  getLogs: (clientId) =>
    apiRequest(`/api/assistant/logs${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`),
  addLog: (payload) =>
    apiRequest('/api/assistant/logs', { method: 'POST', body: JSON.stringify(payload) }),
  clearLogs: (clientId) =>
    apiRequest(
      `/api/assistant/logs${clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''}`,
      { method: 'DELETE' }
    ),
  parseWithLlm: (payload) =>
    apiRequest('/api/assistant/parse-llm', { method: 'POST', body: JSON.stringify(payload) }),
  geocode: (q, { lat, lng, limit = 4 } = {}) => {
    const params = new URLSearchParams({ q: String(q || ''), limit: String(limit) });
    if (lat != null && lng != null) {
      params.set('lat', String(lat));
      params.set('lng', String(lng));
    }
    return apiRequest(`/api/assistant/geocode?${params.toString()}`);
  },
  getNearestBusStop: (lat, lng, limit = 5) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) });
    return apiRequest(`/api/assistant/nearest-bus-stop?${params.toString()}`);
  },
  getWalkingRoute: ({ fromLat, fromLng, toLat, toLng }) => {
    const params = new URLSearchParams({
      from_lat: String(fromLat),
      from_lng: String(fromLng),
      to_lat: String(toLat),
      to_lng: String(toLng),
    });
    return apiRequest(`/api/assistant/route?${params.toString()}`);
  },
};

export const hardwareButtonService = {
  getStatus: () => apiFetch('/api/hardware/status'),
  triggerButtonEvent: (payload) =>
    apiRequest('/api/hardware/button-event', { method: 'POST', body: JSON.stringify(payload) }),
};

// Voice Assistant (legacy)
export const voiceService = {
  sendCommand: (text) => apiFetch('/api/voice/command', { method: 'POST', body: JSON.stringify({ text }) }),
};

// Navigation
export const navigationService = {
  getRoute: (from, to) => apiFetch(`/api/navigation/route?from=${from}&to=${to}`),
  getSignal: () => apiFetch('/api/navigation/signal'),
};

// Authentication & Verification
export const authService = {
  getConfig: () => apiRequest('/api/auth/config'),
  getCsrf: () => apiRequest('/api/auth/csrf'),
  requestOtp: (phone_number) =>
    apiRequest('/api/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone_number }) }),
  verifyOtp: (phone_number, code) =>
    apiRequest('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone_number, code }) }),
  register: (payload) =>
    apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (username, password) =>
    apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  voiceLogin: (payload) =>
    apiRequest('/api/auth/voice-login', { method: 'POST', body: JSON.stringify(payload) }),
  googleLogin: (credential) =>
    apiRequest('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  selectRole: (payload) =>
    apiRequest('/api/auth/select-role', { method: 'POST', body: JSON.stringify(payload) }),
  sendEmailCode: (email) =>
    apiRequest('/api/auth/email/send-code', {
      method: 'POST',
      body: JSON.stringify(email ? { email } : {}),
    }),
  verifyEmailCode: (payload) =>
    apiRequest('/api/auth/email/verify', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/api/auth/me'),
};

// Telegram Bot Integration (Free Alerts)
export const telegramService = {
  createConnectLink: () =>
    apiRequest('/api/telegram/connect-link', { method: 'POST' }),
  getStatus: () => apiRequest('/api/telegram/status'),
  disconnect: () =>
    apiRequest('/api/telegram/disconnect', { method: 'POST' }),
};

// Volunteer Dashboard & Duty
export const volunteerService = {
  setAvailability: (is_available) =>
    apiRequest('/api/volunteer/availability', { method: 'PUT', body: JSON.stringify({ is_available }) }),
  updateLocation: (payload) =>
    apiRequest('/api/volunteer/location', { method: 'PUT', body: JSON.stringify(payload) }),
  verifyIdentity: (payload) =>
    apiRequest('/api/volunteer/verify', { method: 'POST', body: JSON.stringify(payload) }),
  getPendingRequests: () => apiRequest('/api/volunteer/pending-requests'),
  getHistory: () => apiRequest('/api/volunteer/history'),
  getStatus: () => apiRequest('/api/volunteer/status'),
};

// Voice-Activated Help Requests
export const assistanceService = {
  createRequest: (payload) =>
    apiRequest('/api/assistance/request', { method: 'POST', body: JSON.stringify(payload) }),
  escalate: (requestId) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/escalate`, { method: 'POST' }),
  accept: (requestId) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/accept`, { method: 'POST' }),
  decline: (requestId) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/decline`, { method: 'POST' }),
  markArrived: (requestId) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/arrived`, { method: 'POST' }),
  updateLocation: (requestId, payload) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/location`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  cancel: (requestId, reason) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  complete: (requestId) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/complete`, { method: 'POST' }),
  rate: (requestId, rating, comment) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  expandRadius: (requestId, new_radius_km) =>
    apiRequest(`/api/assistance/${encodeURIComponent(requestId)}/expand-radius`, {
      method: 'POST',
      body: JSON.stringify({ new_radius_km }),
    }),
  getActive: () => apiRequest('/api/assistance/active'),
  getHistory: () => apiRequest('/api/assistance/history'),
};

// Eyes on Demand (Live Video Assistance)
export const liveAssistService = {
  createSession: (payload) =>
    apiRequest('/api/live-assist/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  escalateRadius: (sessionId) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/escalate-radius`, { method: 'POST' }),
  getPending: () => apiRequest('/api/live-assist/pending'),
  accept: (sessionId) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/accept`, { method: 'POST' }),
  decline: (sessionId) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/decline`, { method: 'POST' }),
  extend: (sessionId, extra_seconds = 30) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/extend`, {
      method: 'POST',
      body: JSON.stringify({ extra_seconds }),
    }),
  quickReply: (sessionId, prompt_text) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/quick-reply`, {
      method: 'POST',
      body: JSON.stringify({ prompt_text }),
    }),
  toggleFlash: (sessionId, flash_on) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/flash`, {
      method: 'POST',
      body: JSON.stringify({ flash_on }),
    }),
  audioFallback: (sessionId, reason = 'Weak connection — switched to audio-only') =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/audio-fallback`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  escalateToInPerson: (sessionId) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/escalate`, { method: 'POST' }),
  endSession: (sessionId, outcome = 'completed') =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    }),
  rate: (sessionId, rating, comment) =>
    apiRequest(`/api/live-assist/${encodeURIComponent(sessionId)}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  getActive: () => apiRequest('/api/live-assist/active'),
  getHistory: () => apiRequest('/api/live-assist/history'),
};

// Family Live Tracking & Calm Updates
export const familyService = {
  getSharing: () => apiRequest('/api/family/sharing'),
  updateConsent: (payload) =>
    apiRequest('/api/family/sharing/consent', { method: 'POST', body: JSON.stringify(payload) }),
  saveSafeZone: (payload) =>
    apiRequest('/api/family/sharing/safe-zone', { method: 'PUT', body: JSON.stringify(payload) }),
  sendTelemetry: (payload) =>
    apiRequest('/api/family/location', { method: 'POST', body: JSON.stringify(payload) }),
  deleteLocationHistory: () =>
    apiRequest('/api/family/location-history', { method: 'DELETE' }),
  getSavedPlaces: () => apiRequest('/api/family/saved-places'),
  savePlace: (payload) =>
    apiRequest('/api/family/saved-places', { method: 'POST', body: JSON.stringify(payload) }),
  deletePlace: (placeId) =>
    apiRequest(`/api/family/saved-places/${encodeURIComponent(placeId)}`, { method: 'DELETE' }),
  getMembers: () => apiRequest('/api/family/members'),
  confirmMember: (linkId, approved) =>
    apiRequest(`/api/family/members/${encodeURIComponent(linkId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    }),
  confirmLatestInvite: (approved = true) =>
    apiRequest('/api/family/members/confirm-latest', {
      method: 'POST',
      body: JSON.stringify({ approved }),
    }),
  updateMemberPermissions: (linkId, payload) =>
    apiRequest(`/api/family/members/${encodeURIComponent(linkId)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  removeMember: (linkId) =>
    apiRequest(`/api/family/members/${encodeURIComponent(linkId)}`, { method: 'DELETE' }),
  updateMyLinkPreferences: (linkId, payload) =>
    apiRequest(`/api/family/my-links/${encodeURIComponent(linkId)}/preferences`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getDeliveryLogs: () => apiRequest('/api/family/notifications/logs'),
  trackByCode: (inviteCode) =>
    apiRequest(`/api/family/track/${encodeURIComponent(inviteCode)}`),
  getTimelineByCode: (inviteCode) =>
    apiRequest(`/api/family/timeline/${encodeURIComponent(inviteCode)}`),
  getMyTimeline: () => apiRequest('/api/family/my/timeline'),
  linkUser: (invite_code, relationship_label = 'Family Guardian') =>
    apiRequest('/api/family/link', {
      method: 'POST',
      body: JSON.stringify({ invite_code, relationship_label }),
    }),
  getLinked: () => apiRequest('/api/family/linked'),
  sendCheckInAlert: (payload) =>
    apiRequest('/api/family/check-in-alert', { method: 'POST', body: JSON.stringify(payload || {}) }),
  emitNavigationEvent: (payload) =>
    apiRequest('/api/family/navigation-event', { method: 'POST', body: JSON.stringify(payload) }),
};

// Web Push Registration
export const pushService = {
  getVapidKey: () => apiRequest('/api/push/vapid-public-key'),
  subscribe: (payload) =>
    apiRequest('/api/push/subscribe', { method: 'POST', body: JSON.stringify(payload) }),
};

// Google Health Connect Integration Service
export const healthService = {
  getSummary: (date) =>
    apiRequest(`/api/health-connect/dashboard/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  getTrends: (period = 'weekly') =>
    apiRequest(`/api/health-connect/dashboard/trends?period=${encodeURIComponent(period)}`),
  getStatus: () =>
    apiRequest('/api/health-connect/status'),
  getDevices: () =>
    apiRequest('/api/health-connect/devices'),
  generatePairCode: () =>
    apiRequest('/api/health-connect/devices/pair-code', { method: 'POST' }),
  unlinkDevice: (deviceId) =>
    apiRequest(`/api/health-connect/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
  purgeHealthRecords: () =>
    apiRequest('/api/health-connect/records', { method: 'DELETE' }),
  getRawRecords: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/health-connect/records${q ? `?${q}` : ''}`);
  },
};

// WebSocket connections for real-time data
export function createWebSocket(path, onMessage, onError) {
  const ws = new WebSocket(`${getWsBase()}${path}`);
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      onMessage(event.data);
    }
  };
  ws.onerror = (error) => onError?.(error);
  ws.onclose = () => console.log(`WebSocket ${path} closed`);
  return ws;
}

export const wsEndpoints = {
  vision: '/ws/vision',
  gps: '/ws/gps',
  ultrasonic: '/ws/ultrasonic',
  bmtc: '/ws/bmtc',
  sos: '/ws/sos',
};
