/**
 * POST /api/ai/coach
 *
 * Body: { messages: [{ role: 'user' | 'assistant', content: string }], context?: {...} }
 * Returns: { reply, provider, fallbackUsed }
 *
 * The system prompt is built from the member's real profile data supplied
 * by the authenticated client — the server never trusts IDs, it only uses
 * the text context the client assembled from its own session data.
 */
import { runCompletion } from "../_lib/ai-provider.mjs";
import { validateCoachBody, errorResponse, json } from "../_lib/validate.mjs";

function buildSystemPrompt(context) {
  const c = context || {};
  const lines = [
    "You are GymAI Coach, a friendly and knowledgeable fitness coach inside a member fitness app.",
    "You help with training, nutrition, consistency and motivation for everyday gym members.",
    "",
    "Guidelines:",
    "- Be concise and practical. Prefer 2-4 short paragraphs or a short list. Never write essays.",
    "- Give actionable advice the member can apply today.",
    "- Use the member's data below when relevant; refer to real numbers, never invent new ones.",
    "- Do NOT diagnose medical conditions or give medical advice. If asked, recommend a doctor or physiotherapist.",
    "- Do not recommend extreme diets, dangerous calorie targets, or unsupervised maximal lifts.",
    "- If you don't know something, say so plainly.",
    "- Write in a warm, encouraging tone. Use the member's first name if known.",
  ];

  const facts = [];
  if (c.name) facts.push(`Name: ${c.name}`);
  if (c.goal) facts.push(`Primary goal: ${String(c.goal).replace(/_/g, " ")}`);
  if (c.experienceLevel) facts.push(`Experience: ${c.experienceLevel}`);
  if (c.age) facts.push(`Age: ${c.age}`);
  if (c.gender && c.gender !== "prefer_not_to_say") facts.push(`Gender: ${c.gender}`);
  if (c.heightCm) facts.push(`Height: ${c.heightCm} cm`);
  if (c.currentWeightKg) facts.push(`Current weight: ${c.currentWeightKg} kg`);
  if (c.targetWeightKg) facts.push(`Target weight: ${c.targetWeightKg} kg`);
  if (c.calorieTarget) facts.push(`Daily calorie target: ${c.calorieTarget} kcal`);
  if (c.proteinTarget) facts.push(`Daily protein target: ${c.proteinTarget} g`);
  if (c.weeklyWorkoutTarget) facts.push(`Weekly workout target: ${c.weeklyWorkoutTarget} sessions`);
  if (c.streak) facts.push(`Current logging streak: ${c.streak} day(s)`);
  if (c.recentWorkouts != null) facts.push(`Workouts completed (last 30 days): ${c.recentWorkouts}`);
  if (c.todayCalories != null) facts.push(`Calories logged today: ${c.todayCalories}`);
  if (c.todayProtein != null) facts.push(`Protein logged today: ${c.todayProtein} g`);
  if (c.weightTrend != null) facts.push(`Weight change over last 4 weeks: ${c.weightTrend} kg`);
  if (c.dietaryPreferences?.length) facts.push(`Dietary preferences: ${c.dietaryPreferences.join(", ")}`);

  if (facts.length) {
    lines.push("", "Member data (from the app, may be incomplete):", ...facts.map((f) => `- ${f}`));
  } else {
    lines.push("", "No member data is available yet — keep advice general.");
  }
  return lines.join("\n");
}

export default async function handleCoach(req, res, body) {
  try {
    const check = validateCoachBody(body);
    if (check.error) return json(res, 400, { error: check.error });

    const { messages, context } = body;
    const systemPrompt = buildSystemPrompt(context);

    const result = await runCompletion({
      systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content.trim() })),
    });

    json(res, 200, {
      reply: result.text,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (err) {
    errorResponse(res, err);
  }
}
