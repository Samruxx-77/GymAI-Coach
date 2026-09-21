/**
 * Execute the production bundle in jsdom and capture any thrown errors
 * (the exact scenario of the deployed site: build WITHOUT VITE_* env vars).
 *
 * Usage: node scripts/repro-prod-blank.mjs [path-to-bundle]
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

const bundle = process.argv[2] || "dist/assets/index-*.js";
// Resolve the glob
const { globSync } = await import("node:fs");
const files = globSync(bundle);
if (!files.length) {
  console.error("No bundle found at", bundle);
  process.exit(1);
}

// Vite now emits ES-module chunks (lazy 3D scene), which window.eval cannot
// parse. Convert the real production bundle to an IIFE first — same code,
// executable form. Dynamic imports are inlined when splitting is off.
const result = await build({
  entryPoints: [files[0]],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
  logLevel: "silent",
});
const code = result.outputFiles[0].text;

const errors = [];
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "https://example.com/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  resources: "usable",
  beforeParse(window) {
    window.console.error = (...args) => {
      const text = args
        .map((a) => {
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === "object") {
            try { return JSON.stringify(a); } catch { return String(a); }
          }
          return String(a);
        })
        .join(" ");
      errors.push(text);
    };
  },
});

const { window } = dom;
window.addEventListener("error", (e) => errors.push("WINDOW ERROR: " + (e.error?.stack || e.message)));

// Execute the bundle
try {
  window.eval(code);
} catch (err) {
  errors.push("EVAL THROW: " + (err.stack || err.message));
}

// Give React a moment to render and async work to surface
await new Promise((r) => setTimeout(r, 3000));

const root = window.document.getElementById("root");
const innerHTML = root.innerHTML;

console.log("── root element content length:", innerHTML.length);
console.log("── root preview:", innerHTML.slice(0, 300) || "(EMPTY = blank page)");
console.log("── captured errors:", errors.length);
for (const e of errors.slice(0, 10)) console.log("  •", e.slice(0, 500));

// Supabase keeps timers alive; exit explicitly after flushing output.
process.exit(0);
