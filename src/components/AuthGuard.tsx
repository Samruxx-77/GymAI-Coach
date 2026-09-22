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
 * Allow only internal destinations. A raw ?returnTo=/ ?next= value could
 * point at an attacker site (open redirect); anything that isn't a
 * same-origin absolute path falls back to /app.
 */
export function safeRedirect(raw: string | null | undefined): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/app";
  }
  return raw;
}

/**
 * Redirects signed-in users away from a public page (auth, landing)
 * to the app. Honors ?returnTo= / ?next= as the destination.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthGate />;
  if (session) {
    const params = new URLSearchParams(location.search);
    const dest = safeRedirect(params.get("next") ?? params.get("returnTo"));
    return <Navigate to={dest} replace />;
  }
  return <>{children}</>;
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
