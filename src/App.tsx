import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProfileProvider } from "./context/ProfileContext";
import { DataProvider } from "./context/DataContext";
import { RequireAuth, AuthGate, RedirectIfAuthed } from "./components/AuthGuard";
import { AppLayout } from "./components/AppLayout";
import { useProfile } from "./context/ProfileContext";

/* Route-level code splitting: each page becomes its own chunk so the
 * landing page (and every other route) no longer downloads the whole app
 * — e.g. recharts/Progress only loads when /app/progress is visited. */
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const Workouts = lazy(() => import("./pages/Workouts"));
const WorkoutBuilder = lazy(() => import("./pages/WorkoutBuilder"));
const WorkoutSession = lazy(() => import("./pages/WorkoutSession"));
const WorkoutHistory = lazy(() => import("./pages/WorkoutHistory"));
const Progress = lazy(() => import("./pages/Progress"));
const Coach = lazy(() => import("./pages/Coach"));
const Achievements = lazy(() => import("./pages/Achievements"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Sends members without completed onboarding to the wizard (except inside it). */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useProfile();
  const location = useLocation();
  if (loading) return <AuthGate />;
  if (profile && !profile.onboarding_completed && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

/** Renders a protected page inside the app shell + guards. */
function AppPage({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <ProfileProvider>
        <OnboardingGuard>
          <DataProvider>
            <AppLayout>{children}</AppLayout>
          </DataProvider>
        </OnboardingGuard>
      </ProfileProvider>
    </RequireAuth>
  );
}

function OnboardingPage() {
  return (
    <RequireAuth>
      <ProfileProvider>
        <Onboarding />
      </ProfileProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* Chunk loading fallback while a lazy route page downloads. */}
      <Suspense fallback={<AuthGate />}>
        <Routes>
          <Route path="/" element={<RedirectIfAuthed><Landing /></RedirectIfAuthed>} />
          <Route path="/auth" element={<RedirectIfAuthed><Auth /></RedirectIfAuthed>} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/onboarding"
            element={
              <OnboardingPage />
            }
          />
          <Route path="/app" element={<AppPage><Dashboard /></AppPage>} />
          <Route path="/app/nutrition" element={<AppPage><Nutrition /></AppPage>} />
          <Route path="/app/scan" element={<Navigate to="/app/nutrition?mode=scan" replace />} />
          <Route path="/app/workouts" element={<AppPage><Workouts /></AppPage>} />
          <Route path="/app/workouts/new" element={<AppPage><WorkoutBuilder /></AppPage>} />
          <Route path="/app/workouts/history" element={<AppPage><WorkoutHistory /></AppPage>} />
          <Route path="/app/workouts/:id/start" element={<AppPage><WorkoutSession /></AppPage>} />
          <Route path="/app/workouts/:id/edit" element={<AppPage><WorkoutBuilder /></AppPage>} />
          <Route path="/app/progress" element={<AppPage><Progress /></AppPage>} />
          <Route path="/app/coach" element={<AppPage><Coach /></AppPage>} />
          <Route path="/app/achievements" element={<AppPage><Achievements /></AppPage>} />
          <Route path="/app/profile" element={<AppPage><ProfileSettings /></AppPage>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </AuthProvider>
  );
}
