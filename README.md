# Trainlytics

A full-stack personal fitness tracker focused on consistency, clean data separation per user, and reliable auth flows.

Users can:
- create accounts and verify with OTP
- log workouts by split (`push`, `pull`, `legs`, `core`)
- track bodyweight and calories
- view dashboard/insights trends
- manage profile and sign out safely

## Live Demo

- `https://trainlytics-gold-mu.vercel.app`

## Key Features

- Email/password auth with OTP-based signup verification
- Forgot-password with OTP + new password update flow
- Route guarding for protected pages
- Account-scoped data isolation (Supabase RLS)
- Consistent canonical exercise catalog across users
- Dark theme default
- Basic runtime monitoring for auth/API errors

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- Supabase (Auth, Postgres, Storage, RLS)
- Vitest (unit tests)
- Playwright (auth-critical E2E)

## Project Architecture

- `app/`: routes and API endpoints
- `features/`: feature modules (UI + domain logic)
- `lib/`: shared services/utilities (auth, routes, monitoring, helpers)
- `db/`: schema, migrations, audits, and migration plan
- `scripts/db/`: DB plan runner + validator
- `e2e/`: Playwright test suite

### System Diagram

```mermaid
flowchart LR
  U[User Browser] --> N[Next.js App Router]
  N --> P[proxy.ts Route Guard]
  P -->|Public| A[Auth Pages<br/>/login /signup /forgot-password]
  P -->|Protected| F[Feature Pages<br/>dashboard/log/bodyweight/calories/profile/insights]

  A --> SC[lib/supabaseClient]
  F --> SC
  SC --> SA[(Supabase Auth)]
  SC --> SD[(Supabase Postgres + RLS)]
  SC --> SS[(Supabase Storage)]

  F --> API1["/api/auth/account-status"]
  F --> API2["/api/insights-ai"]
  A --> API1
  API1 --> SA
  API2 --> OAI[(OpenAI API)]

  N --> MON["/api/monitoring/error"]
  A --> MON
  F --> MON
```

### Runtime Flow

1. Requests hit `proxy.ts`, which enforces public vs protected route access.
2. Client pages use `lib/supabaseClient` for auth/session and user-scoped data operations.
3. Supabase RLS policies enforce per-user data isolation in database tables.
4. Server APIs handle privileged checks (`/api/auth/account-status`) and optional AI insights (`/api/insights-ai`).
5. Client and server runtime errors are reported to monitoring logs via `/api/monitoring/error`.

## Route Contract

Public:
- `/login`
- `/signup`
- `/forgot-password`

Protected:
- `/launch`
- `/dashboard`
- `/insights`
- `/log`
- `/bodyweight`
- `/calories`
- `/profile`

Other:
- `/signout`
- `/` redirects to `/dashboard`

Route rules are centralized in `lib/routes.ts` and enforced in `proxy.ts`.

## Environment Variables

Create `.env.local`:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Optional (needed only for Insights AI chat)
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Notes:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser/client code.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be the anon key, not service role.

## Local Setup

```bash
npm install
npm run dev
```

App runs at:
- `http://localhost:3000`

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run check
```

CI runs:
- lint
- typecheck
- unit tests
- DB plan validation

## Database Workflow

Canonical order is defined in `db/plan.json`.

Validate plan:

```bash
npm run db:check-plan
```

Apply schema + migrations:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require" npm run db:migrate
```

Run audits (read-only) in Supabase SQL Editor:
- `db/audit/rls_policy_audit.sql`
- `db/audit/validate_exercise_catalog.sql`

See:
- `db/README.md`

## E2E Tests

Auth-critical spec:
- `e2e/auth.spec.mjs`

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

## Monitoring

Basic built-in monitoring is enabled:
- client runtime errors (`window.error`, `unhandledrejection`)
- auth flow failure events
- server-side API error logs

Endpoint:
- `POST /api/monitoring/error`

View logs:
- local terminal (`npm run dev`)
- deployment logs (for example Vercel function logs)

## Deployment (Vercel)

1. Push code to GitHub.
2. Import repo in Vercel.
3. Add required env vars in Vercel Project Settings.
4. Deploy with `npm run build`.
5. Run DB workflow:
   - `npm run db:check-plan`
   - `npm run db:migrate`
6. Run post-deploy smoke tests:
   - signup/login/logout
   - forgot-password OTP flow
   - protected-route redirect behavior
   - log workout + data isolation across users

## Security

- Keep all secrets in environment variables only.
- Never commit `.env.local`.
- Keep RLS enabled on all app-used tables.
- Do not return raw provider error bodies from API routes.

## Roadmap

- Add full CI E2E run
- Improve observability dashboards/alerts
- Add optional OAuth providers
- Expand insights and trend visualizations
