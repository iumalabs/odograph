# API Contracts: Server-Computed Per-Vehicle Aggregates

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.

## `GET /api/v1/vehicles/:vehicleId/aggregates`

**Response** `200`:

```json
{
  "costPerDistance": 0.42,
  "costPerTime": 3.15,
  "averageFuelEconomy": 7.8
}
```

Every field is independently `number | null` — see data-model.md and research.md for exactly when
each is `null`. A vehicle with zero service or fuel records still returns `200` with all three
fields `null` (FR-006) — the vehicle's own existence is what this endpoint validates, not whether
it has enough history to compute a number.

**Response** `404`: `vehicleId` doesn't exist, or belongs to a different tenant than the caller —
both cases refused identically (FR-008), same not-found-or-not-yours contract every other
vehicle-nested route in this codebase already uses.

Not rate-limited (read-only, same as every other `GET` route in `vehicles.ts`).

## Cross-cutting

- Nothing here accepts or trusts a client-supplied tenant id — ownership always comes from the
  caller's resolved `tenantContext`, and `:vehicleId` is checked via `findVehicleById` before the
  aggregate computation ever runs.
- No request body — this is a pure `GET`.
- No pagination, no query parameters — the response is always the full lifetime-to-date summary
  for the one named vehicle (spec.md Assumptions: no time-windowed variant in this slice).
