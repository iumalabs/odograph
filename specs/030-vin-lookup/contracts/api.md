# API Contracts: VIN Lookup on Vehicle Add

## `GET /api/v1/vin-lookup/:vin`

Requires an authenticated session (`tenantContextOrToken`) — `401` without one. Not vehicle-scoped
(the vehicle doesn't exist yet at lookup time) and not tenant-data-scoped — this route touches no
D1 data at all, it's a pure proxy to NHTSA vPIC. Rate-limited via `rateLimitBySession` (research.md
— defense-in-depth against relaying abuse traffic to a third party, not a D1-write concern).

**Path parameter**: `vin` — the VIN string as typed by the owner. A locally-obvious malformation
(e.g. under a minimal plausible length) short-circuits to the same `404`/not-found response below
without calling NHTSA at all (spec.md edge case — avoids a pointless round-trip).

**Response** `200`: `{ "found": true, "make": string | null, "model": string | null, "year": number
| null }` — `found: true` only when NHTSA returned at least one usable field; a field NHTSA didn't
return is `null`, never guessed (FR-003, FR-005, constitution Principle IV).

**Response** `200` (not found): `{ "found": false, "make": null, "model": null, "year": null }` —
used for BOTH "NHTSA reached but returned an undecodable/empty result" and, from the client's
perspective, indistinguishable in shape from a locally-short-circuited malformed VIN. A `200` (not a
`4xx`) because "no details available" is an expected, valid outcome, not a client error (spec.md
User Story 2 — must never block vehicle creation).

**Response** `503`: the proxy call to NHTSA itself failed (timeout, unreachable, non-2xx from
NHTSA) — a genuine infrastructure-level failure, distinct from "reached NHTSA, got an empty
result." The client treats `200 found:false` and `503` identically in its UI messaging
(spec.md — distinguishing them is explicitly not required), but the distinct status codes are kept
so server-side logs/metrics can tell the two apart if that's ever useful later.

## Cross-cutting

- This route is called by the client BEFORE vehicle creation, as a standalone pre-submit step — it
  is never part of the `POST /api/v1/vehicles` request/response cycle and has no interaction with
  the offline write queue (FR-009).
- `POST /api/v1/vehicles` and `PATCH /api/v1/vehicles/:id` are unchanged by this feature — they
  already accept optional `make`/`model`/`year`/`vin` (`src/server/routes/v1/vehicles.ts`).
