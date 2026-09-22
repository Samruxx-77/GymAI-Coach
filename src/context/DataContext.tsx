import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type {
  Achievement,
  Exercise,
  FoodEntry,
  MealType,
  MuscleGroup,
  Profile,
  UserAchievement,
  WeightEntry,
  Workout,
  WorkoutCategory,
  WorkoutSession,
} from "../lib/types";
import { todayKey, yesterdayKey, dayKey } from "../lib/utils";
import { useProfile } from "./ProfileContext";
import { XP_VALUES, type AchievementStats } from "../lib/gamification";
import { checkAndUnlockAchievements } from "../lib/xpUser";
import { recomputeXpCache } from "../lib/xp";

export interface DailySummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: FoodEntry[];
}

interface DataContextValue {
  // raw data
  weightEntries: WeightEntry[];
  foodEntries: FoodEntry[];
  exercises: Exercise[];
  templates: Workout[]; // system templates
  userWorkouts: Workout[]; // member-created
  sessions: WorkoutSession[];
  xpEvents: XpRowLite[];
  achievements: Achievement[];
  userAchievements: UserAchievement[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  // mutations
  addWeight: (date: string, kg: number, note?: string) => Promise<{ error: string | null }>;
  updateWeight: (id: string, kg: number, note: string | null) => Promise<{ error: string | null }>;
  deleteWeight: (id: string) => Promise<{ error: string | null }>;
  addFood: (input: NewFoodInput) => Promise<{ error: string | null }>;
  deleteFood: (id: string) => Promise<{ error: string | null }>;
  saveWorkout: (
    input: WorkoutInput,
    lineItems: LineItemInput[]
  ) => Promise<{ error: string | null; id: string | null }>;
  deleteWorkout: (id: string) => Promise<{ error: string | null }>;
  createExercise: (input: {
    name: string;
    muscle_group: MuscleGroup;
    equipment: string;
  }) => Promise<{ error: string | null; exercise: Exercise | null }>;
  logSession: (input: SessionInput) => Promise<{ error: string | null }>;

  // computed
  today: DailySummary;
  todayEntries: FoodEntry[];
  latestWeight: number | null;
  weightTrendKg: number | null; // last 4 weeks delta
  weekWorkoutCount: number; // sessions in the current local calendar week (Mon–Sun)
  last30Workouts: number;
  sessionOn: (date: string) => boolean;
  hasLoggedToday: boolean;
  workoutDoneToday: boolean;
  mealCounts: Record<MealType, number>;
}

export interface NewFoodInput {
  entry_date: string;
  meal_type: MealType;
  name: string;
  servings: number;
  serving_label: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "manual" | "ai_scan" | "quick";
  ai_confidence: number | null;
}

export interface XpRowLite {
  id: string;
  source: string;
  points: number;
  day: string;
  created_at: string;
}

export interface LineItemInput {
  exercise_id: string;
  position: number;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string;
}

export interface WorkoutInput {
  name: string;
  description: string;
  category: WorkoutCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimated_minutes: number;
}

export interface SessionInput {
  workout_id: string | null;
  workout_name: string;
  session_date: string;
  duration_minutes: number | null;
  total_volume_kg: number;
  exercises_completed: number;
  exercises_total: number;
  session_data: {
    exerciseId: string;
    name: string;
    sets: { weight: number | null; reps: number }[];
  }[];
  notes: string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const [weightEntries, setWeight] = useState<WeightEntry[]>([]);
  const [foodEntries, setFood] = useState<FoodEntry[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutRows, setWorkoutRows] = useState<Workout[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [xpEvents, setXpEvents] = useState<XpRowLite[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Latest profile without adding it to fetchAll's dependencies.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setWeight([]); setFood([]); setExercises([]); setWorkoutRows([]);
      setSessions([]); setXpEvents([]); setAchievements([]); setUserAchievements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [w, f, ex, wk, se, xp, ach, uach] = await Promise.all([
        supabase.from("weight_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("food_entries").select("*").order("entry_date", { ascending: false }).limit(400),
        supabase.from("exercises").select("*").order("name"),
        supabase.from("workouts").select("*, workout_exercises(*, exercises(*))").order("updated_at", { ascending: false }),
        supabase.from("workout_sessions").select("*").order("session_date", { ascending: false }).limit(200),
        supabase.from("xp_events").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("achievements").select("*").order("sort_order"),
        supabase.from("user_achievements").select("*"),
      ]);
      const firstErr = w.error || f.error || ex.error || wk.error || se.error || xp.error || ach.error || uach.error;
      if (firstErr) throw new Error(firstErr.message);
      setWeight((w.data ?? []) as WeightEntry[]);
      setFood((f.data ?? []) as FoodEntry[]);
      setExercises((ex.data ?? []) as Exercise[]);
      setWorkoutRows((wk.data ?? []) as Workout[]);
      setSessions((se.data ?? []) as WorkoutSession[]);
      setXpEvents((xp.data ?? []) as XpRowLite[]);
      setAchievements((ach.data ?? []) as Achievement[]);
      setUserAchievements((uach.data ?? []) as UserAchievement[]);

      // Evaluate badges against the fresh server state so unlocks and
      // their XP rewards land no matter which page triggered the refresh.
      const p = profileRef.current;
      if (p) {
        const meals = (f.data ?? []) as FoodEntry[];
        const stats: AchievementStats = {
          workoutSessions: ((se.data ?? []) as WorkoutSession[]).length,
          weightEntries: ((w.data ?? []) as WeightEntry[]).length,
          foodEntries: meals.length,
          foodLoggingDays: new Set(meals.map((x) => x.entry_date)).size,
          aiScans: meals.filter((x) => x.source === "ai_scan").length,
          streak: p.streak_count,
          xp: p.xp,
          proteinTargetDays: 0,
          calorieTargetDays: 0,
          goalWeightReached:
            p.start_weight_kg != null &&
            p.target_weight_kg != null &&
            p.current_weight_kg != null &&
            (p.primary_goal === "lose_weight"
              ? p.current_weight_kg <= p.target_weight_kg
              : p.primary_goal === "build_muscle"
                ? p.current_weight_kg >= p.target_weight_kg
                : false),
          onboarding: p.onboarding_completed,
        };
        await checkAndUnlockAchievements(
          user.id,
          (ach.data ?? []) as Achievement[],
          (uach.data ?? []) as UserAchievement[],
          stats
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /* ── mutations ──────────────────────────────────────────────── */

  const awardXp = useCallback(
    async (source: keyof typeof XP_VALUES, refId: string | null) => {
      if (!user || !supabaseConfigured) return;
      // Plain insert: the partial unique indexes in the schema enforce
      // idempotency server-side (23505 on duplicates). The old upsert with
      // onConflict could never match a partial index (Postgres 42P10), so
      // daily XP was silently never awarded.
      const { error } = await supabase
        .from("xp_events")
        .insert({ user_id: user.id, source, ref_id: refId, day: todayKey() });
      if (error && error.code !== "23505") {
        console.error("awardXp failed:", error.message);
      }
      // Keep profiles.xp (the cached total the UI reads) in sync.
      await recomputeXpCache(user.id);
      await fetchAll();
    },
    [user, fetchAll]
  );

  const addWeight = useCallback(
    async (date: string, kg: number, note?: string) => {
      if (!user) return { error: "Not signed in" };
      const { error: err } = await supabase.from("weight_entries").upsert(
        { user_id: user.id, entry_date: date, weight_kg: kg, note: note ?? null },
        { onConflict: "user_id,entry_date" }
      );
      if (err) return { error: err.message };
      // keep profile weight cache in sync
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ current_weight_kg: kg })
        .eq("id", user.id);
      if (!pErr && profile) {
        await updateProfile({ current_weight_kg: kg });
      }
      await awardXp("weight_log", null);
      await fetchAll();
      return { error: null };
    },
    [user, profile, updateProfile, awardXp, fetchAll]
  );

  const updateWeight = useCallback(
    async (id: string, kg: number, note: string | null) => {
      const { error: err } = await supabase
        .from("weight_entries")
        .update({ weight_kg: kg, note })
        .eq("id", id);
      if (err) return { error: err.message };
      await fetchAll();
      // Resync the profile cache from the newest remaining entry — editing
      // any row (not just today's) can change which entry is latest.
      if (profile) {
        const updated = weightEntries.map((w) => (w.id === id ? { ...w, weight_kg: kg, note } : w));
        const latest = updated.length ? updated[0].weight_kg : null;
        if (profile.current_weight_kg !== latest) {
          await updateProfile({ current_weight_kg: latest });
        }
      }
      return { error: null };
    },
    [weightEntries, profile, updateProfile, fetchAll]
  );

  const deleteWeight = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from("weight_entries").delete().eq("id", id);
      if (err) return { error: err.message };
      await fetchAll();
      // If the deleted row was the latest, the profile weight cache would
      // go stale — resync it from the newest remaining entry (or clear it).
      if (profile) {
        const remaining = weightEntries.filter((w) => w.id !== id);
        const latest = remaining.length ? remaining[0].weight_kg : null;
        if (profile.current_weight_kg !== latest) {
          await updateProfile({ current_weight_kg: latest });
        }
      }
      return { error: null };
    },
    [fetchAll, profile, updateProfile, weightEntries]
  );

  const addFood = useCallback(
    async (input: NewFoodInput) => {
      if (!user) return { error: "Not signed in" };
      // Explicit user_id: never rely on the column default (which is
      // auth.uid() and NULL for service-role inserts).
      const { error: err } = await supabase
        .from("food_entries")
        .insert({ ...input, user_id: user.id });
      if (err) return { error: err.message };
      await awardXp("food_log", null);
      return { error: null };
    },
    [user, awardXp]
  );

  const deleteFood = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from("food_entries").delete().eq("id", id);
      if (!err) await fetchAll(); // keep the diary list + macro totals in sync
      return { error: err ? err.message : null };
    },
    [fetchAll]
  );

