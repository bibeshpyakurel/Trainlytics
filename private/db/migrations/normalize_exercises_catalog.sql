-- One-time migration: normalize existing users' exercise catalog to canonical names,
-- muscle groups, and sort order.
--
-- What this does:
-- 1) Ensures each existing user has all canonical exercises.
-- 2) Merges known alias exercise names into canonical names.
-- 3) Re-points workout_sets.exercise_id from alias rows to canonical rows.
-- 4) Removes duplicate alias exercise rows after re-pointing.
-- 5) Normalizes canonical exercise fields (split, muscle_group, metric_type, sort_order, is_active).
--
-- Safety:
-- - Does NOT delete workout_sets.
-- - Operates only on users already present in public.exercises.
-- - Designed to be idempotent.

begin;

create temporary table canonical_exercises (
  name text primary key,
  split text not null,
  muscle_group text not null,
  metric_type text not null,
  sort_order int not null
) on commit drop;

insert into canonical_exercises (name, split, muscle_group, metric_type, sort_order)
values
  ('Incline Bench Press', 'push', 'chest', 'WEIGHTED_REPS', 1),
  ('Triceps Push Down', 'push', 'triceps', 'WEIGHTED_REPS', 2),
  ('Barbell Shoulder Press', 'push', 'shoulders', 'WEIGHTED_REPS', 3),
  ('Cable Lateral Raises', 'push', 'shoulders', 'WEIGHTED_REPS', 4),
  ('Pec Fly', 'push', 'chest', 'WEIGHTED_REPS', 5),
  ('Overhead Tricep Press', 'push', 'triceps', 'WEIGHTED_REPS', 6),
  ('Converging Shoulder Press', 'push', 'shoulders', 'WEIGHTED_REPS', 7),

  ('Bendover Barbell Row', 'pull', 'back', 'WEIGHTED_REPS', 1),
  ('Diverging Low Row', 'pull', 'back', 'WEIGHTED_REPS', 2),
  ('Pull Up', 'pull', 'back', 'WEIGHTED_REPS', 3),
  ('Hammer Curl', 'pull', 'biceps', 'WEIGHTED_REPS', 4),
  ('Upper Back Row', 'pull', 'back', 'WEIGHTED_REPS', 5),
  ('Preacher Curl', 'pull', 'biceps', 'WEIGHTED_REPS', 6),
  ('Lat Pull', 'pull', 'back', 'WEIGHTED_REPS', 7),

  ('Squat', 'legs', 'quads', 'WEIGHTED_REPS', 1),
  ('Romanian Deadlift', 'legs', 'hamstrings', 'WEIGHTED_REPS', 2),
  ('Leg Extension', 'legs', 'quads', 'WEIGHTED_REPS', 3),
  ('Leg Curl', 'legs', 'hamstrings', 'WEIGHTED_REPS', 4),
  ('Prone Leg Curl', 'legs', 'hamstrings', 'WEIGHTED_REPS', 5),
  ('Calf Raise', 'legs', 'calves', 'WEIGHTED_REPS', 6),

  ('Plank', 'core', 'core', 'DURATION', 1),
  ('Weighted Leg Raises', 'core', 'core', 'WEIGHTED_REPS', 2),
  ('Dumbbell Crunches', 'core', 'core', 'WEIGHTED_REPS', 3);

create temporary table exercise_aliases (
  alias_name text primary key,
  canonical_name text not null
) on commit drop;

-- Canonical names map to themselves
insert into exercise_aliases (alias_name, canonical_name)
select lower(name), name
from canonical_exercises;

-- Known legacy name variants
insert into exercise_aliases (alias_name, canonical_name)
values
  ('tricep pushdown', 'Triceps Push Down'),
  ('triceps pushdown', 'Triceps Push Down'),
  ('tricep push down', 'Triceps Push Down'),
  ('triceps pull down', 'Triceps Push Down'),
  ('overhead tricep extension', 'Overhead Tricep Press'),
  ('overhead triceps extension', 'Overhead Tricep Press'),
  ('converging chest press', 'Converging Shoulder Press'),
  ('bent over barbell row', 'Bendover Barbell Row'),
  ('lat pulldown', 'Lat Pull'),
  ('lat pull down', 'Lat Pull'),
  ('calves', 'Calf Raise')
on conflict (alias_name) do nothing;

-- 1) Ensure every existing user has every canonical exercise
insert into public.exercises (
  user_id,
  name,
  split,
  muscle_group,
  metric_type,
  sort_order,
  is_active
)
select
  u.user_id,
  c.name,
  c.split::split_type,
  c.muscle_group,
  c.metric_type::exercise_metric_type,
  c.sort_order,
  true
from (
  select distinct user_id
  from public.exercises
) u
cross join canonical_exercises c
where not exists (
  select 1
  from public.exercises e
  where e.user_id = u.user_id
    and lower(e.name) = lower(c.name)
);

-- 2) Re-point workout sets from alias exercise rows to canonical exercise rows
with alias_to_canonical as (
  select
    src.id as source_exercise_id,
    src.user_id,
    tgt.id as target_exercise_id
  from public.exercises src
  join exercise_aliases a
    on lower(src.name) = a.alias_name
  join canonical_exercises c
    on c.name = a.canonical_name
  join public.exercises tgt
    on tgt.user_id = src.user_id
   and lower(tgt.name) = lower(c.name)
  where src.id <> tgt.id
)
update public.workout_sets ws
set exercise_id = m.target_exercise_id
from alias_to_canonical m
where ws.exercise_id = m.source_exercise_id
  and ws.user_id = m.user_id;

-- 3) Remove duplicate alias exercise rows after relinking sets
delete from public.exercises e
using (
  select
    src.id as source_exercise_id
  from public.exercises src
  join exercise_aliases a
    on lower(src.name) = a.alias_name
  join canonical_exercises c
    on c.name = a.canonical_name
  join public.exercises tgt
    on tgt.user_id = src.user_id
   and lower(tgt.name) = lower(c.name)
  where src.id <> tgt.id
) d
where e.id = d.source_exercise_id;

-- 4) Normalize canonical exercise row fields and exact name casing
update public.exercises e
set
  name = c.name,
  split = c.split::split_type,
  muscle_group = c.muscle_group,
  metric_type = c.metric_type::exercise_metric_type,
  sort_order = c.sort_order,
  is_active = true
from canonical_exercises c
where lower(e.name) = lower(c.name);

commit;
