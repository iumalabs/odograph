# API Contracts: Service Record CRUD + Attachments

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.

## `POST /api/v1/vehicles/:vehicleId/service-records`

**Request**: `{ "serviceDate": string, "description": string, "odometerReading"?: number,
"cost"?: number, "notes"?: string }`.

**Response** `201`: the created record.

**Response** `400`: `serviceDate`/`description` missing/empty — nothing created.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant (FR-003) —
indistinguishable from either case.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/vehicles/:vehicleId/service-records`

**Response** `200`: `{ "serviceRecords": ServiceRecord[] }` for that vehicle.

**Response** `404`: same not-found-or-not-yours contract as `POST`, for the vehicle itself.

## `GET /api/v1/service-records/:id`

**Response** `200`: the record, including an `attachments` array (id, contentType, size,
createdAt — never the raw `r2Key`, which is an internal detail).

**Response** `404`: not found or not yours.

## `PATCH /api/v1/service-records/:id`

**Request**: any subset of `{ serviceDate, description, odometerReading, cost, notes }`.

**Response** `200`: the updated record. `400` on an invalid included field. `404` on
not-found-or-not-yours.

Rate-limited via `rateLimitBySession`.

## `DELETE /api/v1/service-records/:id`

**Response** `204`: the record and every one of its attachments (D1 rows *and* R2 objects) are
gone.

**Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## `POST /api/v1/service-records/:id/attachments`

**Request**: raw file bytes as the request body (not multipart) — `Content-Type` header is read but
never trusted for the accept/reject decision (FR-010); the sniffed type is what's stored and
validated against.

**Response** `201`: `{ "id": string, "contentType": string, "size": number, "createdAt": string }`.

**Response** `400`: the sniffed type isn't in the allowlist (JPEG/PNG/WebP/PDF), or the body exceeds
the size cap (10MB) — nothing stored (FR-014).

**Response** `404`: `:id` (the service record) not found or not yours.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/service-records/:id/attachments/:attachmentId`

**Response** `200`: the raw, stored (EXIF-stripped, where applicable) bytes, with `Content-Type`
set to the stored (sniffed) type — served directly by this Worker route, never a redirect to a
public storage URL (FR-013).

**Response** `404`: the service record or the attachment doesn't exist, or belongs to a different
tenant — indistinguishable from each other.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership is always the
  caller's resolved `tenantContext`, same contract every prior tenant-scoped feature established.
- `DELETE /api/v1/vehicles/:id` (specs/006, modified by this feature) now also deletes every R2
  object belonging to that vehicle's service records' attachments before the D1 delete cascades —
  no change to that route's request/response contract, only its side effects.
