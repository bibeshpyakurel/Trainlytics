-- Adds "Diverging Low Row" to Pull day (Back) directly above the first Pull Up entry.
-- This version matches schema where exercises are per-user (user_id is required).
-- Safe to run multiple times.

with pull_up_per_user as (
  select
    t.user_id,
    t.sort_order,
    t.metric_type
  from (
    select
      user_id,
      sort_order,
      metric_type,
      row_number() over (partition by user_id order by sort_order asc) as rn
    from public.exercises
    where split = 'pull'
      and muscle_group = 'back'
      and (
        lower(name) like '%pull up%'
        or lower(name) like '%pull-up%'
        or replace(lower(name), ' ', '') like '%pullup%'
      )
  ) t
  where t.rn = 1
),
target_users as (
  select p.user_id, p.sort_order
  from pull_up_per_user p
  where not exists (
    select 1
    from public.exercises e
    where e.user_id = p.user_id
      and e.split = 'pull'
      and e.muscle_group = 'back'
      and lower(e.name) = 'diverging low row'
  )
)
update public.exercises e
set sort_order = e.sort_order + 1
from target_users t
where e.user_id = t.user_id
  and e.split = 'pull'
  and e.muscle_group = 'back'
  and e.sort_order >= t.sort_order;

with pull_up_per_user as (
  select
    t.user_id,
    t.sort_order,
    t.metric_type
  from (
    select
      user_id,
      sort_order,
      metric_type,
      row_number() over (partition by user_id order by sort_order asc) as rn
    from public.exercises
    where split = 'pull'
      and muscle_group = 'back'
      and (
        lower(name) like '%pull up%'
        or lower(name) like '%pull-up%'
        or replace(lower(name), ' ', '') like '%pullup%'
      )
  ) t
  where t.rn = 1
)
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
  p.user_id,
  'Diverging Low Row',
  'pull',
  'back',
  coalesce(p.metric_type, 'WEIGHTED_REPS'),
  p.sort_order,
  true
from pull_up_per_user p
where not exists (
  select 1
  from public.exercises e
  where e.user_id = p.user_id
    and e.split = 'pull'
    and e.muscle_group = 'back'
    and lower(e.name) = 'diverging low row'
);
