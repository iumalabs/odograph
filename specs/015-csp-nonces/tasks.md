# Tasks: Strict CSP with Per-Request Nonces

**Input**: Design documents from `/specs/015-csp-nonces/` **Prerequisites**: plan.md, spec.md,
data-model.md, contracts/csp-policy.md, research.md, quickstart.md

**Tests**: Included — header shape/uniqueness/scoping via `deno task test` (against a real `workerd`
instance), plus a live-browser check for the one guarantee only a real browser can prove (does the
browser's own CSP engine actually block an unauthorized inline script).

**Scope note**: No new table, route, or client code — this is the CSP half of issue #24 only; the
rate-limiting half is already fully implemented and untouched by this change.

## Phase 1: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 In `wrangler.toml`: add `binding = "ASSETS"` and `run_worker_first = true` to the
      `[assets]` section (default/dev) and to `[env.preview]`/`[env.production]`'s asset
      configuration, so every request — not just `/api/v1/*` — reaches the Worker (research.md)
- [X] T002 [P] Create `src/server/security/csp.ts`: a nonce generator using
      `crypto.getRandomValues(new Uint8Array(16))` (base64-encoded) and
      `buildCspHeader(nonce: string): string` returning the exact policy value specified in
      contracts/csp-policy.md — pure functions, no request/response handling
- [X] T003 In `src/server/index.ts`: extend the exported `fetch` handler to branch on the request
      URL's path **before** calling `app.fetch` — `pathname.startsWith("/api/")` goes to `app.fetch`
      exactly as today (including its own 404s for a missing resource, e.g.
      `GET /api/v1/vehicles/<missing-id>` — never routed to ASSETS); every other path is forwarded
      to `env.ASSETS.fetch(request)`, and when that response's `Content-Type` starts with
      `text/html`, a CSP header built from a freshly generated nonce (T002) is attached before
      returning it — every other content type passes through completely unmodified. Branching on
      Hono's response status (e.g. "fall through to ASSETS on a 404") would be wrong: it would route
      a legitimate API 404 to `ASSETS.fetch`, which — combined with
      `not_found_handling = "single-page-application"` — would silently return `index.html` instead
      of the real JSON 404 (analyze finding U1). The header is attached only outside
      `env.ENVIRONMENT === "development"` — `deno task dev`'s Vite dev server injects its own
      un-nonced inline script (the React Fast Refresh preamble), and a strict policy there blocks
      Vite's own tooling rather than an attacker, breaking local iteration for no security benefit
      (discovered live-testing T005 against `deno task dev`; research.md's later addendum)

**Checkpoint**: The mechanism is wired end-to-end — a manual request confirms the header appears on
the HTML response and is absent from JS/CSS/API responses, before the full test suite proves every
guarantee.

---

## Phase 2: User Story 1 - Every visitor is protected by a strict, unpredictable content policy (P1) 🎯 MVP

**Goal**: The policy exists, is correctly shaped, is unique per request, and the browser actually
enforces it against an unauthorized inline script.

- [X] T004 [US1] Create `tests/server/csp.test.ts` (env.ASSETS mocked per test, `ENVIRONMENT`
      overridden to `"preview"` — see plan.md's Testing section for why): 1. A request for `/`
      includes a `Content-Security-Policy` header matching contracts/csp-policy.md's shape —
      `default-src 'self'`, `script-src`/`style-src` each containing `'self'` and a `'nonce-...'`
      value with no `*` or `'unsafe-inline'` anywhere, `img-src 'self'`, `font-src 'self'`,
      `object-src 'none'`. 2. Two separate requests for `/` produce two different nonce values. 3. A
      request to an `/api/v1/*` route (e.g. `GET /api/v1/auth/whoami`) does not carry a
      `Content-Security-Policy` header, and `env.ASSETS.fetch` is never called for it. 4. A non-HTML
      asset response passes through with its content unmodified and no `Content-Security-Policy`
      header. 5. In the `"development"` environment specifically, no header is attached at all
      (research.md's dev-mode addendum)
- [X] T005 [US1] Live browser check against a production-shaped local server — NOT `deno task dev`
      (research.md: CSP is deliberately skipped there, since `deno task dev`'s own Vite tooling
      injects an un-nonced inline script that a strict policy would block). Build the client
      (`deno task build`) and run `wrangler dev --env preview` against the built output, load the
      app, open devtools, run
      `document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="alert(1)">')` in the
      console (quickstart.md), and confirm the browser logs a CSP violation and the injected handler
      never fires — the one guarantee only a real browser's CSP engine can prove, not
      `workerd`-hosted `deno task test`

**Checkpoint**: The policy exists, is correctly shaped and unique per request (`deno task test`),
and a real browser actually blocks an unauthorized inline script under it.

---

## Phase 3: User Story 2 - Nothing the application legitimately relies on breaks (P2)

**Goal**: Every existing screen and flow, plus every static asset the app depends on, keeps working
exactly as before under the new policy.

- [X] T006 [US2] Live walkthrough against the production-shaped local server from T005
      (`wrangler dev --env preview` serving the built `dist/client` — the policy is active there,
      unlike `deno task dev`; quickstart.md §3): exercise every existing screen and flow —
      passkey/magic-link/Google sign-in, vehicle/service/fuel/reminder CRUD, the Dashboard — with
      devtools open, and confirm nothing errors, nothing fails to render, and the console shows zero
      CSP violations for anything the application itself does. Separately confirm the JS bundle, CSS
      file, self-hosted fonts, and favicon all still load with `200` responses and correct content.
      Separately, a quick pass against plain `deno task dev` (quickstart.md §2) confirms local
      development itself is unaffected (no header at all, nothing regresses there either)

**Checkpoint**: Zero functional regression anywhere in the existing application under the new policy
— safe to ship.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T007 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature

## Dependencies

- **Phase 1 (Foundational)** → **all user story phases**: strict — neither story has anything to
  test until the header-attaching mechanism exists.
- **User Story 1 (Phase 2)** → **User Story 2 (Phase 3)**: soft — verifying nothing broke only makes
  sense once the policy is actually active; the two stories touch no overlapping code, so Phase 3
  could in principle start as soon as Phase 1 lands, but is sequenced after Phase 2 to confirm the
  policy is _correct_ before spending time confirming it doesn't _break_ anything.
- **Phase 4 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 1, the header-construction module has no dependency on the `wrangler.toml` change
(T003, which wires them together, depends on both):

```text
T001 wrangler.toml
T002 [P] src/server/security/csp.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 (User Story 1).** A correctly-shaped, per-request-unique policy that a
real browser actually enforces is the entire security value this feature exists to deliver; User
Story 2 is the confidence-building verification pass that makes it safe to ship, not additional
protection of its own.
