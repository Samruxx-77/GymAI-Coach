import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";
import { Spinner } from "./ui";

/** Full-screen loading state shown while the auth session is resolving. */
export function AuthGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-0">
      <Logo />
      <Spinner className="h-6 w-6" />
    </div>
  );
}

/**
 * Redirects signed-out users to /auth, preserving the intended
 * destination as ?returnTo= so sign-in can bring them back.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthGate />;
  if (!session) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }
  return <>{children}</>;
}
