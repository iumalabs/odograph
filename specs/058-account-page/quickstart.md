# Quickstart: Account Page

## Prerequisites

- `deno task dev` running locally.
- A signed-in test session (via passkey/magic-link, or the dev `/api/v1/_dev/session` shortcut).

## Automated validation

```sh
deno task test tests/server/account-profile.test.ts   # new: GET /account, POST /account/sign-out
deno task test tests/server/account-erasure.test.ts    # existing: confirms DELETE /account still works unmodified
deno task check                                         # fmt, lint, typecheck, full suite, build
```

Server tests should cover, per data-model.md:

- `GET /api/v1/account` returns the real email, session expiry, passkey count, Google-linked flag,
  and linked emails for the calling session — and 401s with no session.
- A bearer API token (read or write scope) cannot call `GET /api/v1/account` or
  `POST /api/v1/account/sign-out` — both routes stay on cookie-only `tenantContext`.
- `POST /api/v1/account/sign-out` actually invalidates the session: a request with the same cookie
  immediately after sign-out gets 401 from any authenticated route.

## Manual validation

1. **Account dropdown** (User Story 1, scenario 1): sign in, click the new account avatar in the
   header. Confirm the dropdown shows the real email, real session-expiry, and a real
   linked-methods summary (not Cloudflare Access / role copy).
2. **Account page** (scenario 2): click "Credentials" in the dropdown. Confirm passkey count,
   Google-linked state, and linked emails render correctly, and that "Add another passkey" / "Link
   Google account" / "Link email" all still work exactly as they did on the old Garage-screen row.
3. **API tokens and deletion relocated** (scenario 5): confirm `ApiTokens` and `AccountDeletion`
   render on the Account page and still function; confirm Settings no longer shows them (only
   currency and push notifications remain).
4. **Sign out** (User Story 2, scenario 1): click "Sign out". Confirm you land back on the landing
   page, and that reloading doesn't restore the session (the cookie no longer authenticates).
5. **Multi-account placeholder** (scenario 6): confirm the "SOON" buttons are visibly disabled and
   clicking them does nothing.
6. **Narrow viewport**: resize to mobile width. Confirm the Account page's cards stack to one
   column and remain usable.

## Expected outcome

Every item above passes, and the Garage screen's top row no longer shows the passkey/Google/email
linking controls (moved to the Account page) — confirm that removal too while testing.
