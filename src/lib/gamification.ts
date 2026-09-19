import type { Achievement, AchievementTier, XpSource } from "./types";

/**
 * XP engine — values must mirror the enforce_xp_points() trigger in
 * supabase/schema.sql (the DB trigger is the authority; these constants
 * exist for optimistic UI + daily-mission logic).
 */

export const XP_VALUES: Record<XpSource, number> = {
  onboarding: 50,
  food_log: 10,
  weight_log: 15,
  workout_complete: 40,
  ai_scan: 5,
  ai_chat: 2,
  streak_day: 20,
  daily_login: 5,
  achievement: 0,
};

/** Rank ladder with cumulative XP thresholds. */
export const RANKS: { name: string; tier: AchievementTier; minXp: number }[] = [
  { name: "Bronze", tier: "bronze", minXp: 0 },
  { name: "Silver", tier: "silver", minXp: 1_500 },
  { name: "Gold", tier: "gold", minXp: 5_000 },
  { name: "Platinum", tier: "platinum", minXp: 12_000 },
  { name: "Mythical", tier: "mythical", minXp: 30_000 },
  { name: "Immortal", tier: "immortal", minXp: 60_000 },
];

export function rankForXp(xp: number) {
  let current = RANKS[0];
  for (const r of RANKS) if (xp >= r.minXp) current = r;
  const next = RANKS.find((r) => r.minXp > current.minXp) ?? null;
  const progress = next
    ? Math.min(100, Math.round(((xp - current.minXp) / (next.minXp - current.minXp)) * 100))
    : 100;
  return { current, next, progress };
}

/**
 * Evaluate achievement criteria against real user stats.
 * `stats` values come from stored data only — nothing is fabricated.
 */
export interface AchievementStats {
  workoutSessions: number;
  weightEntries: number;
  foodEntries: number;
  foodLoggingDays: number;
  aiScans: number;
  streak: number;
  xp: number;
  proteinTargetDays: number;
  calorieTargetDays: number;
  goalWeightReached: boolean;
  onboarding: boolean;
}

export function achievementUnlocked(
  achievement: Achievement,
  stats: AchievementStats
): boolean {
  const c = achievement.criteria;
  switch (c.type) {
    case "onboarding": return stats.onboarding;
    case "workout_sessions": return stats.workoutSessions >= (c.value ?? 1);
    case "weight_entries": return stats.weightEntries >= (c.value ?? 1);
    case "food_entries": return stats.foodEntries >= (c.value ?? 1);
    case "food_logging_days": return stats.foodLoggingDays >= (c.value ?? 1);
    case "ai_scans": return stats.aiScans >= (c.value ?? 1);
    case "streak": return stats.streak >= (c.value ?? 1);
    case "xp": return stats.xp >= (c.value ?? 1);
    case "protein_target_days": return stats.proteinTargetDays >= (c.value ?? 1);
    case "calorie_target_days": return stats.calorieTargetDays >= (c.value ?? 1);
    case "goal_weight_reached": return stats.goalWeightReached;
    default: return false;
  }
}
