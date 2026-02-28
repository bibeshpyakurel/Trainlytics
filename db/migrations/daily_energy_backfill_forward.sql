-- Forward-only backfill helper for daily_energy_metrics snapshots.
-- Recomputes from a given date onward, optionally for a single user.

create or replace function public.backfill_daily_energy_metrics_forward(
  p_from_date date,
  p_user_id uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_rows_upserted integer := 0;
begin
  if p_from_date is null then
    raise exception 'p_from_date is required';
  end if;

  with source_dates as (
    select user_id, log_date
    from public.bodyweight_logs
    where log_date >= p_from_date
      and (p_user_id is null or user_id = p_user_id)
    union
    select user_id, log_date
    from public.calories_logs
    where log_date >= p_from_date
      and (p_user_id is null or user_id = p_user_id)
    union
    select user_id, log_date
    from public.metabolic_activity_logs
    where log_date >= p_from_date
      and (p_user_id is null or user_id = p_user_id)
  ),
  prepared as (
    select
      d.user_id,
      d.log_date,
      bw.weight_kg::numeric as weight_kg,
      case
        when cl.pre_workout_kcal is null and cl.post_workout_kcal is null then null
        else coalesce(cl.pre_workout_kcal, 0)::numeric + coalesce(cl.post_workout_kcal, 0)::numeric
      end as calories_in_kcal,
      mal.estimated_kcal_spent::numeric as active_calories_kcal,
      case
        when pr.sex::text in ('male', 'female')
          and pr.birth_date is not null
          and pr.height_cm is not null and pr.height_cm > 0
          and bw.weight_kg is not null and bw.weight_kg > 0
          and pr.activity_level is not null
        then (
          (
            10 * bw.weight_kg::numeric
            + 6.25 * pr.height_cm::numeric
            - 5 * extract(year from age(d.log_date::timestamp, pr.birth_date::timestamp))::numeric
            + case when pr.sex::text = 'male' then 5 else -161 end
          )
          *
          (
            case pr.activity_level::text
              when 'sedentary' then 1.2
              when 'light' then 1.375
              when 'moderate' then 1.55
              when 'very_active' then 1.725
              when 'extra_active' then 1.9
              else null
            end
          )
        )
        else null
      end as maintenance_kcal_for_day,
      case
        when bw.weight_kg is not null and bw.weight_kg > 0 and pr.height_cm is not null and pr.height_cm > 0
          then bw.weight_kg::numeric / power((pr.height_cm::numeric / 100), 2)
        else null
      end as bmi
    from source_dates d
    left join public.bodyweight_logs bw
      on bw.user_id = d.user_id and bw.log_date = d.log_date
    left join public.calories_logs cl
      on cl.user_id = d.user_id and cl.log_date = d.log_date
    left join public.metabolic_activity_logs mal
      on mal.user_id = d.user_id and mal.log_date = d.log_date
    left join public.profiles pr
      on pr.user_id = d.user_id
  ),
  finalized as (
    select
      p.user_id,
      p.log_date,
      p.weight_kg,
      p.calories_in_kcal,
      p.active_calories_kcal,
      p.bmi,
      p.maintenance_kcal_for_day,
      case
        when p.maintenance_kcal_for_day is not null and p.active_calories_kcal is not null
          then p.maintenance_kcal_for_day + p.active_calories_kcal
        else null
      end as total_burn_kcal,
      case
        when p.calories_in_kcal is not null
             and p.maintenance_kcal_for_day is not null
             and p.active_calories_kcal is not null
          then p.calories_in_kcal - (p.maintenance_kcal_for_day + p.active_calories_kcal)
        else null
      end as net_calories_kcal
    from prepared p
  )
  insert into public.daily_energy_metrics (
    user_id,
    log_date,
    weight_kg,
    calories_in_kcal,
    active_calories_kcal,
    bmi,
    maintenance_kcal_for_day,
    total_burn_kcal,
    net_calories_kcal
  )
  select
    f.user_id,
    f.log_date,
    f.weight_kg,
    f.calories_in_kcal,
    f.active_calories_kcal,
    f.bmi,
    f.maintenance_kcal_for_day,
    f.total_burn_kcal,
    f.net_calories_kcal
  from finalized f
  on conflict (user_id, log_date)
  do update set
    weight_kg = excluded.weight_kg,
    calories_in_kcal = excluded.calories_in_kcal,
    active_calories_kcal = excluded.active_calories_kcal,
    bmi = excluded.bmi,
    maintenance_kcal_for_day = excluded.maintenance_kcal_for_day,
    total_burn_kcal = excluded.total_burn_kcal,
    net_calories_kcal = excluded.net_calories_kcal,
    updated_at = now();

  get diagnostics v_rows_upserted = row_count;
  return v_rows_upserted;
end;
$$;
