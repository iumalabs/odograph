# API Contracts: Maintenance History PDF Export

## `GET /api/v1/vehicles/:vehicleId/report.pdf`

Requires an authenticated session (`tenantContext`) — `401` without one.

**Response** `200`: the generated PDF's raw bytes, `Content-Type: application/pdf`,
`Content-Disposition: attachment; filename="<vehicle-name>-maintenance-history.pdf"` (filename
sanitized to safe characters). Always a well-formed PDF, even for a vehicle with zero records
(FR-009) — never an error for the empty case.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant (FR-002) —
indistinguishable from either case, same contract every other vehicle-scoped route already has.

Read-only, not rate-limited — matches `/:vehicleId/aggregates` and
`/:vehicleId/expense-breakdown`'s existing posture; PDF generation is in-memory and bounded by the
vehicle's own record count, no different in kind from those routes' own read cost.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership is always the
  caller's resolved `tenantContext`.
- The generated document is never persisted anywhere (not D1, not R2) — a fresh request always
  regenerates from current data, so a report is always up to date with the latest edits/deletes.
