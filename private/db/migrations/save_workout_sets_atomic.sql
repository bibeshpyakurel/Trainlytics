create or replace function public.save_workout_sets_atomic(
  p_session_date date,
  p_split split_type,
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
