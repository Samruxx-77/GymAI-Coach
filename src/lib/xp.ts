import { supabase } from "./supabase";

/**
 * Recompute the member's XP total from the durable ledger.
 *
 * Activity points live in xp_events (values server-enforced by the
 * enforce_xp_points trigger); achievement rewards live in
 * achievements.xp_reward. profiles.xp is a maintained cache of the
 * sum — the UI reads it, so it must be kept in sync. Idempotent and
 * safe to call after any XP-relevant mutation.
 */
export async function recomputeXpCache(userId: string): Promise<number | null> {
  const [{ data: events, error: evErr }, { data: unlocks, error: uaErr }] = await Promise.all([
    supabase.from("xp_events").select("points").eq("user_id", userId),
    supabase
      .from("user_achievements")
      .select("achievement_id, achievements(xp_reward)")
      .eq("user_id", userId),
  ]);
  if (evErr || uaErr) return null;

  const activity = (events ?? []).reduce((sum, e) => sum + (e.points ?? 0), 0);
  const badges = (unlocks ?? []).reduce((sum, u) => {
    // Embedded one-to-one relation is typed/returned as an array.
    const rel = Array.isArray(u.achievements) ? u.achievements[0] : u.achievements;
    return sum + (rel?.xp_reward ?? 0);
  }, 0);
  const total = activity + badges;

  const { error } = await supabase.from("profiles").update({ xp: total }).eq("id", userId);
  return error ? null : total;
}
