-- Energy metrics foundation
-- Adds profile-level maintenance inputs/output and a daily snapshot table.

alter table public.profiles
  add column if not exists sex text null,
  add column if not exists birth_date date null,
  add column if not exists height_cm numeric null,
  add column if not exists activity_level text null,
  add column if not exists maintenance_method text null default 'mifflin_st_jeor_activity_multiplier',
  add column if not exists maintenance_updated_at timestamptz null,
  add column if not exists maintenance_kcal_current numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_sex_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_sex_check
      check (sex is null or sex::text in ('male', 'female', 'other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_height_cm_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_height_cm_check
      check (height_cm is null or (height_cm > 0 and height_cm <= 300));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_activity_level_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_activity_level_check
      check (
        activity_level is null
        or activity_level::text in ('sedentary', 'light', 'moderate', 'very_active', 'extra_active')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_maintenance_kcal_current_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_maintenance_kcal_current_check
      check (maintenance_kcal_current is null or maintenance_kcal_current >= 0);
  end if;
end $$;

create table if not exists public.daily_energy_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,

  weight_kg numeric null check (weight_kg is null or weight_kg >= 0),
  calories_in_kcal numeric null check (calories_in_kcal is null or calories_in_kcal >= 0),
  active_calories_kcal numeric null check (active_calories_kcal is null or active_calories_kcal >= 0),

  bmi numeric null check (bmi is null or bmi >= 0),
  maintenance_kcal_for_day numeric null check (maintenance_kcal_for_day is null or maintenance_kcal_for_day >= 0),
  total_burn_kcal numeric null check (total_burn_kcal is null or total_burn_kcal >= 0),
  net_calories_kcal numeric null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint daily_energy_metrics_unique_user_date unique (user_id, log_date)
);

create index if not exists daily_energy_metrics_user_date_idx
  on public.daily_energy_metrics (user_id, log_date desc);

drop trigger if exists daily_energy_metrics_set_updated_at on public.daily_energy_metrics;
create trigger daily_energy_metrics_set_updated_at
before update on public.daily_energy_metrics
for each row
execute function public.set_updated_at();

alter table public.daily_energy_metrics enable row level security;

drop policy if exists "daily_energy_select_own" on public.daily_energy_metrics;
create policy "daily_energy_select_own"
on public.daily_energy_metrics for select
using (auth.uid() = user_id);

drop policy if exists "daily_energy_insert_own" on public.daily_energy_metrics;
create policy "daily_energy_insert_own"
on public.daily_energy_metrics for insert
with check (auth.uid() = user_id);

drop policy if exists "daily_energy_update_own" on public.daily_energy_metrics;
create policy "daily_energy_update_own"
on public.daily_energy_metrics for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "daily_energy_delete_own" on public.daily_energy_metrics;
create policy "daily_energy_delete_own"
on public.daily_energy_metrics for delete
using (auth.uid() = user_id);
