/**
 * POST /api/account/delete
 *
 * Permanently deletes the caller's auth user. All user-owned rows
 * (profiles, weight/food entries, workouts, sessions, XP, achievements,
 * AI conversations/messages) reference auth.users(id) ON DELETE CASCADE,
 * so they are removed automatically.
 *
 * Guarded by Supabase JWT auth + a strict rate limit + an explicit
 * { confirm: "DELETE" } body so it can never fire by accident.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the server environment
 * (Vercel → Project Settings → Environment Variables).
 */
import { requireUser, rateLimit } from "../_lib/auth.mjs";
import { json, readJsonBody } from "../_lib/validate.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  // Strict limit: deleting an account is irreversible.
  if (!rateLimit(res, `account-delete:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })) return;

  const body = await readJsonBody(req);
  if (body?.confirm !== "DELETE") {
    return json(res, 400, { error: "Deletion not confirmed." });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return json(res, 500, {
      error: "Account deletion is not configured on the server yet. Please contact support.",
    });
  }

  try {
    const r = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("admin deleteUser failed:", r.status, detail.slice(0, 200));
      return json(res, 502, { error: "Could not delete the account. Please try again or contact support." });
    }
  } catch (err) {
    console.error("admin deleteUser error:", err?.message || err);
    return json(res, 503, { error: "Could not delete the account. Please try again later." });
  }

  return json(res, 200, { ok: true, deleted: true });
}
