import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRoute } from './components/auth/AdminRoute';
import { ScrollToTop } from './components/common/ScrollToTop';

// Layouts
import { PublicLayout } from './layouts/PublicLayout';
import { UserLayout } from './layouts/UserLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Core Public Pages (Eagerly loaded for bulletproof instant mobile landing & 0ms navigation)
import { HomePage } from './pages/public/HomePage';
import { JobsPage } from './pages/public/JobsPage';
import { JobDetailsPage } from './pages/public/JobDetailsPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';

// Lazy Loaded Auxiliary Public Pages
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const SitemapView = lazy(() => import('./pages/public/SitemapView').then((m) => ({ default: m.SitemapView })));
const RobotsView = lazy(() => import('./pages/public/RobotsView').then((m) => ({ default: m.RobotsView })));
const ForgotPasswordPage = lazy(() => import('./pages/public/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));

// Lazy Loaded User Pages
const UserDashboardPage = lazy(() => import('./pages/user/UserDashboardPage').then((m) => ({ default: m.UserDashboardPage })));
const UserCVPage = lazy(() => import('./pages/user/UserCVPage').then((m) => ({ default: m.UserCVPage })));
const UserApplicationsPage = lazy(() => import('./pages/user/UserApplicationsPage').then((m) => ({ default: m.UserApplicationsPage })));
const UserNotificationsPage = lazy(() => import('./pages/user/UserNotificationsPage').then((m) => ({ default: m.UserNotificationsPage })));
const ApplyJobPage = lazy(() => import('./pages/user/ApplyJobPage').then((m) => ({ default: m.ApplyJobPage })));
const ApplicationPaymentPage = lazy(() => import('./pages/user/ApplicationPaymentPage').then((m) => ({ default: m.ApplicationPaymentPage })));
const ChangePasswordPage = lazy(() => import('./pages/user/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })));

// Lazy Loaded Admin Pages (Heavy editors, Google Drive, and tables isolated from public visitors)
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminJobsListPage = lazy(() => import('./pages/admin/AdminJobsListPage').then((m) => ({ default: m.AdminJobsListPage })));
const AdminJobFormPage = lazy(() => import('./pages/admin/AdminJobFormPage').then((m) => ({ default: m.AdminJobFormPage })));
const AdminExamsPage = lazy(() => import('./pages/admin/AdminExamsPage').then((m) => ({ default: m.AdminExamsPage })));
const AdminApplicationsPage = lazy(() => import('./pages/admin/AdminApplicationsPage').then((m) => ({ default: m.AdminApplicationsPage })));
const AdminPaymentSettingsPage = lazy(() => import('./pages/admin/AdminPaymentSettingsPage').then((m) => ({ default: m.AdminPaymentSettingsPage })));
const AdminExportPage = lazy(() => import('./pages/admin/AdminExportPage').then((m) => ({ default: m.AdminExportPage })));
const AdminGoogleDrivePage = lazy(() => import('./pages/admin/AdminGoogleDrivePage').then((m) => ({ default: m.AdminGoogleDrivePage })));
const AdminUrlShortenerPage = lazy(() => import('./pages/admin/AdminUrlShortenerPage').then((m) => ({ default: m.AdminUrlShortenerPage })));
const AdminPdfConverterPage = lazy(() => import('./pages/admin/AdminPdfConverterPage').then((m) => ({ default: m.AdminPdfConverterPage })));
const AdminGoogleSheetsPage = lazy(() => import('./pages/admin/AdminGoogleSheetsPage').then((m) => ({ default: m.AdminGoogleSheetsPage })));
const ShortLinkRedirectPage = lazy(() => import('./pages/public/ShortLinkRedirectPage').then((m) => ({ default: m.ShortLinkRedirectPage })));

// Lightweight Fast Skeleton Fallback
const PageLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
    <span className="text-xs text-gray-500 font-medium">লোড হচ্ছে...</span>
  </div>
);

export default function App() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <ScrollToTop />
          <AuthProvider>
            <ToastProvider>
              <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  {/* Public Routes */}
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/jobs/:slug" element={<JobDetailsPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  </Route>

                  {/* SEO Endpoints (Raw XML / Robots / Google Verification) */}
                  <Route path="/sitemap.xml" element={<SitemapView />} />
                  <Route path="/robots.txt" element={<RobotsView />} />
                  <Route path="/s/:code" element={<ShortLinkRedirectPage />} />
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
                    <Route path="/change-password" element={<ChangePasswordPage />} />
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
                    <Route path="settings/google-sheets" element={<AdminGoogleSheetsPage />} />
                    <Route path="google-sheets" element={<AdminGoogleSheetsPage />} />
                    <Route path="storage" element={<AdminGoogleDrivePage />} />
                    <Route path="export" element={<AdminExportPage />} />
                    <Route path="shortener" element={<AdminUrlShortenerPage />} />
                    <Route path="pdf-converter" element={<AdminPdfConverterPage />} />
                  </Route>

                  {/* 404 Route */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </HelmetProvider>
  );
}
