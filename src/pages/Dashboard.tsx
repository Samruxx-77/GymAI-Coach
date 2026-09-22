import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, CheckCircle2, Flame, LineChart as LineChartIcon, MessageCircle,
  ScanLine, Target, Dumbbell, Scale,
} from "lucide-react";
import { Card, Badge, ProgressBar, Button } from "../components/ui";
import ThemeDots from "../components/ThemeDots";
import { useData } from "../context/DataContext";
import { useProfile } from "../context/ProfileContext";
import { useAuth } from "../context/AuthContext";
import { dailyInsight, todayMission } from "../lib/insights";
import { goalLabel } from "../lib/nutrition";
import { formatNumber, goalProgressPercent, todayKey } from "../lib/utils";
import { supabase } from "../lib/supabase";
import { recomputeXpCache } from "../lib/xp";

export default function Dashboard() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const {
    today, latestWeight, weightTrendKg, weekWorkoutCount, workoutDoneToday,
    xpEvents, loading,
  } = useData();

  /* ── daily login XP (once per day, server-enforced) ─────────── */
  // Badge evaluation runs centrally in DataContext after every data
  // refresh, so unlocks and their XP rewards land on any page.
  useEffect(() => {
    if (!user || loading) return;
    const todayRows = xpEvents.filter((e) => e.day === todayKey() && e.source === "daily_login");
    if (todayRows.length === 0) {
      supabase
        .from("xp_events")
        .insert({ user_id: user.id, source: "daily_login", ref_id: null, day: todayKey() })
        .then(async ({ error }) => {
          if (!error) await recomputeXpCache(user.id);
        });
    }
  }, [user, loading, xpEvents]);

  const insight = useMemo(
    () =>
      profile
        ? dailyInsight({
            profile,
            todayCalories: today.calories,
            todayProtein: today.protein,
            calorieTarget: profile.calorie_target,
            proteinTarget: profile.protein_target,
            workoutDoneToday,
            streak: profile.streak_count,
            latestWeight,
            weightTrendKg,
            weekWorkoutCount,
            weeklyTarget: profile.weekly_workout_target,
          })
        : null,
    [profile, today, workoutDoneToday, latestWeight, weightTrendKg, weekWorkoutCount]
  );

  const mission = profile
    ? todayMission({
        profile,
        todayCalories: today.calories,
        todayProtein: today.protein,
        calorieTarget: profile.calorie_target,
        proteinTarget: profile.protein_target,
        workoutDoneToday,
        streak: profile.streak_count,
        latestWeight,
        weightTrendKg,
        weekWorkoutCount,
        weeklyTarget: profile.weekly_workout_target,
      })
    : "";

  if (loading || !profile) {
    return (
      <div className="grid gap-4">
        <div className="skeleton h-28" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="skeleton h-44" />
          <div className="skeleton h-44" />
        </div>
      </div>
    );
  }

  const weightProgress = goalProgressPercent(profile.start_weight_kg, profile.current_weight_kg, profile.target_weight_kg);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page-fade space-y-5">
      {/* Greeting + theme switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-faint">{greeting},</p>
          <h1 className="display text-2xl font-bold text-ink">{profile.display_name}</h1>
        </div>
        <ThemeDots />
      </div>

      {/* Mission + insight */}
      <Card className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(400px 160px at 90% 0%, var(--color-accent-soft), transparent)" }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-accent-300">Today's mission</p>
            <p className="mt-1.5 text-[15px] font-medium text-ink">{mission}</p>
            {insight && <p className="mt-1 text-[13px] text-ink-muted">{insight.body}</p>}
          </div>
          <Link to="/app/coach" className="shrink-0">
            <Button variant="secondary" size="sm"><MessageCircle className="h-4 w-4" /> Ask coach</Button>
          </Link>
        </div>
      </Card>

      {/* Goal + weight */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent-300" />
              <h2 className="font-semibold text-ink">{goalLabel(profile.primary_goal)}</h2>
            </div>
            <span className="text-[13px] tnum text-ink-muted">{weightProgress}%</span>
          </div>
          <div className="mt-4">
            <ProgressBar value={weightProgress} />
            <div className="mt-2 flex justify-between text-[13px] text-ink-muted">
              <span>Start {formatNumber(profile.start_weight_kg ?? 0, 1)} kg</span>
              <span>Target {formatNumber(profile.target_weight_kg ?? 0, 1)} kg</span>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-[12px] uppercase tracking-wide text-ink-faint">Current</p>
              <p className="display text-2xl font-bold tnum text-ink">{formatNumber(latestWeight ?? 0, 1)} <span className="text-sm font-medium text-ink-muted">kg</span></p>
            </div>
            {weightTrendKg != null && (
              <p className={cnTrend(weightTrendKg)}>
                {weightTrendKg > 0 ? "+" : ""}{weightTrendKg.toFixed(1)} kg / 4 wks
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Workout status</h2>
            {workoutDoneToday ? (
              <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> Done today</Badge>
            ) : (
              <Badge tone="warning">Not yet today</Badge>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="display text-2xl font-bold tnum text-ink">{weekWorkoutCount}<span className="text-sm font-medium text-ink-muted">/{profile.weekly_workout_target}</span></p>
              <p className="text-[13px] text-ink-muted">sessions this week</p>
            </div>
            <Link to="/app/workouts">
              <Button size="sm">
                {workoutDoneToday ? "View workouts" : "Start training"} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="mt-4">
            <ProgressBar value={(weekWorkoutCount / profile.weekly_workout_target) * 100} tone="success" />
          </div>
        </Card>
      </div>

      {/* Nutrition today */}
      <div className="grid gap-4 sm:grid-cols-2">
        <NutritionCard
          label="Calories"
          value={today.calories}
          target={profile.calorie_target ?? 0}
          unit="kcal"
          icon={<Flame className="h-4 w-4 text-data-amber" />}
        />
        <NutritionCard
          label="Protein"
          value={today.protein}
          target={profile.protein_target ?? 0}
          unit="g"
          icon={<Dumbbell className="h-4 w-4 text-data-teal" />}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { to: "/app/nutrition?mode=scan", icon: ScanLine, label: "Scan food" },
          { to: "/app/nutrition", icon: Scale, label: "Log meal" },
          { to: "/app/workouts", icon: Dumbbell, label: "Workout" },
          { to: "/app/progress", icon: LineChartIcon, label: "Weigh in" },
        ].map((a) => (
          <Link key={a.to} to={a.to}>
            <Card className="card-hover flex h-full flex-col items-center justify-center gap-2 py-5 text-center">
              <a.icon className="h-5 w-5 text-accent-300" />
              <span className="text-[13px] font-medium text-ink">{a.label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NutritionCard({
  label, value, target, unit, icon,
}: {
  label: string; value: number; target: number; unit: string; icon: React.ReactNode;
}) {
  const pct = target ? (value / target) * 100 : 0;
  const over = target > 0 && value > target;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink">
          {icon}
          <h2 className="font-semibold">{label}</h2>
        </div>
        <span className={cnPct(over)}>{Math.round(pct)}%</span>
      </div>
      <p className="mt-3 text-2xl font-bold tnum">
        {formatNumber(value)}
        <span className="text-sm font-medium text-ink-muted"> / {formatNumber(target)} {unit}</span>
      </p>
      <ProgressBar className="mt-3" value={pct} tone={over ? "warning" : "accent"} />
      <Link to="/app/nutrition" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent-300 hover:underline">
        Log food <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  );
}

function cnTrend(delta: number) {
  return `text-[13px] font-medium tnum ${delta <= 0 ? "text-success" : "text-danger"}`;
}
function cnPct(over: boolean) {
  return `text-[13px] tnum ${over ? "text-data-amber" : "text-ink-muted"}`;
}
