import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** Update profile fields (PATCHes own row; RLS scopes it). */
  updateProfile: (patch: Partial<Profile>) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (err) {
      // No profile row yet — e.g. signed up before the profile trigger
      // existed, or the trigger failed. Self-heal by creating it.
      if (err.code === "PGRST116") {
        const { data: created, error: insertErr } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email ?? null,
            display_name:
              (user.user_metadata?.display_name as string | undefined) ||
              user.email?.split("@")[0] ||
              "",
          })
          .select()
          .single();
        if (insertErr) {
          setError(insertErr.message);
          setProfile(null);
        } else {
          setProfile(created as Profile);
        }
      } else {
        setError(err.message);
        setProfile(null);
      }
    } else {
      setProfile(data as Profile);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return { error: "Not signed in" };
      const { data, error: err } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id)
        .select()
        .single();
      if (err) return { error: err.message };
      setProfile(data as Profile);
      return { error: null };
    },
    [user]
  );

  const value = useMemo(
    () => ({ profile, loading, error, updateProfile, refresh: fetchProfile }),
    [profile, loading, error, updateProfile, fetchProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
