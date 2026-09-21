import { supabase } from "./supabase";
import type { Achievement, UserAchievement } from "./types";
import { achievementUnlocked, type AchievementStats } from "./gamification";
import { recomputeXpCache } from "./xp";

/**
 * Evaluate all achievements against real stats and unlock new ones,
 * granting each badge's xp_reward to the member's total.
 *
 * The insert skips rows already present (idempotent), evaluates against
 * fresh server state (not possibly-stale client caches), and on any new
 * unlock both refreshes the caller's list and recomputes the cached XP
 * total from the ledger + badge rewards.
 */
export async function checkAndUnlockAchievements(
  userId: string,
  achievements: Achievement[],
  existing: UserAchievement[],
  stats: AchievementStats,
  onUnlock?: (unlocked: Achievement[]) => void
): Promise<Achievement[]> {
  const have = new Set(existing.map((ua) => ua.achievement_id));
  const toUnlock = achievements.filter((a) => !have.has(a.id) && achievementUnlocked(a, stats));
  if (!toUnlock.length) return [];

  const rows = toUnlock.map((a) => ({ user_id: userId, achievement_id: a.id }));
  const { data, error } = await supabase
    .from("user_achievements")
    .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true })
    .select();
  if (error) {
    console.error("Failed to unlock achievements:", error.message);
    return [];
  }

  // Grant XP: recompute from the ledger so badge rewards land in the total.
  await recomputeXpCache(userId);

  const unlocked = ((data ?? []) as UserAchievement[])
    .map((ua) => achievements.find((a) => a.id === ua.achievement_id))
    .filter((a): a is Achievement => Boolean(a));

  if (unlocked.length) onUnlock?.(unlocked);
  return unlocked;
}
