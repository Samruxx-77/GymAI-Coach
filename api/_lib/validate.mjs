/**
 * Shared validation + response helpers for API routes.
 */

export function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function clientError(res, message, status = 400) {
  json(res, status, { error: message });
}

/** Validate the coach request body: { messages: [{ role, content }] }. */
export function validateCoachBody(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: "messages array is required" };
  }
  if (messages.length > 30) return { error: "too many messages" };
  for (const m of messages) {
    if (!m || typeof m !== "object") return { error: "invalid message" };
    if (m.role !== "user" && m.role !== "assistant") {
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
  const imageBase64 = body?.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length < 500) {
    return { error: "imageBase64 is required" };
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64)) {
    return { error: "imageBase64 must be base64" };
  }
  // 12 MB base64 ceiling (~9 MB binary) matches the client-side downscale.
  if (imageBase64.length > 12 * 1024 * 1024) return { error: "image too large" };
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
  const message = status >= 500 ? fallback : err?.message || fallback;
  if (status >= 500) console.error("[api]", err);
  json(res, status, { error: message });
}
