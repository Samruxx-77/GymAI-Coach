-- ═══════════════════════════════════════════════════════════════════
-- GymAI Coach — database schema
-- Run in Supabase → SQL Editor → Run.
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- The MIGRATIONS section below also repairs databases created from
-- older versions of this file (missing columns, old constraints).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ═══════════════════════════════════════════════════════════════════
-- MIGRATIONS — repair older databases (all idempotent, safe to re-run)
-- NOTE: the ALTER TABLE migrations that need existing tables live in the
-- "POST-CREATION MIGRATIONS" section after the table definitions, so this
-- file also runs cleanly on a FRESH database.
-- ═══════════════════════════════════════════════════════════════════

-- (table-dependent migrations moved below table creation)

-- Custom-exercise delete safety: deleting an exercise must not orphan
-- workout_exercises rows (deleting a referenced exercise used to 500).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'workout_exercises_exercise_id_fkey' and confdeltype <> 'c'
  ) then
    alter table public.workout_exercises drop constraint workout_exercises_exercise_id_fkey;
    alter table public.workout_exercises
      add constraint workout_exercises_exercise_id_fkey
      foreign key (exercise_id) references public.exercises(id) on delete cascade;
  end if;
end $$;

-- ── helpers ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── 1. PROFILES ────────────────────────────────────────────────────
-- One row per member, auto-created on sign-up.
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  display_name           text not null default '',
  avatar_url             text,
  -- onboarding stats
  age                    integer check (age between 13 and 100),
  gender                 text check (gender in ('male','female','other','prefer_not_to_say')),
  height_cm              numeric(5,1) check (height_cm between 90 and 250),
  start_weight_kg        numeric(5,1),
  current_weight_kg      numeric(5,1),
  target_weight_kg       numeric(5,1),
  -- goal + training
  primary_goal           text check (primary_goal in ('lose_weight','build_muscle','recomp','endurance','general_health')),
  activity_level         text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  experience_level       text check (experience_level in ('beginner','intermediate','advanced')),
  weekly_workout_target  integer default 3 check (weekly_workout_target between 1 and 7),
  dietary_preferences    text[] default '{}',
  -- calculated targets (see lib/nutrition.ts)
  calorie_target         integer check (calorie_target between 800 and 8000),
  protein_target         integer check (protein_target between 20 and 500),
  carb_target            integer check (carb_target between 0 and 1200),
  fat_target             integer check (fat_target between 10 and 400),
  -- gamification caches (ledger xp_events is the source of truth)
  xp                     integer not null default 0,
  streak_count           integer not null default 0,
  best_streak            integer not null default 0,
  last_active_date       date,
  onboarding_completed   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-create a profile whenever a new auth user appears
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(new.email, '@', 1),  -- null when signed up by phone
      new.phone,                       -- phone-auth users: use the number
      'Member'
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. WEIGHT ENTRIES ──────────────────────────────────────────────
create table if not exists public.weight_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date  date not null default current_date,
  weight_kg   numeric(5,1) not null check (weight_kg between 25 and 400),
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, entry_date)
);
create index if not exists weight_entries_user_date on public.weight_entries (user_id, entry_date desc);

-- ── 3. FOOD ENTRIES ────────────────────────────────────────────────
create table if not exists public.food_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date     date not null default current_date,
  meal_type      text not null default 'snack' check (meal_type in ('breakfast','lunch','dinner','snack')),
  name           text not null,
  servings       numeric(4,1) not null default 1 check (servings > 0),
  serving_label  text,
  calories       integer not null default 0 check (calories between 0 and 10000),
  protein_g      integer not null default 0 check (protein_g between 0 and 1000),
  carbs_g        integer not null default 0 check (carbs_g between 0 and 1500),
  fat_g          integer not null default 0 check (fat_g between 0 and 1000),
  source         text not null default 'manual' check (source in ('manual','ai_scan','quick')),
  ai_confidence  numeric(3,2),  -- 0..1, only for ai_scan entries
  created_at     timestamptz not null default now()
);
create index if not exists food_entries_user_date on public.food_entries (user_id, entry_date desc);

-- ── 4. EXERCISES (seeded library, read-only) ───────────────────────
create table if not exists public.exercises (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade, -- null = system exercise
  name          text not null,
  muscle_group  text not null check (muscle_group in ('chest','back','shoulders','arms','legs','core','full_body','cardio')),
  equipment     text not null default 'bodyweight' check (equipment in ('barbell','dumbbell','machine','cable','bodyweight','kettlebell','band','cardio')),
  is_compound   boolean not null default false,
  instructions  text not null default '',
  tips          text not null default '',
  created_at    timestamptz not null default now()
);
-- Backfill for databases created before 2026-09-22 (custom exercises):
-- older DBs lack public.exercises.user_id and still carry the old global
-- unique name constraint. This MUST run before the indexes below reference
-- user_id, otherwise a re-run on an old database aborts at index creation.
alter table public.exercises
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.exercises drop constraint if exists exercises_name_key;

-- system exercise names unique; each user's own exercise names unique per user
create unique index if not exists exercises_system_name_unique
  on public.exercises (name) where user_id is null;
