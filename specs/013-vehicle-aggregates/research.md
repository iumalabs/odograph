# Phase 0 Research: Server-Computed Per-Vehicle Aggregates

No `NEEDS CLARIFICATION` markers remain in the Technical Context — this feature uses the existing
stack with no new dependency, table, or unknown. The decisions below are the design choices spec.md
already made as documented Assumptions, expanded here with the alternatives considered.

## Where the aggregate is computed: repository layer, at request time, no caching

**Decision**: A new pure(-ish) repository function, `computeVehicleAggregates(db, ctx,
vehicleId)`, reads the vehicle's existing service and fuel records (via the existing
`listServiceRecords` and `listFuelRecordsWithEconomy` functions) and folds them into the three
aggregates on every call. Nothing is stored; there is no cache to invalidate.

**Rationale**: Identical reasoning to `listFuelRecordsWithEconomy` (spec 009 research.md): storing
a computed aggregate as a column requires identifying and updating it on every write to any record
that could affect it (a new fuel-up changes `costPerDistance` for the whole vehicle, not just
itself). Computing at read time means every write is already correct on the very next read, with
no separate recomputation step to forget (FR-009). Given this endpoint is called at most once per
vehicle view (no high-frequency polling expected), the extra per-request computation cost is
negligible next to the correctness and simplicity win.

**Alternatives considered**:
- **Store aggregates as columns on `vehicles`, recomputed on every service/fuel record write**:
  rejected for the same cache-invalidation-complexity reason `listFuelRecordsWithEconomy` already
  rejected it — every write path (create, update, delete, dismiss-duplicate) across two different
  record types would need to remember to recompute three unrelated numbers on a third table.
- **A separate materialized-view-style table refreshed by a Cron Trigger**: rejected as
  significant complexity (a new table, a new scheduled job, and a staleness window between writes
  and the next Cron run) for a computation cheap enough to do inline on every request.

## costPerDistance and costPerTime: combining two record types into one total

**Decision**: `totalCost` sums `cost` across every non-duplicate-flagged service record (skipping
any with a `null` cost — cost is optional on service records, per spec 007) and every
non-duplicate-flagged fuel record (`cost` is required there, per spec 009). `costPerDistance`
divides that by the span between the lowest and highest odometer reading seen across both record
types (again skipping service records with a `null` odometer reading — also optional). `costPerTime`
divides the same `totalCost` by the number of days between the earliest and latest record date
(service `serviceDate` or fuel `fuelDate`) across both types.

**Rationale**: Combining both record types into one total is the only interpretation that answers
"what does this vehicle cost me" — a vehicle with heavy service costs but light fuel costs (or vice
versa) shouldn't need two separate numbers added by the client; that's exactly the kind of
client-side computation Principle II reserves for the server. Distance and time spans use `min`/`max`
across both types for the same reason: the true "how far has this vehicle been tracked" question
isn't scoped to one record type.

**Alternatives considered**:
- **Separate cost-per-distance for service vs. fuel**: rejected — doubles the response shape for a
  distinction the spec's own framing (issue #16: "fuel economy, cost-per-distance, cost-per-time")
  never asked for; can be added later as additional fields without a breaking change if a real need
  emerges.
- **Per-100-distance-units convention (matching fuel economy's L/100km)**: rejected for
  `costPerDistance`/`costPerTime` — per spec.md's Assumptions, per-single-unit keeps the three
  aggregates in this one response consistent with each other ("cost per km" / "cost per day"),
  whereas L/100km is a domain-specific fuel-economy convention that doesn't naturally extend to a
  cost figure.

## Division-safety guards, enumerated

**Decision**: Three independent guards, each producing `null` (not `0`, not an error) for exactly
one aggregate when its own denominator is insufficient:

| Aggregate | Denominator | Guard |
|---|---|---|
| `costPerDistance` | `maxOdometer - minOdometer` across qualifying records | `null` if fewer than 2 qualifying odometer readings, or the span is `<= 0` |
| `costPerTime` | days between earliest and latest record date | `null` if fewer than 2 qualifying records, or the day span is `<= 0` |
| `averageFuelEconomy` | count of fuel records with a non-null per-record `fuelEconomy` | `null` if that count is `0` |

**Rationale**: This is a direct extension of `computeFuelEconomy`'s existing `deltaDistance <= 0 →
null` guard (spec 009) to two new denominators, plus a third guard (empty-set mean) for
`averageFuelEconomy`. Each guard is independent so that one aggregate being `null` (e.g. a vehicle
with only service records has no fuel data at all) never prevents the other two from computing
normally — explicitly required by spec.md's Edge Cases section.

**Alternatives considered**: none seriously — this is the same pattern already proven correct and
reviewed in this codebase (`computeFuelEconomy`), not a new design.

## Excluding duplicate-flagged records

**Decision**: Every sum, minimum, and maximum used by any of the three aggregates filters out
records where `duplicateOfId !== null` before folding, matching exactly how
`listFuelRecordsWithEconomy` already excludes them from fuel-economy computation.

**Rationale**: A soft-flagged duplicate (constitution D-005) represents the same real-world event
recorded twice; counting its cost twice, or letting its (possibly slightly different) odometer
reading widen the distance span, would double-count or skew every aggregate until the user
resolves the flag. This is not a new decision — D-005 already establishes that flagged records are
excluded from aggregates project-wide; this feature simply has to honor it in a second place.

**Alternatives considered**: none — this is a locked product decision (D-005), not open to
reconsideration here.
