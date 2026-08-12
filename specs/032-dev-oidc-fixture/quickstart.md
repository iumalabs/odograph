# Quickstart: Dev-Only Google OIDC Fixture Sign-In Endpoint

## Prerequisites

- `deno task migrate:local` has been run at least once against this worktree's local D1.
- `deno task dev` running.

## Validation scenario 1 — sign in without a real Google account

1. `GET /api/v1/_dev/oidc-google?email=owner@example.com` (`redirect: manual` if scripting this,
   to inspect the redirect instead of following it) — confirm a `302` to `/?oidc=ok` with a
   `Set-Cookie` header.
2. Using that cookie, confirm an authenticated request (e.g. `GET /api/v1/vehicles`) succeeds.

## Validation scenario 2 — repeat sign-in resolves the same account

1. Repeat step 1 with the same email; confirm the request succeeds again and that a
   database check (or a second authenticated call revealing the same tenant) shows the same
   account was resolved, not a new one.

## Validation scenario 3 — missing email is rejected

1. `GET /api/v1/_dev/oidc-google` (no `email`) — confirm `400`, no cookie set.

## Validation scenario 4 — production inertness

1. Confirm (via the test suite, not manually — production config isn't available in local dev) that
   the route returns `404` identically to a nonexistent path when `ENVIRONMENT` is `"production"`.
