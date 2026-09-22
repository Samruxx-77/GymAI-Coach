import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useProfile } from "../context/ProfileContext";
import { Button, Input, Select, Card } from "../components/ui";
import { Logo } from "../components/Logo";
import { calculateTargets, goalLabel } from "../lib/nutrition";
import { cn, clamp } from "../lib/utils";
import type { ActivityLevel, ExperienceLevel, Gender, Goal } from "../lib/types";

const STEPS = ["You", "Body", "Goal", "Training", "Targets"] as const;

interface Draft {
  display_name: string;
  age: string;
  gender: Gender | "";
  height_cm: string;
  current_weight_kg: string;
  target_weight_kg: string;
  primary_goal: Goal | "";
  activity_level: ActivityLevel | "";
  experience_level: ExperienceLevel | "";
  weekly_workout_target: string;
  dietary_preferences: string[];
}

const DIET_OPTIONS = ["No restrictions", "Vegetarian", "Vegan", "Pescatarian", "Halal", "Kosher", "Lactose-free", "Gluten-free"];

export default function Onboarding() {
  const { profile, loading: profileLoading, updateProfile, refresh } = useProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(() => ({
    display_name: profile?.display_name ?? "",
    age: profile?.age ? String(profile.age) : "",
    gender: (profile?.gender as Gender | "") ?? "",
    height_cm: profile?.height_cm ? String(profile.height_cm) : "",
    current_weight_kg: profile?.current_weight_kg ? String(profile.current_weight_kg) : "",
    target_weight_kg: profile?.target_weight_kg ? String(profile.target_weight_kg) : "",
    primary_goal: (profile?.primary_goal as Goal | "") ?? "",
    activity_level: (profile?.activity_level as ActivityLevel | "") ?? "",
    experience_level: (profile?.experience_level as ExperienceLevel | "") ?? "",
    weekly_workout_target: String(profile?.weekly_workout_target ?? 3),
    dietary_preferences: profile?.dietary_preferences ?? [],
  }));

  // The profile may still be loading on first render — sync the draft once
  // it arrives so returning users see their saved values, not blanks.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (profileLoading || syncedRef.current || !profile) return;
    syncedRef.current = true;
    setDraft({
      display_name: profile.display_name ?? "",
      age: profile.age ? String(profile.age) : "",
      gender: (profile.gender as Gender | "") ?? "",
      height_cm: profile.height_cm ? String(profile.height_cm) : "",
      current_weight_kg: profile.current_weight_kg ? String(profile.current_weight_kg) : "",
      target_weight_kg: profile.target_weight_kg ? String(profile.target_weight_kg) : "",
      primary_goal: (profile.primary_goal as Goal | "") ?? "",
      activity_level: (profile.activity_level as ActivityLevel | "") ?? "",
      experience_level: (profile.experience_level as ExperienceLevel | "") ?? "",
      weekly_workout_target: String(profile.weekly_workout_target ?? 3),
      dietary_preferences: profile.dietary_preferences ?? [],
    });
  }, [profileLoading, profile]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const calculated = useMemo(
    () =>
      calculateTargets({
        gender: (draft.gender || null) as Draft["gender"] extends never ? never : Gender | null,
        age: draft.age ? Number(draft.age) : null,
        heightCm: draft.height_cm ? Number(draft.height_cm) : null,
        currentWeightKg: draft.current_weight_kg ? Number(draft.current_weight_kg) : null,
        targetWeightKg: draft.target_weight_kg ? Number(draft.target_weight_kg) : null,
        activityLevel: (draft.activity_level || null) as ActivityLevel | null,
        goal: (draft.primary_goal || null) as Goal | null,
      }),
    [draft]
  );

  const stepValid = [
    draft.display_name.trim().length > 0 && Number(draft.age) >= 13 && Number(draft.age) <= 100,
    Number(draft.height_cm) >= 90 && Number(draft.current_weight_kg) >= 25 && Number(draft.target_weight_kg) >= 25,
    draft.primary_goal !== "",
    draft.activity_level !== "" && draft.experience_level !== "",
    true,
  ];

  async function finish() {
    setBusy(true);
    setError(null);
    const patch = {
      display_name: draft.display_name.trim(),
      age: draft.age ? Number(draft.age) : null,
      gender: draft.gender || null,
      height_cm: draft.height_cm ? Number(draft.height_cm) : null,
      start_weight_kg: profile?.start_weight_kg ?? (draft.current_weight_kg ? Number(draft.current_weight_kg) : null),
      current_weight_kg: draft.current_weight_kg ? Number(draft.current_weight_kg) : null,
      target_weight_kg: draft.target_weight_kg ? Number(draft.target_weight_kg) : null,
      primary_goal: draft.primary_goal || null,
      activity_level: draft.activity_level || null,
      experience_level: draft.experience_level || null,
      weekly_workout_target: clamp(Number(draft.weekly_workout_target) || 3, 1, 7),
      dietary_preferences: draft.dietary_preferences.filter((d) => d !== "No restrictions"),
      ...(calculated
        ? {
            calorie_target: calculated.calorieTarget,
            protein_target: calculated.proteinTarget,
            carb_target: calculated.carbTarget,
            fat_target: calculated.fatTarget,
          }
        : {}),
      onboarding_completed: true,
    };
    const { error } = await updateProfile(patch);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    await refresh();
    navigate("/app", { replace: true });
  }

  // Don't render the form until the profile has loaded — otherwise the
  // draft initializes from null and returning users see blank fields.
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-surface-0 px-4 py-8">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-0 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-[13px] text-ink-faint">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* progress */}
        <div className="mt-5 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-surface-2")} />
          ))}
        </div>

        <Card className="mt-6">
          <h1 className="display text-xl font-bold text-ink">{STEPS[step]}</h1>

          {step === 0 && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">What should we call you?</label>
                <Input value={draft.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Alex" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Age</label>
                  <Input type="number" min={13} max={100} value={draft.age} onChange={(e) => set("age", e.target.value)} placeholder="28" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Gender</label>
                  <Select value={draft.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Height (cm)</label>
                  <Input type="number" min={90} max={250} value={draft.height_cm} onChange={(e) => set("height_cm", e.target.value)} placeholder="178" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Weight (kg)</label>
                  <Input type="number" min={25} max={400} step="0.1" value={draft.current_weight_kg} onChange={(e) => set("current_weight_kg", e.target.value)} placeholder="80" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Target (kg)</label>
                  <Input type="number" min={25} max={400} step="0.1" value={draft.target_weight_kg} onChange={(e) => set("target_weight_kg", e.target.value)} placeholder="75" />
                </div>
                </div>
              <p className="text-[13px] text-ink-faint">Used for calorie targets and progress charts.</p>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5 space-y-2">
              {(
                [
                  ["lose_weight", "Lose weight", "Cut body fat with a moderate deficit"],
                  ["build_muscle", "Build muscle", "Lean gains with a slight surplus"],
                  ["recomp", "Recomposition", "Build muscle while slowly losing fat"],
                  ["endurance", "Improve endurance", "Conditioning and stamina focus"],
                  ["general_health", "General health", "Feel great, stay consistent"],
                ] as [Goal, string, string][]
              ).map(([value, title, desc]) => (
                <button
                  key={value}
                  onClick={() => set("primary_goal", value)}
                  className={cn(
                    "w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors",
                    draft.primary_goal === value ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2"
                  )}
                >
                  <p className="font-medium text-ink">{title}</p>
                  <p className="text-[13px] text-ink-muted">{desc}</p>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Activity level (outside the gym)</label>
                <Select value={draft.activity_level} onChange={(e) => set("activity_level", e.target.value as ActivityLevel)}>
                  <option value="">Select…</option>
                  <option value="sedentary">Sedentary — mostly sitting</option>
                  <option value="light">Light — some walking</option>
                  <option value="moderate">Moderate — on your feet often</option>
                  <option value="active">Active — physical routine</option>
                  <option value="very_active">Very active — intense daily life</option>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Training experience</label>
                <Select value={draft.experience_level} onChange={(e) => set("experience_level", e.target.value as ExperienceLevel)}>
                  <option value="">Select…</option>
                  <option value="beginner">Beginner — under 1 year</option>
                  <option value="intermediate">Intermediate — 1–3 years</option>
                  <option value="advanced">Advanced — 3+ years</option>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">
                  Weekly workout target: {draft.weekly_workout_target}×
                </label>
                <input
                  type="range" min={1} max={7} step={1}
                  value={Number(draft.weekly_workout_target)}
                  onChange={(e) => set("weekly_workout_target", e.target.value)}
                  className="w-full accent-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">Dietary preferences (optional)</label>
                <div className="flex flex-wrap gap-2">
                  {DIET_OPTIONS.map((opt) => {
                    const selected = draft.dietary_preferences.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          // "No restrictions" is mutually exclusive with the rest.
                          if (opt === "No restrictions") {
                            set("dietary_preferences", selected ? [] : ["No restrictions"]);
                          } else {
                            const withoutNone = draft.dietary_preferences.filter(
                              (d) => d !== "No restrictions" && d !== opt
                            );
                            set("dietary_preferences", selected ? withoutNone : [...withoutNone, opt]);
                          }
                        }}
                        className={cn(
                          "cursor-pointer rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                          selected ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-muted hover:bg-surface-2"
                        )}
                      >
                        {selected && <Check className="mr-1 inline h-3.5 w-3.5" />}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-5 space-y-4">
              {calculated ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Calories", calculated.calorieTarget, "kcal"],
                    ["Protein", calculated.proteinTarget, "g"],
                    ["Carbs", calculated.carbTarget, "g"],
                    ["Fat", calculated.fatTarget, "g"],
                  ].map(([label, value, unit]) => (
                    <div key={label} className="rounded-xl bg-surface-2 p-4 text-center">
                      <p className="display text-xl font-bold text-ink tnum">{value}</p>
                      <p className="text-[12px] text-ink-muted">{label} ({unit})</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Fill in body + goal steps to see calculated targets.</p>
              )}
              <div className="rounded-xl bg-surface-2 p-4 text-[13px] text-ink-muted">
                <p><span className="text-ink">Goal:</span> {goalLabel(draft.primary_goal || null)}</p>
                <p className="mt-1"><span className="text-ink">Weekly workouts:</span> {draft.weekly_workout_target}×</p>
                <p className="mt-1"><span className="text-ink">Diet:</span> {draft.dietary_preferences.length ? draft.dietary_preferences.join(", ") : "No restrictions"}</p>
                <p className="mt-2 text-ink-faint">You can change all of this later in Profile.</p>
              </div>
              {error && <p className="text-[13px] text-danger">{error}</p>}
            </div>
          )}

          {/* nav */}
          <div className="mt-7 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step]}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish} loading={busy} disabled={!stepValid.every(Boolean)}>
                Finish setup <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
