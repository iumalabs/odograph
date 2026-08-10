# API Contracts: Maintenance Planner — Kanban Board

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.
Every write route additionally supports the existing `Idempotency-Key` header (constitution
Principle III, specs/020) — same opt-in mechanism every other write route already has.

## `POST /api/v1/vehicles/:vehicleId/plan-cards`

**Request**: `{ "id"?: string, "title": string, "targetDate"?: string, "estimatedCost"?: number,
"urgent"?: boolean }`. `id`, if present, is the client-generated id for offline-queue creates
(same convention `POST /api/v1/vehicles/:vehicleId/service-records` already has).

**Response** `201`: the created card, `stage: "idea"`.

**Response** `400`: `title` missing/empty — nothing created.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant (FR-003) —
indistinguishable from either case.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/vehicles/:vehicleId/plan-cards`

**Response** `200`: `{ "planCards": PlanCard[] }` for that vehicle.

**Response** `404`: same not-found-or-not-yours contract as `POST`, for the vehicle itself.

## `GET /api/v1/plan-cards/:id`

**Response** `200`: the card.

**Response** `404`: not found or not yours.

## `PATCH /api/v1/plan-cards/:id`

**Request**: any subset of `{ title, stage, targetDate, estimatedCost, urgent }`. `stage` MUST be
one of `idea`/`buy`/`doing`/`done` — any other value is rejected (`400`) with no change applied
(FR-005). `estimatedCost: null`/`targetDate: null` explicitly clear those fields.

**Response** `200`: the updated card. When this request changes `stage` to `"done"` from a
different value, a new service record is also created for the card's vehicle as a side effect
(FR-007) — the response body is still just the updated card, not the new service record; the
service record itself is retrievable the normal way, via
`GET /api/v1/vehicles/:vehicleId/service-records`.

**Response** `400`: an invalid `stage` value, or another invalid included field.

**Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## `DELETE /api/v1/plan-cards/:id`

**Response** `204`: the card is gone. Never creates, modifies, or deletes any `service_records`
row as a side effect (FR-009).

**Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership is always the
  caller's resolved `tenantContext`, same contract every prior tenant-scoped feature established.
- `DELETE /api/v1/vehicles/:id` (specs/006) cascades a vehicle's plan cards automatically via the
  D1 foreign key — no R2 cleanup needed (cards have no attachments), so no route-level retrofit
  like specs/007/009/023 needed.
