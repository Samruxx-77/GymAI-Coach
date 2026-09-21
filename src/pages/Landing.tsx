import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChefHat,
  Dumbbell,
  Flame,
  LineChart,
  MessageCircle,
  ScanLine,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { prefersReducedMotion } from "../lib/env";
import Hero3D from "../components/three/Hero3D";
import heroArt from "../assets/hero-gym.svg";

const STATS = [
  { icon: Dumbbell, value: "42", label: "guided exercises" },
  { icon: Trophy, value: "22", label: "achievements to unlock" },
  { icon: Zap, value: "6", label: "ranks from Bronze to Immortal" },
  { icon: MessageCircle, value: "AI", label: "coach that knows your numbers" },
  { icon: ScanLine, value: "1-tap", label: "food scanner with macros" },
  { icon: LineChart, value: "Daily", label: "progress you can see" },
];

const FEATURES = [
  { icon: ScanLine, title: "AI Food Scanner", body: "Photograph any meal and get instant calorie and macro estimates you can correct before logging." },
  { icon: MessageCircle, title: "AI Coach", body: "A coach that knows your weight trend, macros and streak — ask anything from plateaus to protein." },
  { icon: Dumbbell, title: "Workouts & Builder", body: "Follow proven templates or build your own; log every set with a player built for the gym floor." },
  { icon: ChefHat, title: "Nutrition Tracking", body: "Calories, protein, carbs and fat against daily targets that adapt to your goal." },
  { icon: LineChart, title: "Progress Charts", body: "Weight trend lines, volume per week and consistency you can actually see." },
  { icon: Trophy, title: "XP & Achievements", body: "Earn XP for logging and training, climb ranks from Bronze to Immortal, unlock badges." },
];

/** Feature card with subtle pointer-tracked 3D tilt (desktop, motion-permitting). */
function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const onMove = (e: React.PointerEvent) => {
    if (prefersReducedMotion() || !window.matchMedia?.("(pointer: fine)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * 6, ry: px * 8 });
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
      className="card card-hover p-5 will-change-transform"
      style={{
        transform: `perspective(720px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: tilt.rx === 0 && tilt.ry === 0 ? "transform 400ms ease" : "transform 80ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const primary = { to: user ? "/app" : "/auth", label: user ? "Open app" : "Start free" };

  return (
    <div className="min-h-screen bg-surface-0 text-ink">
      {/* Nav */}
      <header className="theme-glass sticky top-0 z-40 border-b border-line/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to={primary.to}><Button variant="ghost" size="sm">{user ? "Dashboard" : "Log in"}</Button></Link>
            <Link to={primary.to}><Button size="sm">{primary.label}</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero — gym-scene backdrop, copy left, 3D stage right */}
      <section className="relative overflow-hidden">
        {/* moody gym photograph backdrop, fading seamlessly into the page */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-cover bg-[position:center_35%] opacity-[0.4]" style={{ backgroundImage: `url(${heroArt})` }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, color-mix(in oklab, var(--color-surface-0) 35%, transparent) 0%, transparent 32%, var(--color-surface-0) 94%)" }} />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(900px 500px at 15% -10%, var(--color-accent-soft), transparent), radial-gradient(700px 420px at 85% 25%, color-mix(in oklab, var(--color-data-blue) 10%, transparent), transparent)" }} />
        {/* faint grid floor to anchor the 3D stage */}
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-x-0 bottom-0 h-[420px] opacity-[0.14]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 py-1 text-[12px] font-medium text-ink-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent-300" /> Your pocket AI fitness coach
            </span>
            <h1 className="display mt-5 text-4xl font-bold leading-[1.06] sm:text-6xl">
              Train with data.<br />
              <span className="bg-gradient-to-r from-accent-300 via-accent to-accent-strong bg-clip-text text-transparent">
                Progress on tap.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-base lg:mx-0">
              GymAI Coach turns your gym membership into a system: scan meals, track macros,
              follow workouts and get coaching that actually knows your numbers.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link to={primary.to} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  {primary.label} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth" className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto">I have an account</Button>
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-ink-faint">Free to start · Works with any gym</p>
          </div>

          {/* 3D stage */}
          <div className="relative mx-auto h-[340px] w-full max-w-lg sm:h-[420px] lg:h-[500px]">
            <Hero3D className="absolute inset-0" />

            {/* floating stat chips (DOM overlay — crisp text over WebGL) */}
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block">
              <div className="stat-chip absolute right-2 top-[12%] flex items-center gap-2 rounded-xl border border-line bg-surface-1/85 px-3 py-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] backdrop-blur">
                <Flame className="h-4 w-4 text-data-amber" />
                <div className="leading-tight">
                  <p className="text-[11px] text-ink-faint">Streak</p>
                  <p className="text-[13px] font-semibold tnum">12 days</p>
                </div>
              </div>
              <div className="stat-chip stat-chip-2 absolute left-0 top-[38%] flex items-center gap-2 rounded-xl border border-line bg-surface-1/85 px-3 py-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] backdrop-blur">
                <Zap className="h-4 w-4 text-accent-300" />
                <div className="leading-tight">
                  <p className="text-[11px] text-ink-faint">XP</p>
                  <p className="text-[13px] font-semibold tnum">4,820</p>
                </div>
              </div>
              <div className="stat-chip stat-chip-3 absolute bottom-[14%] right-[8%] flex items-center gap-2 rounded-xl border border-line bg-surface-1/85 px-3 py-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)] backdrop-blur">
                <Trophy className="h-4 w-4 text-data-teal" />
                <div className="leading-tight">
                  <p className="text-[11px] text-ink-faint">Rank</p>
                  <p className="text-[13px] font-semibold">Gold</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Facts marquee */}
      <section aria-label="What's inside" className="marquee-mask overflow-hidden border-y border-line bg-surface-1/40 py-4">
        <div className="marquee">
          {[...STATS, ...STATS].map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 whitespace-nowrap">
              <s.icon className="h-4 w-4 text-accent-300" />
              <span className="display tnum text-base font-bold">{s.value}</span>
              <span className="text-[13px] text-ink-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="display text-center text-3xl font-bold">Everything a member needs. Nothing they don't.</h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-ink-muted">
          No gym-owner dashboards, no clutter — just the tools that get you to your goal.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <TiltCard key={f.title}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <f.icon className="h-5 w-5 text-accent-300" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{f.body}</p>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative border-y border-line bg-surface-1/40">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="display text-center text-3xl font-bold">Three steps. Every day.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["1", "Log your inputs", "Scan a meal, log a weigh-in, finish a workout. Under two minutes total."],
              ["2", "See the trend", "Charts and streaks show whether the week is working — no guesswork."],
              ["3", "Get coached", "Ask the AI coach anything; it answers with your real data as context."],
            ].map(([n, title, body]) => (
              <div key={n} className="card p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-300">{n}</div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-[14px] text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(700px 340px at 50% 110%, var(--color-accent-soft), transparent)" }} />
        <div className="relative mx-auto max-w-6xl px-5 py-20 text-center">
          <h2 className="display text-3xl font-bold sm:text-4xl">Stop guessing. Start logging.</h2>
          <p className="mx-auto mt-3 max-w-md text-ink-muted">
            Join members who track what matters and let the data do the talking.
          </p>
          <Link to={primary.to} className="mt-8 inline-block">
            <Button size="lg">{primary.label} <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-[13px] text-ink-faint">
        <p>GymAI Coach — fitness companion for gym members. Not medical advice.</p>
        <p className="mt-2 space-x-4">
          <Link to="/terms" className="hover:underline">Terms of Service</Link>
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        </p>
      </footer>
    </div>
  );
}
