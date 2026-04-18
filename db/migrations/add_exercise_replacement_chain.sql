-- Add replacement chain support to exercises table.
-- replaced_by_exercise_id is nullable; set only when archiving with a replacement.
-- The FK is self-referential; both sides must belong to the same user (enforced at app layer).

alter table public.exercises
  add column if not exists replaced_by_exercise_id uuid null
    references public.exercises(id) on delete set null;

-- Index to efficiently walk the chain forward:
-- "which exercises were replaced by this one?"
create index if not exists idx_exercises_replaced_by
  on public.exercises(replaced_by_exercise_id)
  where replaced_by_exercise_id is not null;

comment on column public.exercises.replaced_by_exercise_id is
  'When archiving an exercise, optionally point to its replacement. '
  'The dashboard uses this chain to merge historical sets under the current exercise name.';
