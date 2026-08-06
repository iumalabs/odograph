# Phase 1 Data Model: Server-Computed Per-Vehicle Aggregates

No new table, column, or migration. This feature reads three tables that already exist
(`vehicles`, `service_records` from spec 007, `fuel_records` from spec 009) and derives a response
shape that is never persisted.

## Vehicle Aggregate Summary (derived, not a table)

| Field | Type | Notes |
|---|---|---|
| `costPerDistance` | `number \| null` | total cost / odometer span, in the vehicle's own currency
  per one `odometerUnit` (km or mi) — `null` if fewer than 2 qualifying odometer readings exist, or
  their span is `<= 0` (research.md) |
| `costPerTime` | `number \| null` | total cost / day span — `null` if fewer than 2 qualifying
  record dates exist, or their span is `<= 0` |
| `averageFuelEconomy` | `number \| null` | mean of the vehicle's existing non-null per-fuel-record
  `fuelEconomy` values (already computed by `listFuelRecordsWithEconomy`, spec 009) — `null` if
  that set is empty |

Not a database entity: this is the JSON shape returned by
`GET /api/v1/vehicles/:vehicleId/aggregates` and the return type of the new repository function
below. Computed fresh on every call — see research.md for why nothing is cached.

## Repository layer additions (`src/server/db/repository.ts`)

- `VehicleAggregates` type: `{ costPerDistance: number | null; costPerTime: number | null;
  averageFuelEconomy: number | null }`.
- `computeVehicleAggregates(db: D1Database, ctx: TenantContext, vehicleId: string): Promise<VehicleAggregates>`
  — assumes the caller (the route) has already confirmed the vehicle exists and belongs to
  `ctx.tenantId` via `findVehicleById`, matching the trust contract every other vehicle-nested
  write function in this file already documents (e.g. `createServiceRecord`'s doc comment).
  Internally:
  1. Calls the existing `listServiceRecords(db, ctx, vehicleId)` and
     `listFuelRecordsWithEconomy(db, ctx, vehicleId)` — no new SQL queries, reusing the exact rows
     every other route already fetches.
  2. Filters both lists to `duplicateOfId === null` (D-005).
  3. Builds a combined cost total, a combined odometer-reading point set (skipping
     `null` service-record readings), and a combined record-date point set, then applies the three
     independent guards from research.md's table.
  4. `averageFuelEconomy` is the mean of the filtered fuel records' `fuelEconomy` values that are
     themselves non-null.

No new exported types are needed on the client side — this feature ships no client code (spec.md
Assumptions: computation-only, no UI).

## GDPR erasure

N/A — no new table or column. This feature only reads `service_records`/`fuel_records` rows whose
erasure behavior (cascading delete from `vehicles`) was already decided in specs 007/009
data-model.md; there is nothing new here for Principle VIII to govern.
