import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Save } from "lucide-react";
import { Card, Button, Input, Select, Badge } from "../components/ui";
import { useProfile } from "../context/ProfileContext";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { calculateTargets, goalLabel } from "../lib/nutrition";
import { rankForXp } from "../lib/gamification";
import { formatNumber } from "../lib/utils";
import type { ActivityLevel, ExperienceLevel, Gender, Goal } from "../lib/types";

export default function ProfileSettings() {
  const { profile, updateProfile, refresh } = useProfile();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { sessions } = useData();

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

  if (!profile) return <div className="skeleton h-64" />;

  const rank = rankForXp(profile.xp);

  return (
    <div className="page-fade space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">Profile & settings</h1>
        <p className="text-[13px] text-ink-muted">Personal details, goals and targets.</p>
      </div>

      {/* summary */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">{profile.display_name}</p>
            <p className="text-[13px] text-ink-muted">{user?.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{rank.current.name} · {formatNumber(profile.xp)} XP</Badge>
            <Badge tone="warning">{profile.streak_count}-day streak</Badge>
            <Badge>{sessions.length} workouts</Badge>
            <Badge tone="success">{goalLabel(profile.primary_goal)}</Badge>
          </div>
        </div>
      </Card>

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
