create table if not exists public.metabolic_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  estimated_kcal_spent numeric not null check (estimated_kcal_spent >= 0),
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint metabolic_activity_logs_unique_user_date unique (user_id, log_date)
);

create index if not exists metabolic_activity_logs_user_date_idx
  on public.metabolic_activity_logs (user_id, log_date desc);

-- Reuse shared updated_at trigger function from calories schema.
drop trigger if exists metabolic_activity_logs_set_updated_at on public.metabolic_activity_logs;
create trigger metabolic_activity_logs_set_updated_at
before update on public.metabolic_activity_logs
for each row
execute function public.set_updated_at();

alter table public.metabolic_activity_logs enable row level security;

drop policy if exists "metabolic_activity_select_own" on public.metabolic_activity_logs;
create policy "metabolic_activity_select_own"
on public.metabolic_activity_logs for select
using (auth.uid() = user_id);

drop policy if exists "metabolic_activity_insert_own" on public.metabolic_activity_logs;
create policy "metabolic_activity_insert_own"
on public.metabolic_activity_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "metabolic_activity_update_own" on public.metabolic_activity_logs;
create policy "metabolic_activity_update_own"
on public.metabolic_activity_logs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "metabolic_activity_delete_own" on public.metabolic_activity_logs;
create policy "metabolic_activity_delete_own"
on public.metabolic_activity_logs for delete
using (auth.uid() = user_id);
