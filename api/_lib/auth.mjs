/**
 * Server-side guards for API routes: Supabase JWT auth + per-user rate limiting.
 *
 * Every route that spends money (AI provider calls) must call requireUser()
 * first. The client sends the user's Supabase access token as
 * `Authorization: Bearer <token>`; we verify it against the Supabase Auth
 * API so anonymous callers can never burn provider quota.
 *
 * No new dependencies — uses the platform fetch (Node 18+).
 */
import { json } from "./validate.mjs";

function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

/**
 * Verify the request's Supabase access token.
 * Returns the user object on success, or sends a 401/500/503 and returns null.
 */
export async function requireUser(req, res) {
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    json(res, 401, { error: "Sign in required." });
    return null;
  }
  const { url, anonKey } = supabaseEnv();
  if (!url || !anonKey) {
    json(res, 500, { error: "Server auth is not configured." });
    return null;
  }
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      json(res, 401, { error: "Session expired. Please sign in again." });
      return null;
    }
    const user = await r.json();
    if (!user?.id) {
      json(res, 401, { error: "Session expired. Please sign in again." });
      return null;
    }
    return user;
  } catch {
    json(res, 503, { error: "Auth check failed. Please try again." });
    return null;
  }
}

/**
 * Verify the request's Supabase access token AND require it to be freshly
 * minted (issued within `maxAgeSec` seconds). Destructive routes (account
 * deletion) use this so a stolen or stale session token alone is not enough —
 * the caller must have signed in (or re-authenticated) recently.
 *
 * The token was already validated via /auth/v1/user above, so decoding the
 * payload for `iat` is safe (no signature check needed here).
 * Returns the user object on success, or sends a 401 and returns null.
 */
export async function requireFreshUser(req, res, maxAgeSec = 600) {
  const user = await requireUser(req, res);
  if (!user) return null;
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  let iat = 0;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    iat = Number(payload?.iat) || 0;
  } catch {
    iat = 0;
  }
  const ageSec = Date.now() / 1000 - iat;
  if (!iat || ageSec > maxAgeSec) {
    json(res, 401, {
      error: "For security, please sign in again to confirm this action.",
      reauthRequired: true,
    });
    return null;
  }
  return user;
}
// ── Simple per-user token-bucket rate limiter ─────────────────────────────
// In-memory per serverless instance: not a global counter, but it still
// blunts per-instance abuse (spam scripts, runaway clients) at zero cost.
const buckets = new Map();

/**
 * @param {string} key  bucket id, e.g. `coach:<userId>`
 * @param {{limit:number, windowMs:number}} opts
 * @returns {boolean} true if allowed, false if the 429 was already sent
 */
export function rateLimit(res, key, { limit, windowMs }) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) b = { count: 0, resetAt: now + windowMs };
  b.count += 1;
  buckets.set(key, b);
  // Trim the map so it can't grow unbounded over a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
      if (buckets.size <= 4000) break;
    }
  }
  if (b.count > limit) {
    const retryAfter = Math.ceil((b.resetAt - now) / 1000);
    try {
      res.setHeader("Retry-After", String(retryAfter));
    } catch {
      /* header already sent — ignore */
    }
    json(res, 429, { error: "Too many requests. Please slow down and try again." });
    return false;
  }
  return true;
}
