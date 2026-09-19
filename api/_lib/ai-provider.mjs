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
 *   OPENROUTER_MODEL            primary text model (default deepseek/deepseek-v4-flash-0731:free)
 *   OPENROUTER_FALLBACK_MODELS  comma-separated list tried in order on errors/rate limits
 *   OPENROUTER_VISION_MODEL     model used for image scans (default inclusionai/ling-3.0-flash-vl:free)
 *   GEMINI_MODEL / GEMINI_VISION_MODEL / GEMINI_API_KEY
 *
 * Swapping providers = editing this file alone.
 */

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 40_000);

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, options) {
  const res = await fetch(url, { ...options, signal: timeoutSignal(TIMEOUT_MS) });
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
const OR_TEXT_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731:free";
const OR_FALLBACKS = (process.env.OPENROUTER_FALLBACK_MODELS || "nex-agi/nex-n2.5-mini:free,z-ai/glm-5.2:free")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OR_VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL || "inclusionai/ling-3.0-flash-vl:free";

function orModelChain({ imageBase64 }) {
  const primary = imageBase64 ? OR_VISION_MODEL : OR_TEXT_MODEL;
  const chain = [primary, ...OR_FALLBACKS.filter((m) => m !== primary)];
  return chain.length > 1 ? chain : null; // null → plain `model` field
}

async function orOnce(body) {
  const base = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  return fetchJson(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.APP_PUBLIC_URL || "https://gymai-coach.vercel.app",
      "X-Title": "GymAI Coach",
    },
    body: JSON.stringify(body),
  });
}

/** Detect the image MIME type from base64 magic bytes (default: jpeg). */
function sniffImageMime(b64) {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("Qk")) return "image/bmp";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

async function callOpenRouter({ systemPrompt, messages, imageBase64, json }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new ProviderError("OPENROUTER_API_KEY is not configured", { status: 501 });
  }

  const content = imageBase64
    ? [
        { type: "text", text: systemPrompt },
        {
          type: "image_url",
          image_url: { url: `data:${sniffImageMime(imageBase64)};base64,${imageBase64}` },
        },
      ]
    : null;

  const modelChain = orModelChain({ imageBase64 });
  const body = {
    ...(modelChain ? { models: modelChain } : { model: modelChain || OR_TEXT_MODEL }),
    temperature: json ? 0.2 : 0.7,
    // Vision models on the free tier reason extensively before answering —
    // give image calls a larger budget so reasoning doesn't eat the reply.
    max_tokens: imageBase64 ? 4096 : 3072,
    // Free-tier models are frequently reasoning models; strip hidden reasoning
    // tokens so `content` carries the actual answer (harmless on plain models).
    reasoning: { exclude: true },
    ...(json && !imageBase64 ? { response_format: { type: "json_object" } } : {}),
    messages: imageBase64
      ? [{ role: "user", content }]
      : [{ role: "system", content: systemPrompt }, ...messages],
  };

  let data;
  try {
    data = await orOnce(body);
  } catch (err) {
    // Free models share an upstream pool — a single brief retry absorbs most 429s.
    if ((err?.status === 429 || err?.status === 408) && modelChain) {
      await sleep(1200);
      data = await orOnce(body);
    } else {
      throw err;
    }
  }

  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new ProviderError("Empty response from OpenRouter", { status: 502 });
  return { text, provider: `openrouter:${data?.model || "unknown"}` };
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
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
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

async function callGemini({ systemPrompt, messages, imageBase64, json }) {
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
  });
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
 * @returns {Promise<{text: string, provider: string, fallbackUsed: boolean}>}
 */
export async function runCompletion(params) {
  const attempts = [callOpenRouter, callGemini];
  const errors = [];
  for (const [i, fn] of attempts.entries()) {
    try {
      const result = await fn(params);
      return { ...result, fallbackUsed: i > 0 };
    } catch (err) {
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
  throw err;
}

export { ProviderError, TIMEOUT_MS };
