# API Contracts: Semantic Duplicate Detection & Resolution

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.
This feature adds two new routes and extends the response shape of every existing fuel/service
record route with a `duplicateOfId: string | null` field — no existing route's status codes,
request bodies, or other response fields change (D-005: detection never blocks a write).

## Response shape change (all existing fuel/service record routes)

Every response that includes a fuel or service record — `POST`/`GET` (list and detail),
`PATCH` — now includes `duplicateOfId: string | null`: the id of the earlier record this one was
flagged as a possible duplicate of, or `null` if never flagged (or flagged and since dismissed).

For fuel records specifically: `fuelEconomy` is `null` both when there's no earlier record to
compare against (spec 009's existing "not enough data" case) and when the record is currently
flagged (`duplicateOfId != null`) — the client distinguishes the two states by checking
`duplicateOfId`, not by any new server-side field (research.md).

## `POST /api/v1/fuel-records/:id/dismiss-duplicate`

**Request**: no body.

**Response** `200`: the record with `duplicateOfId` now `null`, and (since it may now be included
in the odometer-ordered pass) a freshly-computed `fuelEconomy`.

**Response** `404`: the record doesn't exist, belongs to a different tenant, or isn't currently
flagged (`duplicateOfId` is already `null`) — dismissing an unflagged record is treated the same
as the record not existing, since there's nothing to dismiss.

Rate-limited via `rateLimitBySession`.

## `POST /api/v1/service-records/:id/dismiss-duplicate`

**Request**: no body.

**Response** `200`: the record with `duplicateOfId` now `null`.

**Response** `404`: not found, not yours, or not currently flagged — same contract as the fuel
version above.

Rate-limited via `rateLimitBySession`.

## Cross-cutting

- Nothing here ever accepts a client-supplied `duplicateOfId` — it's set only by the server's own
  detection logic at creation time, and cleared only by the dismiss routes above or by deleting the
  referenced record (`ON DELETE SET NULL`, data-model.md). Attempting to set it via `PATCH` has no
  effect (it isn't in either record type's patchable field set).
- Detection and dismissal never cross tenant or vehicle boundaries — the matching query is always
  scoped to the caller's own tenant and the specific vehicle the new record belongs to.
