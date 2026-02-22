# Database Scripts

This folder is organized by purpose:

- `db/schema/`: base tables, constraints, triggers, and RLS policies.
- `db/migrations/`: one-time or incremental data/catalog adjustments.
- `db/audit/`: read-only checks and validation queries.

## Suggested run order (new setup)

1. `db/schema/workout_bodyweight.sql`
2. `db/schema/calories_logs.sql`
3. `db/schema/profiles.sql`

## Existing project maintenance

- Normalize exercise catalog: `db/migrations/normalize_exercises_catalog.sql`
- Optionally archive legacy duplicates: `db/migrations/archive_legacy_duplicate_exercises.sql`
- Audit RLS/policies: `db/audit/rls_policy_audit.sql`
- Validate exercise consistency: `db/audit/validate_exercise_catalog.sql`

## Feature migrations

- `db/migrations/push_day_add_cable_lateral_raises.sql`
- `db/migrations/pull_day_add_diverging_low_row.sql`

## Safety notes

- Files in `db/audit/` are read-only checks.
- Most migration files are intended to be idempotent.
- Always run migrations in a staging/dev project first when possible.
