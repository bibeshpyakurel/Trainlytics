create table if not exists public.calories_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  pre_workout_kcal numeric,
  post_workout_kcal numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calories_logs_non_negative check (
    (pre_workout_kcal is null or pre_workout_kcal >= 0)
    and
    (post_workout_kcal is null or post_workout_kcal >= 0)
  ),

  constraint calories_logs_at_least_one_value check (
    pre_workout_kcal is not null or post_workout_kcal is not null
  ),

  constraint calories_logs_unique_user_date unique (user_id, log_date)
);

create index if not exists calories_logs_user_date_idx
  on public.calories_logs (user_id, log_date desc);

-- Keep updated_at fresh on every update
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calories_logs_set_updated_at on public.calories_logs;
create trigger calories_logs_set_updated_at
before update on public.calories_logs
for each row
execute function public.set_updated_at();

-- Row Level Security
alter table public.calories_logs enable row level security;

drop policy if exists "calories_select_own" on public.calories_logs;
create policy "calories_select_own"
on public.calories_logs for select
using (auth.uid() = user_id);

drop policy if exists "calories_insert_own" on public.calories_logs;
create policy "calories_insert_own"
on public.calories_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "calories_update_own" on public.calories_logs;
create policy "calories_update_own"
on public.calories_logs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "calories_delete_own" on public.calories_logs;
create policy "calories_delete_own"
on public.calories_logs for delete
using (auth.uid() = user_id);
