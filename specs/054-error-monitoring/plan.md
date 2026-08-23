# Implementation Plan: Production Error & Performance Monitoring (FlightDeck)

**Branch**: `054-error-monitoring` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/054-error-monitoring/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Wires Odograph's existing production client (React SPA) and server (Hono on Cloudflare Workers) to
FlightDeck, an already-provisioned, Sentry-protocol-compatible external monitoring platform, using
Sentry's own first-party SDKs (`@sentry/cloudflare` server-side, `@sentry/react` client-side) rather
than a hand-rolled integration. The DSN is a plain literal constant (not a protected secret — see
research.md) present at both integration points; production-only capture (FR-004) is enforced by an
explicit environment check on each side, reusing the `ENVIRONMENT`/`WRANGLER_ENV` values this project
already threads through `wrangler.toml` and `vite.config.ts`. No new persisted data, no new API
routes — this is instrumentation wrapped around the existing `fetch`/`scheduled` export and the
existing client entry point.

## Technical Context

**Language/Version**: TypeScript throughout — Hono/Workers server, Vite-built React 19 SPA client.

**Primary Dependencies**: New — `@sentry/cloudflare` (server) and `@sentry/react` (client), both
official first-party SDKs (research.md). No hand-rolled protocol code.

**Storage**: N/A — no new D1 tables, no new persisted state. Error events and traces live entirely on
FlightDeck's side.

**Testing**: The environment-gating logic (the `enabled: env.ENVIRONMENT === "production"` flag on
the shared server config, and its client-side equivalent — `withSentry`/`Sentry.init` are always
called, they simply no-op when `enabled` is false, never a manual branch around whether to call them)
and the `beforeSend` PII scrubber are ordinary, testable logic — covered under `tests/server/**`
(`@cloudflare/vitest-pool-workers`) for the server side. The actual outbound event submission to FlightDeck's real ingest endpoint is not something a
test environment can exercise — same precedent as specs/012's email send and specs/022's push send
(tested up to, not including, the literal external call) — verified live instead per quickstart.md.
Client-side Sentry init has no equivalent under `vitest.config.ts` (no real browser SDK network
behavior in that environment) — verified live per quickstart.md, same precedent as specs/018-022's
client-only pieces.

