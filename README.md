# Gym Tracker

Gym Tracker is a Next.js + Supabase app for workout logging, bodyweight/calorie tracking, profile management, and AI-driven insights.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase (Auth, Postgres, Storage, RLS)
- Vitest (unit tests)
- Playwright (E2E; optional local setup)

## Project Structure

- `app/`: routes and API handlers
- `features/`: feature modules (UI + feature logic)
- `lib/`: shared infrastructure/utilities
- `db/`: SQL schema, migrations, audits, and migration plan
- `scripts/db/`: DB plan runner and validator
- `e2e/`: Playwright end-to-end tests

## Routes

Public routes:
- `/login`
- `/signup`
- `/forgot-password`

Protected routes:
- `/launch`
- `/dashboard`
- `/insights`
- `/log`
- `/bodyweight`
- `/calories`
- `/profile`

Other:
- `/signout` (sign-out flow)
- `/` redirects to `/dashboard` (proxy handles auth redirect if session is missing)

Route access control is centralized in `lib/routes.ts` and enforced in `proxy.ts`.

## Auth Flow

- Email/password sign-up and sign-in
- Signup includes OTP verification flow (`verifyOtp` for `type: "signup"`)
- Forgot password uses OTP (`signInWithOtp` with `shouldCreateUser: false`) + password update
- Sign-out clears account-scoped client state and redirects to login

Optional server-side account existence checks are provided by:
- `POST /api/auth/account-status`

This endpoint requires `SUPABASE_SERVICE_ROLE_KEY` on the server.

## Environment Variables

Create `.env.local`:

```bash
# Required (client + server)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Required only for account-status API checks
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Required only for AI Insights API
OPENAI_API_KEY=YOUR_OPENAI_API_KEY

# Optional AI overrides
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Notes:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
- `lib/env.client.ts` rejects obviously unsafe keys in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Local Development

Install and run:

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

## Quality Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run check
```

CI (`.github/workflows/ci.yml`) runs:
- lint
- typecheck
- unit tests
- DB plan validation

## Database Workflow

Migration order is defined in `db/plan.json`.

Validate plan coverage/order:

```bash
npm run db:check-plan
```

Apply schema + migrations in canonical order:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require" npm run db:migrate
```

After migration, run audit SQL manually in Supabase SQL Editor:
- `db/audit/rls_policy_audit.sql`
- `db/audit/validate_exercise_catalog.sql`

Reference:
- `db/README.md`

## E2E Tests (Auth-Critical)

Specs: `e2e/auth.spec.mjs`

Covered paths:
- protected route redirects to login
- `next` redirect parameter preservation
- login page navigation to signup/forgot-password
- signup client-side validation
- forgot-password client-side validation

Setup:

```bash
npm install -D @playwright/test
npm run e2e:install
```

Run:

```bash
npm run e2e
npm run e2e:headed
```

## Runtime Monitoring (Basic)

This project includes lightweight built-in monitoring for auth/API runtime failures:

- Client-side:
  - Global capture of `window.error` and `unhandledrejection`
  - Auth flow error reports from login/signup/forgot-password
  - Reports sent to `POST /api/monitoring/error`
- Server-side:
  - Structured error logging in key API routes (`/api/auth/account-status`, `/api/insights-ai`)

Where to view:
- Local: terminal running `npm run dev`
- Production: host platform logs (for example, Vercel function logs)

Note:
- Monitoring payloads are sanitized and should not include passwords/tokens.

## Deployment Checklist

1. Confirm env vars are set in target environment:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (if using account-status checks)
   - `OPENAI_API_KEY` (if using insights AI)
2. Run `npm run check`.
3. Run `npm run db:check-plan`.
4. Run `npm run db:migrate` against staging.
5. Run DB audit SQL queries and review results.
6. Smoke test auth flows in staging:
   - signup OTP
   - login/logout
   - forgot-password OTP + update password
   - protected route redirects
7. Deploy app.
8. Run `npm run db:migrate` in production.
9. Re-run smoke tests in production.

## Security Notes

- Do not commit `.env.local` or any secret keys.
- Do not use service-role key in browser/client code.
- Keep RLS enabled for all app-used tables.
