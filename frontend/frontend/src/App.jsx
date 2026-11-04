import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import ShapeGrid from './components/ShapeGrid';

// Pages
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

// Lazy-loaded sub-pages
const VisionPage = lazy(() => import('./pages/VisionPage'));
const LocationPage = lazy(() => import('./pages/LocationPage'));
const BMTCPage = lazy(() => import('./pages/BMTCPage'));
const NavigationPage = lazy(() => import('./pages/NavigationPage'));
const VoicePage = lazy(() => import('./pages/VoicePage'));
const SafetyPage = lazy(() => import('./pages/SafetyPage'));
const VolunteersPage = lazy(() => import('./pages/VolunteersPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const AccessibilityPage = lazy(() => import('./pages/AccessibilityPage'));

// Loader
function PageLoader() {
  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-2 border-accent-cyan/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-transparent border-t-accent-cyan rounded-full animate-spin" />
        </div>
        <span className="text-xs font-mono text-dark-300 tracking-widest">LOADING MODULE</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="relative min-h-screen bg-dark-950 text-white selection:bg-accent-cyan/30 selection:text-white">
        {/* Global Persistent ReactBits ShapeGrid (Hive Preset) Background */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <ShapeGrid
            preset="hive"
            direction="up"
            speed={0.32}
            cellSize={44}
            lineColor="rgba(255, 255, 255, 0.05)"
            hoverColor="#00d4ff"
            hoverFillColor="#00d4ff"
            fillOpacity={0.14}
            radius={2.2}
            trail={0.9}
            glow={0.4}
            fade={0.9}
            clickCascade={true}
          />
        </div>

        {/* Foreground Content */}
        <div className="relative z-10">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/vision" element={<VisionPage />} />
              <Route path="/location" element={<LocationPage />} />
              <Route path="/bmtc" element={<BMTCPage />} />
              <Route path="/navigation" element={<NavigationPage />} />
              <Route path="/voice" element={<VoicePage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/accessibility" element={<AccessibilityPage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </BrowserRouter>
  );
}
