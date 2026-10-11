import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRoute } from './components/auth/AdminRoute';

// Layouts
import { PublicLayout } from './layouts/PublicLayout';
import { UserLayout } from './layouts/UserLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Public Pages
import { HomePage } from './pages/public/HomePage';
import { JobsPage } from './pages/public/JobsPage';
import { JobDetailsPage } from './pages/public/JobDetailsPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { NotFoundPage } from './pages/public/NotFoundPage';
import { SitemapView } from './pages/public/SitemapView';
import { RobotsView } from './pages/public/RobotsView';

// User Pages
import { UserDashboardPage } from './pages/user/UserDashboardPage';
import { UserCVPage } from './pages/user/UserCVPage';
import { UserApplicationsPage } from './pages/user/UserApplicationsPage';
import { UserNotificationsPage } from './pages/user/UserNotificationsPage';
import { ApplyJobPage } from './pages/user/ApplyJobPage';
import { ApplicationPaymentPage } from './pages/user/ApplicationPaymentPage';

// Admin Pages
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminJobsListPage } from './pages/admin/AdminJobsListPage';
import { AdminJobFormPage } from './pages/admin/AdminJobFormPage';
import { AdminExamsPage } from './pages/admin/AdminExamsPage';
import { AdminApplicationsPage } from './pages/admin/AdminApplicationsPage';
import { AdminPaymentSettingsPage } from './pages/admin/AdminPaymentSettingsPage';
import { AdminExportPage } from './pages/admin/AdminExportPage';
import { AdminGoogleDrivePage } from './pages/admin/AdminGoogleDrivePage';

export default function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <ToastProvider>
              <Routes>
              {/* Public Routes */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/jobs/:slug" element={<JobDetailsPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              {/* SEO Endpoints (Raw XML / Robots / Google Verification) */}
              <Route path="/sitemap.xml" element={<SitemapView />} />
              <Route path="/robots.txt" element={<RobotsView />} />
              <Route
                path="/googlec771a2a1a147ff4a.html"
                element={<pre style={{ margin: 0, padding: '20px' }}>google-site-verification: googlec771a2a1a147ff4a.html</pre>}
              />

              {/* Admin Login (Isolated) */}
              <Route path="/admin/login" element={<AdminLoginPage />} />

              {/* Protected User Routes */}
              <Route
                element={
                  <ProtectedRoute>
                    <UserLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<UserDashboardPage />} />
                <Route path="/cv" element={<UserCVPage />} />
                <Route path="/apply/:jobId" element={<ApplyJobPage />} />
                <Route path="/apply/:jobId/payment" element={<ApplicationPaymentPage />} />
                <Route path="/applications/:status" element={<UserApplicationsPage />} />
                <Route path="/notifications" element={<UserNotificationsPage />} />
              </Route>

              {/* Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="jobs" element={<AdminJobsListPage />} />
                <Route path="jobs/new" element={<AdminJobFormPage />} />
                <Route path="jobs/edit/:id" element={<AdminJobFormPage />} />
                <Route path="exams" element={<AdminExamsPage />} />
                <Route path="applications/:step" element={<AdminApplicationsPage />} />
                <Route path="settings/payment" element={<AdminPaymentSettingsPage />} />
                <Route path="storage" element={<AdminGoogleDrivePage />} />
                <Route path="export" element={<AdminExportPage />} />
              </Route>

              {/* 404 Route */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </HelmetProvider>
);
}
