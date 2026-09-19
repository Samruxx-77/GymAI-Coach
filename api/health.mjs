/**
 * GET /api/health — liveness + AI provider configuration check.
 * Reports only booleans, never key values.
 */
import { json } from "./_lib/validate.mjs";

export default async function handleHealth(req, res) {
  json(res, 200, {
    status: "ok",
    ai: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
    time: new Date().toISOString(),
  });
}
