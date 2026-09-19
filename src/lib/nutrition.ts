import type { Goal } from "./types";

/**
 * Nutrition target calculation (Mifflin-St Jeor BMR + activity factor,
 * adjusted by goal, with a macro split by objective).
 *
 * These are sensible starting defaults — members can override targets
 * later, and nothing here is medical advice.
 */

export interface TargetInput {
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  age: number | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active" | null;
  goal: Goal | null;
}

export interface NutritionTargets {
  calorieTarget: number;
  proteinTarget: number;
  carbTarget: number;
  fatTarget: number;
}

const ACTIVITY_FACTORS: Record<NonNullable<TargetInput["activityLevel"]>, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateTargets(input: TargetInput): NutritionTargets | null {
  const { gender, age, heightCm, currentWeightKg, activityLevel, goal } = input;
  if (!age || !heightCm || !currentWeightKg || !activityLevel) return null;

  // Mifflin-St Jeor
  let bmr: number;
  if (gender === "male") {
    bmr = 10 * currentWeightKg + 6.25 * heightCm - 5 * age + 5;
  } else if (gender === "female") {
    bmr = 10 * currentWeightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    // Neutral midpoint for other / undisclosed
    bmr = 10 * currentWeightKg + 6.25 * heightCm - 5 * age - 78;
  }

  let calories = bmr * ACTIVITY_FACTORS[activityLevel];

  // Goal adjustment — conservative, sustainable rates only.
  const deficitSurplus: Record<Goal, number> = {
    lose_weight: -400,
    build_muscle: 250,
    recomp: -150,
    endurance: 150,
    general_health: 0,
  };
  calories += deficitSurplus[goal ?? "general_health"];

  // Never below a sane floor.
  const floor = gender === "female" ? 1200 : 1500;
  const calorieTarget = Math.round(Math.max(floor, calories) / 10) * 10;

  // Protein: 1.6–2.2 g/kg by goal. Fat: 25–30% of calories. Carbs fill the rest.
  const proteinPerKg: Record<Goal, number> = {
    lose_weight: 2.2,
    build_muscle: 1.8,
    recomp: 2.0,
    endurance: 1.6,
    general_health: 1.6,
  };
  const proteinTarget = Math.round(currentWeightKg * proteinPerKg[goal ?? "general_health"]);
  const fatCalories = calorieTarget * (goal === "lose_weight" ? 0.25 : 0.28);
  const fatTarget = Math.round(fatCalories / 9);
  const carbTarget = Math.max(
    50,
    Math.round((calorieTarget - proteinTarget * 4 - fatTarget * 9) / 4)
  );

  return { calorieTarget, proteinTarget, carbTarget, fatTarget };
}

/** Human label for a goal slug. */
export function goalLabel(goal: Goal | null | undefined): string {
  switch (goal) {
    case "lose_weight": return "Lose weight";
    case "build_muscle": return "Build muscle";
    case "recomp": return "Body recomposition";
    case "endurance": return "Improve endurance";
    case "general_health": return "General health";
    default: return "Set a goal";
  }
}
