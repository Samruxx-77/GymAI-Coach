/**
 * Server-side AI provider abstraction.
 *
 * The UI never talks to AI providers directly — API routes call these
 * helpers, which read secrets from environment variables only.
 *
 * Primary:   OpenRouter (OPENROUTER_API_KEY) — free-tier model routing
 * Fallback:  Google Gemini (GEMINI_API_KEY), optional
 *
 * Env knobs (all optional):
 *   OPENROUTER_MODEL            primary text model (default z-ai/glm-5.2:free)
 *   OPENROUTER_FALLBACK_MODELS  comma-separated list tried in order on errors/rate limits
 *   OPENROUTER_VISION_MODEL     model used for image scans (default inclusionai/ling-3.0-flash-vl:free)
 *   GEMINI_MODEL / GEMINI_VISION_MODEL / GEMINI_API_KEY
 *
 * Default model IDs are verified against the live OpenRouter catalogue
 * (GET https://openrouter.ai/api/v1/models). Slugs get retired without
 * warning — a dead default broke every AI feature at once (2026-09-21) —
 * so callOpenRouter() tries each model in the chain in turn instead of
 * trusting a single ID.
 *
 * Swapping providers = editing this file alone.
 */

function envMs(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// Budgets stay UNDER the client timeouts so the server's error surfaces
// first (client coach = 30s, client food scan = 55s, Vercel maxDuration = 60s).
// Text attempts are hedged (see callOpenRouter): the per-attempt timeout only
// needs to bound a truly hung model, because a slow-but-alive primary gets a
// fallback fired after HEDGE_DELAY_MS.
const TIMEOUT_MS = envMs("AI_TIMEOUT_MS", 15_000);
/** Vision/food analysis needs a roomier budget than text chat. */
const FOOD_TIMEOUT_MS = envMs("AI_FOOD_TIMEOUT_MS", 50_000);
/**
 * Hedging delay: if the primary model hasn't answered within this long,
 * fire the next model in parallel. First success wins, losers are aborted.
 * This kills the tail latency of sequential fallbacks (a busy primary no
 * longer costs a full timeout before the fallback even starts).
 */
const HEDGE_DELAY_MS = envMs("AI_HEDGE_DELAY_MS", 5_000);

class ProviderError extends Error {
  constructor(message, { status, provider } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.provider = provider;
  }
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function fetchJson(url, options, timeoutMs, signal) {
  const res = await fetch(url, {
    ...options,
    // Hedged attempts pass their own AbortController so losers can be
    // cancelled; otherwise fall back to a plain timeout signal.
    signal: signal ?? timeoutSignal(timeoutMs ?? TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error bodies happen at gateways — keep the raw text below.
  }
  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.error ||
      json?.message ||
      `Provider responded ${res.status}`;
    throw new ProviderError(typeof message === "string" ? message : "Provider error", {
      status: res.status,
    });
  }
  return json;
}

// ── OpenRouter (OpenAI-compatible) ────────────────────────────────────────
const OR_TEXT_MODEL = process.env.OPENROUTER_MODEL || "z-ai/glm-5.2:free";
const OR_FALLBACKS = (process.env.OPENROUTER_FALLBACK_MODELS || "nex-agi/nex-n2.5-mini:free,qwen/qwen3.8-27b:free")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OR_VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL || "inclusionai/ling-3.0-flash-vl:free";

function orModelChain({ imageBase64 }) {
  // Text fallbacks can't read images — vision requests get the vision
  // model only; a failure falls through to Gemini in runCompletion().
  if (imageBase64) return [OR_VISION_MODEL];
  return [...new Set([OR_TEXT_MODEL, ...OR_FALLBACKS])];
}

async function orOnce(model, { systemPrompt, messages, imageBase64, json }, timeoutMs, signal) {
  const base = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const content = imageBase64
    ? [
        { type: "text", text: systemPrompt },
        {
          type: "image_url",
          image_url: { url: `data:${sniffImageMime(imageBase64)};base64,${imageBase64}` },
        },
      ]
    : null;
  const body = {
    model,
    temperature: json ? 0.2 : 0.7,
    // Vision models on the free tier reason extensively before answering —
    // give image calls a larger budget so reasoning doesn't eat the reply.
    // Text chat only needs a couple of paragraphs, so cap it lower: output
    // length is the main driver of generation latency.
    max_tokens: imageBase64 ? 4096 : 1500,
    // Free-tier models are frequently reasoning models; strip hidden reasoning
    // tokens so `content` carries the actual answer (harmless on plain models).
    reasoning: { exclude: true },
    ...(json && !imageBase64 ? { response_format: { type: "json_object" } } : {}),
    messages: imageBase64
      ? [{ role: "user", content }]
      : [{ role: "system", content: systemPrompt }, ...messages],
  };
  const data = await fetchJson(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.APP_PUBLIC_URL || "https://gymai-coach.vercel.app",
      "X-Title": "GymAI Coach",
    },
    body: JSON.stringify(body),
  }, timeoutMs, signal);
  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new ProviderError("Empty response from OpenRouter", { status: 502 });
  return { text, provider: `openrouter:${data?.model || model}` };
}

/**
 * Classify a per-model failure: some errors mean "no other model can
 * succeed" (fail the whole request now), the rest mean "try the next one".
 */
function classifyModelError(err) {
  // 401 = the API key itself is bad — no other model can succeed.
  if (err?.status === 401) {
    return {
      failFast: true,
      error: new ProviderError(
        "OpenRouter API key is invalid or revoked — the app owner needs to update it.",
        { status: 401 }
      ),
    };
  }
  // A 400 that is NOT about this model (bad request shape, policy
  // rejection) will fail identically on every model — fail fast
  // instead of burning the fallback chain on a doomed request. Only
  // model-specific 400s (dead/retired slugs) move to the next model.
  if (err?.status === 400 && !/no endpoints found|model.*not found|invalid model|unknown model/i.test(err?.message || "")) {
    return { failFast: true, error: err };
  }
  return { failFast: false, error: err };
}

function exhaustedError(errors, providerCalls) {
  const exhausted = new ProviderError(`All OpenRouter models failed. ${errors.join(" | ")}`, {
    status: 502,
  });
  exhausted.providerCalls = providerCalls;
  // Safe, user-facing explanation — survives the 5xx sanitizer in errorResponse.
  exhausted.userMessage =
    "The free AI models are busy right now. Please wait a moment and try again.";
  return exhausted;
}

/**
 * Fire the model chain with hedging: the primary model goes immediately;
 * if it hasn't answered within HEDGE_DELAY_MS, the next model fires in
 * parallel, and so on. The first success wins and the losers are aborted,
 * so a busy primary no longer costs a full timeout before the fallback
 * even starts. providerCalls counts attempts actually fired, so the quota
 * ledger still reflects real spend.
 */
function raceModels(models, params, perAttemptMs) {
  return new Promise((resolve, reject) => {
    const errors = [];
    const controllers = [];
    let fired = 0;
    let nextIndex = 0;
    let settled = false;

    const abortAll = () => {
      for (const c of controllers) {
        try {
          c.abort();
        } catch {
          /* already settled — ignore */
        }
      }
    };
    const finishRejected = (err) => {
      if (settled) return;
      settled = true;
      clearInterval(hedgeTimer);
      abortAll();
      reject(err);
    };

    const fireNext = () => {
      if (settled || nextIndex >= models.length) return;
      const model = models[nextIndex++];
      fired += 1;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const timer = setTimeout(() => ctrl.abort(), perAttemptMs);
      orOnce(model, params, perAttemptMs, ctrl.signal).then(
        (result) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          clearInterval(hedgeTimer);
          abortAll(); // cancel the losers
          result.providerCalls = fired;
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          if (settled) return; // an aborted loser racing a winner — ignore
          const { failFast, error } = classifyModelError(err);
          if (failFast) {
            finishRejected(error);
            return;
          }
          errors.push(`${model}: ${err?.message || err}`);
          if (fired >= models.length && errors.length >= fired) {
            finishRejected(exhaustedError(errors, fired));
          }
          // otherwise: keep waiting for in-flight / not-yet-fired models
        }
      );
    };

    fireNext(); // primary fires immediately
    const hedgeTimer = setInterval(() => {
      if (settled) {
        clearInterval(hedgeTimer);
        return;
      }
      if (nextIndex < models.length) fireNext();
      else clearInterval(hedgeTimer);
    }, HEDGE_DELAY_MS);
  });
}

