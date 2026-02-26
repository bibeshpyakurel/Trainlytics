-- User profile metadata (display name fields)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text null,
  last_name text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists first_name text null,
  add column if not exists last_name text null,
  add column if not exists avatar_url text null;

create index if not exists idx_profiles_user_id on public.profiles (user_id);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = user_id);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do nothing;

drop policy if exists "profile_avatars_select_public" on storage.objects;
create policy "profile_avatars_select_public"
on storage.objects
for select
using (bucket_id = 'profile-avatars');

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own"
on storage.objects
for update
using (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'profile-avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);
