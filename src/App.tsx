import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProfileProvider } from "./context/ProfileContext";
import { DataProvider } from "./context/DataContext";
import { RequireAuth, AuthGate, RedirectIfAuthed } from "./components/AuthGuard";
import { AppLayout } from "./components/AppLayout";
import { useProfile } from "./context/ProfileContext";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Nutrition from "./pages/Nutrition";
import Scan from "./pages/Scan";
import Workouts from "./pages/Workouts";
import WorkoutBuilder from "./pages/WorkoutBuilder";
import WorkoutSession from "./pages/WorkoutSession";
import WorkoutHistory from "./pages/WorkoutHistory";
import Progress from "./pages/Progress";
import Coach from "./pages/Coach";
import Achievements from "./pages/Achievements";
import ProfileSettings from "./pages/ProfileSettings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

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
          <Route path="/app/scan" element={<AppPage><Scan /></AppPage>} />
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
      </AuthProvider>
  );
}
