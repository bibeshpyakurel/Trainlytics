-- Adds "Cable Lateral Raises" to Push day under each user's existing shoulder section.
-- Ensures it appears directly after "Barbell Shoulder Press" when present,
-- otherwise appends it to the end of Push for that user.
-- Safe to run multiple times.

with push_users as (
  select distinct e.user_id
  from public.exercises e
  where e.split = 'push'
),
shoulder_group_label as (
  select
    t.user_id,
    t.muscle_group
  from (
    selectn
      e.user_id,
      e.muscle_group,
      row_number() over (partition by e.user_id order by e.sort_order asc) as rn
    from public.exercises e
    where e.split = 'push'
      and lower(e.muscle_group) like 'shoulder%'
  ) t
  where t.rn = 1
),
barbell_shoulder_anchor as (
  select
    t.user_id,
    t.sort_order
  from (
    select
      e.user_id,
      e.sort_order,
      row_number() over (partition by e.user_id order by e.sort_order asc) as rn
    from public.exercises e
    where e.split = 'push'
      and lower(e.name) like '%barbell shoulder%'
  ) t
  where t.rn = 1
),
target_position as (
  select
    u.user_id,
    coalesce(s.muscle_group, 'Shoulders') as target_muscle_group,
    coalesce(
      a.sort_order + 1,
      (
        select coalesce(max(e2.sort_order), -1) + 1
        from public.exercises e2
        where e2.user_id = u.user_id
          and e2.split = 'push'
      )
    ) as target_sort_order
  from push_users u
  left join shoulder_group_label s on s.user_id = u.user_id
  left join barbell_shoulder_anchor a on a.user_id = u.user_id
),
cable_state as (
  select
    t.user_id,
    t.target_muscle_group,
    t.target_sort_order,
    c.id as cable_id,
    c.sort_order as cable_sort_order,
    c.split as cable_split,
    c.muscle_group as cable_muscle_group,
    c.metric_type as cable_metric_type,
    c.is_active as cable_is_active
  from target_position t
  left join public.exercises c
    on c.user_id = t.user_id
   and lower(c.name) = 'cable lateral raises'
),
needs_reposition as (
  select *
  from cable_state cs
  where cs.cable_id is null
     or cs.cable_split <> 'push'
      or lower(cs.cable_muscle_group) <> lower(cs.target_muscle_group)
     or cs.cable_metric_type <> 'WEIGHTED_REPS'
     or cs.cable_is_active = false
     or cs.cable_sort_order <> cs.target_sort_order
)
update public.exercises e
set sort_order = e.sort_order + 1
from needs_reposition n
where e.user_id = n.user_id
  and e.split = 'push'
  and lower(e.name) <> 'cable lateral raises'
  and e.sort_order >= n.target_sort_order;

with push_users as (
  select distinct e.user_id
  from public.exercises e
  where e.split = 'push'
),
shoulder_group_label as (
  select
    t.user_id,
    t.muscle_group
  from (
    select
      e.user_id,
      e.muscle_group,
      row_number() over (partition by e.user_id order by e.sort_order asc) as rn
    from public.exercises e
    where e.split = 'push'
      and lower(e.muscle_group) like 'shoulder%'
  ) t
  where t.rn = 1
),
barbell_shoulder_anchor as (
  select
    t.user_id,
    t.sort_order
  from (
    select
      e.user_id,
      e.sort_order,
      row_number() over (partition by e.user_id order by e.sort_order asc) as rn
    from public.exercises e
    where e.split = 'push'
      and lower(e.name) like '%barbell shoulder%'
  ) t
  where t.rn = 1
),
target_position as (
  select
    u.user_id,
    coalesce(s.muscle_group, 'Shoulders') as target_muscle_group,
    coalesce(
      a.sort_order + 1,
      (
        select coalesce(max(e2.sort_order), -1) + 1
        from public.exercises e2
        where e2.user_id = u.user_id
          and e2.split = 'push'
      )
    ) as target_sort_order
  from push_users u
  left join shoulder_group_label s on s.user_id = u.user_id
  left join barbell_shoulder_anchor a on a.user_id = u.user_id
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
  t.user_id,
  'Cable Lateral Raises',
  'push',
  t.target_muscle_group,
  'WEIGHTED_REPS',
  t.target_sort_order,
  true
from target_position t
where not exists (
  select 1
  from public.exercises e
  where e.user_id = t.user_id
    and lower(e.name) = 'cable lateral raises'
);

with push_users as (
  select distinct e.user_id
  from public.exercises e
  where e.split = 'push'
),
shoulder_group_label as (
  select
    t.user_id,
    t.muscle_group
  from (
    select
      e.user_id,
      e.muscle_group,
      row_number() over (partition by e.user_id order by e.sort_order asc) as rn
    from public.exercises e
    where e.split = 'push'
      and lower(e.muscle_group) like 'shoulder%'
  ) t
  where t.rn = 1
),
barbell_shoulder_anchor as (
  select
    t.user_id,
    t.sort_order
  from (
    select
      e.user_id,
      e.sort_order,
      row_number() over (partition by e.user_id order by e.sort_order asc) as rn
    from public.exercises e
    where e.split = 'push'
      and lower(e.name) like '%barbell shoulder%'
  ) t
  where t.rn = 1
),
target_position as (
  select
    u.user_id,
    coalesce(s.muscle_group, 'Shoulders') as target_muscle_group,
    coalesce(
      a.sort_order + 1,
      (
        select coalesce(max(e2.sort_order), -1) + 1
        from public.exercises e2
        where e2.user_id = u.user_id
          and e2.split = 'push'
      )
    ) as target_sort_order
  from push_users u
  left join shoulder_group_label s on s.user_id = u.user_id
  left join barbell_shoulder_anchor a on a.user_id = u.user_id
)
update public.exercises e
set
  split = 'push',
  muscle_group = t.target_muscle_group,
  metric_type = 'WEIGHTED_REPS',
  sort_order = t.target_sort_order,
  is_active = true
from target_position t
where e.user_id = t.user_id
  and lower(e.name) = 'cable lateral raises'
  and (
    e.split <> 'push'
    or lower(e.muscle_group) <> lower(t.target_muscle_group)
    or e.metric_type <> 'WEIGHTED_REPS'
    or e.sort_order <> t.target_sort_order
    or e.is_active = false
  );
