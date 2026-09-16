# Decisions

Records of choices that were not obvious, so they are not relitigated from
scratch later. Newest first. A decision stays here once made; if it is
reversed, the reversal is appended rather than the entry deleted.

---

## 2026-09-16 — Take next 16.3.3, and defer the React Compiler lint rules

**Status:** accepted, with follow-up required.

The standing entry below says 16.3.5 was attempted and reverted because
client-side rendering broke on `/launch`, `/signup` and `/forgot-password`.
16.3.3 does not have that fault: the auth suite passes 5/5 against a production
build, which is a real verdict now the suite no longer runs against a dev
server. 16.3.3 carries the request-smuggling fix, and pulls `sharp` 0.35.4 with
it, so both critical advisories close and only the known `xlsx` one remains.

The upgrade brings `eslint-config-next` 16.3.3 and its React Compiler rules,
which produce six new errors: `react-hooks/set-state-in-effect` five times and
`react-hooks/preserve-manual-memoization` once, across `InsightsPage.tsx` and
`LogPage.tsx`. Nothing regressed — the linter got stricter about patterns that
were already there. Every one is a mount-time initialisation effect that reads
`window`, `localStorage` or a query parameter and seeds state from it, which is
how those files stay SSR-safe.

Both rules are downgraded to warnings **scoped to those two files**, and the
work is tracked in #38. Weakening a gate is not free, and RUNBOOK.md says as
much about the coverage ratchet, so the scoping matters: the same violation in
any other file is still an error, and that was verified rather than assumed. The
alternative was restructuring state initialisation in the two largest components
in the app during a security upgrade, with an E2E suite that only covers auth
and would not catch a regression in insights or log.

**Follow-up:** #38. Delete the override block in `eslint.config.mjs` when it
lands; do not add files to it.

---

## 2026-09-16 — eslint stays on 9

**Status:** accepted, blocked upstream.

Dependabot proposes eslint 10. It cannot be taken yet: `eslint-config-next`
16.3.3 bundles `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, whose peer
ranges stop at eslint 9, and `eslint-plugin-react` crashes outright on the v10
API with `contextOrFilename.getFilename is not a function`.

Nothing in this repository can fix that. Revisit when `eslint-config-next`
supports eslint 10.

---

## 2026-09-16 — CI builds the app, and the E2E suite runs against that build

**Status:** accepted.

Nothing in CI ran `next build`. The required checks were lint, typecheck, unit
tests, CodeQL and commit format; `tsc --noEmit` type-checks without emitting, so
no required check ever compiled the app. The Vercel deployment was the first
thing to build it, and the `Vercel` check is not in branch protection's required
list — so a change that broke only the build could merge to main with every
required check green.

The build now runs inside the existing `quality` job rather than in a new one.
That is deliberate: branch protection requires the contexts
`Lint, types, unit tests (20)` and `(22)`, so a build step added there is
blocking immediately. A separate job would need a branch-protection change to
mean anything, and until someone made it, it would fail exactly as silently as
the Vercel check does now. The job's display name is therefore load-bearing and
cannot be renamed to mention the build without updating protection in the same
change.

The Playwright suite also ran against `npm run dev` — a webpack dev server with
dev-mode rendering — while production is a `next build`. `DECISIONS.md` names
that suite as the acceptance gate for the reverted Next 16.3.5 upgrade, whose
symptom was client-side rendering breaking on `/launch`, `/signup` and
`/forgot-password`. A hydration failure is precisely the class of bug that shows
in a production build and not in a dev server, so the gate was running in the
mode least likely to reproduce the failure it existed to catch.

The suite now builds and serves in every environment, not only in CI. Keeping
the dev server locally was considered and rejected on measurement: a cold
`next build` is under six seconds with Turbopack, which is too cheap to justify
testing one thing locally and a different one on the way to production.

`webServer.stdout` is set to `pipe` because Playwright ignores it by default.
Without it a failing build reports only "Timed out waiting for the web server",
and a passing log gives no way to confirm the build ran at all.

All five specs pass against a production build on 16.1.6, so this change gates
the upgrade rather than blocking today's work.

---

## 2026-09-15 — Stay on Next 16.1.6 despite an open critical advisory

**Status:** accepted, with follow-up required.

`npm audit` reports a critical advisory (HTTP request smuggling in rewrites)
against `next` versions up to and including 16.3.2. This app runs 16.1.6, so it
is in range.

Upgrading to 16.3.5 was attempted and reverted. The build and typecheck pass on
16.3.5, but client-side rendering breaks: `/launch`, `/signup` and
`/forgot-password` stop becoming interactive, and the Playwright auth suite goes
from 5 passing to 2. Only the server-rendered and middleware paths survive.

Taking this upgrade is therefore a real piece of work — most likely a hydration
or React 19 interaction — and not a version bump. It is tracked as follow-up
rather than done under a security-hygiene pass, because shipping a flagship app
whose signup form does not respond is worse than the advisory it fixes.

The dependency audit runs in CI as an advisory job rather than a blocking gate
for this reason: blocking merges on something no available bump can fix would
train everyone to ignore a red check.

**Follow-up:** upgrade Next deliberately, with the E2E suite as the acceptance
gate. Dependabot is enabled and will keep proposing the bump.

---

## 2026-09-15 — `xlsx` stays despite a high advisory with no fix

**Status:** accepted.

SheetJS stopped publishing to npm, so `xlsx` on the registry is frozen at 0.18.5
with open advisories and no upstream fix. The options are to vendor SheetJS from
its own registry or to replace it in the workout export path.

Neither is justified right now: the export path takes only data this app itself
produced, not untrusted spreadsheets, so the parsing advisories are not reachable
by an attacker through normal use. Revisit if user-supplied file import is ever
added — at that point the exposure changes and this decision does not hold.

---

## 2026-09-15 — The login redirect clears the caller's query string

**Status:** accepted.

`proxy.ts` builds the login redirect with `request.nextUrl.clone()`, which
carries the original query string. Visiting `/dashboard?tab=volume` signed out
produced `/login?tab=volume&next=%2Fdashboard%3Ftab%3Dvolume&reason=auth_required`
— the requested page's parameters leaked onto the login URL, where they mean
nothing and are echoed back to the user.

The session-expired branch in the same function already cleared `search` before
setting its parameters. The login branch now does the same, so the redirect
carries exactly `next` and `reason`. The requested path is still preserved in
full, query string included, inside `next`.

Covered by `e2e/auth.spec.mjs` → "preserves requested protected path in next param".
