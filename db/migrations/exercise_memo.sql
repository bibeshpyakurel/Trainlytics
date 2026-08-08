-- Adds a freeform personal note column to each exercise row.
-- The note is user-scoped (exercises already belong to one user).
alter table public.exercises
  add column if not exists memo text null;
