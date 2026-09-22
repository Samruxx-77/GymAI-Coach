/**
 * POST /api/ai/food
 *
 * Body: { imageBase64: string }  (downscaled JPEG, no data-url prefix)
 * Returns:
 * {
 *   name, servingEstimate, confidence (0..1),
 *   calories, proteinG, carbsG, fatG,
 *   items: [{ name, calories, proteinG, carbsG, fatG }],
 *   provider, fallbackUsed
 * }
 *
 * All values are AI ESTIMATES. The UI must present them as estimates
 * for user review before logging.
 */
import { runCompletion } from "../_lib/ai-provider.mjs";
import {
  validateFoodBody,
  extractJson,
  errorResponse,
  json,
  readJsonBody,
  requirePost,
  logRequest,
} from "../_lib/validate.mjs";
import { requireUser, rateLimit } from "../_lib/auth.mjs";
import { checkDailyQuota, recordUsage } from "../_lib/quota.mjs";

const SYSTEM_PROMPT = `You are a nutrition estimation service. Analyze the food in the photo and estimate its nutritional content.

Rules:
- Identify the food or meal and estimate the portion size visible.
- Estimate calories, protein, carbs and fat for the WHOLE visible portion.
- If the image contains multiple distinct foods, list each in "items" with its own estimates.
- Be realistic, not optimistic. Standard nutrient databases are your reference.
- If the image does not clearly contain food, set confidence to 0 and explain briefly in "name".
- Respond with JSON ONLY, no other text. Use exactly this shape:
{
  "name": "short meal name",
  "servingEstimate": "e.g. '1 bowl (~350 g)'",
  "confidence": 0.0-1.0,
  "calories": integer,
  "proteinG": integer,
  "carbsG": integer,
  "fatG": integer,
  "items": [{ "name": "component", "calories": integer, "proteinG": integer, "carbsG": integer, "fatG": integer }]
}`;

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeEstimate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const macroSum = ["proteinG", "carbsG", "fatG"].reduce(
    (acc, k) => acc + clampInt(raw[k], 0, 2000),
    0
  );
  const calories = clampInt(raw.calories, 0, 8000);
  // A sane calorie/macros relationship guards against hallucinated numbers
  // (protein+carb = 4 kcal/g, fat = 9 kcal/g; allow generous tolerance).
  const impliedCalories = macroSum ? macroSum * 4 + clampInt(raw.fatG, 0, 2000) * 5 : calories;
  const sane = !macroSum || Math.abs(impliedCalories - calories) / Math.max(calories, 1) < 1.2;

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((it) => it && typeof it.name === "string")
        .slice(0, 10)
        .map((it) => ({
          name: String(it.name).slice(0, 80),
          calories: clampInt(it.calories, 0, 5000),
          proteinG: clampInt(it.proteinG, 0, 500),
          carbsG: clampInt(it.carbsG, 0, 800),
          fatG: clampInt(it.fatG, 0, 500),
        }))
    : [];

  return {
    name: String(raw.name || "Scanned food").slice(0, 120),
    servingEstimate: String(raw.servingEstimate || "1 serving").slice(0, 80),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    calories,
    proteinG: clampInt(raw.proteinG, 0, 500),
    carbsG: clampInt(raw.carbsG, 0, 800),
    fatG: clampInt(raw.fatG, 0, 500),
    items,
    sanity: sane ? "ok" : "uncertain",
  };
}

export default async function handleFood(req, res, body) {
  const started = Date.now();
  const token = (req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  let status = 500;
  let userId = null;
  try {
    if (!requirePost(req, res)) {
      status = 405;
      return;
    }
    // Costly vision call — only signed-in members may use it.
    const user = await requireUser(req, res);
    if (!user) {
      status = 401;
      return;
    }
    userId = user.id;
    if (!rateLimit(res, `food:${user.id}`, { limit: 10, windowMs: 60_000 })) {
      status = 429;
      return;
    }

    body = await readJsonBody(req, body);
    const check = validateFoodBody(body);
    if (check.error) {
      status = 400;
      return json(res, 400, { error: check.error });
    }

    // Persistent per-user daily quota for vision calls.
    const quota = await checkDailyQuota({ userId: user.id, token, endpoint: "food" });
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
        error: `You've used your ${quota.limit} free food scans for today. Try again tomorrow.`,
      });
    }

    let result;
    try {
      result = await runCompletion({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: "Estimate the nutrition of this food." }],
        imageBase64: body.imageBase64,
        json: true,
      });
    } catch (completionErr) {
      // Failed vision calls still burn the shared free-tier budget — ledger
      // them so the quota reflects real spend.
      const failedCalls = Number(completionErr?.providerCalls) || 0;
      if (failedCalls > 0) {
        await recordUsage({ userId: user.id, token, endpoint: "food", providerCalls: failedCalls }).catch(() => {});
      }
      throw completionErr;
    }
    await recordUsage({
      userId: user.id,
      token,
      endpoint: "food",
      providerCalls: result.providerCalls,
    });

    const parsed = extractJson(result.text);
    const estimate = normalizeEstimate(parsed);
    if (!estimate) {
      status = 502;
      logRequest({ endpoint: "/api/ai/food", method: "POST", userId, status, provider: result.provider, ms: Date.now() - started });
      return json(res, 502, {
        error: "Could not analyze that image. Try another photo with clearer food.",
      });
    }

    status = 200;
    logRequest({
      endpoint: "/api/ai/food",
      method: "POST",
      userId,
      status,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      ms: Date.now() - started,
      extra: `quota=${quota.remaining - 1}/${quota.limit}${quota.enforced ? "" : " (unenforced)"}`,
    });
    json(res, 200, { ...estimate, provider: result.provider, fallbackUsed: result.fallbackUsed });
  } catch (err) {
    status = err?.statusCode || err?.status || 500;
    logRequest({ endpoint: "/api/ai/food", method: "POST", userId, status, ms: Date.now() - started });
    errorResponse(res, err);
  }
}
