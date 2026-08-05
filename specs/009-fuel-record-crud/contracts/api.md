# API Contracts: Fuel Record CRUD + Attachments

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.

## `POST /api/v1/vehicles/:vehicleId/fuel-records`

**Request**: `{ "fuelDate": string, "odometerReading": number, "volume": number, "cost": number,
"station"?: string, "notes"?: string }`.

**Response** `201`: the created record, including `fuelEconomy` (`null` — a vehicle's first fuel
record never has a computable figure at creation time).

**Response** `400`: `fuelDate`/`odometerReading`/`volume`/`cost` missing/invalid — nothing created.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant — indistinguishable
from either case.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/vehicles/:vehicleId/fuel-records`

**Response** `200`: `{ "fuelRecords": FuelRecord[] }` for that vehicle, each including
`fuelEconomy: number | null`, ordered by `fuelDate` (display order — not the odometer order used
internally to compute economy).

**Response** `404`: same not-found-or-not-yours contract as `POST`, for the vehicle itself.

## `GET /api/v1/fuel-records/:id`

**Response** `200`: the record, including `fuelEconomy: number | null` and an `attachments` array
(id, contentType, size, createdAt — never the raw `r2Key`).

**Response** `404`: not found or not yours.

## `PATCH /api/v1/fuel-records/:id`

**Request**: any subset of `{ fuelDate, odometerReading, volume, cost, station, notes }`.

**Response** `200`: the updated record, with `fuelEconomy` recomputed against the vehicle's full
current ordering (FR-008) — may differ from the record's previous `fuelEconomy` even if this
record's own odometer reading wasn't the field changed, if a neighboring record's economy
calculation depends on this one.

**Response** `400`: invalid included field. `404`: not-found-or-not-yours.

Rate-limited via `rateLimitBySession`.

## `DELETE /api/v1/fuel-records/:id`

**Response** `204`: the record and every one of its attachments (D1 rows *and* R2 objects) are
gone.

**Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## `POST /api/v1/fuel-records/:id/attachments`

**Request**: raw file bytes as the request body (not multipart) — identical contract to spec 007's
service-record attachment upload (magic-byte sniffing, 10MB cap, EXIF stripping for JPEG).

**Response** `201`: `{ "id": string, "contentType": string, "size": number, "createdAt": string }`.

**Response** `400`: sniffed type not in the allowlist, or body exceeds the size cap — nothing
stored.

**Response** `404`: `:id` (the fuel record) not found or not yours.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/fuel-records/:id/attachments/:attachmentId`

**Response** `200`: the raw, stored (EXIF-stripped where applicable) bytes, `Content-Type` set to
the stored sniffed type — served directly, never a redirect to a public URL.

**Response** `404`: the fuel record or the attachment doesn't exist, or belongs to a different
tenant — indistinguishable from each other.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership always comes from
  the caller's resolved `tenantContext`, same contract every prior tenant-scoped feature
  established.
- `DELETE /api/v1/vehicles/:id` (specs 006/007, modified again by this feature) now also deletes
  every R2 object belonging to that vehicle's fuel records' attachments, alongside its service
  records' attachments — no change to that route's request/response contract, only its side
  effects.
- `fuelEconomy` is never a field accepted in any request body — attempting to set it has no
  effect; it's a read-only, server-computed value on every response shape that includes a fuel
  record (FR-008).
