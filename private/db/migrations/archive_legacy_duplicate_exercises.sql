-- Optional safety migration: archive/disable legacy duplicate exercise rows
-- instead of deleting them.
--
-- Use this when you want to keep old rows for audit/history but hide them
-- from active exercise selection.
--
-- This script:
-- 1) Builds canonical + alias mapping.
-- 2) Finds alias rows where a canonical row already exists for the same user.
-- 3) Sets those alias rows to is_active = false.
--
-- Non-destructive: no delete on exercises/workout_sets.

begin;

create temporary table canonical_exercises (
  name text primary key
) on commit drop;

insert into canonical_exercises (name)
values
  ('Incline Bench Press'),
  ('Triceps Push Down'),
  ('Barbell Shoulder Press'),
  ('Cable Lateral Raises'),
  ('Pec Fly'),
  ('Overhead Tricep Press'),
  ('Converging Shoulder Press'),
  ('Bendover Barbell Row'),
  ('Diverging Low Row'),
  ('Pull Up'),
  ('Hammer Curl'),
  ('Upper Back Row'),
  ('Preacher Curl'),
  ('Lat Pull'),
  ('Squat'),
  ('Romanian Deadlift'),
  ('Leg Extension'),
  ('Leg Curl'),
  ('Prone Leg Curl'),
  ('Calf Raise'),
  ('Plank'),
  ('Weighted Leg Raises'),
  ('Dumbbell Crunches');

create temporary table exercise_aliases (
  alias_name text primary key,
  canonical_name text not null
) on commit drop;

insert into exercise_aliases (alias_name, canonical_name)
select lower(name), name
from canonical_exercises;

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

with alias_rows as (
  select
    src.id as alias_id
  from public.exercises src
  join exercise_aliases a
    on lower(src.name) = a.alias_name
  join public.exercises canonical
    on canonical.user_id = src.user_id
   and lower(canonical.name) = lower(a.canonical_name)
  where src.id <> canonical.id
)
update public.exercises e
set is_active = false
from alias_rows ar
where e.id = ar.alias_id
  and e.is_active = true;

commit;
