# Database Scripts

This folder is organized by purpose:

- `db/schema/`: base tables, constraints, triggers, and RLS policies.
- `db/migrations/`: one-time or incremental data/catalog adjustments.
- `db/audit/`: read-only checks and validation queries.
- `db/plan.json`: canonical apply order for schema + migrations.

## Single command workflow

Validate plan:

```bash
npm run db:check-plan
```

Apply plan in canonical order:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require" npm run db:migrate
```

`db:migrate` executes every file listed in `db/plan.json` in order.

## Canonical run order

1. `db/schema/workout_bodyweight.sql`
2. `db/schema/calories_logs.sql`
3. `db/schema/profiles.sql`
4. `db/migrations/push_day_add_cable_lateral_raises.sql`
5. `db/migrations/pull_day_add_diverging_low_row.sql`
6. `db/migrations/normalize_exercises_catalog.sql`
7. `db/migrations/archive_legacy_duplicate_exercises.sql`

## Post-migration audits (manual, read-only)

1. `db/audit/rls_policy_audit.sql`
2. `db/audit/validate_exercise_catalog.sql`

## Safety notes

- Files in `db/audit/` are read-only checks.
- Most migration files are intended to be idempotent.
- Always run migrations in a staging/dev project first when possible.