  const saveWorkout = useCallback(
    async (input: WorkoutInput, lineItems: LineItemInput[]) => {
      if (!user) return { error: "Not signed in", id: null };
      const { data, error: err } = await supabase
        .from("workouts")
        .insert({ ...input, user_id: user.id })
        .select("id")
        .single();
      if (err) return { error: err.message, id: null };
      if (lineItems.length) {
        const { error: liErr } = await supabase
          .from("workout_exercises")
          .insert(lineItems.map((li) => ({ ...li, workout_id: data.id })));
        if (liErr) {
          // Don't leave an empty workout header behind — best-effort cleanup.
          await supabase.from("workouts").delete().eq("id", data.id);
          return { error: liErr.message, id: null };
        }
      }
      await fetchAll();
      return { error: null, id: data.id as string };
    },
    [user, fetchAll]
  );

  const deleteWorkout = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from("workouts").delete().eq("id", id);
      if (err) return { error: err.message };
      await fetchAll();
      return { error: null };
    },
    [fetchAll]
  );

  const createExercise = useCallback(
    async (input: { name: string; muscle_group: MuscleGroup; equipment: string }) => {
      if (!user) return { error: "Not signed in", exercise: null };
      const { data, error: err } = await supabase
        .from("exercises")
        .insert({ ...input, user_id: user.id, is_compound: false, instructions: "", tips: "" })
        .select("*")
        .single();
      if (err) return { error: err.message, exercise: null };
      await fetchAll();
      return { error: null, exercise: data as Exercise };
    },
    [user, fetchAll]
  );

  const logSession = useCallback(
    async (input: SessionInput) => {
      if (!user) return { error: "Not signed in" };
      const { data, error: err } = await supabase
        .from("workout_sessions")
        .insert(input)
        .select("id")
        .single();
      if (err) return { error: err.message };
      await awardXp("workout_complete", data.id);
      // streak update: set last_active_date + increment if consecutive.
      // Both dates are LOCAL day keys — the old code used a UTC "yesterday",
      // which broke streaks for ~half the day in IST.
      const today = todayKey();
      const yesterday = yesterdayKey();
      if (profile) {
        const last = profile.last_active_date;
        let streak = profile.streak_count;
        if (last !== today) {
          streak = last === yesterday ? streak + 1 : 1;
        }
        const best = Math.max(profile.best_streak, streak);
        const { error: pErr } = await supabase
          .from("profiles")
          .update({ last_active_date: today, streak_count: streak, best_streak: best })
          .eq("id", user.id);
        if (!pErr && streak !== profile.streak_count) await awardXp("streak_day", null);
        await updateProfile({ last_active_date: today, streak_count: streak, best_streak: best });
      }
      await fetchAll();
      return { error: null };
    },
    [user, profile, awardXp, updateProfile, fetchAll]
  );

  /* ── computed ──────────────────────────────────────────────── */

  const todayEntries = useMemo(
    () => foodEntries.filter((f) => f.entry_date === todayKey()),
    [foodEntries]
  );

  const today = useMemo<DailySummary>(() => {
    const sum = (sel: (f: FoodEntry) => number) => todayEntries.reduce((a, f) => a + sel(f), 0);
    return {
      calories: sum((f) => f.calories),
      protein: sum((f) => f.protein_g),
      carbs: sum((f) => f.carbs_g),
      fat: sum((f) => f.fat_g),
      entries: todayEntries,
    };
  }, [todayEntries]);

  const latestWeight = useMemo(
    () => (weightEntries.length ? weightEntries[0].weight_kg : (profile?.current_weight_kg ?? null)),
    [weightEntries, profile]
  );

  const weightTrendKg = useMemo(() => {
    if (weightEntries.length < 2) return null;
    const cutoff = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
    const recent = weightEntries.filter((w) => w.entry_date >= cutoff);
    if (recent.length < 2) return null;
    const sorted = [...recent].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    return Math.round((sorted[sorted.length - 1].weight_kg - sorted[0].weight_kg) * 10) / 10;
  }, [weightEntries]);

  const weekWorkoutCount = useMemo(() => {
    // True local calendar week (Monday–Sunday): counts sessions in the
    // current calendar week, not a rolling window.
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    const start = dayKey(monday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const end = dayKey(sunday);
    return sessions.filter((s) => s.session_date >= start && s.session_date <= end).length;
  }, [sessions]);

  const last30Workouts = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return sessions.filter((s) => s.session_date >= cutoff).length;
  }, [sessions]);

  const sessionOn = useCallback(
    (date: string) => sessions.some((s) => s.session_date === date),
    [sessions]
  );
  const hasLoggedToday = todayEntries.length > 0;
  const workoutDoneToday = useMemo(() => sessionOn(todayKey()), [sessionOn]);

  const mealCounts = useMemo(() => {
    const counts: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    for (const e of todayEntries) counts[e.meal_type] += 1;
    return counts;
  }, [todayEntries]);

  const templates = useMemo(
    () => workoutRows.filter((w) => w.user_id === null),
    [workoutRows]
  );
  const userWorkouts = useMemo(
    () => workoutRows.filter((w) => w.user_id !== null),
    [workoutRows]
  );

  const value: DataContextValue = {
    weightEntries, foodEntries, exercises, templates, userWorkouts, sessions,
    xpEvents, achievements, userAchievements, loading, error, refresh: fetchAll,
    addWeight, updateWeight, deleteWeight, addFood, deleteFood, saveWorkout, deleteWorkout, createExercise, logSession,
    today, todayEntries, latestWeight, weightTrendKg, weekWorkoutCount,
    last30Workouts, sessionOn, hasLoggedToday, workoutDoneToday, mealCounts,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}

/** Convenience: profile with non-null defaults for computation. */
export function useProfileOrThrow(): Profile {
  const { profile } = useProfile();
  if (!profile) throw new Error("Profile not loaded");
  return profile;
}

export type { Profile };
