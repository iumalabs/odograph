# Quickstart: Client-Side Routing

## Prerequisites

- `deno task dev` running locally.
- A signed-in test session and a fresh unauthenticated session (see specs/056 quickstart.md for
  forcing a logged-out state via `POST /api/v1/_dev/session/invalidate` in dev).

## Automated validation

```sh
deno task check   # fmt, lint, typecheck, full suite, build
```

No new automated tests (research.md/spec.md Assumptions — no client-side test suite exists).

## Manual validation

1. **Unauthenticated `/app` redirect** (User Story 1, scenario 1): with no session, navigate
   directly to `http://127.0.0.1:5173/app`. Confirm the URL changes to `/` and the landing page
   renders.
2. **Authenticated `/` redirect** (scenario 2): sign in, then navigate directly to `/`. Confirm the
   URL changes to `/app` and the Garage screen renders.
3. **Sign-out URL change** (scenario 3): from `/app/account`, sign out. Confirm the URL changes to
   `/` and the landing page renders.
4. **Sign-up/sign-in URL change** (scenario 4): from `/`, sign up or sign in. Confirm the URL
   changes to `/app` once authentication completes.
5. **Nav-rail navigation + back/forward** (User Story 2, scenarios 1–2): sign in, click through
   Dashboard → Fuel → Service. Confirm the URL updates each time (`/app/dashboard`, `/app/fuel`,
   `/app/service`). Use the browser back button twice — confirm it shows Fuel, then Dashboard.
6. **Reload on a deep screen** (scenario 3): while on `/app/fuel`, reload the page. Confirm the
   Fuel screen renders directly — not a redirect to `/app`/Garage, and not a 404.
7. **No premature bounce** (Edge Cases): with a valid session, open `/app/dashboard` directly
   (e.g. paste into the address bar) in a fresh tab/window. Confirm it lands on Dashboard without a
   visible flash of the landing page first.
8. **Magic-link lands on `/app`** (User Story 3, scenario 1): request a magic link, open the
   captured dev email, click the sign-in link. Confirm the browser lands on `/app` with the
   sign-in outcome banner, not `/`.
9. **Failed magic-link still lands on `/`** (scenario 2): visit an expired/invalid magic-link verify
   URL. Confirm the browser lands on `/` with the error banner, unchanged from today.

## Expected outcome

Every item above passes without any change to what each screen renders or how any existing
sign-in/link/delete action behaves — only the URL each of them is reachable at and navigable
through changes.
