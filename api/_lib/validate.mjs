/**
 * Shared validation + response helpers for API routes.
 */

export function json(res, status, payload) {
  // Never blow up on an already-answered request (double-response crashes).
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Guard for POST-only routes: responds 405 otherwise. */
export function requirePost(req, res) {
  if (req.method === "POST") return true;
  try {
    res.setHeader("Allow", "POST");
  } catch {
    /* already sent — ignore */
  }
  json(res, 405, { error: "Method not allowed." });
  return false;
}

/** Structured request log: route, user, provider, latency — no secrets. */
export function logRequest({ endpoint, method, userId, status, provider, fallbackUsed, ms, extra }) {
  const line = [
    `[api] ${method} ${endpoint}`,
    `user=${userId || "anon"}`,
    `status=${status}`,
    provider ? `provider=${provider}` : null,
    fallbackUsed ? "fallback=yes" : null,
    typeof ms === "number" ? `${ms}ms` : null,
    extra || null,
  ]
    .filter(Boolean)
    .join(" ");
  if (status >= 500) console.error(line);
  else console.log(line);
}

/**
 * Read and parse a JSON request body.
 *
 * Serverless runtimes (Vercel Node functions) do NOT pre-parse the body —
 * handlers receive the raw IncomingMessage — so every POST route must read
 * it itself. The local dev server passes a pre-parsed body as the third
 * handler argument; reading here is safe there too (the stream is already
 * consumed, so this returns the parsed value via the handler contract).
 */
export async function readJsonBody(req, preParsed) {
  if (preParsed !== undefined) return preParsed;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return undefined; // signals invalid JSON → route responds 400
  }
}

export function clientError(res, message, status = 400) {
  json(res, status, { error: message });
}

/** Validate the coach request body: { messages: [{ role, content }] }.
 *
 * Only "user" messages are accepted. Past assistant replies are
 * user-controlled data the client could forge (prompt shaping / token
 * abuse), so the server never trusts client-supplied assistant history.
 * Multi-turn context still comes from the user's own messages plus the
 * profile-data system prompt built from real session data.
 */
export function validateCoachBody(body) {
  if (body === undefined) return { error: "invalid JSON body" };
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "messages array is required" };
  }
  if (messages.length > 30) return { error: "too many messages" };
  for (const m of messages) {
    if (!m || typeof m !== "object") return { error: "invalid message" };
    if (m.role !== "user") {
      return { error: "invalid message role" };
    }
    if (typeof m.content !== "string" || !m.content.trim()) {
      return { error: "invalid message content" };
    }
    if (m.content.length > 4000) return { error: "message too long" };
  }
  return { valid: true };
}

/** Validate the food-scan request body: { imageBase64 }. */
export function validateFoodBody(body) {
  if (body === undefined) return { error: "invalid JSON body" };
  const imageBase64 = body?.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length < 500) {
    return { error: "imageBase64 is required" };
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64)) {
    return { error: "imageBase64 must be base64" };
  }
  // 500 KB base64 ceiling (~375 KB binary). The client downscales photos
  // to ~180 KB before sending, so this is generous — while multi-MB
  // uploads previously reached the providers (and their bills) unchecked.
  if (imageBase64.length > 500 * 1024) return { error: "image too large" };
  return { valid: true };
}

/** Extract the first JSON object/array from a model response string. */
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  for (let end = candidate.length; end > start; end--) {
    const slice = candidate.slice(start, end);
    try {
      return JSON.parse(slice);
    } catch {
      // keep shrinking until a valid JSON suffix is found
    }
  }
  return null;
}

/** Map unknown errors to a safe status + user-facing message. */
export function errorResponse(res, err) {
  const status = err?.statusCode || err?.status || 500;
  const fallback = "Something went wrong. Please try again.";
  // Providers can attach a safe, user-facing explanation (e.g. free-tier
  // busy) that survives the 5xx sanitizer below.
  const message = err?.userMessage || (status >= 500 ? fallback : err?.message || fallback);
  if (status >= 500) console.error("[api]", err);
  json(res, status, { error: message });
}
