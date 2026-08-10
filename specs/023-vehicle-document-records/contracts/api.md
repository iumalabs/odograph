# API Contracts: Vehicle Document Records — CRUD, Expiry Tracking, and Attachments

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.

## `POST /api/v1/vehicles/:vehicleId/documents`

**Request**: `{ "title": string, "category": "registration" | "insurance" | "warranty" |
"inspection" | "other", "expiryDate"?: string, "notes"?: string }`.

**Response** `201`: the created document, including `isExpired: false` (a fresh document can never
be created already-expired unless `expiryDate` is in the past — that's still computed the same
way, not special-cased).

**Response** `400`: `title` missing/empty, `category` missing or outside the defined set — nothing
created.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant (FR-004) —
indistinguishable from either case.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/vehicles/:vehicleId/documents`

**Response** `200`: `{ "documents": Document[] }` for that vehicle, each including `isExpired`.

**Response** `404`: same not-found-or-not-yours contract as `POST`, for the vehicle itself.

## `GET /api/v1/documents/:id`

**Response** `200`: the document, including `isExpired` and an `attachments` array (id,
contentType, size, createdAt — never the raw `r2Key`, which is an internal detail).

**Response** `404`: not found or not yours.

## `PATCH /api/v1/documents/:id`

**Request**: any subset of `{ title, category, expiryDate, notes }`. `expiryDate: null` explicitly
clears it (distinct from omitting the field, which leaves it unchanged) — same omitted-vs-null
convention `PATCH /api/v1/service-records/:id` already uses for its optional fields.

**Response** `200`: the updated document, with `isExpired` recomputed against the (possibly new)
`expiryDate`. `400` on an invalid included field (e.g. `category` outside the defined set).
`404` on not-found-or-not-yours.

Rate-limited via `rateLimitBySession`.

## `DELETE /api/v1/documents/:id`

**Response** `204`: the document and every one of its attachments (D1 rows *and* R2 objects) are
gone.

**Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## `POST /api/v1/documents/:id/attachments`

**Request**: raw file bytes as the request body (not multipart) — `Content-Type` header is read
but never trusted for the accept/reject decision (FR-012); the sniffed type is what's stored and
validated against.

**Response** `201`: `{ "id": string, "contentType": string, "size": number, "createdAt": string }`.

**Response** `400`: the sniffed type isn't in the allowlist (JPEG/PNG/WebP/PDF), or the body
exceeds the size cap (10MB) — nothing stored (FR-016).

**Response** `404`: `:id` (the document) not found or not yours.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/documents/:id/attachments/:attachmentId`

**Response** `200`: the raw, stored (EXIF-stripped, where applicable) bytes, with `Content-Type`
set to the stored (sniffed) type — served directly by this Worker route, never a redirect to a
public storage URL (FR-015).

**Response** `404`: the document or the attachment doesn't exist, or belongs to a different
tenant — indistinguishable from each other.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership is always the
  caller's resolved `tenantContext`, same contract every prior tenant-scoped feature established.
- `DELETE /api/v1/vehicles/:id` (specs/006, already modified once each by specs/007 and specs/009)
  now also deletes every R2 object belonging to that vehicle's documents' attachments before the D1
  delete cascades — no change to that route's request/response contract, only its side effects.
