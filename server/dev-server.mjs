/**
 * Local dev server for the /api/* serverless routes.
 *
 * On Vercel, `api/` functions handle these routes natively. Locally,
 * Vite's dev proxy forwards /api/* here so the full app runs with
 * `bun run dev` (or `npm run dev`).
 *
 * Zero dependencies — plain Node http.
 */
import http from "node:http";
import handleCoach from "../api/ai/coach.mjs";
import handleFood from "../api/ai/food.mjs";
import handleHealth from "../api/health.mjs";
import handleAccountDelete from "../api/account/delete.mjs";

const PORT = Number(process.env.API_PORT || 8787);

const ROUTES = [
  { method: "POST", pattern: /^\/api\/ai\/coach\/?$/, handler: handleCoach },
  { method: "POST", pattern: /^\/api\/ai\/food\/?$/, handler: handleFood },
  { method: "POST", pattern: /^\/api\/account\/delete\/?$/, handler: handleAccountDelete },
  { method: "GET", pattern: /^\/api\/health\/?$/, handler: handleHealth },
];

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      // Reject oversized uploads early. The server-side food cap is 500 KB
      // base64; a 1 MB body ceiling leaves room for JSON overhead while
      // keeping memory use bounded.
      if (size > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  const contentType = String(req.headers["content-type"] || "");
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      const err = new Error("Invalid JSON body");
      err.statusCode = 400;
      throw err;
    }
  }
  return { _raw: raw };
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  const route = ROUTES.find((r) => r.method === req.method && r.pattern.test(url));

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!route) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const body = req.method === "POST" ? await parseJsonBody(req) : undefined;
    await route.handler(req, res, body);
  } catch (err) {
    const status = err?.statusCode || 500;
    if (status >= 500) console.error("[api]", err);
    if (!res.headersSent) {
      res.writeHead(status, { "Content-Type": "application/json" });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: status >= 500 ? "Server error" : err.message }));
    }
  }
});

// Bind to loopback only — this is a local dev helper, not a network service.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[api] dev server listening on http://127.0.0.1:${PORT}`);
});
