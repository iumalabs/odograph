# Implementation Plan: Vehicle CRUD

**Branch**: `006-vehicle-crud` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-vehicle-crud/spec.md`

## Summary

Add a tenant-scoped `vehicles` table and full CRUD routes (`POST/GET /vehicles`,
`GET/PATCH/DELETE /vehicles/:id`) behind the existing `tenantContext` middleware, following the
exact repository/route pattern `_tenant-isolation-probe`/`probe_resources` already proved out.
Since vehicles is the first *real* tenant-scoped resource, this feature also retires that
placeholder (`_tenant-isolation-probe.ts`, `probe_resources`) per its own code comment
("delete this file... in the first PR that adds one") — replacing its role in every existing test
file that used it as a "confirm this session resolves to tenant X" utility with an equivalent call
against the new `/vehicles` endpoint.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — Hono, D1 as-is.

**Storage**: D1 — one new table, `vehicles` (tenant-scoped, `ON DELETE CASCADE` from `tenants`).
One migration also drops `probe_resources` (superseded — see Summary).

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup). A new
`tests/server/vehicle-crud.test.ts` covers the CRUD lifecycle and cross-tenant isolation
(mirroring `tenant-isolation.test.ts`'s existing structure, since `vehicles` replaces
`probe_resources` as the thing that test proves isolation against). Every other existing test file
that called `_tenant-isolation-probe` as a "get my tenantId" helper (`passkey-auth.test.ts`,
`magic-link-auth.test.ts`, `oidc-auth.test.ts`, `session.test.ts`, `rate-limit.test.ts`) switches to
the equivalent `/vehicles` call — no behavioral change to those tests' actual assertions, just the
resource they probe against.

**Target Platform**: Cloudflare Workers (`workerd`); client UI runs in evergreen browsers (existing
SPA) — a minimal vehicle list + add-vehicle form, same "no design polish yet" posture as every
prior feature's UI.

**Project Type**: Web application (existing single-Worker structure) — touches `src/server/`
(repository, routes, migration) and `src/client/` (first data-bearing screen beyond the auth
shell).

**Performance Goals**: No new target — CRUD over a small per-tenant list, not a hot path or
expected to scale to large per-tenant vehicle counts.

**Constraints**: Repository layer remains the only D1 access point (Principle I); every write path
(create/update/delete) MUST be rate-limited (Principle VII) — `rateLimitBySession`, same as every
other authenticated write route in this codebase; cross-tenant access MUST be refused
indistinguishably from a nonexistent id (Principle I, FR-007); the new table needs a documented
GDPR erasure decision before shipping (Principle VIII).

**Scale/Scope**: One new table, one dropped table, 5 routes, ~6 repository functions, minimal
client UI (list + create form), one new test file plus edits to five existing ones.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | All `vehicles` access goes through new `repository.ts` exports only, every function takes a resolved `TenantContext` and scopes by `tenantId` internally — no handler queries D1 directly (enforced by the existing CI guard script) | PASS |
| II-V | N/A — no aggregates, offline writes, or R2/attachment usage in this feature (spec.md's Assumptions explicitly exclude attachments and odometer *readings* here) | N/A |
| VI. Hardened API tokens | N/A — no token type introduced | N/A |
| VII. Session/CSP/rate limiting | Create/update/delete pass through `rateLimitBySession` (an authenticated write path); list/fetch (read paths) are not rate-limited, same posture as every prior read-only route in this codebase | PASS |
| VIII. GDPR erasure by design | `vehicles` gets a documented delete-vs-anonymise decision in data-model.md before any row is written in production | PASS — see data-model.md |
| IX. i18n axes | The minimal vehicle list/form UI's strings route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency; `deno fmt`/`deno lint` apply | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/006-vehicle-crud/
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
├── db/
│   └── repository.ts                 # REMOVE: createProbeResource, findProbeResourceById,
│                                       #         ProbeResource type (superseded)
│                                       # ADD: createVehicle, listVehicles, findVehicleById,
│                                       #      updateVehicle, deleteVehicle — all take a resolved
│                                       #      TenantContext, mirroring probe_resources' shape
└── routes/v1/
    ├── _tenant-isolation-probe.ts      # DELETE — its role is now filled by vehicles.ts
    └── vehicles.ts                     # ADD: GET/POST /, GET/PATCH/DELETE /:id (tenantContext +
                                        #      rateLimitBySession on the three write routes)

migrations/
└── 0006_vehicles.sql                  # ADD: vehicles table. DROP TABLE probe_resources
                                        #      (superseded — see Summary)

src/client/
├── App.tsx                            # MODIFY: authenticated view gains a vehicle list + minimal
│                                       #         add-vehicle form
└── vehicles.ts                        # ADD: thin client wrapper for the 5 endpoints

tests/server/
├── vehicle-crud.test.ts               # ADD: CRUD lifecycle + cross-tenant isolation (replaces
│                                       #      tenant-isolation.test.ts's role — see below)
├── tenant-isolation.test.ts            # DELETE — superseded by vehicle-crud.test.ts's isolation
│                                        #         cases, which test the same properties against a
│                                        #         real resource instead of a placeholder
├── passkey-auth.test.ts                # MODIFY: probeTenantId-equivalent helper now calls
├── magic-link-auth.test.ts             # MODIFY: /api/v1/vehicles instead of
├── oidc-auth.test.ts                   # MODIFY: /api/v1/_tenant-isolation-probe
├── session.test.ts                     # MODIFY: (same mechanical swap)
└── rate-limit.test.ts                  # MODIFY: its write-path-under-test becomes
                                         #         POST /api/v1/vehicles instead of the probe —
                                         #         arguably a more meaningful target anyway
```

**Structure Decision**: Follows the existing `src/server/{db,routes}` layout exactly. No new
top-level modules. The probe's retirement touches more files than a typical feature would, but
every one of those changes is mechanical (swap one endpoint call for an equivalent one) — none of
them changes what any test actually asserts.
