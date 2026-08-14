# API Contracts: History-Based Service Due Estimate

All routes require an authenticated session (`tenantContextOrToken`) — `401` without one,
throughout. Mounted under `/api/v1/vehicles` (`src/server/routes/v1/vehicles.ts`), alongside the
existing `/fuel-preview` and `/reminder-rules` routes this feature reuses the shape of.

## `GET /api/v1/vehicles/:vehicleId/service-due-estimate`

No query parameters or request body — reads the vehicle's own current `service_records` and
`reminder_rules` state.

**Response** `200`:

```json
{
  "estimate": {
    "description": "Замена масла и фильтров",
    "estimatedOdometer": 223240,
    "averageInterval": 10000,
    "basedOnRecordCount": 3
  }
}
```

`estimate` is `null` when no work group currently qualifies (fewer than 2 usable records for
every group, or the only qualifying group already has a matching `reminder_rules` entry):

```json
{ "estimate": null }
```

**Response** `404`: `vehicleId` doesn't exist, or belongs to a different tenant than the caller —
same not-found-or-not-yours contract every other vehicle-nested route uses.

Not rate-limited (read-only, matches `/fuel-preview`'s and `/aggregates`'s existing posture).
Never persists anything.

## `POST /api/v1/vehicles/:vehicleId/service-due-estimate/accept`

**Request body**:

```json
{ "description": "Замена масла и фильтров" }
```

`description` MUST match the `description` of the estimate the `GET` route most recently
returned for this vehicle — the server re-derives the estimate itself from current data rather
than trusting any client-supplied numbers (`estimatedOdometer`/`averageInterval` are never
accepted as input).

**Response** `201`: the newly created reminder rule, same shape `POST
/:vehicleId/reminder-rules` already returns:

```json
{
  "id": "...",
  "tenantId": "...",
  "vehicleId": "...",
  "label": "Замена масла и фильтров",
  "intervalDays": null,
  "intervalDistance": 10000,
  "lastDoneDate": "2026-07-12",
  "lastDoneOdometer": 213240,
  "cachedStatus": null,
  "lastEvaluatedAt": null,
  "lastNotifiedSeverity": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Response** `400` (`{"error": "invalid_request"}`): `description` missing, empty, or not a
string.

**Response** `404`: `vehicleId` doesn't exist, or belongs to a different tenant than the caller.

**Response** `409` (`{"error": "no_longer_available"}`): no qualifying, unsuppressed estimate
currently exists for that `description` (e.g. it was already accepted — an explicit
`reminder_rules` entry with that label now exists — or new service records changed the grouping
since the client last fetched `GET .../service-due-estimate`). The client should re-fetch the
`GET` route rather than retry this exact request.

Requires `rateLimitBySession` and the existing `idempotent` middleware — identical wiring to
`POST /:vehicleId/reminder-rules` and every other write route in this file. A request replayed
with the same idempotency key returns the original response, never a second row (FR-010).

## Cross-cutting

- Nothing here accepts or trusts a client-supplied tenant id — ownership always comes from the
  caller's resolved tenant context, and `:vehicleId` is checked via `findVehicleById` before any
  computation or write runs, identical to every other vehicle-nested route in this codebase.
- The `GET` route's grouping/averaging logic and the `POST` route's re-derivation before writing
  share one repository function (`computeServiceDueEstimate`) — the accept path never duplicates
  the computation, only adds the write.
- `PATCH /:vehicleId/reminder-rules/:id` and `DELETE` (existing routes) are unaffected — an
  accepted reminder is edited/deleted exactly like a manually-created one, no new endpoint needed
  for that.
