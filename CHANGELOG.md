# Changelog

Notable changes to Trainlytics. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

Entries from v0.1.0 onward are generated from Conventional Commits by
`scripts/build-release-notes.sh` and published as GitHub Releases. Anything
before that tag predates the convention and is summarised by hand below.

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-09-15

First tagged release. The application was already deployed and in use; this tag
exists so there is finally a name for what is running, rather than "whatever is
on main right now".

### Added

- Workout logging by split (push, pull, legs, core), by guided form or pasted
  free-text notes
- User-defined training splits with per-exercise set counts
- Exercise management: create, archive, unarchive, reorder, permanent delete,
  with per-exercise notes
- Bodyweight and calorie tracking, with burn estimates
- Dashboard and insights trends, including an AI insights layer
- Guided export by category, muscle group or exercise to CSV, XLSX and PDF
- OTP-backed signup and password reset
- Per-user data isolation enforced in the database through Supabase row-level
  security, not only in application code
- Route guarding via `proxy.ts`, with the requested path preserved across login

### Fixed

- The login redirect no longer inherits the caller's query string. Visiting a
  protected route with parameters, signed out, used to leak them onto the login
  URL; the requested path is still preserved inside `next`.

### Infrastructure

- CI runs lint, typecheck, unit tests with coverage thresholds, `db:check-plan`
  and the Playwright auth suite, on Node 20 and 22, for pull requests and for
  pushes to `main`
- The Playwright suite runs at all for the first time — `@playwright/test` had
  never been declared as a dependency
- `main` is protected: pull requests required, CI must pass, linear history, no
  force pushes
- CodeQL, Dependabot, secret scanning and push protection enabled
- Every GitHub Action pinned to a commit SHA
- Scheduled uptime probe against production that opens an issue on failure

[Unreleased]: https://github.com/bibeshpyakurel/Trainlytics/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bibeshpyakurel/Trainlytics/releases/tag/v0.1.0
