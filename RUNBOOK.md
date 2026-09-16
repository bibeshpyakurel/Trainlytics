# Runbook

What to do when Trainlytics misbehaves. Written for the person on call at
02:00, which is usually the author — so it states the obvious on purpose.

## At a glance

| Thing | Where |
| ----- | ----- |
| Production | https://trainlytics-two.vercel.app |
| Hosting | Vercel (build, serve, edge) |
| Database and auth | Supabase (Postgres, Auth, Storage, RLS) |
| Uptime probe | `.github/workflows/uptime.yml`, every 30 minutes |
| Outage signal | A GitHub issue labelled `outage`, opened automatically |

## The probe opened an outage issue

The probe fails only after three consecutive failed requests, so treat one
issue as real rather than noise.

1. **Confirm from outside CI.** `curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' -L https://trainlytics-two.vercel.app/login`.
   A `200` means the outage already recovered — the probe will close the issue
   on its next run.
2. **Check Vercel first.** Most outages are a failed deployment, not a code
   fault. Look at the most recent deployment: if it failed, the previous one is
   still serving and the fault is in the new build. If it succeeded and the site
   is still down, continue.
3. **Check Supabase.** The app cannot render signed-in routes without it. A
   Supabase incident looks like a working `/login` and failing `/dashboard`.
4. **Roll back rather than fix forward.** Promote the last known-good Vercel
   deployment. Diagnosis is cheaper once users are unaffected.
5. **Write down what happened** as a dated entry in `DECISIONS.md` if the cause
   was a design choice, or as an issue if it was a defect.

## Symptom: signed-in routes bounce to /login

The route guard lives in `proxy.ts` (Next 16 names middleware `proxy.ts`; the
build output confirms it as `ƒ Proxy (Middleware)`).

- Bouncing with `reason=auth_required` and no `sb-` cookie is correct behaviour
  for a signed-out visitor.
- Bouncing **with** an `sb-` cookie present means the session was rejected, and
  the user should be sent to `/session-expired` instead. If they land on
  `/login`, the cookie-detection branch is the thing to inspect.
- `next` should carry the full requested path including its query string.

Covered by `e2e/auth.spec.mjs`. Reproduce locally with
`npm run e2e -- --grep "next param"`.

## Symptom: a migration needs to go out

Schema changes are planned, not improvised.

```bash
npm run db:check-plan   # verifies the plan file matches the schema
npm run db:migrate      # applies it
```

`db:check-plan` runs in CI, so a plan that has drifted from the schema fails the
build before it reaches production.

## Symptom: CI is red on main

- **Coverage threshold** — thresholds in `vitest.config.ts` are a ratchet set
  just under the measured numbers. If coverage dropped, add tests. Do not lower
  the threshold to make the build green; that is the one change that makes the
  gate worthless.
- **`Build`** — the production build broke. `tsc --noEmit` passes on plenty of
  changes that fail to bundle, so read the step's output rather than assuming
  the types will tell you. Reproduce with `npm run build`.
- **`Dependency advisories`** — this job is advisory and cannot fail the run.
  See `DECISIONS.md` for the standing `next` and `xlsx` advisories.
- **Playwright** — the report is uploaded as a `playwright-report` artifact on
  every run, pass or fail. Download it before re-running anything. In CI the
  suite runs against a production build, not the dev server, so a failure that
  will not reproduce with `npm run e2e` locally needs `PLAYWRIGHT_PROD=1`.

## Escalation

There is no second on-call. If the fix is not obvious within thirty minutes,
roll back, leave the outage issue open with what you have learned, and continue
in daylight.
