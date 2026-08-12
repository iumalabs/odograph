# Phase 0 Research: Garage Cards Show Vehicle Data

No `[NEEDS CLARIFICATION]` markers were left in the spec. This phase confirms implementation-level
decisions already implied by the codebase's existing conventions.

## Decision: Where the odometer field lives

**Decision**: Add `currentOdometer: number | null` to `computeVehicleAggregates`'s return type
(`VehicleAggregates`), derived from `odometerPoints` — an array the function already builds
in-memory from the same non-duplicate-flagged service/fuel records it fetches for its existing
cost-per-distance calculation (`Math.max(...odometerPoints)` when non-empty, else `null`).

**Rationale (revised during implementation)**: Initially planned as a call to the existing
`getVehicleCurrentOdometer` helper in a parallel query. Reading the function's actual body at
implementation time found something better: `computeVehicleAggregates` already collects every
non-duplicate record's odometer reading into `odometerPoints` for its distance-span calculation —
the current odometer is just `Math.max` of that same array, with no second database query needed at
all. This is also *more correct* than `getVehicleCurrentOdometer`, which does not exclude
duplicate-flagged records (constitution D-005) the way this function's `services`/`fuels` filtering
already does — using the in-memory array avoids the endpoint's most-visible field silently
disagreeing with its own cost figures on a vehicle with a flagged duplicate record.

**Note**: `getVehicleCurrentOdometer` itself is unchanged and still used by its existing callers
(reminder-status computation, the maintenance-planner's auto-fill) — this decision only affects
where `computeVehicleAggregates` gets its own copy of the same figure from.

**Alternatives considered**: A new dedicated `GET /:vehicleId/odometer` route — rejected as an
unnecessary second request for a value that's cheap to compute alongside data already being
fetched. Adding it directly to the `Vehicle` entity/table as a stored column — rejected because it's
explicitly a derived value (max of recorded readings), and storing it would create a second source
of truth that could drift from the records it's derived from (constitution Principle IV's spirit:
no interpolated/duplicated data).

## Decision: Client fetch pattern in Garage.tsx

**Decision**: Reuse `DashboardView.tsx`'s exact pattern verbatim: on mount/`vehicles` change, fetch
`getVehicleAggregates(vehicle.id)` and `listReminderRules(vehicle.id)` in parallel per vehicle via
`Promise.all`, each independently `.catch(() => null)` / `.catch(() => [])`, store results in a
`Record<string, Summary>` keyed by vehicle id, keyed off a `cancelled` flag to avoid a stale-closure
state update after unmount.

**Rationale**: This exact pattern is already proven in this codebase for the same underlying data
(aggregates + reminder rules per vehicle) on the Dashboard screen. Reusing it verbatim in Garage
satisfies FR-006 (a failed/slow fetch for one vehicle doesn't block others) for free, since it's the
same resilience mechanism already validated there — no new pattern to design or test from scratch.

**Alternatives considered**: A shared hook (`useVehicleSummaries`) extracted once and used by both
`DashboardView.tsx` and `Garage.tsx` — a reasonable follow-up refactor, but out of scope here per
the spec's own boundary ("purely additive to Garage's cards... not removing DashboardView.tsx's own
card content"); duplicating ~15 lines of fetch logic once is not worth a refactor of an unrelated,
already-shipped, already-tested screen as a side effect of this feature.

## Decision: Most-urgent-reminder derivation

**Decision**: A small client-side helper in `Garage.tsx` (not exported/shared) that, given a
vehicle's `ReminderRule[]`, returns the single rule with the highest urgency
(`overdue` > `coming_up`, ignoring `on_track`/`not_enough_data`), or `null` if none qualify.

**Rationale**: The server already has an equivalent ranking (`REMINDER_URGENCY` in
`repository.ts`), but it's internal/unexported and used for a different purpose (notification
de-dup). `DashboardView.tsx` already derives its own `needsAttention` boolean client-side from the
same `status` field via `.some(...)` — this feature's "pick the most urgent one" is the same class
of client-side derivation, just picking a value instead of a boolean, consistent with the existing
precedent of not adding server logic for a purely presentational reduction.