create unique index if not exists exercises_user_name_unique
  on public.exercises (user_id, name) where user_id is not null;
-- lookup index for "my exercises" queries (used by createExercise / library)
create index if not exists exercises_user_lookup on public.exercises (user_id);

-- ── 5. WORKOUTS (templates: system + user-created) ─────────────────
create table if not exists public.workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade,  -- null = system template
  name              text not null,
  description       text not null default '',
  category          text not null default 'custom' check (category in ('push','pull','legs','full_body','upper','lower','bro_split','cardio','custom')),
  difficulty        text not null default 'intermediate' check (difficulty in ('beginner','intermediate','advanced')),
  estimated_minutes integer not null default 45 check (estimated_minutes between 5 and 240),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists workouts_updated_at on public.workouts;
create trigger workouts_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();

-- ── 6. WORKOUT_EXERCISES (ordered line items of a template) ────────
create table if not exists public.workout_exercises (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references public.workouts(id) on delete cascade,
  exercise_id   uuid not null references public.exercises(id) on delete cascade,
  position      integer not null default 0,
  sets          integer not null default 3 check (sets between 1 and 20),
  reps          text not null default '10',
  rest_seconds  integer not null default 90 check (rest_seconds between 0 and 600),
  notes         text not null default ''
);
create index if not exists workout_exercises_workout on public.workout_exercises (workout_id, position);
create index if not exists workout_exercises_exercise on public.workout_exercises (exercise_id);

-- ── 7. WORKOUT SESSIONS (completions) ──────────────────────────────
create table if not exists public.workout_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id          uuid references public.workouts(id) on delete set null,
  workout_name        text not null,
  session_date        date not null default current_date,
  duration_minutes    integer check (duration_minutes between 0 and 600),
  total_volume_kg     numeric(9,1) not null default 0,
  exercises_completed integer not null default 0,
  exercises_total     integer not null default 0,
  session_data        jsonb not null default '[]',  -- logged sets [{exerciseId,name,sets:[{weight,reps}]}]
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists workout_sessions_user_date on public.workout_sessions (user_id, session_date desc);
create index if not exists workout_sessions_workout on public.workout_sessions (workout_id);

-- ── 8. XP EVENTS (append-only ledger — source of truth) ────────────
create table if not exists public.xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source      text not null check (source in ('food_log','weight_log','workout_complete','ai_scan','ai_chat','streak_day','achievement','onboarding','daily_login')),
  points      integer not null default 0,
  ref_id      text,          -- idempotency key (e.g. session id)
  day         date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists xp_events_user_day on public.xp_events (user_id, day desc);

-- idempotency: same source+ref+day can only award XP once
create unique index if not exists xp_events_dedupe_ref
  on public.xp_events (user_id, source, ref_id, day) where ref_id is not null;
-- once-a-day sources can only award once per day
create unique index if not exists xp_events_dedupe_daily
  on public.xp_events (user_id, source, day) where ref_id is null;

-- server-side point enforcement: clients cannot set arbitrary XP values
create or replace function public.enforce_xp_points()
returns trigger language plpgsql as $$
begin
  new.points := case new.source
    when 'onboarding'        then 50
    when 'food_log'          then 10
    when 'weight_log'        then 15
    when 'workout_complete'  then 40
    when 'ai_scan'           then 5
    when 'ai_chat'           then 2
    when 'streak_day'        then 20
    when 'daily_login'       then 5
    when 'achievement'       then 0   -- achievements carry their own xp_reward
    else 0
  end;
  return new;
end $$;

drop trigger if exists xp_enforce_points on public.xp_events;
create trigger xp_enforce_points before insert on public.xp_events
  for each row execute function public.enforce_xp_points();

-- freeze points on UPDATE: clients can never change awarded XP afterwards.
-- (RLS allows owners to update their rows for other reasons; points stay fixed.)
create or replace function public.freeze_xp_points()
returns trigger language plpgsql as $$
begin
  new.points := old.points;
  return new;
end $$;

drop trigger if exists xp_freeze_points on public.xp_events;
create trigger xp_freeze_points before update on public.xp_events
  for each row execute function public.freeze_xp_points();

-- anti-farming: sources that carry a ref_id must reference a real row.
-- (Today only workout_complete uses ref_ids — workout_sessions ids.)
create or replace function public.verify_xp_ref()
returns trigger language plpgsql as $$
begin
  if new.source = 'workout_complete' and new.ref_id is not null then
    if not exists (
      select 1 from public.workout_sessions
      where id = new.ref_id::uuid and user_id = new.user_id
    ) then
      raise exception 'xp_events: ref_id does not reference a real workout session';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists xp_verify_ref on public.xp_events;
create trigger xp_verify_ref before insert on public.xp_events
  for each row execute function public.verify_xp_ref();

-- anti-farming: xp_events.day must stay near today. The client sends its
-- LOCAL day key, which can legitimately differ from the server date by up
-- to one day (timezones), so the window is ±1 day — INSERT-only, meaning
-- historical rows are never affected.
create or replace function public.guard_xp_day()
returns trigger language plpgsql as $$
begin
  if new.day < current_date - 1 or new.day > current_date + 1 then
    raise exception 'xp_events: day % is outside the allowed window', new.day;
  end if;
  return new;
