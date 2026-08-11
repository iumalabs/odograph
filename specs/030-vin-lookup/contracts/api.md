# API Contracts: VIN Lookup on Vehicle Add

## `GET /api/v1/vin-lookup/:vin`

Requires an authenticated session (`tenantContextOrToken`) — `401` without one. Not vehicle-scoped
(the vehicle doesn't exist yet at lookup time) and not tenant-data-scoped — this route touches no
D1 data at all, it's a pure proxy to NHTSA vPIC. Rate-limited via `rateLimitBySession` (research.md
— defense-in-depth against relaying abuse traffic to a third party, not a D1-write concern).

**Path parameter**: `vin` — the VIN string as typed by the owner. A locally-obvious malformation
(under a minimal plausible length, or over a generous maximum) short-circuits to the same `200
found:false` response below without calling NHTSA at all (spec.md edge case — avoids a pointless
round-trip; the max-length bound is a code-review-driven abuse-prevention addition, not a VIN
format validator — NHTSA's own response remains the format authority per spec.md).

**Response** `200`: `{ "found": true, "make": string | null, "model": string | null, "year": number
| null }` — `found: true` only when NHTSA returned at least one usable field; a field NHTSA didn't
return is `null`, never guessed (FR-003, FR-005, constitution Principle IV).

**Response** `200` (not found): `{ "found": false, "make": null, "model": null, "year": null }` —
used uniformly for every failure mode: a locally-short-circuited malformed VIN, a transport-level
failure reaching NHTSA (timeout, unreachable, non-2xx), and a reached-but-undecodable/empty NHTSA
result. All collapse to the same `DecodeResult.ok: false` in `decodeVin` (implementation note,
corrected from an earlier draft of this contract that specified a distinct `503` for transport
failures — `decodeVin`'s result type has no such discriminant, and spec.md is explicit that
distinguishing these cases in the UI is not required, so the simpler uniform shape is what's
actually built). A `200` (not a `4xx`/`5xx`) because "no details available" is an expected, valid
outcome, not a client error (spec.md User Story 2 — must never block vehicle creation).

## Cross-cutting

- This route is called by the client BEFORE vehicle creation, as a standalone pre-submit step — it
  is never part of the `POST /api/v1/vehicles` request/response cycle and has no interaction with
  the offline write queue (FR-009).
- `POST /api/v1/vehicles` and `PATCH /api/v1/vehicles/:id` are unchanged by this feature — they
  already accept optional `make`/`model`/`year`/`vin` (`src/server/routes/v1/vehicles.ts`).
