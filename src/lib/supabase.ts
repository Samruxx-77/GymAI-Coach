import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Deliberately loud: a blank screen with no explanation is worse.
  console.error(
    "GymAI Coach: Missing Supabase configuration.\n" +
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.\n" +
      "See env.example for details."
  );
}

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // handles password-reset + magic links
    },
  }
);
