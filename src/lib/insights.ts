import type { Profile } from "./types";

interface InsightInput {
  profile: Profile;
  todayCalories: number;
  todayProtein: number;
  calorieTarget: number | null;
  proteinTarget: number | null;
  workoutDoneToday: boolean;
  streak: number;
  latestWeight: number | null;
  weightTrendKg: number | null;
  weekWorkoutCount: number;
  weeklyTarget: number;
}

/**
 * One prioritized, data-driven insight for the dashboard.
 * Returns null when there is genuinely nothing meaningful to say yet.
 */
export function dailyInsight(i: InsightInput): { title: string; body: string } | null {
  const { profile } = i;

  if (!profile.onboarding_completed) {
    return {
      title: "Finish setup to unlock your targets",
      body: "Complete onboarding so calorie, protein and workout targets can be calculated for you.",
    };
  }

  // Weight trend context takes priority — it reflects multi-week effort.
  if (i.weightTrendKg != null && i.profile.primary_goal === "lose_weight" && i.weightTrendKg > 0.2) {
    return {
      title: "Weight trending up",
      body: `Your weight is up ${i.weightTrendKg.toFixed(1)} kg over the last 4 weeks. Tighten calorie tracking and aim for ${Math.round((i.calorieTarget ?? 0) - 100)} kcal today.`,
    };
  }
  if (i.weightTrendKg != null && i.profile.primary_goal === "build_muscle" && i.weightTrendKg < -0.8) {
    return {
      title: "Scale moving the wrong way",
      body: `You're down ${Math.abs(i.weightTrendKg).toFixed(1)} kg in 4 weeks while building muscle. Add ~200 kcal of quality food today.`,
    };
  }

  // Protein shortfall late in the day.
  const hour = new Date().getHours();
  const proteinLeft = (i.proteinTarget ?? 0) - i.todayProtein;
  if (i.proteinTarget && proteinLeft > 15 && hour >= 17) {
    return {
      title: "Protein gap to close",
      body: `${Math.round(proteinLeft)} g of protein still to go today. A shake, Greek yogurt or a lean dinner will get you there.`,
    };
  }

  // Over target.
  if (i.calorieTarget && i.todayCalories > i.calorieTarget + 150) {
    return {
      title: "Over calorie target",
      body: `You're ${Math.round(i.todayCalories - i.calorieTarget)} kcal over. An easy walk tonight keeps the week on track.`,
    };
  }

  // Workout mission.
  if (!i.workoutDoneToday && i.weekWorkoutCount < i.weeklyTarget) {
    const left = i.weeklyTarget - i.weekWorkoutCount;
    return {
      title: "Training mission for today",
      body: `${left} session${left === 1 ? "" : "s"} left this week to hit your ${i.weeklyTarget}× target. A 30–45 min session keeps the streak alive.`,
    };
  }

  // Default encouragement grounded in real numbers.
  const parts: string[] = [];
  if (i.streak > 0) parts.push(`a ${i.streak}-day streak`);
  if (i.latestWeight != null) parts.push(`your latest weigh-in at ${i.latestWeight} kg`);
  if (i.weekWorkoutCount > 0) parts.push(`${i.weekWorkoutCount} sessions this week`);
  if (parts.length) {
    return {
      title: "Keep it rolling",
      body: `You have ${parts.join(", ")}. Log your meals and move today — consistency compounds.`,
    };
  }
  return null;
}

/** One-line mission string for the dashboard hero card. */
export function todayMission(i: InsightInput): string {
  if (!i.workoutDoneToday) {
    return i.weekWorkoutCount < i.weeklyTarget
      ? `Train today — ${i.weeklyTarget - i.weekWorkoutCount} session(s) left this week`
      : "Optional: light activity or mobility today";
  }
  const proteinLeft = (i.proteinTarget ?? 0) - i.todayProtein;
  if (i.proteinTarget && proteinLeft > 15) {
    return `Workout done ✓ — close the ${Math.round(proteinLeft)} g protein gap`;
  }
  if (i.calorieTarget && i.todayCalories < i.calorieTarget * 0.5) {
    return "Workout done ✓ — log your remaining meals";
  }
  return "Workout done ✓ — targets met. Rest and recover.";
}