end $$;

drop trigger if exists xp_guard_day on public.xp_events;
create trigger xp_guard_day before insert on public.xp_events
  for each row execute function public.guard_xp_day();

-- profiles.xp integrity: the displayed total is recomputed from the ledger
-- (xp_events points + unlocked achievement rewards) on every update, so a
-- client can never PATCH an inflated total — the app's own recomputeXpCache
-- writes the same value, so the trigger is a no-op for legitimate writes.
create or replace function public.recompute_profile_xp()
returns trigger language plpgsql as $$
declare
  ledger_total integer;
  reward_total integer;
begin
  select coalesce(sum(points), 0) into ledger_total
    from public.xp_events where user_id = new.id;
  select coalesce(sum(a.xp_reward), 0) into reward_total
    from public.user_achievements ua
    join public.achievements a on a.id = ua.achievement_id
    where ua.user_id = new.id;
  new.xp := ledger_total + reward_total;
  return new;
end $$;

drop trigger if exists profiles_recompute_xp on public.profiles;
create trigger profiles_recompute_xp before update on public.profiles
  for each row execute function public.recompute_profile_xp();

-- streak integrity: the client computes streaks, so the DB pins down the
-- legal transitions. Same day -> streak unchanged; consecutive day -> +1;
-- any gap (or first workout ever) -> reset to 1. last_active_date can only
-- move forward (never rewind, never jump past tomorrow to allow for
-- timezone differences between client-local day keys and the server).
-- best_streak is monotonic and always >= streak_count.
create or replace function public.guard_streak_write()
returns trigger language plpgsql as $$
begin
  if new.streak_count is not distinct from old.streak_count
     and new.last_active_date is not distinct from old.last_active_date
     and new.best_streak is not distinct from old.best_streak then
    return new;
  end if;

  if old.last_active_date is not null
     and (new.last_active_date is null or new.last_active_date < old.last_active_date) then
    raise exception 'profiles: last_active_date cannot move backwards';
  end if;
  if new.last_active_date is not null and new.last_active_date > current_date + 1 then
    raise exception 'profiles: last_active_date too far in the future';
  end if;

  if old.last_active_date is null or new.last_active_date is distinct from old.last_active_date then
    if new.last_active_date is not null
       and old.last_active_date is not null
       and new.last_active_date = old.last_active_date + 1 then
      if new.streak_count != old.streak_count + 1 then
        raise exception 'profiles: streak must increment by exactly 1 on consecutive days';
      end if;
    elsif new.streak_count != 1 then
      raise exception 'profiles: streak must reset to 1 after a gap';
    end if;
  elsif new.streak_count != old.streak_count then
    raise exception 'profiles: streak cannot change within the same day';
  end if;

  if new.best_streak < old.best_streak then
    raise exception 'profiles: best_streak cannot decrease';
  end if;
  if new.best_streak < new.streak_count then
    raise exception 'profiles: best_streak cannot be below streak_count';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_streak on public.profiles;
create trigger profiles_guard_streak before update on public.profiles
  for each row execute function public.guard_streak_write();

-- achievement integrity: badge unlocks are evaluated client-side, so the DB
-- re-verifies the achievement's criteria against real stored data before
-- allowing the insert. Mirrors lib/gamification.ts achievementUnlocked().
-- (protein_target_days / calorie_target_days are evaluated against hardcoded
-- 0s client-side and can never unlock — parity is kept here.)
create or replace function public.verify_achievement_unlock()
returns trigger language plpgsql as $$
declare
  crit jsonb;
  ctype text;
  cval numeric;
  ok boolean := false;
  p record;
  ledger_total integer;
  reward_total integer;
begin
  select criteria into crit from public.achievements where id = new.achievement_id;
  if crit is null then
    raise exception 'user_achievements: unknown achievement %', new.achievement_id;
  end if;
  ctype := crit ->> 'type';
  cval := coalesce(nullif(crit ->> 'value', '')::numeric, 1);

  case ctype
    when 'onboarding' then
      select onboarding_completed into ok from public.profiles where id = new.user_id;
      ok := coalesce(ok, false);
    when 'workout_sessions' then
      select count(*) >= cval into ok from public.workout_sessions where user_id = new.user_id;
    when 'weight_entries' then
      select count(*) >= cval into ok from public.weight_entries where user_id = new.user_id;
    when 'food_entries' then
      select count(*) >= cval into ok from public.food_entries where user_id = new.user_id;
    when 'food_logging_days' then
      select count(distinct entry_date) >= cval into ok from public.food_entries where user_id = new.user_id;
    when 'ai_scans' then
      select count(*) >= cval into ok from public.food_entries where user_id = new.user_id and source = 'ai_scan';
    when 'streak' then
      select coalesce(streak_count, 0) >= cval into ok from public.profiles where id = new.user_id;
    when 'xp' then
      select coalesce(sum(points), 0) into ledger_total from public.xp_events where user_id = new.user_id;
      select coalesce(sum(a.xp_reward), 0) into reward_total
        from public.user_achievements ua
        join public.achievements a on a.id = ua.achievement_id
        where ua.user_id = new.user_id;
      ok := (ledger_total + reward_total) >= cval;
    when 'goal_weight_reached' then
      select * into p from public.profiles where id = new.user_id;
      ok := p.start_weight_kg is not null
        and p.target_weight_kg is not null
        and p.current_weight_kg is not null
        and case p.primary_goal
              when 'lose_weight' then p.current_weight_kg <= p.target_weight_kg
              when 'build_muscle' then p.current_weight_kg >= p.target_weight_kg
              else false
            end;
    when 'protein_target_days', 'calorie_target_days' then
      ok := false;
    else
      ok := false;
  end case;

  if not ok then
    raise exception 'user_achievements: criteria not met for %', new.achievement_id;
  end if;
  return new;