async function callOpenRouter({ systemPrompt, messages, imageBase64, json, timeoutMs }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ProviderError("OPENROUTER_API_KEY is not configured", { status: 501 });
  }
  // Try each model in turn with a plain `model` field. Relying on OpenRouter's
  // `models` array meant one retired slug (unknown model ID → HTTP 400) failed
  // the whole request instead of falling through — client-side iteration
  // survives dead slugs. A 429 on one model just moves to the next, which
  // usually sits in a different upstream pool.
  const params = { systemPrompt, messages, imageBase64, json };
  const models = orModelChain({ imageBase64 });
  const perAttemptMs = timeoutMs ?? TIMEOUT_MS;
  // Vision requests have a single model — no hedging, keep the simple
  // sequential path.
  if (models.length < 2) {
    const errors = [];
    let providerCalls = 0;
    for (const model of models) {
      providerCalls += 1;
      try {
        const result = await orOnce(model, params, perAttemptMs);
        result.providerCalls = providerCalls;
        return result;
      } catch (err) {
        const { failFast, error } = classifyModelError(err);
        if (failFast) throw error;
        errors.push(`${model}: ${err?.message || err}`);
      }
    }
    throw exhaustedError(errors, providerCalls);
  }
  return raceModels(models, params, perAttemptMs);
}

