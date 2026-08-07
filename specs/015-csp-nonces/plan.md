# Implementation Plan: Strict CSP with Per-Request Nonces

**Branch**: `015-csp-nonces` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-csp-nonces/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the
execution workflow.

## Summary

Route every request through the Worker (`assets.run_worker_first = true`), so the Worker can add a
strict, per-request-nonce CSP header to every HTML response — including the ones currently served
directly by Cloudflare's static-asset layer without ever reaching the Worker today. Non-HTML asset
responses (JS/CSS/fonts/images) pass through unmodified; API responses are untouched (they already
reach the Worker). No new route, no new table — this is a response-header change applied uniformly
at the edge of the existing `fetch` handler.

## Technical Context

**Language/Version**: TypeScript (Cloudflare Workers `workerd` runtime) — server-only; no client
code changes.

**Primary Dependencies**: None new — `crypto.getRandomValues` (already available in `workerd`,
already used elsewhere in this codebase for id/token generation) is the only API this needs.

**Storage**: N/A — no persisted state.

**Testing**: `deno task test` (vitest via `@cloudflare/vitest-pool-workers`) asserts on response
headers directly, the same way this suite already asserts on `Set-Cookie`. `env.ASSETS` is mocked
per test (a plain object exposing `fetch`) rather than depending on a real `dist/client` build —
`deno task test` runs before `deno task build` in every existing CI workflow (`ci.yml`,
`deploy-preview.yml`), so a built client is never guaranteed to exist when this suite runs; mocking
also isolates this feature's own header-attachment logic from Cloudflare's static-asset serving
behavior, which isn't this project's code to test. Live browser verification (does everything still
render/run, does a deliberately injected inline script actually get blocked) via `deno task dev`,
which always has a real dev-server-served client to test against.

**Target Platform**: Cloudflare Workers (`workerd`) — this changes how the Worker's `fetch` export
handles every request, not just `/api/v1/*`.

**Project Type**: Web application (existing structure) — this slice touches the server's top-level
request handling and `wrangler.toml`'s asset configuration; no client code changes (research.md:
today's build has no inline `<script>`/`<style>` to tag with a nonce, so nothing in
`src/client/`/`index.html` needs editing).

**Performance Goals**: Every static asset request now passes through the Worker instead of being
served directly by Cloudflare's edge asset cache (`run_worker_first`'s necessary cost for uniform
coverage, research.md) — acceptable at this project's scale (an individual/small-fleet tool, not a
high-traffic public site); non-HTML responses are forwarded unmodified with a single added `fetch()`
hop, no extra processing.

**Constraints**: The nonce MUST be freshly generated per request via a cryptographically secure
source, never reused, and MUST NOT weaken script-src/style-src with any wildcard or `unsafe-inline`
fallback (FR-001/FR-002/FR-003). Every existing screen and flow MUST keep working unchanged (FR-007)
— this is a header-only change with no HTML rewriting needed today.

**Scale/Scope**: 0 new tables, 0 new client code, 1 new server module (CSP header construction),
`src/server/index.ts` extended to proxy non-API requests through `env.ASSETS` and attach the header,
`wrangler.toml` extended with `assets.binding`/`assets.run_worker_first` across
default/preview/production.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Tenant Isolation via Repository Layer** — N/A: no data access, no repository changes.
- **II. Server-Computed, Division-Safe Aggregates** — N/A: no aggregate computation.
- **III. Idempotent, Ordered Offline Sync** — N/A: no writes, no sync queue interaction.
- **IV. No Interpolated Data** — N/A.
- **V. Private Object Storage with Validated Uploads** — N/A: no R2/attachment interaction.
- **VI. Hardened API Tokens** — N/A: out of scope for this feature (spec.md), a separate future
  issue.
- **VII. Locked-Down Session and Transport Security** — this feature directly implements the CSP
  half of this principle; the other two sub-requirements (HttpOnly/Secure/SameSite cookies, rate
  limiting on auth/write paths) are already satisfied by existing code (audited before this spec was
  written) and untouched by this change.
- **VIII. GDPR Erasure by Design** — N/A: no new table or stored data.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — N/A: no user-facing text, this
  feature has no UI of its own (spec.md).
- **X. Toolchain Discipline** — PASS: no new dependency; `crypto.getRandomValues` is a Web Crypto
  API already available in `workerd`, not a Deno-runtime API (Principle X's actual concern).
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: the `wrangler.toml` change ships through the
  existing CI/preview/production pipeline unchanged, no manual deploy step.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/015-csp-nonces/
├── plan.md                  # This file (/speckit-plan command output)
├── research.md              # Phase 0 output (/speckit-plan command)
├── data-model.md            # Phase 1 output (/speckit-plan command)
├── contracts/csp-policy.md  # Phase 1 output (/speckit-plan command)
├── quickstart.md            # Phase 1 output (/speckit-plan command)
└── tasks.md                 # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
wrangler.toml                      # extended: [assets] gains binding = "ASSETS" and
                                     # run_worker_first = true on default/[env.preview]/
                                     # [env.production] — every request now reaches the Worker

src/server/
├── security/csp.ts                # new: buildCspHeader(nonce) -> string (the policy value
│                                     # itself, per contracts/csp-policy.md) and a nonce generator
│                                     # using crypto.getRandomValues
└── index.ts                       # extended: the exported fetch handler branches on the URL path
                                     # BEFORE calling Hono — /api/* goes to app.fetch exactly as
                                     # today (including its own 404s), everything else forwards to
                                     # env.ASSETS.fetch(request); the CSP header (fresh nonce) is
                                     # attached to that result when its content-type is text/html —
                                     # non-HTML asset responses pass through unmodified

tests/server/
└── csp.test.ts                     # new: header present with no wildcard/unsafe-inline for
                                     # script-src/style-src, two requests produce different
                                     # nonces, non-HTML asset responses are unaffected, API
                                     # responses are unaffected
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories,
no client changes, no new table. This is the first feature to make the Worker's `fetch` export
handle non-API requests explicitly, rather than relying entirely on Cloudflare's static-asset layer
to serve everything outside `/api/v1/*` — a structural change to request routing, not just a new
route.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
