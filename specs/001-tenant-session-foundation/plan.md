# Implementation Plan: Tenant-Scoped Repository Layer & Session Foundation

**Branch**: `001-tenant-session-foundation` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-tenant-session-foundation/spec.md`

## Summary

Establish the tenant-isolation and session mechanism every later v1 feature depends on: a D1
`tenants`/`users`/`sessions` schema, a repository layer that is the _only_ path from a route handler
to D1 (injecting `tenant_id` from the resolved session on every query), HttpOnly/Secure/
SameSite=Lax session cookies backed by an opaque server-side token (D1 as source of truth, KV as an
explicitly-invalidated read cache), and a per-session KV-based write-path rate limiter. A
dev/test-only session-issuing route stands in for real login until the passkey/magic-link/OIDC specs
land.

## Technical Context

**Language/Version**: TypeScript 5.9, targeting Cloudflare Workers (`workerd`)

**Primary Dependencies**: Hono (existing), Cloudflare D1, Cloudflare KV, Web Crypto
(`crypto.subtle`, `crypto.randomUUID`/`crypto.getRandomValues`) — no `node:crypto`, no Deno-runtime
APIs (Principle X)

**Storage**: D1 (`tenants`, `users`, `sessions` tables — source of truth); KV (session read cache,
explicitly invalidated on logout, short TTL as backstop)

**Testing**: Vitest via `@cloudflare/vitest-pool-workers`, against real D1/KV bindings configured in
`vitest.config.ts` → `wrangler.toml` (migrations applied automatically per the pool's `d1Databases`
migration support) — no mocking of D1/KV

**Target Platform**: Cloudflare Workers (`workerd`), single Worker already scaffolded

**Project Type**: Web application (existing single-Worker structure: `src/server/` API,
`src/client/` SPA — this feature is backend-only, no client changes)

**Performance Goals**: Session resolution adds no more than one KV read (cache hit) or one D1 read
(cache miss) to a request's critical path; no numeric target beyond "doesn't add a second/third
round trip"

**Constraints**: No node:crypto or Deno-runtime APIs in Worker code (Principle X); no endpoint may
accept a client-supplied tenant/owner id as an authorization claim (Principle I); session
invalidation must be observable on the _next_ request, not eventually (rules out relying on KV's
eventual-consistency window as the sole invalidation mechanism)

**Scale/Scope**: Foundation only — no vehicles/service/fuel routes yet, just the repository layer,
session middleware, rate limiter, and one placeholder tenant-scoped route + one dev/test
session-issuing route, both removed or superseded once real features land

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                     | Check                                                                                                                                                                                    | Status                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| I. Tenant isolation via repository layer      | Repository layer is the only D1 access path; handlers never import the D1 client directly; no endpoint accepts a client-supplied tenant/owner id                                         | PASS — this feature exists to establish exactly this              |
| II. Server-computed, division-safe aggregates | N/A — no aggregates in this feature                                                                                                                                                      | N/A                                                               |
| III. Idempotent, ordered offline sync         | N/A — no offline writes in this feature                                                                                                                                                  | N/A                                                               |
| IV. No interpolated data                      | N/A — no user-facing records in this feature                                                                                                                                             | N/A                                                               |
| V. Private object storage                     | N/A — no R2 usage in this feature                                                                                                                                                        | N/A                                                               |
| VI. Hardened API tokens                       | N/A — API tokens (issue #20) are a separate later feature; this feature's session tokens follow the same spirit (hashed at rest) even though the principle text is scoped to API tokens  | PASS (by analogy, not required)                                   |
| VII. Session/CSP/rate limiting                | Session cookies HttpOnly/Secure/SameSite=Lax (FR-005); write-path rate limiting (FR-007); CSP nonces are a separate, later concern (issue #22) — noted as deferred, not skipped silently | PASS for the parts in scope; CSP explicitly deferred to issue #22 |
| VIII. GDPR erasure by design                  | `tenants`/`users`/`sessions` each get a documented delete-vs-anonymise decision in data-model.md before any row is written in production                                                 | PASS — see data-model.md                                          |
| IX. i18n axes                                 | N/A — no user-facing strings in this feature (no UI)                                                                                                                                     | N/A                                                               |
| X. Toolchain discipline                       | Web Crypto only, no `node:crypto`/Deno APIs; `deno fmt`/`deno lint` apply to all new files                                                                                               | PASS                                                              |
| XI. English-only artifacts                    | All code/comments/docs in English                                                                                                                                                        | PASS                                                              |
| XII. GitHub-Actions-only deploy               | No local deploy; D1/KV resources for preview/production already provisioned via CLI ahead of this feature (one-time infra setup, not a per-feature deploy)                               | PASS                                                              |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/001-tenant-session-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/server/
├── index.ts                       # existing Hono app entry — mounts new middleware + routes
├── db/
│   ├── schema.sql                 # reference copy of the current schema shape (docs only;
│   │                               migrations/ is the actual source of truth for D1)
│   └── repository.ts               # the ONLY module that imports/queries D1 (Principle I)
├── auth/
│   ├── session.ts                  # session issuance/resolution/invalidation, cookie helpers
│   ├── rate-limit.ts                # KV-based per-session write-path limiter
│   └── dev-session.ts               # dev/test-only session-issuing route (env-gated)
├── middleware/
│   └── tenant-context.ts            # resolves session -> {userId, tenantId}, attaches to context
└── routes/v1/
    ├── health.ts                    # existing
    └── _tenant-isolation-probe.ts    # placeholder tenant-scoped route used only to prove
                                       # isolation (Acceptance Scenarios), removed once a real
                                       # tenant-scoped feature (vehicles) exists

migrations/
└── 0001_tenants_users_sessions.sql  # wrangler D1 migration

tests/server/
├── health.test.ts                   # existing
├── tenant-isolation.test.ts          # User Story 1 acceptance scenarios
├── session.test.ts                   # User Story 2 acceptance scenarios
└── rate-limit.test.ts                # User Story 3 acceptance scenarios
```

**Structure Decision**: Single Worker, existing `src/server/` tree. New `db/`, `auth/`, and
`middleware/` subdirectories under `src/server/`. No `frontend`/`backend` split — the client is
untouched by this feature. The placeholder probe route is intentionally named with a leading
underscore to signal "not a real feature route" and is deleted in the first feature that adds a real
tenant-scoped resource (vehicles, milestone M2).
