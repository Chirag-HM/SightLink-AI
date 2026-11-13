// Mock data for the SIGHTLINK AI platform
// Replace with real API data when hardware/backend is connected

export const mockDetections = [
  { id: 1, label: 'PERSON', confidence: 98, position: 'Ahead', distance: '2.4m', color: '#059669', x: 15, y: 10, w: 25, h: 55 },
  { id: 2, label: 'CHAIR', confidence: 94, position: 'Left', distance: '1.8m', color: '#9A7227', x: 55, y: 35, w: 18, h: 30 },
  { id: 3, label: 'LAPTOP', confidence: 91, position: 'Right', distance: '3.1m', color: '#0F766E', x: 60, y: 45, w: 15, h: 12 },
  { id: 4, label: 'BOTTLE', confidence: 87, position: 'Ahead-Right', distance: '2.0m', color: '#8C6A23', x: 42, y: 50, w: 6, h: 16 },
];

export const mockBuses = [
  { id: 1, route: '507', distance: '357m', direction: 'Approaching', eta: '31 sec', lat: 12.9720, lng: 77.5950 },
  { id: 2, route: '500C', distance: '1.2 km', direction: 'Moving away', eta: '~4 min', lat: 12.9700, lng: 77.5930 },
  { id: 3, route: '335E', distance: '2.8 km', direction: 'Approaching', eta: '~7 min', lat: 12.9740, lng: 77.5960 },
  { id: 4, route: '401', distance: '890m', direction: 'Stationary', eta: '~2 min', lat: 12.9710, lng: 77.5940 },
];

export const mockGPS = {
  latitude: 12.9716,
  longitude: 77.5946,
  accuracy: 4.2,
  altitude: 920,
  speed: 1.2,
  heading: 45,
  connected: true,
  satellites: 12,
};

export const mockUltrasonic = {
  distance: 2.8,
  unit: 'm',
  status: 'safe', // safe | warning | danger
  threshold: { safe: 2.0, warning: 1.0, danger: 0.5 },
};

export const mockTrustedContacts = [
  { id: 1, name: 'Amma', relation: 'Mother', phone: '+91 98765 43210', online: true, distance: '2.3 km', avatar: '👩' },
  { id: 2, name: 'Raj', relation: 'Brother', phone: '+91 87654 32109', online: true, distance: '5.1 km', avatar: '👨' },
  { id: 3, name: 'Priya', relation: 'Friend', phone: '+91 76543 21098', online: false, distance: '12.4 km', avatar: '👩‍🦰' },
];

export const mockVolunteers = [
  { id: 1, name: 'Volunteer A', distance: '0.8 km', available: true, responseTime: '~2 min', coords: { x: 35, y: 28 } },
  { id: 2, name: 'Volunteer B', distance: '1.4 km', available: true, responseTime: '~4 min', coords: { x: 62, y: 45 } },
  { id: 3, name: 'Volunteer C', distance: '2.1 km', available: false, responseTime: 'N/A', coords: { x: 75, y: 68 } },
  { id: 4, name: 'Volunteer D', distance: '0.5 km', available: true, responseTime: '~1 min', coords: { x: 48, y: 55 } },
];

export const mockHistory = [
  { time: '08:42', event: 'Person detected', type: 'detection', icon: 'Eye' },
  { time: '08:44', event: 'Obstacle warning — 1.2m ahead', type: 'warning', icon: 'AlertTriangle' },
  { time: '08:45', event: 'Bus 507 requested via voice', type: 'voice', icon: 'Mic' },
  { time: '08:46', event: 'Bus 507 approaching — 357m', type: 'bus', icon: 'Bus' },
  { time: '08:48', event: 'Traffic signal: GREEN', type: 'signal', icon: 'CircleDot' },
  { time: '08:50', event: 'Navigation started to MG Road', type: 'navigation', icon: 'Navigation' },
  { time: '08:52', event: 'Destination reached', type: 'arrival', icon: 'MapPin' },
];

export const mockDashboard = {
  aiVision: { status: 'Active', lastDetection: 'Person', confidence: 98 },
  distance: { value: 1.8, unit: 'm', status: 'safe' },
  gps: { connected: true, lat: 12.9716, lng: 77.5946 },
  bmtc: { route: '507', distance: '357m', direction: 'Approaching' },
  voice: { status: 'Listening', lastCommand: 'Which bus is nearby?' },
  safety: { status: 'Protected', contacts: 3, volunteers: 4 },
};

export const objectCategories = [
  { name: 'Person', confidence: 98, position: 'Ahead · 2.4m', icon: 'User', color: '#065F46' },
  { name: 'Vehicle', confidence: 95, position: 'Left · 4.1m', icon: 'Car', color: '#9A7227' },
  { name: 'Chair', confidence: 94, position: 'Right · 1.8m', icon: 'Armchair', color: '#047857' },
  { name: 'Table', confidence: 92, position: 'Ahead · 3.0m', icon: 'Table2', color: '#8C6A23' },
  { name: 'Bottle', confidence: 87, position: 'Ahead-Right · 2.0m', icon: 'Wine', color: '#0F766E' },
  { name: 'Laptop', confidence: 91, position: 'Right · 3.1m', icon: 'Laptop', color: '#065F46' },
  { name: 'Door', confidence: 89, position: 'Ahead · 5.2m', icon: 'DoorOpen', color: '#9A7227' },
  { name: 'Traffic Signal', confidence: 97, position: 'Ahead · 8.4m', icon: 'TrafficCone', color: '#047857' },
];

export const systemArchitecture = {
  hardware: [
    { name: 'ESP32-CAM', type: 'Camera Module', description: 'Real-time video capture for AI inference' },
    { name: 'ESP8266', type: 'Microcontroller', description: 'Sensor data processing and communication' },
    { name: 'GPS Module', type: 'NEO-6M', description: 'Satellite-based location tracking' },
    { name: 'Ultrasonic', type: 'HC-SR04', description: 'Distance measurement and obstacle detection' },
    { name: 'Buzzer', type: 'Piezo', description: 'Audio feedback for warnings' },
    { name: 'SOS Button', type: 'Push Button', description: 'Emergency trigger mechanism' },
  ],
  software: [
    { name: 'YOLOv8', type: 'AI Model', description: 'Real-time object detection and classification' },
    { name: 'FastAPI', type: 'Backend', description: 'High-performance API server' },
    { name: 'Python', type: 'Runtime', description: 'AI processing and server logic' },
    { name: 'React', type: 'Frontend', description: 'Interactive web dashboard' },
    { name: 'WebSocket', type: 'Protocol', description: 'Real-time bidirectional communication' },
    { name: 'BMTC/Chalo', type: 'API', description: 'Live bus tracking data' },
  ],
};
