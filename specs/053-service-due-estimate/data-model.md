# Phase 1 Data Model: History-Based Service Due Estimate

No schema changes. This feature reads two existing tables (`service_records`, `reminder_rules`)
and, on accept, writes one ordinary row to the second via the existing `createReminderRule`
repository function (`src/server/db/repository.ts`) — no new table, no new columns.

## Existing entities read

- **`service_records`** (via `listServiceRecords(db, ctx, vehicleId)`) — `ServiceRecord[]`:
  `id`, `tenantId`, `vehicleId`, `serviceDate`, `description`, `odometerReading`, `cost`, `notes`,
  `performedBy`, `duplicateOfId`, `createdAt`, `updatedAt`.
- **`reminder_rules`** (via `listReminderRulesWithStatus` or a new lightweight label-only read) —
  only `label` is needed, to check FR-006's suppression rule.

## Derived value: `ServiceDueEstimate` (in-memory only, not persisted)

Computed by a new repository function, e.g. `computeServiceDueEstimate(db, ctx, vehicleId)`:

```ts
type ServiceDueEstimate = {
  description: string; // the work group's shared description, verbatim from its records
  estimatedOdometer: number; // most recent matching record's odometerReading + averageInterval
  averageInterval: number; // average distance between consecutive records in the group
  basedOnRecordCount: number; // how many records contributed (>= 2)
} | null; // null when no qualifying group exists
```

### Computation (FR-001–FR-006)

1. Fetch `listServiceRecords(db, ctx, vehicleId)`, excluding records where `duplicateOfId !=
   null` (a flagged semantic duplicate — constitution D-005 — must not distort the interval math)
   and records where `odometerReading == null` (nothing to measure distance from).
2. Group the remainder by `description.trim().toLowerCase()`, keeping each group's original
   (unnormalized) `description` from its most recent record for display.
3. Discard any group with fewer than 2 records, and any group whose only computable interval(s)
   are all zero (spec Edge Case: identical odometer readings contribute nothing usable).
4. For each remaining group, sort by `serviceDate` ascending, compute the distance between each
   consecutive pair, and average them (FR-002). `estimatedOdometer` = most recent record's
   `odometerReading` + that average.
5. Fetch existing `reminder_rules` labels for the vehicle; drop any group whose normalized
   description matches an existing rule's normalized label (FR-006).
6. Of what remains, return the single group with the soonest `estimatedOdometer`
   (`estimatedOdometer` ascending; ties broken by most-recent contributing record's `serviceDate`,
   per spec Edge Cases) — or `null` if nothing qualifies.

## Write path: accepting an estimate

A new repository function, e.g. `acceptServiceDueEstimate(db, ctx, vehicleId, description,
clientId?)`, that:

1. Re-derives the same `ServiceDueEstimate` server-side from the current data (never trusts a
   client-supplied `estimatedOdometer`/`averageInterval` — those are recomputed, not accepted
   as input, so a stale client can't write a stale/fabricated number).
2. If no estimate still qualifies for that `description` (e.g. it was accepted or superseded
   already — see idempotency below), returns without creating a duplicate row.
3. Otherwise calls the existing `createReminderRule(db, ctx, vehicleId, input, clientId)` with:

   | `ReminderRuleInput` field | Value |
   |---|---|
   | `label` | the estimate's `description` |
   | `intervalDays` | `null` (distance-only, per spec Assumptions) |
   | `intervalDistance` | the estimate's `averageInterval` |
   | `lastDoneDate` | the most recent contributing record's `serviceDate` |
   | `lastDoneOdometer` | the most recent contributing record's `odometerReading` |

   This makes the existing reminder due-computation formula (`dueOdometer = lastDoneOdometer +
   intervalDistance`) reproduce the exact `estimatedOdometer` the owner saw before accepting.

### Idempotency (FR-010)

The route wraps this in the existing `idempotent` middleware (same as `plan-cards.ts` PATCH and
the mark-done route), keyed on the caller-supplied idempotency key — a retried accept replays the
cached response rather than re-running the write. `clientId` (optional, same convention as
`createServiceRecord`/other creators) lets an offline-queued accept use a client-generated UUID
as the new row's `id`, so even a non-idempotency-header retry path can't double-create.
