# Phase 0 Research: Live Fuel Consumption & Cost Preview

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: The preview is server-computed via a new read-only GET endpoint, not client math

**Decision**: `GET /api/v1/vehicles/:vehicleId/fuel-preview?odometerReading=&volume=&cost=` computes
the estimate server-side and returns `{ economy: number | null, costPerDistance: number | null }`.
The client debounces a call to this endpoint as the owner types; it does not run the division
itself.

**Rationale**: The originating GitHub issue described this as a "purely client-side" preview.
Constitution Principle II explicitly names fuel economy as an aggregate that MUST be computed
server-side, never client-side — a literal reading of the issue would have violated that principle.
Moving the computation server-side, while keeping the *experience* live (the client still updates
the displayed number as the owner types, just via a debounced network round-trip instead of local
arithmetic), satisfies both the issue's actual goal and the constitution.

**Alternatives considered**:
- Compute client-side directly from the already-loaded `mergedFuelRecords` list (rejected — direct
  Principle II violation; also would silently diverge from the server's rounding/edge-case behavior
  over time since the two implementations aren't the same code).
- Ship the whole vehicle's fuel-economy formula as a small shared/duplicated pure function importable
  by both client and server (rejected — this project's server logic is Workers-only code with no
  existing client/server shared-code layer; introducing one for a single formula is more
  infrastructure than the feature needs, and duplicated logic drifts. A network round-trip to the
  single source of truth is simpler and matches the existing `/aggregates` and `/expense-breakdown`
  endpoints' own pattern).

## Decision: Reuse `computeFuelEconomy` and the existing "previous record by odometer" lookup, not new math

**Decision**: The new repository function locates the vehicle's most recent prior fuel record the
same way `listFuelRecordsWithEconomy` already does — the non-duplicate (`duplicateOfId === null`)
record with the highest `odometerReading` — then calls the exact same `computeFuelEconomy(vehicle.
odometerUnit, deltaDistance, volume)` function already used for saved records' economy figures.

**Rationale**: This guarantees the preview and the eventual saved value are computed by literally
the same code path (spec.md FR-002/SC-003), and inherits the existing division-safety guard
(`deltaDistance <= 0` → `null`) for free instead of re-implementing it.

## Decision: Cost-per-distance is a new, small addition — same denominator, no new lookup

**Decision**: When a positive `cost` query param is present alongside a resolvable positive
distance, the endpoint also returns `costPerDistance = cost / deltaDistance`; otherwise `null`.

**Rationale**: Reuses the same `deltaDistance` the economy calculation already computed — no second
prior-record lookup, no new formula shape. Guarded the same way (`deltaDistance <= 0` → `null`,
`cost <= 0` → `null`), consistent with Principle II's "every denominator guarded for zero" rule.

## Decision: Debounce lives in the client component, not a new shared hook

**Decision**: `FuelRecordPanel.tsx` debounces the preview fetch locally (a `useEffect` with a
`setTimeout`/cleanup pattern), not via a new generic `useDebounce` hook.

**Rationale**: No debounce utility exists anywhere in this codebase yet, and this is the only place
that needs one. Matches this project's stated preference against introducing abstractions before a
second use case exists.

## Decision: The endpoint is read-only, unauthenticated-by-tenant-only (no rate limit), matching `/aggregates`

**Decision**: Same posture as `/:vehicleId/aggregates` and `/:vehicleId/expense-breakdown` — tenant-
scoped auth via the existing session middleware, `findVehicleById` 404 check, no additional rate
limiting beyond what already applies to every route in this file.

**Rationale**: Consistency with the two other existing lightweight read-only vehicle-aggregate
endpoints in the same route file; introducing a different posture for this one endpoint would be an
unexplained inconsistency.
