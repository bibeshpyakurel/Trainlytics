-- Validation query after exercise normalization/archive migrations.
-- Run in Supabase SQL Editor.

with canonical as (
  select * from (values
    ('Incline Bench Press','push','chest',1),
    ('Triceps Push Down','push','triceps',2),
    ('Barbell Shoulder Press','push','shoulders',3),
    ('Cable Lateral Raises','push','shoulders',4),
    ('Pec Fly','push','chest',5),
    ('Overhead Tricep Press','push','triceps',6),
    ('Converging Shoulder Press','push','shoulders',7),

    ('Bendover Barbell Row','pull','back',1),
    ('Diverging Low Row','pull','back',2),
    ('Pull Up','pull','back',3),
    ('Hammer Curl','pull','biceps',4),
    ('Upper Back Row','pull','back',5),
    ('Preacher Curl','pull','biceps',6),
    ('Lat Pull','pull','back',7),

    ('Squat','legs','quads',1),
    ('Romanian Deadlift','legs','hamstrings',2),
    ('Leg Extension','legs','quads',3),
    ('Leg Curl','legs','hamstrings',4),
    ('Prone Leg Curl','legs','hamstrings',5),
    ('Calf Raise','legs','calves',6),

    ('Plank','core','core',1),
    ('Weighted Leg Raises','core','core',2),
    ('Dumbbell Crunches','core','core',3)
  ) as t(name, split, muscle_group, sort_order)
),
active_rows as (
  select
    e.user_id,
    e.id,
    e.name,
    e.split::text as split,
    e.muscle_group,
    e.sort_order
  from public.exercises e
  where e.is_active = true
),
non_canonical_active as (
  select a.*
  from active_rows a
  left join canonical c
    on lower(c.name) = lower(a.name)
  where c.name is null
),
canonical_mismatch as (
  select a.*
  from active_rows a
  join canonical c
    on lower(c.name) = lower(a.name)
  where a.split <> c.split
     or lower(a.muscle_group) <> lower(c.muscle_group)
     or a.sort_order <> c.sort_order
),
duplicate_active_names as (
  select
    user_id,
    lower(name) as name_key,
    count(*) as ct
  from active_rows
  group by user_id, lower(name)
  having count(*) > 1
),
duplicate_active_sort as (
  select
    user_id,
    split,
    sort_order,
    count(*) as ct
  from active_rows
  group by user_id, split, sort_order
  having count(*) > 1
),
missing_canonical as (
  select
    u.user_id,
    c.name
  from (select distinct user_id from public.exercises) u
  cross join canonical c
  left join active_rows a
    on a.user_id = u.user_id
   and lower(a.name) = lower(c.name)
  where a.id is null
),
summary as (
  select 'non_canonical_active' as check_name, count(*)::bigint as issue_count from non_canonical_active
  union all
  select 'canonical_mismatch', count(*)::bigint from canonical_mismatch
  union all
  select 'duplicate_active_names', count(*)::bigint from duplicate_active_names
  union all
  select 'duplicate_active_sort', count(*)::bigint from duplicate_active_sort
  union all
  select 'missing_canonical', count(*)::bigint from missing_canonical
)
select *
from summary
order by check_name;
