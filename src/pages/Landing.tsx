import { Link } from "react-router-dom";
import { ArrowRight, ChefHat, Dumbbell, Flame, LineChart, MessageCircle, ScanLine, Trophy, Zap } from "lucide-react";
import { Button } from "../components/ui";
import { Logo } from "../components/Logo";
import { useAuth } from "../context/AuthContext";

const FEATURES = [
  { icon: ScanLine, title: "AI Food Scanner", body: "Photograph any meal and get instant calorie and macro estimates you can correct before logging." },
  { icon: MessageCircle, title: "AI Coach", body: "A coach that knows your weight trend, macros and streak — ask anything from plateaus to protein." },
  { icon: Dumbbell, title: "Workouts & Builder", body: "Follow proven templates or build your own; log every set with a player built for the gym floor." },
  { icon: ChefHat, title: "Nutrition Tracking", body: "Calories, protein, carbs and fat against daily targets that adapt to your goal." },
  { icon: LineChart, title: "Progress Charts", body: "Weight trend lines, volume per week and consistency you can actually see." },
  { icon: Trophy, title: "XP & Achievements", body: "Earn XP for logging and training, climb ranks from Bronze to Immortal, unlock badges." },
];

export default function Landing() {
  const { user } = useAuth();
  const primary = { to: user ? "/app" : "/auth", label: user ? "Open app" : "Start free" };

  return (
    <div className="min-h-screen bg-surface-0 text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-surface-0/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo />
          <div className="flex items-center gap-2">
            <Link to={primary.to}><Button variant="ghost" size="sm">{user ? "Dashboard" : "Log in"}</Button></Link>
            <Link to={primary.to}><Button size="sm">{primary.label}</Button></Link>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(700px 300px at 70% -10%, var(--color-accent-soft), transparent)" }} />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(900px 500px at 20% -10%, var(--color-accent-soft), transparent), radial-gradient(700px 400px at 90% 30%, rgba(91,140,255,0.10), transparent)" }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 py-1 text-[12px] font-medium text-ink-muted">
              <Zap className="h-3.5 w-3.5 text-accent-300" /> Your pocket AI fitness coach
            </span>
            <h1 className="display mt-5 text-4xl font-bold leading-[1.08] sm:text-6xl">
              Train with data.<br />
              <span className="bg-gradient-to-r from-accent-300 to-accent-strong bg-clip-text text-transparent">
                Progress on tap.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
              GymAI Coach turns your gym membership into a system: scan meals, track macros,
              follow workouts and get coaching that actually knows your numbers.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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

          {/* Hero card mockup */}
          <div className="relative mx-auto mt-14 max-w-3xl">
            <div className="card p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between text-[13px] text-ink-muted">
                <span className="font-medium text-ink">Today</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-data-amber" /> 12-day streak</span>
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-accent-300" /> 4,820 XP</span>
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["Calories", "1,640", "/ 2,400 kcal", "68%"],
                  ["Protein", "128", "/ 160 g", "80%"],
                  ["Workout", "Push Day", "45 min · done", "100%"],
                ].map(([label, main, sub, pct]) => (
                  <div key={label} className="rounded-xl bg-surface-2 p-4">
                    <p className="text-[12px] uppercase tracking-wide text-ink-faint">{label}</p>
                    <p className="display mt-1 text-xl font-bold tnum">{main}</p>
                    <p className="text-[12px] text-ink-muted">{sub}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent" style={{ width: pct }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
            <div key={f.title} className="card card-hover p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
                <f.icon className="h-5 w-5 text-accent-300" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-surface-1/40">
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
      <section className="mx-auto max-w-6xl px-5 py-20 text-center">
        <h2 className="display text-3xl font-bold sm:text-4xl">Stop guessing. Start logging.</h2>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">
          Join members who track what matters and let the data do the talking.
        </p>
        <Link to={primary.to} className="mt-8 inline-block">
          <Button size="lg">{primary.label} <ArrowRight className="h-4 w-4" /></Button>
        </Link>
      </section>

      <footer className="border-t border-line py-8 text-center text-[13px] text-ink-faint">
        GymAI Coach — fitness companion for gym members. Not medical advice.
      </footer>
    </div>
  );
}
