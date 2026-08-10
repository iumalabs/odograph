# Implementation Plan: Maintenance Planner — Kanban Board

**Branch**: `025-maintenance-planner` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-maintenance-planner/spec.md`

## Summary

Add a tenant/vehicle-scoped `plan_cards` table (title, stage, target date, estimated cost, urgent
flag) and CRUD routes following the exact repository/route pattern specs/007/009/023 established,
with one behavioral addition: transitioning a card's `stage` to `"done"` from any other stage
creates a real `service_records` row via the existing `createServiceRecord` repository function —
never a second, parallel record type. Unlike documents (specs/023, which explicitly opted out of
the offline queue), every plan-card write routes through the existing offline write queue
(specs/020) exactly like service/fuel records and reminder rules already do — a new
`"planCard"` `PendingActionEntity`, a new `mergePlanCards` overlay function, and the same
`idempotent` middleware + client-generated id pattern on the server side.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new.

**Storage**: D1 — one new table, `plan_cards` (tenant + vehicle scoped). No new R2 usage. Reuses
the existing `service_records` table as the target of the done-transition side effect — no new
service-record-shaped table.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup) — same real D1 pattern
every prior feature's server tests use. Client-side offline-queue behavior (merge overlay,
ordering) is exercised the same way `service-records`'s existing offline-queue coverage already
is — through the queue/merge unit-level tests, not a new integration harness.

**Target Platform**: Cloudflare Workers (`workerd`); client UI is a new per-vehicle kanban board
component with four columns and a forward-advance control per card (no drag-and-drop, spec.md
Assumptions).

**Project Type**: Web application (existing single-Worker structure) — touches `src/server/db/`,
`src/server/routes/v1/`, `migrations/`, `src/client/offline/{types,queue,merge}.ts`, and
`src/client/`.

**Performance Goals**: No new target — CRUD over a small per-vehicle list, same shape as every
prior vehicle-scoped entity.

**Constraints**: Repository layer remains the only D1 access point (Principle I); every write path
is rate-limited (Principle VII); cross-tenant access refused indistinguishably from a nonexistent
resource (Principle I); the done-transition's service-record creation never fabricates an odometer
reading or cost the card didn't provide (Principle IV); card writes are idempotent and ordered per
vehicle via the existing offline-queue machinery (Principle III) — this feature adds a new entity
to that machinery rather than building a second one; new table gets a documented GDPR erasure
decision (Principle VIII).

**Scale/Scope**: One new D1 table, no new R2 usage, one new pure-ish repository function
(`transitionPlanCardStage`, which conditionally calls the existing `createServiceRecord`), 5
routes (create/list for the vehicle-nested mount, fetch/update/delete for the card-scoped mount —
same 5-route shape reminder rules established, no attachment routes needed per spec.md
Assumptions), one new `PendingActionEntity` + one new `merge*` function on the client, minimal
client UI (a new `PlanBoard`/`PlanCard` component pair).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | All D1 access for `plan_cards` goes through new `repository.ts` exports only, scoped by `ctx.tenantId`; the done-transition calls the existing `createServiceRecord` (already tenant-scoped) rather than writing `service_records` directly | PASS |
| II. Server-computed aggregates | N/A — no aggregates in this feature; the created service record's odometer reading reuses the existing `getVehicleCurrentOdometer` computation, not a new one | N/A |
| III. Idempotent, ordered offline sync | Every card write carries the same client-generated idempotency key and per-vehicle ordering guarantee every other queued entity already has — this feature extends the existing queue, not a second one | PASS — this feature's entire client design exists to satisfy this principle, per the issue's explicit requirement |
| IV. No Interpolated Data | The done-transition's odometer reading and cost are set only from what's actually known (vehicle's current odometer, card's own estimated cost) — never guessed or defaulted to a placeholder value if absent (FR-007) | PASS |
| V-VI | N/A — no attachments or API tokens in this feature | N/A |
| VII. Session/CSP/rate limiting | Create/update/delete pass through `rateLimitBySession` + `idempotent`, matching every existing write route; list/fetch (reads) don't, matching every prior read route's posture | PASS |
| VIII. GDPR erasure by design | New `plan_cards` table gets a documented delete-vs-anonymise decision (data-model.md) before any row is written in production — delete, cascading from `vehicles`, same as every other vehicle-scoped entity | PASS — see data-model.md |
| IX. i18n axes | New UI strings route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/025-maintenance-planner/
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
│   └── repository.ts                  # ADD: createPlanCard, listPlanCards, findPlanCardById,
│                                        #      updatePlanCard (handles arbitrary field updates
│                                        #      including stage — the done-transition side effect
│                                        #      lives here, calling the existing
│                                        #      createServiceRecord when stage becomes "done" from
│                                        #      a different value), deletePlanCard
└── routes/v1/
    ├── vehicles.ts                     # MODIFY: adds POST/GET /:vehicleId/plan-cards (create/
    │                                    #         list — no new mount point, matching every prior
    │                                    #         nested-resource convention); DELETE /:id also
    │                                    #         now deletes the vehicle's plan cards (D1
    │                                    #         cascade handles this automatically — no R2
    │                                    #         cleanup needed since cards have no attachments)
    └── plan-cards.ts                   # ADD: mounted at /api/v1/plan-cards — fetch/update/
                                         #      delete (3 routes)

migrations/
└── 0017_plan_cards.sql                 # ADD: plan_cards

src/client/
├── offline/
│   ├── types.ts                       # MODIFY: PendingActionEntity gains "planCard"
│   └── merge.ts                       # MODIFY: mergePlanCards, hydrateOptimisticPlanCard
├── plan-cards.ts                       # ADD: thin client wrapper for the 5 endpoints, routed
│                                        #      through enqueue() like service-records.ts
├── App.tsx                             # MODIFY: mounts a new per-vehicle PlanBoard
└── components/
    └── PlanBoard.tsx                   # ADD: four-column kanban board, forward-advance control
                                         #      per card, add-card form

tests/server/
└── plan-card-crud.test.ts              # ADD: CRUD lifecycle, cross-tenant isolation, stage
                                         #      validation, done-transition creates exactly one
                                         #      service record (with/without known odometer),
                                         #      re-done is a no-op, delete never touches
                                         #      service_records, vehicle-delete cascades cards
```

**Structure Decision**: Follows the existing `src/server/{db,routes}` layout exactly, identical to
every prior vehicle-scoped entity. `plan-cards.ts` sits alongside `service-records.ts`/
`fuel-records.ts`/`documents.ts` as a fourth resource-scoped route file. Client-side, this is the
first feature since specs/020 itself to add a new entity to the offline-queue machinery
(`types.ts`/`merge.ts`) rather than either building a second machinery (rejected for documents,
specs/023) or opting out of both (documents' actual choice) — the issue's own text requires the
former for this feature specifically.
