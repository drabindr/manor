import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import CasaGuard from './CasaGuard';
import { PlayerProvider } from './PlayerContext';
import LiveStream from './LiveStream';
import VideoPlayer from './VideoPlayer';
import AdminPanel from './AdminPanel';
import { usePageMetrics } from './hooks/useMetrics';
import useNavigationTracking from './hooks/useNavigationTracking';
import MetricsErrorBoundary from './components/MetricsErrorBoundary';

// Initialize metrics collector
import './utils/MetricsCollector';

// Auth configuration - these values will come from your CDK deployment
const authConfig = {
  userPoolId: process.env.REACT_APP_USER_POOL_ID || 'us-east-1_XXXXXXXXX',
  userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
  identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID || 'us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  authDomain: process.env.REACT_APP_AUTH_DOMAIN || 'auth.mymanor.click',
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
};

function App() {
  // Track app-level metrics
  usePageMetrics('App');

  return (
    <AuthProvider config={authConfig}>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlayerProvider>
          <MetricsErrorBoundary widgetName="App">
            <AppContent />
          </MetricsErrorBoundary>
        </PlayerProvider>
      </Router>
    </AuthProvider>
  );
}

function AppContent() {
  // Track navigation between routes
  useNavigationTracking();

  return (
    <Routes>
      {/* Auth callback route - public */}
      <Route path="/auth/callback" element={<div>Processing authentication...</div>} />
      
      {/* Protected routes */}
      <Route path="/video-player/:date" element={
        <ProtectedRoute>
          <MetricsErrorBoundary widgetName="VideoPlayer">
            <VideoPlayer />
          </MetricsErrorBoundary>
        </ProtectedRoute>
      } />
      
      <Route path="/live-stream/" element={
        <ProtectedRoute>
          <MetricsErrorBoundary widgetName="LiveStream">
            <LiveStream />
          </MetricsErrorBoundary>
        </ProtectedRoute>
      } />
      
      {/* Admin route with role-based access */}
      <Route path="/admin" element={
        <ProtectedRoute requiredRole="admin">
          <MetricsErrorBoundary widgetName="AdminPanel">
            <AdminPanel />
          </MetricsErrorBoundary>
        </ProtectedRoute>
      } />
      
      {/* Main app route */}
      <Route path="/" element={
        <ProtectedRoute>
          <MetricsErrorBoundary widgetName="CasaGuard">
            <CasaGuard />
          </MetricsErrorBoundary>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;