end $$;

-- (user_achievements_verify trigger is created after the user_achievements
-- table in section 9 — DROP TRIGGER errors on a fresh DB if the table does
-- not exist yet.)

-- ── 8b. AI USAGE (append-only ledger — persistent per-user daily AI quota)
-- The server records one row per AI endpoint call (with the number of
-- provider requests it spent). No UPDATE/DELETE policies: append-only.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day            date not null default current_date,
  endpoint       text not null check (endpoint in ('coach','food')),
  provider_calls integer not null default 1 check (provider_calls between 1 and 20),
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_user_day on public.ai_usage (user_id, day desc);

-- ── 9. ACHIEVEMENTS ────────────────────────────────────────────────
create table if not exists public.achievements (
  id          text primary key,          -- slug
  name        text not null,
  description text not null,
  icon        text not null default 'award',
  category    text not null check (category in ('nutrition','training','consistency','progress','milestone')),
  tier        text not null default 'bronze' check (tier in ('bronze','silver','gold','platinum','mythical','immortal')),
  xp_reward   integer not null default 0,
  criteria    jsonb not null default '{}', -- {type, value} — interpreted by lib/gamification.ts
  sort_order  integer not null default 0
);

create table if not exists public.user_achievements (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

drop trigger if exists user_achievements_verify on public.user_achievements;
create trigger user_achievements_verify before insert on public.user_achievements
  for each row execute function public.verify_achievement_unlock();

-- ── 10. AI COACH CONVERSATIONS ─────────────────────────────────────
create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'New chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists ai_conversations_updated_at on public.ai_conversations;
create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists ai_messages_conversation on public.ai_messages (conversation_id, created_at);
create index if not exists ai_conversations_user_updated on public.ai_conversations (user_id, updated_at desc);

-- ═══════════════════════════════════════════════════════════════════
-- POST-CREATION MIGRATIONS — repair older databases.
-- These run AFTER the tables above exist, so the file also works on FRESH
-- databases (ALTER TABLE on a missing table would abort the script).
-- All statements are idempotent / guarded — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- (The custom-exercises user_id backfill now lives right after the
-- exercises table definition, before the indexes that reference it.)

-- GRANTs — PostgREST serves API requests as anon/authenticated; without
-- these, a fresh database would be API-dead even with correct RLS.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — member data is isolated to auth.uid()
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles           enable row level security;
alter table public.weight_entries     enable row level security;
alter table public.food_entries       enable row level security;
alter table public.exercises          enable row level security;
alter table public.workouts           enable row level security;
alter table public.workout_exercises  enable row level security;
alter table public.workout_sessions   enable row level security;
alter table public.xp_events          enable row level security;
alter table public.achievements       enable row level security;
alter table public.user_achievements  enable row level security;
alter table public.ai_conversations   enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.ai_usage            enable row level security;

-- profiles
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- simple owner-scoped tables
do $$
declare t text;
begin
  foreach t in array array['weight_entries','food_entries','workout_sessions','xp_events','user_achievements','ai_conversations','ai_messages']
  loop
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format('create policy "owner all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ai_usage: append-only ledger. Users can read and insert their own
-- rows (the server writes with the caller's token); no UPDATE/DELETE.
drop policy if exists "ai_usage read own" on public.ai_usage;
create policy "ai_usage read own" on public.ai_usage
  for select using (auth.uid() = user_id);
drop policy if exists "ai_usage insert own" on public.ai_usage;
create policy "ai_usage insert own" on public.ai_usage
  for insert with check (auth.uid() = user_id);

-- exercises: system seed data readable by all; users can manage only their own rows
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
drop policy if exists "public read" on public.achievements;
create policy "public read" on public.achievements for select using (true);

-- workouts: system templates readable by everyone, own workouts fully owned
drop policy if exists "read system + own" on public.workouts;
create policy "read system + own" on public.workouts
  for select using (user_id is null or user_id = auth.uid());
drop policy if exists "insert own" on public.workouts;
create policy "insert own" on public.workouts
  for insert with check (user_id = auth.uid());
drop policy if exists "update own" on public.workouts;
create policy "update own" on public.workouts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own" on public.workouts;
create policy "delete own" on public.workouts
  for delete using (user_id = auth.uid());

-- workout_exercises: readable if parent workout is readable; writable if parent is owned
drop policy if exists "read via workout" on public.workout_exercises;
create policy "read via workout" on public.workout_exercises
  for select using (
    exists (select 1 from public.workouts w where w.id = workout_id and (w.user_id is null or w.user_id = auth.uid()))
  );
drop policy if exists "write via workout" on public.workout_exercises;
create policy "write via workout" on public.workout_exercises
  for all using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════
-- SEED: EXERCISE LIBRARY
-- ═══════════════════════════════════════════════════════════════════
insert into public.exercises (name, muscle_group, equipment, is_compound, instructions, tips) values
  ('Barbell Bench Press','chest','barbell',true,'Lie on the bench, grip slightly wider than shoulder width. Lower the bar to your mid-chest, then press up until arms extend.','Keep feet planted and shoulder blades pulled back and down.'),
  ('Incline Dumbbell Press','chest','dumbbell',true,'Set bench to 30–45°. Press dumbbells up from shoulder level until arms extend, then lower with control.','A moderate incline emphasizes the upper chest without straining shoulders.'),
  ('Push-Up','chest','bodyweight',true,'Hands under shoulders, body in a straight line. Lower until chest nears the floor, then press back up.','Squeeze glutes and brace your core to keep hips from sagging.'),
  ('Cable Chest Fly','chest','cable',false,'Set pulleys at chest height. With a slight elbow bend, bring handles together in front of your chest.','Focus on squeezing the chest at the center rather than moving heavy weight.'),
  ('Machine Chest Press','chest','machine',true,'Adjust the seat so handles align with mid-chest. Press forward until arms extend, then return slowly.','A fixed path makes this a solid option when learning pressing mechanics.'),
  ('Deadlift','back','barbell',true,'Stand over the bar with mid-foot. Hinge and grip just outside your legs. Brace, then stand tall with the bar.','Keep the bar close to your body and set your back neutral before pulling.'),
  ('Barbell Row','back','barbell',true,'Hinge to about 45°, back neutral. Row the bar toward your lower ribs, then lower under control.','Avoid using momentum — the torso angle should stay steady.'),
  ('Lat Pulldown','back','machine',false,'Grip the bar wide, pull it to your upper chest while keeping your torso mostly upright.','Think about driving elbows down rather than pulling with your hands.'),
  ('Seated Cable Row','back','machine',false,'Pull the handle to your torso with elbows close to your body, then extend your arms forward.','Keep your lower back neutral; do not lean far back as you pull.'),
  ('Pull-Up','back','bodyweight',true,'Hang from a bar with an overhand grip. Pull until your chin clears the bar, then lower fully.','If these are tough, use an assisted machine or band and build up over time.'),
  ('Face Pull','back','cable',false,'Set a rope at upper-face height. Pull toward your face, separating your hands beside your ears.','Great for shoulder health — keep it light and controlled.'),
  ('Overhead Press','shoulders','barbell',true,'Stand with the bar at shoulder height. Press overhead until arms lock out, then lower to the shoulders.','Brace your core and squeeze glutes to avoid arching your lower back.'),
  ('Dumbbell Lateral Raise','shoulders','dumbbell',false,'Raise dumbbells out to your sides to shoulder height, leading with elbows, then lower slowly.','Lighter weight with strict form builds shoulders better than swinging heavy bells.'),
  ('Rear Delt Fly','shoulders','dumbbell',false,'Hinge forward and raise dumbbells out to the sides at shoulder height.','Keep the movement small — the rear delts respond to control, not load.'),
  ('Arnold Press','shoulders','dumbbell',true,'Start with palms facing you at shoulder level. Rotate palms outward as you press overhead.','Move smoothly through the rotation rather than rushing it.'),
  ('Barbell Curl','arms','barbell',false,'Curl the bar from hip level to shoulder height with elbows pinned to your sides.','Avoid swinging the torso; if momentum creeps in, reduce the load.'),
  ('Dumbbell Hammer Curl','arms','dumbbell',false,'Curl dumbbells with a neutral grip (palms facing each other).','The neutral grip hits the forearm flexors along with the biceps.'),
  ('Triceps Rope Pushdown','arms','cable',false,'Push the rope down until arms extend, slightly separating the ends at the bottom.','Keep elbows fixed at your sides — the shoulder should not move.'),
  ('Overhead Triceps Extension','arms','dumbbell',false,'Hold one dumbbell overhead with both hands. Lower behind your head, then extend back up.','Keep elbows pointing forward and close together.'),
  ('Skull Crusher','arms','barbell',false,'Lying on a bench, lower the bar toward your forehead by bending elbows, then extend.','Keep upper arms perpendicular to the floor throughout.'),
  ('Back Squat','legs','barbell',true,'Bar on upper back, feet shoulder-width. Squat until thighs reach at least parallel, then drive up.','Push your knees out and keep your chest up as you descend.'),
  ('Front Squat','legs','barbell',true,'Bar racked on front delts, elbows high. Squat down and drive up keeping torso upright.','An upright torso makes this quad-dominant — start lighter than back squats.'),
  ('Romanian Deadlift','legs','barbell',true,'Hinge at the hips with a slight knee bend, lowering the bar along your thighs until you feel a hamstring stretch.','The bar stays in contact with your legs; your back stays neutral.'),
  ('Leg Press','legs','machine',true,'Press the platform away until legs extend, then lower until knees reach about 90°.','Avoid locking knees hard at the top; keep constant tension.'),
  ('Walking Lunge','legs','dumbbell',true,'Step forward and lower until both knees reach 90°, then step through into the next lunge.','Short steps emphasize quads; longer steps bias glutes and hamstrings.'),
  ('Leg Curl','legs','machine',false,'Curl the pad toward your glutes, then return with control.','A slower eccentric builds the hamstrings effectively.'),
  ('Leg Extension','legs','machine',false,'Extend knees until legs are straight, pause briefly, then lower slowly.','Pause at the top for a strong quad contraction.'),
  ('Standing Calf Raise','legs','machine',false,'Rise onto the balls of your feet as high as possible, then lower below the step for a stretch.','Full range matters more than heavy weight for calves.'),
  ('Hip Thrust','legs','barbell',true,'Upper back on a bench, bar over hips. Drive hips up until your body forms a line, then lower.','Squeeze glutes hard at the top and keep ribs down.'),
  ('Plank','core','bodyweight',false,'Hold a straight line from head to heels on your forearms and toes.','Keep hips level; a shorter, braced hold beats a long sagging one.'),
  ('Hanging Leg Raise','core','bodyweight',false,'Hang from a bar and raise legs until hips reach 90°, then lower with control.','Start with bent knees if straight-leg raises are too difficult.'),
  ('Cable Crunch','core','cable',false,'Kneel below a high pulley and crunch your ribs toward your hips.','Flex the spine deliberately — this is not a hip hinge.'),
  ('Russian Twist','core','bodyweight',false,'Seated, lean back slightly and rotate your torso side to side.','Keep the movement controlled rather than fast.'),
  ('Treadmill Run','cardio','cardio',false,'Run at a steady conversational pace, or alternate speeds for intervals.','Adjust incline or speed to match your session goal.'),
  ('Cycling','cardio','cardio',false,'Pedal at a steady cadence, adjusting resistance for intensity.','A higher cadence at lower resistance is easier on the knees.'),
  ('Rowing Machine','cardio','cardio',true,'Drive with legs, then lean back slightly and pull the handle to your ribs.','The sequence is legs → back → arms; reverse it on the return.'),
  ('Jump Rope','cardio','bodyweight',false,'Jump an inch off the ground, rotating the rope from the wrists.','Small, quick hops protect your joints better than high jumps.'),
  ('Kettlebell Swing','full_body','kettlebell',true,'Hinge and swing the kettlebell to chest height with a powerful hip drive.','This is a hip hinge, not a squat or a shoulder raise.'),
  ('Burpee','full_body','bodyweight',true,'From standing, drop to a push-up, then jump your feet in and leap up.','Scale by stepping back instead of jumping to manage intensity.'),
  ('Farmer Carry','full_body','dumbbell',true,'Carry heavy dumbbells at your sides for distance or time with a tall posture.','Grip strength and core bracing are the limiting factors — stay tall.'),
  ('Goblet Squat','legs','kettlebell',true,'Hold a kettlebell at chest height and squat until thighs reach parallel, then drive up.','Keep elbows inside your knees at the bottom and chest tall.'),
  ('Dumbbell Row','back','dumbbell',true,'Brace one hand on a bench and row the dumbbell toward your hip with the other.','Let the shoulder blade move naturally; avoid twisting the torso.')
on conflict (name) where user_id is null do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: ACHIEVEMENTS
-- criteria = { type, value } — interpreted by src/lib/gamification.ts
-- ═══════════════════════════════════════════════════════════════════
insert into public.achievements (id, name, description, icon, category, tier, xp_reward, criteria, sort_order) values
  ('first-steps','First Steps','Complete onboarding and set your first targets','sparkles','milestone','bronze',50,'{"type":"onboarding"}',1),
  ('first-weigh-in','On the Record','Log your first body weight','scale','progress','bronze',25,'{"type":"weight_entries","value":1}',2),
  ('first-meal','First Fuel','Log your first meal','utensils','nutrition','bronze',25,'{"type":"food_entries","value":1}',3),
  ('first-workout','Opening Set','Complete your first workout','dumbbell','training','bronze',50,'{"type":"workout_sessions","value":1}',4),
  ('scan-rookie','Sharp Eye','Run your first AI food scan','scan','nutrition','bronze',25,'{"type":"ai_scans","value":1}',5),
  ('logging-habit','Consistent Logger','Log food on 7 different days','calendar-check','consistency','silver',100,'{"type":"food_logging_days","value":7}',6),
  ('workout-five','Getting Serious','Complete 5 workouts','dumbbell','training','silver',100,'{"type":"workout_sessions","value":5}',7),
  ('workout-twentyfive','Gym Regular','Complete 25 workouts','dumbbell','training','gold',300,'{"type":"workout_sessions","value":25}',8),
  ('streak-three','Warming Up','Hit a 3-day streak','flame','consistency','bronze',50,'{"type":"streak","value":3}',9),
  ('streak-seven','Week Warrior','Hit a 7-day streak','flame','consistency','silver',150,'{"type":"streak","value":7}',10),
  ('streak-thirty','Unstoppable','Hit a 30-day streak','flame','consistency','gold',500,'{"type":"streak","value":30}',11),
  ('weigh-in-ten','Data Driven','Log 10 weight entries','scale','progress','silver',100,'{"type":"weight_entries","value":10}',12),
  ('weigh-in-fifty','Trend Tracker','Log 50 weight entries','scale','progress','gold',300,'{"type":"weight_entries","value":50}',13),
  ('protein-hunter','Protein Hunter','Hit your protein target 5 times','beef','nutrition','silver',100,'{"type":"protein_target_days","value":5}',14),
  ('calorie-discipline','On Target','Hit your calorie target within range 5 times','target','nutrition','silver',100,'{"type":"calorie_target_days","value":5}',15),
  ('scan-veteran','Menu Reader','Run 10 AI food scans','scan','nutrition','silver',100,'{"type":"ai_scans","value":10}',16),
  ('xp-one-thousand','Rising Star','Earn 1,000 XP','star','milestone','silver',100,'{"type":"xp","value":1000}',17),
  ('xp-five-thousand','Force of Habit','Earn 5,000 XP','star','milestone','gold',250,'{"type":"xp","value":5000}',18),
  ('xp-twenty-five-thousand','Legend of the Gym','Earn 25,000 XP','crown','milestone','mythical',1000,'{"type":"xp","value":25000}',19),
  ('goal-crusher','Goal Crusher','Reach your target weight','trophy','progress','gold',500,'{"type":"goal_weight_reached"}',20),
  ('century-club','Century Club','Complete 100 workouts','medal','training','platinum',750,'{"type":"workout_sessions","value":100}',21),
  ('streak-sixty','Iron Will','Hit a 60-day streak','flame','consistency','platinum',800,'{"type":"streak","value":60}',22)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════
-- SEED: SYSTEM WORKOUT TEMPLATES
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  w_push uuid; w_pull uuid; w_legs uuid; w_full uuid; w_upper uuid; w_lower uuid;
  e uuid;
begin
  -- Idempotent template headers: insert only when the fixed id is missing,
  -- then resolve the id either way (plain re-run of this file is safe).
  insert into public.workouts (id, user_id, name, description, category, difficulty, estimated_minutes)
    values ('11111111-1111-4111-8111-111111111111', null, 'Push Day', 'Chest, shoulders and triceps — the classic pressing day.', 'push', 'intermediate', 55)
    on conflict (id) do nothing;
  insert into public.workouts (id, user_id, name, description, category, difficulty, estimated_minutes)
    values ('11111111-1111-4111-8111-111111111112', null, 'Pull Day', 'Back and biceps — rows, pulldowns and curls.', 'pull', 'intermediate', 55)
    on conflict (id) do nothing;
  insert into public.workouts (id, user_id, name, description, category, difficulty, estimated_minutes)
    values ('11111111-1111-4111-8111-111111111113', null, 'Leg Day', 'Squats, hinges and everything in between.', 'legs', 'intermediate', 60)
    on conflict (id) do nothing;
  insert into public.workouts (id, user_id, name, description, category, difficulty, estimated_minutes)
    values ('11111111-1111-4111-8111-111111111114', null, 'Full Body Starter', 'A balanced beginner session hitting the whole body.', 'full_body', 'beginner', 45)
    on conflict (id) do nothing;
  insert into public.workouts (id, user_id, name, description, category, difficulty, estimated_minutes)
    values ('11111111-1111-4111-8111-111111111115', null, 'Upper Body Power', 'Heavy compound pressing and pulling for the upper body.', 'upper', 'advanced', 60)
    on conflict (id) do nothing;
  insert into public.workouts (id, user_id, name, description, category, difficulty, estimated_minutes)
    values ('11111111-1111-4111-8111-111111111116', null, 'Lower Body Strength', 'Squat-focused strength work for the lower body.', 'lower', 'advanced', 60)
    on conflict (id) do nothing;

  select id into w_push  from public.workouts where id = '11111111-1111-4111-8111-111111111111';
  select id into w_pull  from public.workouts where id = '11111111-1111-4111-8111-111111111112';
  select id into w_legs  from public.workouts where id = '11111111-1111-4111-8111-111111111113';
  select id into w_full  from public.workouts where id = '11111111-1111-4111-8111-111111111114';
  select id into w_upper from public.workouts where id = '11111111-1111-4111-8111-111111111115';
  select id into w_lower from public.workouts where id = '11111111-1111-4111-8111-111111111116';

  -- Push exercises
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds)
  select w_push, id, position, sets, reps, rest from (values
    ('Barbell Bench Press', 0, 4, '8-10', 120),
    ('Incline Dumbbell Press', 1, 3, '10-12', 90),
    ('Overhead Press', 2, 3, '8-10', 120),
    ('Dumbbell Lateral Raise', 3, 3, '12-15', 60),
    ('Triceps Rope Pushdown', 4, 3, '12-15', 60),
    ('Overhead Triceps Extension', 5, 2, '12', 60)
  ) as t(name, position, sets, reps, rest)
  join public.exercises e on e.name = t.name and e.user_id is null
  where not exists (select 1 from public.workout_exercises we where we.workout_id = w_push);

  -- Pull exercises
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds)
  select w_pull, id, position, sets, reps, rest from (values
    ('Pull-Up', 0, 4, '6-10', 120),
    ('Barbell Row', 1, 4, '8-10', 120),
    ('Lat Pulldown', 2, 3, '10-12', 90),
    ('Seated Cable Row', 3, 3, '10-12', 90),
    ('Face Pull', 4, 3, '15', 60),
    ('Barbell Curl', 5, 3, '10-12', 60),
    ('Dumbbell Hammer Curl', 6, 2, '12', 60)
  ) as t(name, position, sets, reps, rest)
  join public.exercises e on e.name = t.name and e.user_id is null
  where not exists (select 1 from public.workout_exercises we where we.workout_id = w_pull);

  -- Legs exercises
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds)
  select w_legs, id, position, sets, reps, rest from (values
    ('Back Squat', 0, 4, '6-10', 150),
    ('Romanian Deadlift', 1, 3, '8-10', 120),
    ('Leg Press', 2, 3, '10-12', 120),
    ('Walking Lunge', 3, 3, '12', 90),
    ('Leg Curl', 4, 3, '12', 60),
    ('Standing Calf Raise', 5, 4, '15', 60)
  ) as t(name, position, sets, reps, rest)
  join public.exercises e on e.name = t.name and e.user_id is null
  where not exists (select 1 from public.workout_exercises we where we.workout_id = w_legs);

  -- Full body starter
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds)
  select w_full, id, position, sets, reps, rest from (values
    ('Goblet Squat', 0, 3, '10', 90),
    ('Push-Up', 1, 3, '10-15', 90),
    ('Dumbbell Row', 2, 3, '10', 90),
    ('Overhead Press', 3, 2, '10', 90),
    ('Plank', 4, 3, '30-45s', 60)
  ) as t(name, position, sets, reps, rest)
  join public.exercises e on e.name = t.name and e.user_id is null
  where not exists (select 1 from public.workout_exercises we where we.workout_id = w_full);

  -- Upper body power
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds)
  select w_upper, id, position, sets, reps, rest from (values
    ('Deadlift', 0, 4, '5', 180),
    ('Barbell Bench Press', 1, 4, '6-8', 150),
    ('Pull-Up', 2, 4, '6-10', 120),
    ('Overhead Press', 3, 3, '8', 120),
    ('Barbell Curl', 4, 3, '10', 60),
    ('Skull Crusher', 5, 3, '10', 60)
  ) as t(name, position, sets, reps, rest)
  join public.exercises e on e.name = t.name and e.user_id is null
  where not exists (select 1 from public.workout_exercises we where we.workout_id = w_upper);

  -- Lower body strength
  insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds)
  select w_lower, id, position, sets, reps, rest from (values
    ('Back Squat', 0, 5, '5', 180),
    ('Front Squat', 1, 3, '8', 150),
    ('Hip Thrust', 2, 3, '10', 120),
    ('Leg Curl', 3, 3, '12', 90),
    ('Leg Extension', 4, 3, '12', 90),
    ('Standing Calf Raise', 5, 4, '12', 60)
  ) as t(name, position, sets, reps, rest)
  join public.exercises e on e.name = t.name and e.user_id is null
  where not exists (select 1 from public.workout_exercises we where we.workout_id = w_lower);
