import { supabase } from "./supabase";

/**
 * Permanently delete the signed-in user's account and all their data.
 * The server verifies the session token, then removes the auth user;
 * database rows cascade-delete automatically.
 *
 * @param password when the user signed up with email+password, their
 * current password for fresh re-authentication — proves the person
 * clicking "delete" actually owns the account (a stolen session alone
 * is not enough).
 */
export async function deleteAccount(password?: string): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const email = sess.session?.user?.email;
  let token = sess.session?.access_token;
  if (!token) throw new Error("You are not signed in.");

  // Fresh re-auth before the irreversible delete. OAuth/phone users have
  // no password — the typed DELETE + valid session is their check.
  if (password && email) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("That password is incorrect. Your account was not deleted.");
    const { data: fresh } = await supabase.auth.getSession();
    token = fresh.session?.access_token;
    if (!token) throw new Error("You are not signed in.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirm: "DELETE" }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Account deletion failed (${res.status}).`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
