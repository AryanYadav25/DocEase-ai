import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Spinner } from '@/components/ui/primitives';
import { useAuth } from '@/features/auth/AuthContext';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '@/features/auth/AuthPages';
import { AboutPage, ContactPage, FeaturesPage, NotFoundPage, PrivacyPage, TermsPage } from '@/features/public/InfoPages';
import { LandingPage } from '@/features/public/LandingPage';

// Authenticated area is code-split so the public site loads fast.
const AppLayout = lazy(() => import('@/components/layout/AppLayout').then((m) => ({ default: m.AppLayout })));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LibraryPage = lazy(() => import('@/features/documents/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const WorkspacePage = lazy(() => import('@/features/workspace/WorkspacePage').then((m) => ({ default: m.WorkspacePage })));
const StudyMaterialsPage = lazy(() => import('@/features/study-materials/StudyMaterialsPage').then((m) => ({ default: m.StudyMaterialsPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const HelpPage = lazy(() => import('@/features/help/HelpPage').then((m) => ({ default: m.HelpPage })));

function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function AppRouter() {
  // HashRouter is only used for static previews where the host controls the path.
  const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;
  return (
    <Router>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="features" element={<FeaturesPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="contact" element={<ContactPage />} />
          </Route>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />

          <Route
            path="app"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="documents" element={<LibraryPage mode="all" />} />
            <Route path="favorites" element={<LibraryPage mode="favorites" />} />
            <Route path="trash" element={<LibraryPage mode="trash" />} />
            <Route path="workspace" element={<WorkspacePage />} />
            <Route path="workspace/:id" element={<WorkspacePage />} />
            <Route path="study" element={<StudyMaterialsPage />} />
            <Route path="study/:id" element={<StudyMaterialsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help" element={<HelpPage />} />
          </Route>

          <Route
            path="*"
            element={
              <PublicLayout />
            }
          >
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
