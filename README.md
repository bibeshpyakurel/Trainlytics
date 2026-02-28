# Trainlytics

<p align="center">
  <strong>A focused fitness tracker for consistent training, clean per-user data boundaries, and reliable auth flows.</strong>
</p>

<p align="center">
  <a href="https://trainlytics-gold-mu.vercel.app">Live Demo</a>
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20RLS-3ECF8E?logo=supabase&logoColor=white" />
</p>

## Why Trainlytics

Trainlytics is built for lifters who want low-friction tracking and trustworthy data isolation.

- OTP-backed signup and password reset flows
- Workout logging by split (`push`, `pull`, `legs`, `core`)
- Bodyweight and calorie tracking
- Dashboard and insights trends
- Strong route guarding + Supabase RLS isolation
- Built-in monitoring endpoint for runtime/auth/API issues

## Table of Contents

- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Route Contract](#route-contract)
- [Quality Checks](#quality-checks)
- [Database Workflow](#database-workflow)
- [E2E Tests](#e2e-tests)
- [Monitoring](#monitoring)
- [Deployment (Vercel)](#deployment-vercel)
- [Security](#security)
- [Roadmap](#roadmap)

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- Supabase (Auth, Postgres, Storage, RLS)
- Vitest (unit tests)
- Playwright (auth-critical E2E)

## Quick Start

```bash
npm install
npm run dev
```

App URL: `http://localhost:3000`

## Environment Variables

Create `.env.local`:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Optional (Insights AI chat only)
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser/client code.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be your anon key, not service role.

## Architecture

Core directories:

- `app/` routes and API endpoints
- `features/` feature modules (UI + domain logic)
- `lib/` shared services/utilities (auth, routes, monitoring, helpers)
- `db/` schema, migrations, audits, migration plan
- `scripts/db/` DB plan runner + validator
- `e2e/` Playwright suite

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

  F --> API2["/api/insights-ai"]
  API2 --> OAI[(OpenAI API)]

  N --> MON["/api/monitoring/error"]
  A --> MON
  F --> MON
```

### Runtime Flow

1. Requests hit `proxy.ts`, enforcing public/protected route access.
2. Client pages use `lib/supabaseClient` for auth/session and scoped data.
3. Supabase RLS policies enforce per-user table isolation.
4. Server routes handle optional AI insights and operational monitoring.
5. Client/server runtime errors are reported via `/api/monitoring/error`.

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

Canonical execution order is defined in `db/plan.json`.

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

See `db/README.md` for details.

## E2E Tests

Auth-critical spec: `e2e/auth.spec.mjs`

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

Built-in monitoring captures:

- Client runtime errors (`window.error`, `unhandledrejection`)
- Auth flow failures
- Server API error logs

Endpoint: `POST /api/monitoring/error`

Where to view logs:

- Local terminal (`npm run dev`)
- Deployment logs (for example Vercel function logs)

## Deployment (Vercel)

1. Push code to GitHub.
2. Import repo in Vercel.
3. Add required environment variables in project settings.
4. Deploy with `npm run build`.
5. Run DB checks and migrations:
   - `npm run db:check-plan`
   - `npm run db:migrate`
6. Run post-deploy smoke tests:
   - signup/login/logout
   - forgot-password OTP flow
   - protected-route redirect behavior
   - workout logging and cross-user isolation

## Security

- Keep secrets in environment variables only.
- Never commit `.env.local`.
- Keep RLS enabled on all application tables.
- Do not return raw provider error bodies from API routes.

## Roadmap

- Add full CI E2E run
- Improve observability dashboards/alerts
- Add optional OAuth providers
- Expand insights and trend visualizations
