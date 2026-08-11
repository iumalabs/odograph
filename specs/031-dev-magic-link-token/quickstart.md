# Quickstart: Dev-Only Magic-Link Token Retrieval Endpoint

## Prerequisites

- `deno task migrate:local` has been run at least once against this worktree's local D1.
- `deno task dev` running.

## Validation scenario 1 — full magic-link sign-in without a real inbox

1. `POST /api/v1/auth/magic-link/request` with `{"email": "owner@example.com"}` — confirm `{"sent":
   true}`.
2. `GET /api/v1/_dev/magic-link-token?email=owner@example.com` — confirm a `token`/`expiresAt` pair
   is returned.
3. `GET /api/v1/auth/magic-link/verify?token=<token from step 2>` — confirm a redirect to
   `/?magicLink=ok` with a session cookie set.

## Validation scenario 2 — no pending token

1. `GET /api/v1/_dev/magic-link-token?email=never-requested@example.com` — confirm `{"token":
   null, "expiresAt": null}`, status `200`.

## Validation scenario 3 — production inertness

1. Confirm (via the test suite, not manually — production config isn't available in local dev) that
   the route returns `404` identically to a nonexistent path when `ENVIRONMENT` is `"production"`.
