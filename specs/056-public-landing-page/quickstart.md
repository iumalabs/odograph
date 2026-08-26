# Quickstart: Public Landing Page

Manual validation for this feature. No new environment variables, bindings, or migrations — same
local setup as any other client-only change. There is no existing client component test suite in
this project (`tests/` is server-only Vitest), so this feature is verified via `deno task check`
(typecheck/build/fmt/lint) plus the manual walkthrough below — the project's established pattern
for UI-only changes (see e.g. issue #241's fix).

## Prerequisites

- `deno task dev` running locally.
- A browser with no existing odograph session cookie for that origin (private/incognito window, or
  clear cookies for `127.0.0.1:5173`).

## Automated validation

```sh
deno task check   # fmt, lint, typecheck, full suite, build
```

No new unit tests are added (no new logic — pure JSX/copy/CSS); `deno task check`'s typecheck step
is what catches a broken prop/type mismatch between `LandingPage`, the extracted `SignInCard`, and
`App.tsx`'s existing handler wiring.

## Manual validation

1. **First load, no session** (User Story 1, scenario 1–2): open the app in a fresh
   private-browsing window. Confirm: a header (logo, "Documentation" link, no misleading badge), a
   hero with a 3-line headline and lead paragraph describing odograph, and — in place of any demo
   stats — the real sign-in card offering passkey sign-up, passkey sign-in, magic link, and Google.
   Confirm no text anywhere says "Cloudflare Access" or implies a redirect-based login.
2. **Every sign-in action still works** (scenario 2, 4): from the landing page, exercise each of
   the four actions exactly as today — passkey sign-up creates an account, passkey sign-in signs
   an existing one in, magic-link request shows the "check your email" banner, and the Google link
   points at the real `googleSignInUrl`. Trigger a WebAuthn prompt and confirm the other three
   actions disable while it's pending, matching `AuthScreen`'s existing behavior.
3. **Session-expired reuse** (scenario 3): sign in, then trigger a `needsReauth` sync event (or
   simply clear the session cookie and perform an authenticated action) and confirm the same
   landing page renders — no separate "you were signed out" screen.
4. **Documentation link** (User Story 2, scenario 1): click "Documentation" in the header and in
   the hero; confirm both open `https://github.com/iumalabs/odograph` (the README) in a new tab.
5. **Narrow viewport** (scenario 5): resize the browser to a mobile width (e.g. 375px). Confirm
   the hero's two columns stack to one, the sign-in card remains fully usable (no cut-off inputs
   or buttons), and nothing overflows horizontally.
6. **No fabricated data**: confirm nowhere on the page shows an invented spend total, consumption
   figure, or vehicle count as though it were real.

## Expected outcome

Every item above passes without touching any server-side code, the auth API routes, or session
handling — this feature only changes what's rendered client-side when `identity` is null.
