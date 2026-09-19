# GymAI Coach

> Your personal digital fitness companion — nutrition, workouts, progress and an AI coach, built for individual gym members.

GymAI Coach is a member-facing fitness app. It is **not** a gym-management or trainer CRM product: there are no owner dashboards, revenue tools or staff features. Everything is designed around one person's daily routine — log your meals, track your weight, follow your workouts, and chat with an AI coach that knows your actual numbers.

## Features

- **Authentication** — email + password sign-up, login, password reset, persistent sessions (Supabase Auth)
- **Onboarding** — a short wizard that personalizes targets (calories, macros, goal weight) from your stats
- **Dashboard** — today's numbers at a glance: calories/macros remaining, weight progress, streak, XP, today's mission
- **AI Food Scanner** — photograph a meal, get an estimated macro breakdown, review it, then log it (estimate, clearly labeled)
- **Nutrition tracking** — daily calorie/protein/carb/fat targets, food log with edit/delete, 14-day history
- **Weight tracking** — entries with a trend chart, weekly view, goal-progress percentage
- **Workouts** — template library (Push, Pull, Legs, Full Body, etc.), exercise library with cues, custom workout builder, session logger, history
- **Progress** — weight/calories/protein charts, workout consistency, XP timeline, achievements
- **Gamification** — XP for meaningful actions, daily streak, rank progression (Bronze → Mythical), achievements
- **AI Coach** — chat that uses your real profile, weight trend, and nutrition context to answer

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend — React 19 + Vite + TypeScript + Tailwind v4      │
│  SPA with protected routes (react-router)                   │
└───────────────┬─────────────────────────────┬───────────────┘
                │ supabase-js (anon key)      │ fetch /api/*
                ▼                             ▼
┌───────────────────────────────┐  ┌──────────────────────────┐
│  Supabase                     │  │  Vercel serverless API   │
│  • Postgres + RLS             │  │  /api/ai/coach           │
│  • Auth (email/password)      │  │  /api/ai/food            │
│  • Row-level data isolation   │  │  secrets via env vars    │
└───────────────────────────────┘  │  OpenRouter → Gemini     │
                                   │  fallback                │
                                   └──────────────────────────┘
```

- **Frontend** — `src/` — React 19, Vite, TypeScript (strict), Tailwind CSS v4, Recharts, Framer Motion (restrained scroll reveals), lucide-react icons
- **Backend (AI)** — `api/` — framework-free functions that run as Vercel serverless routes. AI provider keys never reach the browser
- **Database + Auth** — Supabase. The schema (with row-level security) lives in `supabase/schema.sql`. All member data is scoped to `auth.uid()` — one user can never read another's data

### Project layout

```
api/                    serverless AI routes (deployed by Vercel)
  ai/coach.mjs          POST /api/ai/coach
  ai/food.mjs           POST /api/ai/food
  health.mjs            GET  /api/health
  _lib/                 shared AI provider abstraction + validation
server/
  dev-server.mjs        local Node server that mirrors api/ for `npm run dev`
supabase/
  schema.sql            full database schema — run once in the SQL editor
src/
  components/ui/        design-system primitives (Button, Card, Input, …)
  components/           feature components (charts, stat cards, scanner…)
  context/AuthContext   session + profile + sign-in/out/reset logic
  features/             feature hooks (nutrition, weight, workouts, gamification)
  lib/                  supabase client, API client, gamification engine, utils
  pages/                routes (Dashboard, Nutrition, Workouts, Progress, …)
```

## Local setup

**Prerequisites:** Node 18+, and a free [Supabase](https://supabase.com) project.

```bash
# 1 — install dependencies
npm install        # or bun install

# 2 — create your env file
cp env.example .env
# then fill in the values (see "Environment variables" below)

# 3 — create the database schema
# Open your Supabase project → SQL Editor → paste supabase/schema.sql → Run

# 4 — start both the web app and the local API server
npm run dev
# web:  http://localhost:5173   (Vite)
# api:  http://localhost:8787   (proxied via /api)
```

Sign up inside the app, complete onboarding, and you're in.

## Environment variables

Copy `env.example` → `.env` (never commit the real file). On Vercel, add the same variables in **Project → Settings → Environment Variables**.

| Variable | Exposure | Required | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | public (safe) | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | public (safe) | ✅ | Supabase publishable client key |
| `OPENROUTER_API_KEY` | **private — server only** | ✅* | OpenRouter API key ([openrouter.ai/keys](https://openrouter.ai/keys)) — powers the AI coach and food scanner on free models |
| `GEMINI_API_KEY` | **private — server only** | — | Optional fallback AI provider ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) |
| `OPENROUTER_BASE_URL` | private | — | Defaults to `https://openrouter.ai/api/v1` |
| `OPENROUTER_MODEL` | private | — | Primary text model (default `deepseek/deepseek-v4-flash-0731:free`) |
| `OPENROUTER_FALLBACK_MODELS` | private | — | Comma-separated models tried in order on errors/rate limits (default `nex-agi/nex-n2.5-mini:free,z-ai/glm-5.2:free`) |
| `OPENROUTER_VISION_MODEL` | private | — | Model for food scans (default `inclusionai/ling-3.0-flash-vl:free`) |
| `GEMINI_MODEL` / `GEMINI_VISION_MODEL` | private | — | Optional model overrides |
| `SUPABASE_SERVICE_ROLE_KEY` | **private — server only** | — | Only for privileged admin tasks; unused by default |
| `VITE_API_ORIGIN` | dev only | — | Local API origin for the Vite proxy (`http://localhost:8787`) |

\* Required for the AI coach and food scanner. Without it those two features degrade gracefully — everything else still works.

**Which variables must stay private?** Anything **without** the `VITE_` prefix: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Vite only exposes `VITE_*` variables to the browser bundle. The two Supabase `VITE_*` values are intentionally public — the anon key is a publishable key, and data protection comes from row-level security, not key secrecy.

## Database setup

Run `supabase/schema.sql` once in the Supabase SQL editor. It creates:

- `profiles` — onboarding data, goals, calculated nutrition targets, `onboarding_completed`
- `weight_entries` — one row per weigh-in (unique per user/day)
- `food_entries` — nutrition log (manual or `source = 'ai_scan'`)
- `exercises` — seeded exercise library (public read)
- `workouts` — workout templates (system or user-created)
- `workout_exercises` — ordered exercises with sets/reps/rest
- `workout_sessions` — completed sessions with totals
- `xp_events` — append-only XP ledger (source of truth for XP/streaks)
- `achievements` / `user_achievements` — definitions and unlocks
- `ai_conversations` / `ai_messages` — persisted coach chats

Every member table has `user_id uuid not null default auth.uid()` plus RLS policies allowing only `select/insert/update/delete where user_id = auth.uid()`. `exercises` and `achievements` are world-readable but writable by no one (seed data).

## AI setup

Both AI routes share one server-side abstraction (`api/_lib/ai-provider.mjs`):

1. **Primary** — OpenRouter (OpenAI-compatible) with free-model routing: the coach uses a fast text model with automatic fallbacks for rate limits; the food scanner uses a vision model
2. **Fallback** — Google Gemini `generateContent` if OpenRouter is unconfigured or fails

Handles timeouts, rate limits (429), provider failures, empty responses, invalid JSON and oversized payloads, returning user-facing errors instead of crashing. The frontend only knows "an AI answered" — it never sees which provider or any key material.

## Vercel deployment

1. Push this repo to GitHub
2. In Vercel: **Add New → Project → Import** the repo (framework: **Vite**, auto-detected; build `vite build`, output `dist/`)
3. Add environment variables (see table above) — at minimum the two `VITE_SUPABASE_*` values and `OPENROUTER_API_KEY`
4. Deploy. `api/*.mjs` functions are picked up automatically — no extra config needed
5. In Supabase → Authentication → URL Configuration, add your Vercel URL as a **Site URL** (and redirect URL) so password-reset links work in production

## Development commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite web app with the API routes mounted in-process (single port) |
| `npm run dev:web` | Same as `dev` — the Vite dev server serves `/api/*` too |
| `npm run dev:api` | Standalone API server on port 8787 (optional; `dev` needs it) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript strict check |

In dev, `/api/*` is handled by a small Vite plugin (`vite.config.ts`) that mounts the same
handler modules Vercel deploys — one port for everything. In production, Vercel serves
the real serverless functions and Vite's plugin never runs.

## Security model

- **Keys** — AI provider keys live in server-side environment variables only; requests flow through `/api/ai/*` serverless functions. The browser bundle contains no secrets
- **Authorization** — every database request is authorized by the Supabase session (JWT). Row-level security policies restrict all member data to `auth.uid()`. Client-supplied user IDs are never trusted — the server session is the identity
- **Uploads** — food photos are downscaled to ≤ 768px JPEG on-device before upload, sent once to the AI endpoint, and never persisted
- **AI safety** — the coach is explicitly instructed not to diagnose medical conditions; responses are educational, not medical advice. Food-scan results are labeled as estimates
- **RLS** — database is the last line of defense: even a leaked anon key exposes no member data

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank page after deploy | Check the browser console; usually missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Vercel |
| "Database not connected" | The schema hasn't been run — paste `supabase/schema.sql` in the Supabase SQL editor |
| AI coach says the service is unavailable | No provider key configured (`OPENROUTER_API_KEY`), or all free models are rate-limited. Add the key in Vercel env vars and redeploy |
| Food scanner fails on big photos | Keep `GEMINI_VISION_MODEL` on a vision-capable model; images are auto-downscaled client-side |
| Password reset email not arriving | Check Supabase → Authentication → URL Configuration and your SMTP settings |
| Streak/XP looks wrong | XP is derived from the `xp_events` ledger; streaks from distinct logging days |
| Works locally, AI fails on Vercel | `VITE_API_ORIGIN` must **not** be set in Vercel (dev-only variable) |
---

Built with React, Vite, Tailwind CSS, Supabase and Vercel. AI by OpenRouter with a Gemini fallback.
