import { supabase } from "./supabase";
import type { Achievement, UserAchievement } from "./types";
import { achievementUnlocked, type AchievementStats } from "./gamification";

/**
 * Evaluate all achievements against real stats and unlock new ones.
 * Returns the list of newly unlocked achievements (empty if none).
 * Safe to call after any data mutation.
 */
export async function checkAndUnlockAchievements(
  userId: string,
  achievements: Achievement[],
  existing: UserAchievement[],
  stats: AchievementStats
): Promise<Achievement[]> {
  const have = new Set(existing.map((ua) => ua.achievement_id));
  const toUnlock = achievements.filter((a) => !have.has(a.id) && achievementUnlocked(a, stats));
  if (!toUnlock.length) return [];

  const rows = toUnlock.map((a) => ({ user_id: userId, achievement_id: a.id }));
  const { error } = await supabase.from("user_achievements").insert(rows);
  if (error) {
    console.error("Failed to unlock achievements:", error.message);
    return [];
  }
  return toUnlock;
}
