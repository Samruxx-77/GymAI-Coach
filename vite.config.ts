import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

// Load .env.local / .env into process.env so the in-process dev API routes
// (which run inside this config's Node process) always see provider keys,
// independent of how the dev command was launched.
for (const file of [".env", ".env.local"]) {
  const p = path.resolve(__dirname, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      const raw = m[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      process.env[m[1]] = raw;
    }
  }
}

// Local API handlers served by the Vite dev server itself (single port).
// In production, /api/* are real Vercel serverless functions instead.
import handleCoach from "./api/ai/coach.mjs";
import handleFood from "./api/ai/food.mjs";
import handleHealth from "./api/health.mjs";

/** Vite plugin that mounts the serverless handlers at /api/* during dev. */
function devApiPlugin() {
  return {
    name: "dev-api-routes",
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
        const url = (req.url || "").split("?")[0];
        const handler =
          (req.method === "POST" && url === "/api/ai/coach" && handleCoach) ||
          (req.method === "POST" && url === "/api/ai/food" && handleFood) ||
          (req.method === "GET" && url === "/api/health" && handleHealth);
        if (!handler) return next();

        let body: unknown = undefined;
        if (req.method === "POST") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const size = chunks.reduce((a, c) => a + c.length, 0);
          if (size > 12 * 1024 * 1024) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Payload too large" }));
            return;
          }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON body" }));
            return;
          }
        }
        await handler(req, res, body);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApiPlugin()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },  server: {
    host: "0.0.0.0",
    // Freebuff/workspaces inject PORT; fall back to the classic Vite port locally.
    port: Number(process.env.PORT) || 5173,
    // Fail loudly instead of silently drifting to another port — the preview
    // registration and any port-based tooling expect the registered port.
    strictPort: true,
  },
});
