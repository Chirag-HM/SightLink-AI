// API service layer — replace base URLs with real endpoints when hardware is connected

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost:8000';

// Generic fetch wrapper with error handling
async function apiFetch(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`API call to ${endpoint} failed:`, error.message);
    return null;
  }
}

// AI Vision
export const visionService = {
  getDetections: () => apiFetch('/api/vision/detections'),
  getStream: () => `${API_BASE}/api/vision/stream`,
  getCameraStatus: () => apiFetch('/api/vision/status'),
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
// BMTC Bus Tracking
export const bmtcService = {
  // Search buses by BMTC route number
  searchRoute: (route) =>
    apiFetch(`/bus-route/${encodeURIComponent(route)}`),

  // Get detailed information about a specific bus
  getBusDetails: (vehicleId) =>
    apiFetch(`/bus/${encodeURIComponent(vehicleId)}`),
};
// Ultrasonic Sensor
export const ultrasonicService = {
  getDistance: () => apiFetch('/api/ultrasonic/distance'),
};

// SOS & Safety
export const safetyService = {
  triggerSOS: (location) => apiFetch('/api/safety/sos', { method: 'POST', body: JSON.stringify(location) }),
  getContacts: () => apiFetch('/api/safety/contacts'),
  addContact: (contact) => apiFetch('/api/safety/contacts', { method: 'POST', body: JSON.stringify(contact) }),
  getVolunteers: (lat, lng) => apiFetch(`/api/safety/volunteers?lat=${lat}&lng=${lng}`),
};

// Voice Assistant
export const voiceService = {
  sendCommand: (text) => apiFetch('/api/voice/command', { method: 'POST', body: JSON.stringify({ text }) }),
};

// Navigation
export const navigationService = {
  getRoute: (from, to) => apiFetch(`/api/navigation/route?from=${from}&to=${to}`),
  getSignal: () => apiFetch('/api/navigation/signal'),
};

// WebSocket connections for real-time data
export function createWebSocket(path, onMessage, onError) {
  const ws = new WebSocket(`${WS_BASE}${path}`);
  ws.onmessage = (event) => onMessage(JSON.parse(event.data));
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
