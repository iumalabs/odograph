# Quickstart: Strict CSP with Per-Request Nonces

No migration — this feature changes response headers and `wrangler.toml`'s asset routing only.

## 1. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/csp.test.ts` to pass — header present with no wildcard/`unsafe-inline` in
`script-src`/`style-src`, two consecutive requests produce different nonces, non-HTML asset
responses are unaffected, and `/api/v1/*` JSON responses are unaffected.

## 2. Confirm local development is unaffected

```sh
deno task dev
```

1. Load the app and inspect the response headers for `/` — confirm **no** `Content-Security-Policy`
   header is present (research.md: deliberately skipped in `ENVIRONMENT=development`, since
   `deno task dev`'s own Vite tooling injects an un-nonced inline script that a strict policy would
   otherwise block).
2. Walk through every existing screen and flow (sign-in via passkey/magic link/Google,
   vehicle/service/fuel/reminder CRUD, the Dashboard) — confirm nothing errors or fails to render,
   same as before this feature existed.

## 3. Manual smoke test against a production-shaped local server

```sh
deno task build
deno task cf-typegen
deno run -A npm:wrangler dev --env preview
```

This serves the _built_ `dist/client` output (not Vite's dev server) through the same
Worker-plus-`env.ASSETS` path preview/production actually use, under `ENVIRONMENT=preview` — the one
combination that actually exercises this feature the way a real deployment would.

1. Load the app and inspect the response headers for `/` — confirm a `Content-Security-Policy`
   header matching contracts/csp-policy.md's shape is present, with a nonce value.
2. Reload the page and compare the nonce value against the first load — confirm it's different.
3. Walk through every existing screen and flow with devtools open — confirm nothing errors, nothing
   fails to render, and the console shows no CSP violation reports for anything the app itself does.
4. Open the devtools console and attempt to run
   `document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="alert(1)">')` (a classic
   inline-event-handler injection shape) — confirm the console logs a CSP violation and the handler
   never fires, proving the policy actually blocks unauthorized inline execution.
5. Confirm static assets (the JS bundle, the CSS file, self-hosted fonts, the favicon) all still
   load with `200` responses and correct content — proving the `env.ASSETS.fetch()` passthrough for
   non-HTML responses works.
6. Confirm `/api/v1/*` requests (e.g. `GET /api/v1/auth/whoami`) still work exactly as before and do
   not carry a `Content-Security-Policy` header (contracts/csp-policy.md's "not attached" list).