**Target Platform**: Cloudflare Workers (server) and every browser the existing client already
supports (no new browser-capability requirement — unlike specs/022's Push API dependency, error/trace
capture doesn't rely on any optional browser feature).

**Project Type**: Web application (existing structure) — this slice touches both `src/server/` and
`src/client/`, plus `wrangler.toml` and `vite.config.ts`.

**Performance Goals**: Trace sampling rate on the order of 10-20% of requests (spec.md Assumptions) —
bounds event volume without needing to capture every request; error capture itself is not sampled
(every unhandled error is reported, per FR-001/FR-002).

**Constraints**: MUST NOT forward events from non-production environments (FR-004). MUST NOT include
tenant-identifying data in any forwarded event (FR-005). MUST NOT widen the CSP beyond the one
monitoring-ingest origin (FR-006). MUST NOT let a monitoring-endpoint failure alter the response
returned to the user (FR-007) — `withSentry`/`@sentry/react`'s own error-isolation already satisfies
this by design (the SDKs report asynchronously and don't block the wrapped handler on ingest success),
confirmed as part of implementation rather than assumed.

**Scale/Scope**: 2 new dependencies, `wrangler.toml` extended (+`nodejs_compat` compatibility flag),
`vite.config.ts` extended (+1 `define` entry), `src/server/index.ts` extended (default export wrapped
in `Sentry.withSentry`), 1 new server module (monitoring config/scrubber), `src/server/security/csp.ts`
extended (+`connect-src`), `src/client/main.tsx` extended (Sentry init before render), 1 new client
module (monitoring config/scrubber), `tests/server/` extended with the environment-gating tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — N/A: no D1 access, no repository-layer code involved.
- **II. Server-Computed, Division-Safe Aggregates** — N/A: no aggregate math.
- **III. Idempotent, Ordered Offline Sync** — N/A: unrelated to the offline write queue.
- **IV. No Interpolated Data** — N/A: no user-facing data is computed or displayed by this feature.
- **V. Private Object Storage with Validated Uploads** — N/A: no R2/attachments involved.
- **VI. Hardened API Tokens** — N/A: no new authentication surface; monitoring capture is not a
  caller-authenticated endpoint.
- **VII. Locked-Down Session and Transport Security** — PASS, with a deliberate one-directive CSP
  widening: `connect-src` is extended to allow FlightDeck's specific ingest origin only (FR-006,
  research.md) — no `unsafe-inline`/wildcard introduced, nonce-based `script-src`/`style-src` are
  unchanged. Session cookies are explicitly excluded from forwarded events (FR-005, `beforeSend`
  scrubber).
- **VIII. GDPR Erasure by Design** — considered and PASS by construction: error/trace events never
  contain tenant-identifying data by design (FR-005), so there is no tenant-linked row on FlightDeck's
  side to erase on account deletion — nothing analogous to `push_subscriptions`/`api_tokens` is created
  here.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — N/A: this feature adds no
  user-facing UI text (monitoring is invisible to end users by design).
- **X. Toolchain Discipline** — PASS: both new dependencies declared as `npm:` specifiers in
  `deno.json`, resolved via `deno install`. The new `nodejs_compat` compatibility flag is a `workerd`
  capability, not a Deno-runtime API leaking into Worker code — Deno itself still never supplies a
  runtime API used inside `workerd` code (research.md's Constitution check note).
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no new deploy-time secret or manual step — the DSN
  is a plain source literal (research.md), so nothing needs to be provisioned via `wrangler secret put`
  the way `GOOGLE_CLIENT_SECRET`/`VAPID_PRIVATE_KEY` were. Ships through the existing
  `deploy-preview.yml`/`deploy-production.yml` pipeline unchanged, gated by the environment check
  (FR-004) rather than by which secrets a given deploy has access to.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/054-error-monitoring/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `data-model.md`: this feature introduces no persisted entities (no new D1 tables, no new rows in
any existing table) — the "Key Entities" in spec.md (Error Event, Performance Trace, Release) live
entirely on FlightDeck's side, not in this app's own data model. No separate `contracts/` file either:
there is no new API surface this app exposes — the only "contract" is the outbound shape of events
sent to FlightDeck, which is fully defined by the `@sentry/*` SDKs themselves, not something this
project defines or versions.

### Source Code (repository root)

```text
wrangler.toml                          # extended: compatibility_flags = ["nodejs_compat"]
vite.config.ts                         # extended: define exposes WRANGLER_ENV to client build

src/server/
├── index.ts                           # extended: default export wrapped in Sentry.withSentry(...)
├── monitoring/
│   └── config.ts                      # new: DSN constant, shared Sentry init options
│                                        #   (environment/release/tracesSampleRate/beforeSend scrubber)
└── security/
    └── csp.ts                         # extended: connect-src allows FlightDeck's ingest origin only

src/client/
├── main.tsx                           # extended: Sentry.init(...) before createRoot(...).render(...)
└── monitoring.ts                      # new: DSN constant, shared Sentry init options
                                         #   (mirrors src/server/monitoring/config.ts's shape, not
                                         #   imported from it — no existing client/server cross-import
                                         #   precedent in this codebase, research.md)

tests/server/
└── monitoring.test.ts                 # new: environment gating (no init outside production),
                                         #   beforeSend scrubber strips Cookie/Authorization/body
```

**Structure Decision**: Single-project web app (existing structure). Server addition follows the
existing per-concern module pattern (`push/`, `email/` → `monitoring/`); the CSP change extends the
existing `security/csp.ts` in place rather than introducing a new file for one directive.
