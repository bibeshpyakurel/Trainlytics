# Decisions

Records of choices that were not obvious, so they are not relitigated from
scratch later. Newest first. A decision stays here once made; if it is
reversed, the reversal is appended rather than the entry deleted.

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
