# API Contracts: Search Across Vehicles and Records

## `GET /api/v1/search?q=<query>`

Requires an authenticated session (`tenantContext`) — `401` without one. Tenant-wide, not
vehicle-scoped — no `:vehicleId` in the path (contrast with every other read route in this
codebase).

**Query parameters**: `q` — required, at least 2 characters after trimming.

**Response** `200`: `{ "vehicles": VehicleMatch[], "serviceRecords": RecordMatch[], "fuelRecords":
RecordMatch[], "documents": RecordMatch[] }` (data-model.md shapes). Any or all arrays may be
empty — an all-empty response is still `200`, never an error (FR-010).

**Response** `400`: `q` missing or shorter than 2 characters after trimming — nothing searched
(FR-002).

Read-only, not rate-limited — matches every other GET route's existing posture; four bounded,
`tenant_id`-indexed `LIKE` queries, no different in kind from any other read.

## Cross-cutting

- Every one of the four underlying queries filters by the caller's own resolved `ctx.tenantId`
  directly — there's no vehicle id to pre-resolve ownership through, since this route has none
  (FR-009).
- A record flagged as a semantic duplicate (constitution D-005) still appears in results —
  deliberately, per research.md, not excluded like the cost-aggregate features exclude it.
