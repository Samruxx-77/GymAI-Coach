/**
 * POST /api/ai/coach
 *
 * Body: { messages: [{ role: 'user', content: string }], context?: {...} }
 *   (only the 'user' role is accepted — client-supplied assistant history
 *   is rejected to block prompt-injection via forged roles)
 * Returns: { reply, provider, fallbackUsed }
 *
 * The system prompt is built from the member's real profile data supplied
 * by the authenticated client — the server never trusts IDs, it only uses
 * the text context the client assembled from its own session data.
 */
import { runCompletion } from "../_lib/ai-provider.mjs";
import {
  validateCoachBody,
  errorResponse,
  json,
  readJsonBody,
  requirePost,
  logRequest,
} from "../_lib/validate.mjs";
import { requireUser, rateLimit } from "../_lib/auth.mjs";
import { checkDailyQuota, recordUsage } from "../_lib/quota.mjs";

/**
 * Sanitize client-supplied profile context before it touches the system
 * prompt. The client assembles this from its own session data, so every
 * field is attacker-controlled: whitelist known fields, enforce
 * type/length limits, and strip newlines/control characters so a value
 * can't break out of its "- Field: value" line and inject instructions
 * (prompt injection) or bloat tokens (token abuse).
 */
const CONTEXT_SCHEMA = {
  name: { type: "string", max: 60 },
  goal: { type: "string", max: 40 },
  experienceLevel: { type: "string", max: 40 },
  age: { type: "number", min: 10, max: 120 },
  gender: { type: "string", max: 30 },
  heightCm: { type: "number", min: 100, max: 250 },
  currentWeightKg: { type: "number", min: 25, max: 400 },
  targetWeightKg: { type: "number", min: 25, max: 400 },
  calorieTarget: { type: "number", min: 800, max: 8000 },
  proteinTarget: { type: "number", min: 0, max: 500 },
  weeklyWorkoutTarget: { type: "number", min: 0, max: 14 },
  streak: { type: "number", min: 0, max: 3650 },
  recentWorkouts: { type: "number", min: 0, max: 300 },
  todayCalories: { type: "number", min: 0, max: 30000 },
  todayProtein: { type: "number", min: 0, max: 2000 },
  weightTrend: { type: "number", min: -100, max: 100 },
  dietaryPreferences: { type: "stringArray", max: 10, itemMax: 40 },
};

function cleanText(value, max) {
  return String(value)
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, " ") // no line breaks / control chars
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeCoachContext(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, rule] of Object.entries(CONTEXT_SCHEMA)) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (rule.type === "string") {
      const s = cleanText(v, rule.max);
      if (s) out[key] = s;
    } else if (rule.type === "number") {
      const n = cleanNumber(v, rule.min, rule.max);
      if (n !== undefined) out[key] = n;
    } else if (rule.type === "stringArray") {
      if (!Array.isArray(v)) continue;
      const arr = v
        .map((x) => cleanText(x, rule.itemMax))
        .filter(Boolean)
        .slice(0, rule.max);
      if (arr.length) out[key] = arr;
    }
  }
  return out;
}

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
  const started = Date.now();
  const token = (req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  let status = 500;
  let userId = null;
  try {
    if (!requirePost(req, res)) {
      status = 405;
      logRequest({ endpoint: "/api/ai/coach", method: req.method, userId, status, ms: Date.now() - started });
      return;
    }
    // Costly AI call — only signed-in members may use it.
    const user = await requireUser(req, res);
    if (!user) {
      status = 401;
      return;
    }
    userId = user.id;
    if (!rateLimit(res, `coach:${user.id}`, { limit: 30, windowMs: 60_000 })) {
      status = 429;
      return;
    }

    body = await readJsonBody(req, body);
    const check = validateCoachBody(body);
    if (check.error) {
      status = 400;
      return json(res, 400, { error: check.error });
    }

    // Persistent per-user daily quota (protects the shared free-tier budget
    // across cold starts and serverless instances).
    const quota = await checkDailyQuota({ userId: user.id, token, endpoint: "coach" });
    if (!quota.allowed) {
      status = 429;
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(new Date().toISOString().slice(0, 10) + "T23:59:59.999Z").getTime() - Date.now()) / 1000)
      );
      try {
        res.setHeader("Retry-After", String(retryAfter));
      } catch {
        /* header already sent — ignore */
      }
      return json(res, 429, {
        error: `You've used your ${quota.limit} free AI requests for today. Try again tomorrow.`,
      });
    }

    const { messages, context } = body;
    const systemPrompt = buildSystemPrompt(sanitizeCoachContext(context));

    let providerCalls = 0;
    let result;
    try {
      result = await runCompletion({
        systemPrompt,
        messages: messages.map((m) => ({ role: "user", content: m.content.trim() })),
      });
      providerCalls = result.providerCalls;
    } catch (completionErr) {
      // Even failed provider calls burn the shared free-tier budget — ledger
      // them so the quota reflects real spend, not just successful replies.
      providerCalls = Number(completionErr?.providerCalls) || 0;
      if (providerCalls > 0) {
        await recordUsage({ userId: user.id, token, endpoint: "coach", providerCalls }).catch(() => {});
      }
      throw completionErr;
    }
    await recordUsage({
      userId: user.id,
      token,
      endpoint: "coach",
      providerCalls,
    });

    status = 200;
    logRequest({
      endpoint: "/api/ai/coach",
      method: "POST",
      userId,
      status,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      ms: Date.now() - started,
      extra: `quota=${quota.remaining - 1}/${quota.limit}${quota.enforced ? "" : " (unenforced)"}`,
    });
    json(res, 200, {
      reply: result.text,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (err) {
    status = err?.statusCode || err?.status || 500;
    logRequest({ endpoint: "/api/ai/coach", method: "POST", userId, status, ms: Date.now() - started });
    errorResponse(res, err);
  }
}
