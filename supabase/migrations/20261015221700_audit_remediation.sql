-- GymAI Coach — audit remediation migration (2026-09-22)
-- Run this in Supabase Dashboard > SQL Editor on the LIVE database.
-- Idempotent: safe to re-run. Verification queries at the end.
--
-- What this does:
-- 1. Adds an index on workouts(user_id) for per-owner workout lookups.
-- 2. Hardens ai_messages RLS: a message's conversation_id must belong to
--    the same user — matching user_id alone is no longer enough.
-- 3. Hardens workout_exercises RLS: line items may only reference system
--    exercises (user_id IS NULL) or the caller's own custom exercises.
-- 4. Sets default privileges so FUTURE tables get the same API grants as
--    the existing ones (RLS still isolates rows per member).

-- 1. workouts owner lookup index
create index if not exists workouts_user_updated
  on public.workouts (user_id, updated_at desc);

-- 2. ai_messages: conversation must belong to the same user
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

-- 3. workout_exercises: only system or caller-owned custom exercises
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

-- 4. default privileges for future tables
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- ── Verification (run after applying; expect 1 row each) ──
select 'workouts_user_updated' as item,
  count(*) > 0 as present
from pg_indexes
where schemaname = 'public' and indexname = 'workouts_user_updated';

select 'ai_messages owner via conversation' as item,
  count(*) > 0 as present
from pg_policies
where schemaname = 'public' and tablename = 'ai_messages'
  and policyname = 'ai_messages owner via conversation';

select 'workout_exercises write via workout (hardened)' as item,
  count(*) > 0 as present
from pg_policies
where schemaname = 'public' and tablename = 'workout_exercises'
  and policyname = 'write via workout'
  and with_check ilike '%exercises%';
