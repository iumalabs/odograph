# Phase 1 Data Model: Monthly/Annual Expense Analytics

## Entities

No new table or column — this feature is a purely derived, computed-on-read view over the
existing `service_records`/`fuel_records` tables (specs/007/009), identical in kind to
`computeVehicleAggregates` (specs/013). No GDPR erasure decision needed: nothing new is stored.

### `ExpensePeriod` (in-memory shape, not persisted)

| Field           | Type                        | Notes                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| `period`          | string                       | `"YYYY-MM"` for month grouping, `"YYYY"` for year grouping (research.md) |
| `maintenanceCost` | number                       | Sum of that period's non-duplicate service records' `cost`, missing cost counted as 0 (FR-005) |
| `fuelCost`         | number                       | Sum of that period's non-duplicate fuel records' `cost` (never null — `fuel_records.cost` is `NOT NULL`, repository.ts:1226) |
| `totalCost`        | number                       | `maintenanceCost + fuelCost`                                  |

## Validation / behavior rules (from Functional Requirements)

- `groupBy` MUST be exactly `"month"` or `"year"` — any other value (including omission) is a
  `400` (FR-001, FR-002, research.md).
- Only periods with at least one qualifying (non-duplicate) record appear — no zero-filled gaps
  (FR-004).
- A service record with `cost === null` contributes `0` to `maintenanceCost`, not skipped from
  consideration for its period, not fabricated to a non-zero value (FR-005) — mirrors
  `computeVehicleAggregates`'s exact existing `if (record.cost !== null) totalCost += record.cost`
  handling (`repository.ts:2326`).
- A record with `duplicateOfId !== null` (constitution D-005) is excluded entirely from every
  period's totals — same filter `computeVehicleAggregates` already applies
  (`repository.ts:2319-2320`) (FR-006).
- `vehicleId` MUST resolve to a vehicle owned by the caller's tenant before any computation runs —
  refused identically to a nonexistent vehicle otherwise (FR-007).
- Returned periods MUST be in chronological order (FR-008) — guaranteed for free by sorting the
  string period keys, since `"YYYY-MM"`/`"YYYY"` string comparison order matches chronological
  order.

## Repository layer addition (shape, not full implementation)

Lives in `src/server/db/repository.ts`, alongside `computeVehicleAggregates`.

```text
type ExpenseGroupBy = "month" | "year";

type ExpensePeriod = {
  period: string; maintenanceCost: number; fuelCost: number; totalCost: number;
};

function computeVehicleExpenseBreakdown(
  db: D1Database, ctx: TenantContext, vehicleId: string, groupBy: ExpenseGroupBy,
): Promise<ExpensePeriod[]>
// Reuses listServiceRecords/listFuelRecordsWithEconomy exactly as computeVehicleAggregates does
// (same Promise.all shape), filters duplicateOfId === null, buckets by
// record.serviceDate/fuelDate.slice(0, groupBy === "month" ? 7 : 4), sums per bucket, returns
// entries sorted by period ascending. Caller (route) has already resolved vehicleId belongs to
// ctx.tenantId via findVehicleById, same trust contract computeVehicleAggregates's own doc
// comment establishes.
```
