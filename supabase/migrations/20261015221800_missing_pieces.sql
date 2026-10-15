-- ═══════════════════════════════════════════════════════════════════
-- GymAI Coach — missing-pieces migration (2026-09-22)
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Everything here is idempotent: safe to run even if some parts were
-- already applied. It does NOT delete any of your data.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. CUSTOM EXERCISES ─────────────────────────────────────────────
-- Add the owner column (older DBs don't have it) and replace the old
-- global unique name with per-user uniqueness, so every user can have
-- their own "Push-ups" etc.
alter table public.exercises
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.exercises
  drop constraint if exists exercises_name_key;

create unique index if not exists exercises_system_name_unique
  on public.exercises (name) where user_id is null;

create unique index if not exists exercises_user_name_unique
  on public.exercises (user_id, name) where user_id is not null;

create index if not exists exercises_user_lookup
  on public.exercises (user_id);

-- ── 2. AI USAGE LEDGER (daily quota) ────────────────────────────────
-- One row per AI call. Without this table the quota logic stays
-- switched off (fails open) and users get unlimited free-tier calls.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day            date not null default current_date,
  endpoint       text not null check (endpoint in ('coach','food')),
  provider_calls integer not null default 1 check (provider_calls between 1 and 20),
  created_at     timestamptz not null default now()
);

create index if not exists ai_usage_user_day
  on public.ai_usage (user_id, day desc);

alter table public.ai_usage enable row level security;

-- append-only: users read/insert their own rows; no update/delete
drop policy if exists "ai_usage read own" on public.ai_usage;
create policy "ai_usage read own" on public.ai_usage
  for select using (auth.uid() = user_id);

drop policy if exists "ai_usage insert own" on public.ai_usage;
create policy "ai_usage insert own" on public.ai_usage
  for insert with check (auth.uid() = user_id);

-- ── 3. EXERCISES ACCESS RULES ───────────────────────────────────────
-- Everyone reads system exercises; users fully manage their own.
alter table public.exercises enable row level security;

drop policy if exists "public read" on public.exercises;
drop policy if exists "read system + own exercises" on public.exercises;
create policy "read system + own exercises" on public.exercises
  for select using (user_id is null or user_id = auth.uid());

drop policy if exists "insert own exercise" on public.exercises;
create policy "insert own exercise" on public.exercises
  for insert with check (user_id = auth.uid());

drop policy if exists "update own exercise" on public.exercises;
create policy "update own exercise" on public.exercises
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own exercise" on public.exercises;
create policy "delete own exercise" on public.exercises
  for delete using (user_id = auth.uid());

-- ── 4. API GRANTS ───────────────────────────────────────────────────
-- PostgREST serves requests as anon/authenticated roles; without these
-- the tables are invisible to the app API even with correct RLS.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ── DONE ────────────────────────────────────────────────────────────
-- Quick check: run this to confirm the pieces exist:
--   select count(*) from public.ai_usage;            -- 0 is fine
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='exercises'
--    order by ordinal_position;                       -- must include user_id