end $$;

-- ── Avatar uploads (Supabase Storage) ─────────────────────────────
-- Public "avatars" bucket; each user may read publicly but only
-- upload/replace/delete their own <user-id>/... files.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
for select using (bucket_id = 'avatars');

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects
for insert with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
for update
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
for delete using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-22 audit remediation — query + RLS integrity hardening.
-- Idempotent: safe to re-run on live via the SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- 1. workouts are listed per owner — index the lookup.
create index if not exists workouts_user_updated
  on public.workouts (user_id, updated_at desc);

-- 2. ai_messages: the conversation must belong to the same user —
-- a matching user_id column alone is not enough, since the client
-- supplies both values on insert.
drop policy if exists "owner all" on public.ai_messages;
create policy "ai_messages owner via conversation" on public.ai_messages
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- 3. workout_exercises: line items may only reference system exercises
-- (user_id is null) or the caller's own custom exercises — never another
-- member's private exercise.
drop policy if exists "write via workout" on public.workout_exercises;
create policy "write via workout" on public.workout_exercises
  for all
  using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
    and exists (
      select 1 from public.exercises e
      where e.id = workout_exercises.exercise_id
        and (e.user_id is null or e.user_id = auth.uid())
    )
  );

-- 4. Default privileges: future tables stay API-reachable with the same
-- grants as the existing ones (RLS still isolates rows per member).
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
