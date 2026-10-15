-- GymAI Coach — integrity triggers migration (2026-09-22)
-- Run this in Supabase Dashboard > SQL Editor on the LIVE database.
-- Idempotent: safe to re-run. Verification query at the end.
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

drop trigger if exists user_achievements_verify on public.user_achievements;
create trigger user_achievements_verify before insert on public.user_achievements
  for each row execute function public.verify_achievement_unlock();

-- ── verification (all three should show present = 1) ──
select 'xp_guard_day' as trigger_name, count(*) as present from pg_trigger where tgname='xp_guard_day'
union all select 'profiles_guard_streak', count(*) from pg_trigger where tgname='profiles_guard_streak'
union all select 'user_achievements_verify', count(*) from pg_trigger where tgname='user_achievements_verify';
