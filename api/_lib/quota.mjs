/**
 * Persistent per-user daily AI quota.
 *
 * The in-memory per-minute limiter in auth.mjs blunts spam but resets on
 * every cold start and is per-instance — it cannot protect the shared
 * OpenRouter free-tier budget (50 requests/day for the whole account).
 * This module keeps a persistent, per-user, per-day ledger in Supabase
 * (`public.ai_usage`, append-only, RLS-scoped to the user) so one runaway
 * client can never burn the whole shared budget.
 *
 * The server talks to Supabase with the caller's own access token, so the
 * table's RLS policies (users see/insert only their own rows) apply — no
 * service-role key needed.
 *
 * Env knobs (optional):
 *   AI_DAILY_COACH_LIMIT   default 5   (chat completions per user per day)
 *   AI_DAILY_FOOD_LIMIT    default 15  (vision scans per user per day)
 *
 * If the ai_usage table does not exist yet (migration not run), quota
 * enforcement fails OPEN with a warning so AI keeps working — the
 * migration must be applied for enforcement to activate.
 */

function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function limitFor(endpoint) {
  const raw = Number(
    endpoint === "food" ? process.env.AI_DAILY_FOOD_LIMIT : process.env.AI_DAILY_COACH_LIMIT
  );
  const fallback = endpoint === "food" ? 15 : 5;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function restHeaders(token) {
  const { anonKey } = supabaseEnv();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * @returns {{ allowed: boolean, remaining: number, limit: number, enforced: boolean }}
 * `enforced` is false when the ledger table is missing — quota is then
 * not applied (fail-open) but the miss is logged loudly.
 */
export async function checkDailyQuota({ userId, token, endpoint }) {
  const limit = limitFor(endpoint);
  const { url } = supabaseEnv();
  if (!url) {
    console.warn("[quota] SUPABASE_URL missing — quota not enforced");
    return { allowed: true, remaining: limit, limit, enforced: false };
  }
  try {
    const q = new URL(`${url}/rest/v1/ai_usage`);
    q.searchParams.set("user_id", `eq.${userId}`);
    q.searchParams.set("day", `eq.${utcDay()}`);
    q.searchParams.set("endpoint", `eq.${endpoint}`);
    q.searchParams.set("select", "provider_calls");
    const r = await fetch(q, { headers: restHeaders(token) });
    if (!r.ok) {
      // Table missing (404/PGRST205) or RLS misconfigured — fail open,
      // loudly, so one missing migration never takes AI down for everyone.
      console.warn("[quota] usage lookup failed, failing open:", r.status);
      return { allowed: true, remaining: limit, limit, enforced: false };
    }
    const rows = (await r.json()) || [];
    const used = rows.reduce((acc, row) => acc + (Number(row.provider_calls) || 0), 0);
    return { allowed: used < limit, remaining: Math.max(0, limit - used), limit, enforced: true };
  } catch (err) {
    console.warn("[quota] usage lookup error, failing open:", err?.message || err);
    return { allowed: true, remaining: limit, limit, enforced: false };
  }
}

/** Append one ledger row for an AI call (providerCalls = provider requests spent). */
export async function recordUsage({ userId, token, endpoint, providerCalls = 1 }) {
  const { url } = supabaseEnv();
  if (!url) return;
  try {
    const r = await fetch(`${url}/rest/v1/ai_usage`, {
      method: "POST",
      headers: { ...restHeaders(token), Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: userId,
        day: utcDay(),
        endpoint,
        provider_calls: Math.max(1, providerCalls | 0),
      }),
    });
    if (!r.ok) {
      console.warn("[quota] usage record failed:", r.status);
    }
  } catch (err) {
    console.warn("[quota] usage record error:", err?.message || err);
  }
}
