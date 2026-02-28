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

## Energy Metric Definitions (Canonical)

Use these names and formulas consistently across backend services, AI prompts, and UI labels.

- `active_calories_kcal`: smartwatch activity-only calories (walking, sports, lifting). Never includes BMR/resting/maintenance.
- `maintenance_kcal`: estimated maintenance baseline (TDEE), computed separately from profile/BMR inputs.
- `total_burn_kcal`: `maintenance_kcal + active_calories_kcal`.
- `net_calories_kcal`: `calories_in_kcal - total_burn_kcal`.

Guardrail: never treat `active_calories_kcal` as total burn.

### Maintenance Formula (Canonical)

- BMR (Mifflin-St Jeor)
  - Male: `10*kg + 6.25*cm - 5*age + 5`
  - Female: `10*kg + 6.25*cm - 5*age - 161`
- TDEE/Maintenance
  - `maintenance_kcal = BMR * activity_multiplier`
  - Activity multipliers:
    - `sedentary = 1.2`
    - `light = 1.375`
    - `moderate = 1.55`
    - `very_active = 1.725`
    - `extra_active = 1.9`

### Forward-Only Backfill Tool

Daily maintenance snapshots are stored in `daily_energy_metrics.maintenance_kcal_for_day`.

Use forward-only backfill after profile formula/input changes:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require" npm run energy:backfill-forward -- --from=2026-01-01
```

Optional single-user run:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require" npm run energy:backfill-forward -- --from=2026-01-01 --user=00000000-0000-0000-0000-000000000000
```

This backfills only from the provided date forward (recommended), preserving older historical snapshots.
