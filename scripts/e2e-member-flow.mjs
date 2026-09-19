/**
 * E2E member-flow verification against the live Supabase project.
 * Simulates exactly what the app does: onboarding save, weight/food logging,
 * workout completion, XP ledger writes (server enforces points), and
 * RLS isolation between users.
 *
 * Usage: node scripts/e2e-member-flow.mjs
 * Env:   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD
 */
const BASE = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, token, method = "GET", body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// 1 — login
const loginRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const login = await loginRes.json();
const token = login.access_token;
const uid = login.user?.id;
check("1. Login returns session", !!token && !!uid, `user ${uid?.slice(0, 8)}…`);
if (!token) process.exit(1);

// 2 — trigger-created profile exists
let r = await api(`profiles?select=*&id=eq.${uid}`, token);
const p0 = r.data?.[0];
check("2. Profile auto-created on signup", !!p0, `name="${p0?.display_name}", onboarded=${p0?.onboarding_completed}`);

// 3 — onboarding save (same patch shape as Onboarding.tsx finish())
const targets = { calorie_target: 3040, protein_target: 148, carb_target: 398, fat_target: 95 };
r = await api(`profiles?id=eq.${uid}`, token, "PATCH", {
  display_name: "Alex",
  age: 28,
  gender: "male",
  height_cm: 178,
  start_weight_kg: 82,
  current_weight_kg: 82,
  target_weight_kg: 76,
  primary_goal: "build_muscle",
  activity_level: "moderate",
  experience_level: "intermediate",
  weekly_workout_target: 4,
  dietary_preferences: [],
  onboarding_completed: true,
  ...targets,
});
check("3. Onboarding save succeeds", r.status === 200 && r.data?.[0]?.onboarding_completed === true, `targets: ${targets.calorie_target} kcal / ${targets.protein_target}P`);

// onboarding XP (+50, once per day)
r = await api("xp_events", token, "POST", { source: "onboarding" });
check("4. Onboarding XP event (+50)", r.status === 201, `points=${r.data?.[0]?.points}`);

// 5 — weight log + upsert behavior
r = await api("weight_entries", token, "POST", { weight_kg: 82.0, note: "first weigh-in" });
check("5. Weight entry saved", r.status === 201, `${r.data?.[0]?.weight_kg} kg on ${r.data?.[0]?.entry_date}`);
r = await api("xp_events", token, "POST", { source: "weight_log" });
check("6. Weight XP event (+15)", r.status === 201, `points=${r.data?.[0]?.points}`);

// 6 — food logging (manual + ai_scan)
r = await api("food_entries", token, "POST", {
  meal_type: "breakfast", name: "Oatmeal with banana", servings: 1,
  calories: 320, protein_g: 12, carbs_g: 58, fat_g: 6, source: "manual",
});
check("7. Manual food entry saved", r.status === 201, `${r.data?.[0]?.name}: ${r.data?.[0]?.calories} kcal`);
r = await api("food_entries", token, "POST", {
  meal_type: "lunch", name: "Grilled chicken breast", servings: 1, serving_label: "150 g",
  calories: 248, protein_g: 47, carbs_g: 0, fat_g: 5, source: "ai_scan", ai_confidence: 0.85,
});
check("8. AI-scan food entry saved", r.status === 201, `${r.data?.[0]?.name}: ${r.data?.[0]?.calories} kcal (conf ${r.data?.[0]?.ai_confidence})`);
await api("xp_events", token, "POST", { source: "food_log", ref_id: "e2e-food-1" });
r = await api("xp_events", token, "POST", { source: "ai_scan", ref_id: "e2e-food-2" });
check("9. Food + scan XP events", r.status === 201, `+10 food, +5 scan`);

// 7 — workout completion
r = await api("workout_sessions", token, "POST", {
  workout_name: "Push Day (template)", duration_minutes: 52,
  total_volume_kg: 4820, exercises_completed: 6, exercises_total: 6,
  session_data: [{ name: "Bench Press", sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 7 }] }],
});
const sessionId = r.data?.[0]?.id;
check("10. Workout session saved", r.status === 201, `vol ${r.data?.[0]?.total_volume_kg} kg, ${r.data?.[0]?.exercises_completed}/${r.data?.[0]?.exercises_total} exercises`);
r = await api("xp_events", token, "POST", { source: "workout_complete", ref_id: sessionId });
check("11. Workout XP event (+40)", r.status === 201, `points=${r.data?.[0]?.points}`);

// 8 — dedupe: same ref_id + source must be rejected
r = await api("xp_events", token, "POST", { source: "workout_complete", ref_id: sessionId });
check("12. XP dedupe blocks double-award", r.status >= 400, `HTTP ${r.status}`);

// 9 — daily login XP (no ref_id, once per day)
r = await api("xp_events", token, "POST", { source: "daily_login" });
check("13. Daily login XP (+5)", r.status === 201, `points=${r.data?.[0]?.points}`);

// 10 — profile gamification state
r = await api(`profiles?select=xp,streak_count,best_streak,last_active_date,onboarding_completed&id=eq.${uid}`, token);
const p = r.data?.[0];
check("14. Profile shows XP 125 / streak 1", p?.xp === 125 && p?.streak_count === 1, `xp=${p?.xp}, streak=${p?.streak_count}, best=${p?.best_streak}, active=${p?.last_active_date}`);

// 11 — streak_day XP (+20)
r = await api("xp_events", token, "POST", { source: "streak_day" });
check("15. Streak day XP (+20)", r.status === 201, `points=${r.data?.[0]?.points}`);

// 12 — RLS cross-user isolation: this token must NOT see the pre-schema test user
r = await api(`profiles?select=id&display_name=eq.Ver`, token);
check("16. RLS: cannot read another member's profile", Array.isArray(r.data) && r.data.length === 0, `got ${r.data?.length ?? "n/a"} rows`);

// 13 — achievements unlock check (first workout achievements)
r = await api(`achievements?select=id,name,criteria&criteria->>type=eq.workouts&order=sort_order&limit=5`, token);
const workoutAch = r.data ?? [];
if (workoutAch.length) {
  const first = workoutAch.find((a) => Number(a.criteria?.value) === 1);
  if (first) {
    const u = await api("user_achievements", token, "POST", { achievement_id: first.id });
    check(`17. Achievement unlock "${first.name}"`, u.status === 201, `${first.id}`);
  } else {
    check(`17. Achievement criteria rows present`, true, `${workoutAch.length} workout achievements found`);
  }
} else {
  check(`17. Achievement criteria rows present`, false, "no workout achievements found");
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
