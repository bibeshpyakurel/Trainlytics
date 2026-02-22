-- RLS policy audit for app-used tables.
-- Run in Supabase SQL editor to verify every table has RLS enabled
-- and has select/insert/update/delete owner policies.

with app_tables as (
  select unnest(
    array[
      'exercises',
      'workout_sessions',
      'workout_sets',
      'bodyweight_logs',
      'calories_logs',
      'profiles'
    ]
  )::text as table_name
),
table_rls as (
  select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
),
policy_summary as (
  select
    tablename as table_name,
    bool_or(cmd = 'SELECT') as has_select_policy,
    bool_or(cmd = 'INSERT') as has_insert_policy,
    bool_or(cmd = 'UPDATE') as has_update_policy,
    bool_or(cmd = 'DELETE') as has_delete_policy
  from pg_policies
  where schemaname = 'public'
  group by tablename
)
select
  t.table_name,
  coalesce(r.rls_enabled, false) as rls_enabled,
  coalesce(p.has_select_policy, false) as has_select_policy,
  coalesce(p.has_insert_policy, false) as has_insert_policy,
  coalesce(p.has_update_policy, false) as has_update_policy,
  coalesce(p.has_delete_policy, false) as has_delete_policy
from app_tables t
left join table_rls r on r.table_name = t.table_name
left join policy_summary p on p.table_name = t.table_name
order by t.table_name;
