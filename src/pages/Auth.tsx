import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "../components/ui";
import { safeRedirect } from "../components/AuthGuard";
import authArt from "../assets/auth-scene.svg";
import { Logo } from "../components/Logo";

type Mode = "login" | "signup" | "forgot" | "reset";

function useMode(): [Mode, (m: Mode) => void] {
  const [params] = useSearchParams();
  const initial: Mode = params.get("mode") === "reset" ? "reset" : "login";
  const [mode, setMode] = useState<Mode>(initial);
  return [mode, setMode];
}

function AuthForm({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { signIn, signUp, resetPassword, updatePassword, session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeRedirect(params.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Arriving from an email recovery link: Supabase detects the session in URL.
  useEffect(() => {
    if (mode === "reset" && !session) setError("Open the reset link on this device to set a new password.");
  }, [mode, session]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
        else navigate(returnTo, { replace: true });
      } else if (mode === "signup") {
        if (!agreed) {
          setError("Please agree to the Terms of Service and Privacy Policy to create an account.");
          setBusy(false);
          return;
        }
        const { error, needsEmailConfirm } = await signUp(email, password, displayName);
        if (error) setError(error);
        else if (needsEmailConfirm) setNotice("Check your inbox to confirm your email, then log in.");
        else navigate("/onboarding", { replace: true });
      } else if (mode === "forgot") {
        const { error } = await resetPassword(email);
        if (error) setError(error);
        else setNotice("If that email is registered, a reset link is on its way.");
      } else {
        if (password.length < 6) {
          setError("Password must be at least 6 characters.");
        } else {
          const { error } = await updatePassword(password);
          if (error) setError(error);
          else navigate("/app", { replace: true });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const title = {
    login: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Set a new password",
  }[mode];

  return (
    <div className="w-full max-w-sm">
      <h1 className="display text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {mode === "login" && "Log in to keep your streak alive."}
        {mode === "signup" && "Start tracking nutrition, workouts and progress."}
        {mode === "forgot" && "We'll email you a secure reset link."}
        {mode === "reset" && "Choose a new password for your account."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted" htmlFor="displayName">Display name</label>
            <Input id="displayName" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" autoComplete="name" />
          </div>
        )}
        {mode !== "reset" && (
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted" htmlFor="email">Email</label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
        )}
        {mode !== "forgot" && (
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-ink-muted" htmlFor="password">
              {mode === "reset" ? "New password" : "Password"}
            </label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>
        )}

        {mode === "signup" && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-ink-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-300)]"
            />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" rel="noreferrer" className="font-medium text-accent-300 hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link to="/privacy" target="_blank" rel="noreferrer" className="font-medium text-accent-300 hover:underline">Privacy Policy</Link>.
            </span>
          </label>
        )}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
        {notice && <p className="rounded-xl bg-success/10 px-3 py-2 text-[13px] text-success">{notice}</p>}

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {mode === "login" && "Log in"}
          {mode === "signup" && "Create account"}
          {mode === "forgot" && "Send reset link"}
          {mode === "reset" && "Save new password"}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-sm text-ink-muted">
        {mode === "login" && (
          <>
            <p>
              No account?{" "}
              <button type="button" className="font-medium text-accent-300 hover:underline" onClick={() => setMode("signup")}>Sign up</button>
            </p>
            <p>
              <button type="button" className="hover:underline" onClick={() => setMode("forgot")}>Forgot password?</button>
            </p>
          </>
        )}
        {(mode === "signup" || mode === "forgot" || mode === "reset") && (
          <p>
            <button type="button" className="font-medium text-accent-300 hover:underline" onClick={() => setMode("login")}>← Back to login</button>
          </p>
        )}
      </div>
    </div>
  );
}

export default function Auth() {
  const [mode, setMode] = useMode();
  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* Left: brand panel over the gym scene */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-line p-10 lg:flex">
        {/* gym photograph backdrop, fading into the surface */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-cover bg-center opacity-[0.45]" style={{ backgroundImage: `url(${authArt})` }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, var(--color-surface-0) 6%, transparent 45%), radial-gradient(600px 400px at 20% 10%, var(--color-accent-soft), transparent), radial-gradient(500px 500px at 80% 90%, color-mix(in oklab, var(--color-data-blue) 12%, transparent), transparent)" }} />
        </div>
        <Logo />
        <div className="relative max-w-md">
          <h2 className="display text-3xl font-bold leading-tight text-ink">
            Your coach, your log,<br />your progress — in one place.
          </h2>
          <p className="mt-3 text-ink-muted">
            Nutrition, workouts, streaks and an AI coach that knows your numbers.
            Built for people who already train.
          </p>
        </div>
        <p className="text-[13px] text-ink-faint">Train smart. Log everything. Get better daily.</p>
      </div>

      {/* Right: form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <AuthForm mode={mode} setMode={setMode} />
      </div>
    </div>
  );
}
