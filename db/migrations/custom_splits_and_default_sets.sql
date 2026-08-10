-- Lets users define their own training days instead of the fixed push/pull/legs/core,
-- and lets each exercise remember how many sets that user actually does.
--
-- Idempotent and safe to run multiple times. Must stay LAST in db/plan.json:
-- earlier migrations still cast to split_type, so a fresh apply has to create the
-- enum, run those, and only then convert the columns to text.

-- ==========================================
-- 1) Per-exercise default set count (min 1)
-- ==========================================
alter table public.exercises
  add column if not exists default_sets int not null default 2;

do $$ begin
  alter table public.exercises
    add constraint exercises_default_sets_min_one check (default_sets >= 1);
exception when duplicate_object then null; end $$;

-- ================================================
-- 2) split: enum -> text (arbitrary user-defined)
-- ================================================
-- The atomic save names split_type in its signature, so it has to go before the
-- type can be dropped. It is recreated against text in section 5 below.
drop function if exists public.save_workout_sets_atomic(date, split_type, jsonb);
drop function if exists public.save_workout_sets_atomic(date, text, jsonb);

do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'exercises'
      and column_name = 'split' and udt_name = 'split_type'
  ) then
    alter table public.exercises alter column split type text using split::text;
    alter table public.workout_sessions alter column split type text using split::text;
  end if;
end $$;

drop type if exists split_type;

-- ==============================
-- 3) Per-user catalog of splits
-- ==============================
create table if not exists public.user_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  constraint user_splits_unique_per_user unique (user_id, name)
);

create index if not exists idx_user_splits_user_order
  on public.user_splits(user_id, sort_order);

-- ==================
-- 4) RLS for splits
-- ==================
alter table public.user_splits enable row level security;

drop policy if exists "user_splits_select_own" on public.user_splits;
create policy "user_splits_select_own"
on public.user_splits for select
using (auth.uid() = user_id);

drop policy if exists "user_splits_insert_own" on public.user_splits;
create policy "user_splits_insert_own"
on public.user_splits for insert
with check (auth.uid() = user_id);

drop policy if exists "user_splits_update_own" on public.user_splits;
create policy "user_splits_update_own"
on public.user_splits for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_splits_delete_own" on public.user_splits;
create policy "user_splits_delete_own"
on public.user_splits for delete
using (auth.uid() = user_id);

-- =========================================================
-- 5) Backfill: every user keeps the splits they already use
-- =========================================================
insert into public.user_splits (user_id, name, sort_order)
select
  src.user_id,
  src.split,
  case src.split
    when 'push' then 1
    when 'pull' then 2
    when 'legs' then 3
    when 'core' then 4
    else 5
  end
from (
  select distinct user_id, split from public.exercises
  union
  select distinct user_id, split from public.workout_sessions
) as src
on conflict (user_id, name) do nothing;

-- ==================================================
-- 6) Recreate the atomic save with a text split arg
-- ==================================================
create or replace function public.save_workout_sets_atomic(
  p_session_date date,
  p_split text,
  p_rows jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_session_id uuid;
  v_row_count int;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_split is null or btrim(p_split) = '' then
    raise exception 'A split is required';
  end if;

  if p_rows is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one set row is required';
  end if;

  insert into public.workout_sessions (user_id, session_date, split)
  values (v_user_id, p_session_date, p_split)
  on conflict (user_id, session_date, split)
  do update set session_date = excluded.session_date
  returning id into v_session_id;

  delete from public.workout_sets
  where user_id = v_user_id
    and session_id = v_session_id;

  insert into public.workout_sets (
    user_id,
    session_id,
    exercise_id,
    set_number,
    reps,
    weight_input,
    unit_input,
    weight_kg,
    duration_seconds
  )
  select
    v_user_id,
    v_session_id,
    (row->>'exercise_id')::uuid,
    (row->>'set_number')::int,
    nullif(row->>'reps', '')::int,
    nullif(row->>'weight_input', '')::numeric,
    nullif(row->>'unit_input', '')::unit_type,
    nullif(row->>'weight_kg', '')::numeric,
    nullif(row->>'duration_seconds', '')::int
  from jsonb_array_elements(p_rows) as row;

  get diagnostics v_row_count = row_count;

  return jsonb_build_object(
    'session_id', v_session_id,
    'set_count', v_row_count
  );
end;
$$;
