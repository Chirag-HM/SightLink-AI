import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AssistantProvider } from './assistant/AssistantContext';
import ShapeGrid from './components/ShapeGrid';
import SharingStatusBanner from './components/SharingStatusBanner';
import VoiceAssistantOrb from './components/VoiceAssistantOrb';

// Core Eager Pages
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

// Lazy-loaded Modules & Pages
const AuthPage = lazy(() => import('./pages/AuthPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const AssistancePage = lazy(() => import('./pages/AssistancePage'));
const LiveAssistPage = lazy(() => import('./pages/LiveAssistPage'));
const FamilyTrackPage = lazy(() => import('./pages/FamilyTrackPage'));
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

function PageLoader() {
  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-2 border-[#065F46]/20 rounded-full" />
          <div className="absolute inset-0 border-2 border-transparent border-t-[#065F46] rounded-full animate-spin" />
        </div>
        <span className="text-xs font-mono text-[#354B40] tracking-widest">LOADING SIGHTLINK</span>
      </div>
    </div>
  );
}

function AppShell() {
  const { reducedMotion } = useAuth();

  return (
    <div className="relative min-h-screen bg-transparent text-[#12231B] overflow-x-hidden selection:bg-[#065F46]/20 selection:text-[#063B2C]">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Subtle ambient background grid when motion is permitted */}
      {!reducedMotion && (
        <div className="fixed inset-0 pointer-events-none z-0 opacity-65" aria-hidden="true">
          <ShapeGrid
            preset="hive"
            direction="up"
            speed={0.22}
            cellSize={48}
            lineColor="rgba(6, 95, 70, 0.065)"
            hoverColor="#065F46"
            hoverFillColor="#C59B42"
            fillOpacity={0.07}
            radius={2}
            trail={0.8}
            glow={0.18}
            fade={0.9}
            clickCascade={false}
          />
        </div>
      )}

      <div className="relative z-10">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage initialMode="login" />} />
            <Route path="/signup" element={<AuthPage initialMode="signup" />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/assist" element={<AssistancePage />} />
            <Route path="/live-assist" element={<LiveAssistPage />} />
            <Route path="/family/track" element={<FamilyTrackPage />} />
            <Route path="/family/track/:inviteCode" element={<FamilyTrackPage />} />
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

      {/* Persistent Family Sharing Indicator */}
      <SharingStatusBanner />

      {/* Global Hands-Free Voice Assistant & Hardware Button Dock */}
      <VoiceAssistantOrb />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AssistantProvider>
          <AppShell />
        </AssistantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
