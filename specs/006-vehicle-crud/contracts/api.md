# API Contracts: Vehicle CRUD

Routes under `/api/v1/vehicles`. All require an authenticated session (`tenantContext`) — `401`
without one, for every route below.

## `POST /api/v1/vehicles`

**Request**: `{ "name": string, "odometerUnit": "km" | "mi", "make"?: string, "model"?: string,
"year"?: number, "vin"?: string }`.

**Response** `201`: the created vehicle, including server-assigned `id`, `createdAt`, `updatedAt`.

**Response** `400`: `name` missing/empty, `odometerUnit` missing/invalid, or `year` present but
outside `[1900, currentYear + 10]` — nothing created.

Rate-limited via `rateLimitBySession` (write path, Principle VII).

## `GET /api/v1/vehicles`

**Response** `200`: `{ "vehicles": Vehicle[] }` — every vehicle owned by the caller's tenant, and
no others (FR-003).

## `GET /api/v1/vehicles/:id`

**Response** `200`: the vehicle, if it exists and belongs to the caller's tenant.

**Response** `404`: the id doesn't exist, or belongs to a different tenant — the two cases are
indistinguishable (FR-007).

## `PATCH /api/v1/vehicles/:id`

**Request**: any subset of `{ name, make, model, year, vin, odometerUnit }` — omitted fields are
left unchanged (FR-005).

**Response** `200`: the updated vehicle, reflecting only the changed fields.

**Response** `400`: an included field fails the same validation as `POST` (e.g. an invalid
`odometerUnit` or out-of-range `year`) — no change applied.

**Response** `404`: same not-found-or-not-yours contract as `GET /:id`.

Rate-limited via `rateLimitBySession`.

## `DELETE /api/v1/vehicles/:id`

**Response** `204`: the vehicle no longer exists or is fetchable (FR-006).

**Response** `404`: same not-found-or-not-yours contract as `GET /:id`.

Rate-limited via `rateLimitBySession`.

## Cross-cutting

- No route here ever accepts or trusts a client-supplied tenant/owner id — ownership is always the
  caller's resolved `tenantContext` (constitution Principle I), the same contract
  `_tenant-isolation-probe` proved before this feature replaced it.
