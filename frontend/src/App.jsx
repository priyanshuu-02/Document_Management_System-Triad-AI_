// Sets up the pages (routes), the login checks and the main layout.
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';

import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import AccessRequestsPage from './pages/AccessRequestsPage';
import SearchPage from './pages/SearchPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AuthErrorPage from './pages/AuthErrorPage';

function AppLayout({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  if (!isAuthenticated || isAuthPage) {
    return (
      <div className="min-h-screen bg-[#f8faf9] dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200 flex">
      {/* Sidebar Navigation */}
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="md:pl-64 flex flex-col flex-1 min-w-0 min-h-screen">
        <TopHeader onOpenMobile={() => setMobileOpen(true)} />
        <AnimatePresence mode="wait">
          <motion.main 
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppLayout>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage />} />

            {/* Error / Access Denied Route */}
            <Route
              path="/unauthorized"
              element={
                <ProtectedRoute>
                  <AuthErrorPage />
                </ProtectedRoute>
              }
            />

            {/* Protected Core Pages */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/documents/:id"
              element={
                <ProtectedRoute>
                  <DocumentDetailPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/requests"
              element={
                <ProtectedRoute>
                  <AccessRequestsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <SearchPage />
                </ProtectedRoute>
              }
            />

            {/* Admin Only Route (Enforces Role-Based Access Control) */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminSettingsPage />
                </AdminRoute>
              }
            />

            {/* Fallback Routes */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </AuthProvider>
  </ThemeProvider>
  );
}
