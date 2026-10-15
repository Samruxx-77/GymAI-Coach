-- GymAI Coach — post-rebuild verification (2026-10-15)
-- Asserts the critical end-state of migrations 1-4. Raises an exception
-- (failing db push loudly) if anything essential is missing.

do $$
declare
  t text;
  tables text[] := array['profiles','weight_entries','food_entries','exercises',
    'workouts','workout_exercises','workout_sessions','xp_events','ai_usage',
    'achievements','user_achievements','ai_conversations','ai_messages'];
  n int;
begin
  foreach t in array tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = t) then
      raise exception 'VERIFY FAIL: table public.% missing', t;
    end if;
    if not exists (select 1 from pg_class
                   where relnamespace = 'public'::regnamespace
                     and relname = t and relrowsecurity) then
      raise exception 'VERIFY FAIL: RLS not enabled on public.%', t;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    raise exception 'VERIFY FAIL: trigger on_auth_user_created missing';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'user_achievements_verify') then
    raise exception 'VERIFY FAIL: trigger user_achievements_verify missing';
  end if;

  if not exists (select 1 from storage.buckets where id = 'avatars') then
    raise exception 'VERIFY FAIL: storage bucket avatars missing';
  end if;

  select count(*) into n from public.exercises;
  if n < 1 then raise exception 'VERIFY FAIL: no seed exercises'; end if;

  select count(*) into n from public.achievements;
  if n < 1 then raise exception 'VERIFY FAIL: no seed achievements'; end if;

  select count(*) into n from pg_policies where schemaname = 'public';
  if n < 15 then raise exception 'VERIFY FAIL: only % public policies', n; end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'exercises'
                   and column_name = 'user_id') then
    raise exception 'VERIFY FAIL: exercises.user_id column missing';
  end if;

  raise notice 'GYMAI VERIFY: all checks passed';
end $$;