/** Detect the image MIME type from base64 magic bytes (default: jpeg). */
function sniffImageMime(b64) {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("Qk")) return "image/bmp";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

// ── Gemini (optional fallback) ────────────────────────────────────────────
const GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_TEXT_MODEL;

function geminiEndpoint(model) {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

function geminiContents({ systemPrompt, messages, imageBase64 }) {
  const contents = (messages || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  if (imageBase64) {
    contents.push({
      role: "user",
      parts: [
        { text: systemPrompt },
        { inlineData: { mimeType: sniffImageMime(imageBase64), data: imageBase64 } },
      ],
    });
    return contents;
  }
  if (contents.length && contents[0].role === "user") {
    contents[0].parts.unshift({ text: systemPrompt });
  } else {
    contents.unshift({ role: "user", parts: [{ text: systemPrompt }] });
  }
  return contents;
}

async function callGemini({ systemPrompt, messages, imageBase64, json, timeoutMs }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new ProviderError("GEMINI_API_KEY is not configured", { status: 501 });
  }
  const model = imageBase64 ? GEMINI_VISION_MODEL : GEMINI_TEXT_MODEL;
  const body = {
    contents: geminiContents({ systemPrompt, messages, imageBase64 }),
    generationConfig: {
      temperature: json ? 0.2 : 0.7,
      maxOutputTokens: 2048,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };
  const data = await fetchJson(geminiEndpoint(model), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("\n")
      .trim() || "";
  if (!text) throw new ProviderError("Empty response from Gemini", { status: 502 });
  return { text, provider: "gemini" };
}

/**
 * Run a completion against the primary provider; on failure, fall back.
 * @returns {Promise<{text: string, provider: string, fallbackUsed: boolean, providerCalls: number}>}
 */
export async function runCompletion(params) {
  // Vision requests (food scans) reason over large images on free-tier
  // models — allow a per-call timeout override so they can finish.
  const timeoutMs = params.timeoutMs ?? (params.imageBase64 ? FOOD_TIMEOUT_MS : TIMEOUT_MS);
  const attempts = [callOpenRouter, callGemini];
  const errors = [];
  let providerCalls = 0;
  let lastUserMessage = null;
  for (const [i, fn] of attempts.entries()) {
    try {
      // Plumbing fix: the computed timeoutMs (50s for food scans) is now
      // actually passed to the providers — previously it was calculated
      // here but never forwarded, so scans aborted at the 15s default.
      const result = await fn({ ...params, timeoutMs });
      return {
        ...result,
        fallbackUsed: i > 0,
        providerCalls: providerCalls + (result.providerCalls || 1),
      };
    } catch (err) {
      // Only count provider calls that actually fired (a 501 "key not
      // configured" fires zero requests, so it must not add a phantom call
      // to the quota ledger).
      providerCalls += err?.providerCalls ?? 0;
      if (err?.userMessage) lastUserMessage = err.userMessage;
      const status = err?.status || 500;
      const isClientError = status === 400 || status === 401 || status === 403;
      errors.push(`${fn.name}: ${err?.message || err}`);
      if (isClientError && status !== 501) throw err;
      // 501 = key not configured → try the next provider quietly.
      if (!isClientError || status === 501) continue;
    }
  }
  const err = new Error(`No AI provider available. ${errors.join(" | ")}`);
  err.statusCode = 503;
  err.providerCalls = providerCalls;
  // Preserve the friendly explanation (e.g. "free AI models are busy")
  // instead of letting the Gemini 501 swallow it into a generic message.
  if (lastUserMessage) err.userMessage = lastUserMessage;
  throw err;
}

export { ProviderError, TIMEOUT_MS, FOOD_TIMEOUT_MS };
