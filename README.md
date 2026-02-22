This is a [Next.js](https://nextjs.org) gym tracking app.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Architecture

- `app/*/page.tsx` contains thin route shells.
- `features/*` contains feature-first modules (UI pages/components, types, services, and pure view/summary logic).
- `lib/*` contains cross-feature shared infrastructure/utilities (for example Supabase client and unit conversion).

Current feature folders:

- `features/log`
- `features/bodyweight`

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
```

A CI workflow runs lint, typecheck, and unit tests on every pull request.

## Insights AI setup

To enable API-backed AI chat on the Insights page, add these env vars:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
# Optional, for OpenAI-compatible providers (Perplexity-compatible gateways, etc.)
OPENAI_BASE_URL=https://api.openai.com/v1
```

Then restart the dev server.

## Profile setup (Supabase)

To enable saving first/last name and profile photo in Profile settings:

1. Open Supabase SQL Editor.
2. Copy the SQL from `db/schema/profiles.sql`.
3. Run it once.

This creates:
- `public.profiles` with `first_name`, `last_name`, `avatar_url`
- RLS policies for profile rows
- Public storage bucket `profile-avatars`
- Storage policies so each user can upload/update/delete only their own avatar files

## Auth flow contract

Current decision (February 21, 2026): ship **email/password only** for now.

- In scope now:
  - `supabase.auth.signInWithPassword`
  - session-based access for app pages
  - explicit sign out flow
- Out of scope for this phase:
  - magic link login
  - OAuth providers (Google, Apple, etc.)

Route access contract:

- Public routes:
  - `/login`
- Protected routes (require active session):
  - `/launch`
  - `/dashboard`
  - `/insights`
  - `/log`
  - `/bodyweight`
  - `/calories`
  - `/profile`

Implementation note:

- Route sets and helpers are centralized in `lib/routes.ts` via:
  - `PUBLIC_ROUTES`
  - `PROTECTED_ROUTES`
  - `isPublicRoute(pathname)`
  - `isProtectedRoute(pathname)`

### Optional server-side account checks

To show explicit messages like:
- "No account exists with this email"
- "Wrong email or password"

and to validate forgot-password email existence, add:

```bash
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

This key is used only by server routes (never exposed to browser code).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
