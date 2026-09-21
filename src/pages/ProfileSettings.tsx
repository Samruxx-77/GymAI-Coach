import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Award,
  CalendarDays,
  Check,
  Flame,
  LogOut,
  Palette,
  Save,
  Target,
  Zap,
} from "lucide-react";
import { Card, Button, Input, Select, Badge } from "../components/ui";
import { Avatar, AVATARS } from "../components/Avatar";
import { useProfile } from "../context/ProfileContext";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useTheme } from "../context/ThemeContext";
import { calculateTargets, goalLabel } from "../lib/nutrition";
import { rankForXp } from "../lib/gamification";
import { THEMES, THEME_IDS } from "../lib/themes";
import { cn, formatNumber } from "../lib/utils";
import bannerArt from "../assets/profile-banner.svg";
import type { ActivityLevel, ExperienceLevel, Gender, Goal } from "../lib/types";

export default function ProfileSettings() {
  const { profile, updateProfile, refresh } = useProfile();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { sessions } = useData();
  const { theme, setTheme } = useTheme();

  const [form, setForm] = useState({
    display_name: "",
    age: "",
    gender: "" as Gender | "",
    height_cm: "",
    current_weight_kg: "",
    target_weight_kg: "",
    primary_goal: "" as Goal | "",
    activity_level: "" as ActivityLevel | "",
    experience_level: "" as ExperienceLevel | "",
    weekly_workout_target: 3,
    dietary_preferences: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name ?? "",
      age: profile.age ? String(profile.age) : "",
      gender: (profile.gender as Gender | "") ?? "",
      height_cm: profile.height_cm ? String(profile.height_cm) : "",
      current_weight_kg: profile.current_weight_kg ? String(profile.current_weight_kg) : "",
      target_weight_kg: profile.target_weight_kg ? String(profile.target_weight_kg) : "",
      primary_goal: (profile.primary_goal as Goal | "") ?? "",
      activity_level: (profile.activity_level as ActivityLevel | "") ?? "",
      experience_level: (profile.experience_level as ExperienceLevel | "") ?? "",
      weekly_workout_target: profile.weekly_workout_target ?? 3,
      dietary_preferences: profile.dietary_preferences ?? [],
    });
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  const recalculated = calculateTargets({
    gender: form.gender || null,
    age: form.age ? Number(form.age) : null,
    heightCm: form.height_cm ? Number(form.height_cm) : null,
    currentWeightKg: form.current_weight_kg ? Number(form.current_weight_kg) : null,
    targetWeightKg: form.target_weight_kg ? Number(form.target_weight_kg) : null,
    activityLevel: form.activity_level || null,
    goal: form.primary_goal || null,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const patch = {
      display_name: form.display_name.trim(),
      age: form.age ? Number(form.age) : null,
      gender: form.gender || null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      current_weight_kg: form.current_weight_kg ? Number(form.current_weight_kg) : null,
      target_weight_kg: form.target_weight_kg ? Number(form.target_weight_kg) : null,
      primary_goal: form.primary_goal || null,
      activity_level: form.activity_level || null,
      experience_level: form.experience_level || null,
      weekly_workout_target: Number(form.weekly_workout_target) || 3,
      dietary_preferences: form.dietary_preferences.filter((d) => d !== "No restrictions"),
      ...(recalculated
        ? {
            calorie_target: recalculated.calorieTarget,
            protein_target: recalculated.proteinTarget,
            carb_target: recalculated.carbTarget,
            fat_target: recalculated.fatTarget,
          }
        : {}),
    };
    const { error } = await updateProfile(patch);
    setBusy(false);
    if (error) setError(error);
    else {
      setSaved(true);
      await refresh();
    }
  }

  async function pickAvatar(avatarId: string) {
    if (!profile || profile.avatar_url === `avatar:${avatarId}`) return;
    setSaved(false);
    await updateProfile({ avatar_url: `avatar:${avatarId}` });
    await refresh();
  }

  if (!profile) return <div className="skeleton h-64" />;

  const rank = rankForXp(profile.xp);
  const memberSince = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  const stats = [
    { icon: Zap, label: "Total XP", value: formatNumber(profile.xp) },
    { icon: Target, label: "Workouts", value: String(sessions.length) },
    { icon: Flame, label: "Streak", value: `${profile.streak_count}d` },
    { icon: Award, label: "Best streak", value: `${profile.best_streak}d` },
    { icon: CalendarDays, label: "Member since", value: memberSince },
    { icon: Target, label: "Weekly goal", value: `${profile.weekly_workout_target}×` },
  ];

  return (
    <div className="page-fade space-y-5">
      {/* ── Banner + identity ─────────────────────────────────────── */}
      <Card className="overflow-hidden !p-0">
        <div
          className="profile-banner relative h-40 sm:h-48"
          style={{ backgroundImage: `url(${bannerArt})` }}
        >
          <div className="profile-banner-fade absolute inset-0" />
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(420px 180px at 80% 0%, var(--color-accent-soft), transparent 70%)",
            }}
          />
        </div>
        <div className="px-5 pb-5 sm:px-6">
          {/* identity row: only the avatar chip overlaps the banner */}
          <div className="-mt-10 flex items-end gap-3.5 sm:-mt-12 sm:gap-4">
            <div className="shrink-0 rounded-[18px] bg-surface-1 p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] ring-1 ring-line">
              <Avatar
                avatarId={profile.avatar_url}
                name={profile.display_name}
                className="h-20 w-20 rounded-xl text-3xl sm:h-24 sm:w-24"
              />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="display truncate text-xl font-bold sm:text-2xl">{profile.display_name}</h1>
              <p className="truncate text-[13px] text-ink-muted">{user?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="accent">{rank.current.name} · {formatNumber(profile.xp)} XP</Badge>
            <Badge tone="warning">{profile.streak_count}-day streak</Badge>
            <Badge tone="success">{goalLabel(profile.primary_goal)}</Badge>
          </div>
        </div>
      </Card>

      {/* ── Rank progress ─────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Rank progress</h2>
          <p className="text-[13px] text-ink-muted">
            {rank.next
              ? `${formatNumber(rank.next.minXp - profile.xp)} XP to ${rank.next.name}`
              : "Highest rank achieved"}
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-strong transition-[width] duration-500"
            style={{ width: `${Math.max(4, rank.progress)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-faint">
          <span>{rank.current.name}</span>
          <span>{rank.next ? rank.next.name : "Immortal"}</span>
        </div>
      </Card>

      {/* ── Stat tiles ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="card-hover p-3.5">
            <Icon className="h-4 w-4 text-accent-300" />
            <p className="display tnum mt-2 text-lg font-bold">{value}</p>
            <p className="text-[12px] text-ink-muted">{label}</p>
          </Card>
        ))}
      </div>

      {/* ── Appearance: theme ─────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-accent-300" />
          <h2 className="font-semibold">Appearance</h2>
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">
          Pick the mood of your gym. Applies instantly across the whole app.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEME_IDS.map((id) => {
            const t = THEMES[id];
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(id)}
                className={cn(
                  "theme-swatch cursor-pointer rounded-2xl border border-line bg-surface-1 p-3 text-left",
                  active && "border-accent"
                )}
              >
                {/* mini preview strip */}
                <span className="flex h-12 overflow-hidden rounded-xl border border-line">
                  <span className="w-1/3" style={{ background: t.surfaces[0] }} />
                  <span className="w-1/3" style={{ background: t.surfaces[1] }} />
                  <span className="w-1/3" style={{ background: t.accent }} />
                </span>
                <span className="mt-2.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{t.name}</span>
                  {active && <Check className="h-4 w-4 text-accent-300" />}
                </span>
                <span className="text-[12px] text-ink-muted">{t.tagline}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Avatar picker ─────────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold">Avatar</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Choose your mark. Shown beside your name across the app.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {AVATARS.map((a) => {
            const active = profile.avatar_url === `avatar:${a.id}`;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                title={a.name}
                onClick={() => pickAvatar(a.id)}
                className={cn(
                  "theme-swatch cursor-pointer rounded-2xl border-2 p-0.5",
                  active ? "border-accent" : "border-transparent hover:border-line"
                )}
              >
                <Avatar avatarId={a.id} name={profile.display_name} className="h-14 w-14 text-xl" />
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Details form ──────────────────────────────────────────── */}
      <form onSubmit={save} className="space-y-5">
        <Card>
          <h2 className="font-semibold">Personal</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Display name</label>
              <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Age</label>
              <Input type="number" min={13} max={100} value={form.age} onChange={(e) => set("age", e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Gender</label>
              <Select value={form.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Height (cm)</label>
              <Input type="number" min={90} max={250} value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Goal & body</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Primary goal</label>
              <Select value={form.primary_goal} onChange={(e) => set("primary_goal", e.target.value as Goal)}>
                <option value="">Select…</option>
                <option value="lose_weight">Lose weight</option>
                <option value="build_muscle">Build muscle</option>
                <option value="recomp">Recomposition</option>
                <option value="endurance">Endurance</option>
                <option value="general_health">General health</option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Activity level</label>
              <Select value={form.activity_level} onChange={(e) => set("activity_level", e.target.value as ActivityLevel)}>
                <option value="">Select…</option>
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="active">Active</option>
                <option value="very_active">Very active</option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Experience</label>
              <Select value={form.experience_level} onChange={(e) => set("experience_level", e.target.value as ExperienceLevel)}>
                <option value="">Select…</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Weekly workout target</label>
              <Select
                value={String(form.weekly_workout_target)}
                onChange={(e) => set("weekly_workout_target", Number(e.target.value))}
              >
                {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}× per week</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Current weight (kg)</label>
              <Input type="number" step="0.1" value={form.current_weight_kg} onChange={(e) => set("current_weight_kg", e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Target weight (kg)</label>
              <Input type="number" step="0.1" value={form.target_weight_kg} onChange={(e) => set("target_weight_kg", e.target.value)} />
            </div>
          </div>
        </Card>

        {/* targets preview */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Daily targets</h2>
            {recalculated && <Badge tone="accent">auto-updates on save</Badge>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Calories", profile.calorie_target, recalculated?.calorieTarget],
              ["Protein", profile.protein_target, recalculated?.proteinTarget],
              ["Carbs", profile.carb_target, recalculated?.carbTarget],
              ["Fat", profile.fat_target, recalculated?.fatTarget],
            ].map(([label, current, next]) => (
              <div key={label as string} className="rounded-xl bg-surface-2 p-3 text-center">
                <p className="text-[12px] text-ink-muted">{label}</p>
                <p className="display text-lg font-bold tnum">{formatNumber((current as number | null) ?? 0)}</p>
                {next != null && (current as number | null) !== next && (
                  <p className="text-[11px] text-accent-300">→ {formatNumber(next as number)}</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy}><Save className="h-4 w-4" /> Save changes</Button>
          {saved && <span className="text-[13px] text-success">Saved.</span>}
        </div>
      </form>

      {/* ── Account ───────────────────────────────────────────────── */}
      <Card>
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Signed in as {user?.email}. Signing out keeps your data safe in the cloud.
        </p>
        <Button
          variant="danger"
          className="mt-4"
          onClick={async () => {
            await signOut();
            navigate("/", { replace: true });
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </Card>
    </div>
  );
}
