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
import { requireFreshUser, rateLimit } from "../_lib/auth.mjs";
import { json, readJsonBody, logRequest } from "../_lib/validate.mjs";

export default async function handler(req, res) {
  const started = Date.now();
  let userId = null;
  let status = 500;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    status = 405;
    logRequest({ endpoint: "/api/account/delete", method: req.method, userId, status, ms: Date.now() - started });
    return json(res, 405, { error: "Method not allowed." });
  }

  // Destructive + irreversible: require a FRESH session (signed in within the
  // last 10 minutes). The client re-authenticates with the password right
  // before calling, which mints a fresh token — a stale or stolen token alone
  // is rejected with reauthRequired: true.
  const user = await requireFreshUser(req, res, 10 * 60);
  if (!user) {
    status = 401;
    return;
  }
  userId = user.id;

  // Strict limit: deleting an account is irreversible.
  if (!rateLimit(res, `account-delete:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })) {
    status = 429;
    return;
  }

  const body = await readJsonBody(req);
  if (body?.confirm !== "DELETE") {
    status = 400;
    return json(res, 400, { error: "Deletion not confirmed." });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    status = 500;
    return json(res, 500, {
      error: "Account deletion is not configured on the server yet. Please contact support.",
    });
  }

  try {
    // Best-effort: remove the user's avatar files from Storage first —
    // storage objects are NOT covered by the DB cascade.
    try {
      const list = await fetch(`${url}/storage/v1/object/list/avatars`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefix: `${user.id}/` }),
      });
      const files = (await list.json().catch(() => [])) || [];
      const names = files.map((f) => `${user.id}/${f.name}`).filter((n) => n.length > user.id.length + 1);
      if (names.length) {
        await fetch(`${url}/storage/v1/object/avatars`, {
          method: "DELETE",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefixes: names }),
        });
      }
    } catch (storageErr) {
      // Non-fatal: the account delete below still proceeds.
      console.warn("avatar cleanup failed:", storageErr?.message || storageErr);
    }

    const r = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("admin deleteUser failed:", r.status, detail.slice(0, 200));
      status = 502;
      return json(res, 502, { error: "Could not delete the account. Please try again or contact support." });
    }
  } catch (err) {
    console.error("admin deleteUser error:", err?.message || err);
    status = 503;
    return json(res, 503, { error: "Could not delete the account. Please try again later." });
  }

  status = 200;
  logRequest({ endpoint: "/api/account/delete", method: "POST", userId, status, ms: Date.now() - started });
  return json(res, 200, { ok: true, deleted: true });
}
