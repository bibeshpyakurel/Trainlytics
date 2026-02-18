-- =========
-- 1) Enums
-- =========
do $$ begin
  create type split_type as enum ('push','pull','legs','core');
exception when duplicate_object then null; end $$;

do $$ begin
  create type unit_type as enum ('kg','lb');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exercise_metric_type as enum ('WEIGHTED_REPS','DURATION');
exception when duplicate_object then null; end $$;

-- =====================
-- 2) Exercises catalog
-- =====================
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  split split_type not null,
  muscle_group text not null,

  metric_type exercise_metric_type not null default 'WEIGHTED_REPS',

  sort_order int not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint exercises_unique_per_user unique (user_id, name)
);

create index if not exists idx_exercises_user_split
  on public.exercises(user_id, split);

-- ==========================
-- 3) Workout sessions (day)
-- ==========================
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  session_date date not null,
  split split_type not null,

  notes text null,
  created_at timestamptz not null default now(),

  constraint workout_sessions_unique unique (user_id, session_date, split)
);

create index if not exists idx_sessions_user_date
  on public.workout_sessions(user_id, session_date);

-- ===========================
-- 4) Workout sets (the log)
-- ===========================
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,

  set_number int not null check (set_number >= 1),

  -- For WEIGHTED_REPS
  reps int null check (reps is null or reps >= 0),

  weight_input numeric null check (weight_input is null or weight_input >= 0),
  unit_input unit_type null,
  weight_kg numeric null check (weight_kg is null or weight_kg >= 0),

  -- For DURATION (e.g., Plank)
  duration_seconds int null check (duration_seconds is null or duration_seconds >= 0),

  created_at timestamptz not null default now(),

  -- Helpful integrity: unit must exist if weight exists
  constraint weight_unit_pair check (
    (weight_input is null and unit_input is null and weight_kg is null)
    or
    (weight_input is not null and unit_input is not null and weight_kg is not null)
  )
);

create index if not exists idx_sets_user_session
  on public.workout_sets(user_id, session_id);

create index if not exists idx_sets_user_exercise_created
  on public.workout_sets(user_id, exercise_id, created_at);

-- ======================
-- 5) Bodyweight tracking
-- ======================
create table if not exists public.bodyweight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  log_date date not null,

  weight_input numeric not null check (weight_input >= 0),
  unit_input unit_type not null,
  weight_kg numeric not null check (weight_kg >= 0),

  notes text null,
  created_at timestamptz not null default now(),

  constraint bodyweight_unique unique (user_id, log_date)
);

create index if not exists idx_bodyweight_user_date
  on public.bodyweight_logs(user_id, log_date);

-- ==========================
-- 6) Row Level Security RLS
-- ==========================
alter table public.exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.bodyweight_logs enable row level security;

-- Exercises policies
drop policy if exists "exercises_select_own" on public.exercises;
create policy "exercises_select_own"
on public.exercises for select
using (auth.uid() = user_id);

drop policy if exists "exercises_insert_own" on public.exercises;
create policy "exercises_insert_own"
on public.exercises for insert
with check (auth.uid() = user_id);

drop policy if exists "exercises_update_own" on public.exercises;
create policy "exercises_update_own"
on public.exercises for update
using (auth.uid() = user_id);

drop policy if exists "exercises_delete_own" on public.exercises;
create policy "exercises_delete_own"
on public.exercises for delete
using (auth.uid() = user_id);

-- Sessions policies
drop policy if exists "sessions_select_own" on public.workout_sessions;
create policy "sessions_select_own"
on public.workout_sessions for select
using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.workout_sessions;
create policy "sessions_insert_own"
on public.workout_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.workout_sessions;
create policy "sessions_update_own"
on public.workout_sessions for update
using (auth.uid() = user_id);

drop policy if exists "sessions_delete_own" on public.workout_sessions;
create policy "sessions_delete_own"
on public.workout_sessions for delete
using (auth.uid() = user_id);

-- Sets policies
drop policy if exists "sets_select_own" on public.workout_sets;
create policy "sets_select_own"
on public.workout_sets for select
using (auth.uid() = user_id);

drop policy if exists "sets_insert_own" on public.workout_sets;
create policy "sets_insert_own"
on public.workout_sets for insert
with check (auth.uid() = user_id);

drop policy if exists "sets_update_own" on public.workout_sets;
create policy "sets_update_own"
on public.workout_sets for update
using (auth.uid() = user_id);

drop policy if exists "sets_delete_own" on public.workout_sets;
create policy "sets_delete_own"
on public.workout_sets for delete
using (auth.uid() = user_id);

-- Bodyweight policies
drop policy if exists "bodyweight_select_own" on public.bodyweight_logs;
create policy "bodyweight_select_own"
on public.bodyweight_logs for select
using (auth.uid() = user_id);

drop policy if exists "bodyweight_insert_own" on public.bodyweight_logs;
create policy "bodyweight_insert_own"
on public.bodyweight_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "bodyweight_update_own" on public.bodyweight_logs;
create policy "bodyweight_update_own"
on public.bodyweight_logs for update
using (auth.uid() = user_id);

drop policy if exists "bodyweight_delete_own" on public.bodyweight_logs;
create policy "bodyweight_delete_own"
on public.bodyweight_logs for delete
using (auth.uid() = user_id);