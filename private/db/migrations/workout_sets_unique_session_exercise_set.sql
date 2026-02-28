-- Enforce one row per (user, session, exercise, set number).
-- This migration is idempotent and safe to run multiple times.

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, session_id, exercise_id, set_number
      order by created_at asc, id asc
    ) as rn
  from public.workout_sets
)
delete from public.workout_sets ws
using ranked r
where ws.id = r.id
  and r.rn > 1;

create unique index if not exists idx_workout_sets_unique_session_exercise_set
  on public.workout_sets(user_id, session_id, exercise_id, set_number);
