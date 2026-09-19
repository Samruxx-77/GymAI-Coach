/** Database row types — mirror supabase/schema.sql. */

export type Goal = "lose_weight" | "build_muscle" | "recomp" | "endurance" | "general_health";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodSource = "manual" | "ai_scan" | "quick";

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "arms" | "legs" | "core" | "full_body" | "cardio";

export type WorkoutCategory =
  | "push" | "pull" | "legs" | "full_body" | "upper" | "lower" | "bro_split" | "cardio" | "custom";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  age: number | null;
  gender: Gender | null;
  height_cm: number | null;
  start_weight_kg: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  primary_goal: Goal | null;
  activity_level: ActivityLevel | null;
  experience_level: ExperienceLevel | null;
  weekly_workout_target: number;
  dietary_preferences: string[];
  calorie_target: number | null;
  protein_target: number | null;
  carb_target: number | null;
  fat_target: number | null;
  xp: number;
  streak_count: number;
  best_streak: number;
  last_active_date: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeightEntry {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  weight_kg: number;
  note: string | null;
  created_at: string;
}

export interface FoodEntry {
  id: string;
  user_id: string;
  entry_date: string;
  meal_type: MealType;
  name: string;
  servings: number;
  serving_label: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource;
  ai_confidence: number | null;
  created_at: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  equipment: string;
  is_compound: boolean;
  instructions: string;
  tips: string;
}

export interface Workout {
  id: string;
  user_id: string | null; // null = system template
  name: string;
  description: string;
  category: WorkoutCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimated_minutes: number;
  created_at: string;
  updated_at: string;
  /** Joined line items (present when fetched with exercises). */
  workout_exercises?: WorkoutExercise[];
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string;
  exercises?: Exercise;
}

export interface LoggedSet {
  weight: number | null;
  reps: number;
}

export interface SessionExerciseLog {
  exerciseId: string;
  name: string;
  sets: LoggedSet[];
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  workout_id: string | null;
  workout_name: string;
  session_date: string;
  duration_minutes: number | null;
  total_volume_kg: number;
  exercises_completed: number;
  exercises_total: number;
  session_data: SessionExerciseLog[];
  notes: string | null;
  created_at: string;
}

export type XpSource =
  | "food_log" | "weight_log" | "workout_complete" | "ai_scan" | "ai_chat"
  | "streak_day" | "achievement" | "onboarding" | "daily_login";

export interface XpEvent {
  id: string;
  user_id: string;
  source: XpSource;
  points: number;
  ref_id: string | null;
  day: string;
  created_at: string;
}

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum" | "mythical" | "immortal";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "nutrition" | "training" | "consistency" | "progress" | "milestone";
  tier: AchievementTier;
  xp_reward: number;
  criteria: { type: string; value?: number };
  sort_order: number;
}

export interface UserAchievement {
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface AiConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/** Food scanner response from /api/ai/food. */
export interface FoodScanResult {
  name: string;
  servingEstimate: string;
  confidence: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number }[];
  sanity: "ok" | "uncertain";
  provider: string;
  fallbackUsed: boolean;
}
