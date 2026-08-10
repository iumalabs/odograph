# Phase 1 Data Model: Maintenance Planner

## Entities

### `plan_cards`

| Column           | Type                                                | Notes                                                              |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------------------|
| `id`               | TEXT PRIMARY KEY                                     | UUID (or client-supplied, offline-queue create — FR-011)             |
| `tenant_id`        | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE   | Redundant alongside `vehicle_id`, same direct-isolation-check pattern every other vehicle-scoped table uses |
| `vehicle_id`       | TEXT NOT NULL, FK → `vehicles.id` ON DELETE CASCADE  |                                                                       |
| `title`            | TEXT NOT NULL                                        | Free text (FR-001)                                                    |
| `stage`            | TEXT NOT NULL                                        | One of `idea`, `buy`, `doing`, `done` — defaults to `idea` on creation (FR-001); enforced at the application layer, matching how `documents.category` validates in-code rather than via a SQL CHECK |
| `target_date`      | TEXT                                                  | Optional, ISO 8601 date — when the owner plans to act on it (FR-002)  |
| `estimated_cost`   | REAL                                                  | Optional (FR-002)                                                     |
| `urgent`           | INTEGER (0/1)                                        | Optional boolean flag (FR-002), stored as SQLite's usual 0/1           |
| `created_at`       | TEXT NOT NULL                                        | ISO 8601                                                              |
| `updated_at`       | TEXT NOT NULL                                        | ISO 8601, refreshed on every update                                   |

**GDPR erasure decision**: Delete, cascading from `vehicles` — same reasoning as every other
vehicle-scoped entity (specs/006/007/023): a plan card has no independent existence apart from
the vehicle it's planning work for.

## Relationships

```text
vehicles (1) ───< (N) plan_cards
```

`plan_cards` has no direct relationship to `service_records` — a completed card's service record
is a normal, independent row (created via the existing `createServiceRecord`), not linked back to
the card by a foreign key. The card simply stays visible in the `done` column; nothing tracks
"which service record did this card produce" (not requested by spec.md, and the two rows already
carry matching title/date/cost/odometer for a user to correlate visually if needed).

## Validation / behavior rules (from Functional Requirements)

- `title` is required (FR-001); `stage` defaults to `idea` on creation and is otherwise restricted
  to the four defined values on any write (FR-005); `targetDate`/`estimatedCost`/`urgent` are
  optional and never inferred if absent (FR-002).
- Creating a card for a `vehicle_id` that doesn't exist or belongs to a different tenant is
  refused identically to any other cross-tenant access (FR-003) — resolved via `findVehicleById`
  before insert, same as every prior vehicle-nested create.
- An update only ever changes the fields present in the request body — omitted fields keep their
  stored value (FR-006), same pattern `updateDocument`/`updateServiceRecord` established.
- **Done-transition** (FR-007/FR-008): `updatePlanCard` computes the merged patch first (same as
  every other entity's update), then compares the *existing* row's `stage` to the *merged* result's
  `stage`. If they differ and the merged result is `"done"`, it calls the existing
  `createServiceRecord(db, ctx, card.vehicleId, { serviceDate: today, description: card.title,
  odometerReading: await getVehicleCurrentOdometer(db, ctx, card.vehicleId), cost:
  card.estimatedCost, notes: "Created from the maintenance planner" })` — reusing specs/007's
  function verbatim, including its existing semantic-duplicate-detection behavior (D-005), rather
  than writing to `service_records` directly. If the existing and merged `stage` are both
  `"done"` (a no-op re-set), no service record is created (FR-008).
- Every read/update/delete of a `plan_cards` row is scoped by `tenant_id` matching the caller's
  resolved tenant — a row that exists but belongs to a different tenant returns exactly the same
  response as a row that doesn't exist at all (FR-010).
- Deleting a card never touches `service_records` — a card's lifecycle after conversion (i.e.
  after it produced a service record) is otherwise identical to before; deleting a `done` card
  doesn't retroactively delete the service record it produced (FR-009).

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`, alongside existing exports.

```text
type PlanCardStage = "idea" | "buy" | "doing" | "done";

type PlanCardInput = {
  title: string; targetDate: string | null; estimatedCost: number | null; urgent: boolean;
};

type PlanCard = PlanCardInput & {
  id: string; tenantId: string; vehicleId: string; stage: PlanCardStage;
  createdAt: string; updatedAt: string;
};

function createPlanCard(
  db: D1Database, ctx: TenantContext, vehicleId: string, input: PlanCardInput, clientId?: string,
): Promise<PlanCard>
// stage always starts "idea" — not settable at creation (FR-001). Caller has already resolved
// vehicleId belongs to ctx.tenantId via findVehicleById (FR-003), mirroring createDocument's
// trust contract.

function listPlanCards(db: D1Database, ctx: TenantContext, vehicleId: string): Promise<PlanCard[]>
function findPlanCardById(db: D1Database, ctx: TenantContext, id: string): Promise<PlanCard | null>

function updatePlanCard(
  db: D1Database, ctx: TenantContext, id: string,
  patch: Partial<PlanCardInput> & { stage?: PlanCardStage },
): Promise<PlanCard | null>
// Handles the done-transition side effect internally (data-model.md above) — the route layer
// never needs to know it exists.

function deletePlanCard(db: D1Database, ctx: TenantContext, id: string): Promise<boolean>
// Returns whether a row was actually deleted (found-or-not-yours) — no R2 keys to return (no
// attachments, spec.md Assumptions), unlike deleteDocument/deleteServiceRecord.
```

## Client-side offline-queue additions

```text
// src/client/offline/types.ts
export type PendingActionEntity = "vehicle" | "serviceRecord" | "fuelRecord" | "reminderRule" | "planCard";

// src/client/offline/merge.ts
function mergePlanCards(server: PlanCard[], actions: PendingAction[]): WithSyncStatus<PlanCard>[]
// Identical shape to mergeServiceRecords — a create not yet synced is appended (in the "idea"
// stage, since stage isn't settable at creation), an update (any field including stage) is
// overlaid via applyPatch, a delete hides its target, per mergeGeneric's existing generic logic.

function hydrateOptimisticPlanCard(action: PendingAction): PlanCard
// Same role as hydrateOptimisticServiceRecord — builds a displayable card from a still-pending
// "create" action; stage is always "idea" here since creation never sets it (FR-001).
```
