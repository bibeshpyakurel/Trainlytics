-- Upgrade profile energy fields from text to enums for stricter data integrity.

do $$ begin
  create type profile_sex_type as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_level_type as enum ('sedentary', 'light', 'moderate', 'very_active', 'extra_active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type maintenance_method_type as enum ('mifflin_st_jeor_activity_multiplier');
exception when duplicate_object then null; end $$;

-- Drop legacy text-based checks before enum conversion.
alter table public.profiles drop constraint if exists profiles_sex_check;
alter table public.profiles drop constraint if exists profiles_activity_level_check;

-- Drop text default first; set enum default after conversion.
alter table public.profiles alter column maintenance_method drop default;

alter table public.profiles
  alter column sex type profile_sex_type
  using (
    case
      when sex::text in ('male', 'female', 'other') then sex::text::profile_sex_type
      else null
    end
  );

alter table public.profiles
  alter column activity_level type activity_level_type
  using (
    case
      when activity_level::text in ('sedentary', 'light', 'moderate', 'very_active', 'extra_active')
        then activity_level::text::activity_level_type
      else null
    end
  );

alter table public.profiles
  alter column maintenance_method type maintenance_method_type
  using (
    case
      when maintenance_method::text = 'mifflin_st_jeor_activity_multiplier'
        then maintenance_method::text::maintenance_method_type
      else 'mifflin_st_jeor_activity_multiplier'::maintenance_method_type
    end
  );

alter table public.profiles
  alter column maintenance_method set default 'mifflin_st_jeor_activity_multiplier'::maintenance_method_type;
