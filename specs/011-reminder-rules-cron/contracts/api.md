# API Contracts: Reminder Rules & Cron Scheduling

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.
There is no HTTP route for the scheduled evaluation itself — Cloudflare invokes the Worker's
`scheduled()` export directly, never reachable via `fetch` (research.md).

## `POST /api/v1/vehicles/:vehicleId/reminder-rules`

**Request**: `{ "label": string, "intervalDays"?: number, "intervalDistance"?: number,
"lastDoneDate"?: string, "lastDoneOdometer"?: number }`. At least one of `intervalDays`/
`intervalDistance` required; `lastDoneDate` required if `intervalDays` is set, `lastDoneOdometer`
required if `intervalDistance` is set.

**Response** `201`: the created rule, including computed `status`, `byDate`/`byMileage` substatus,
`dueDate`, `dueOdometer` (each `null` where not applicable).

**Response** `400`: neither interval present, or a required anchor field missing for the interval
present — nothing created.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant.

Rate-limited via `rateLimitBySession`.

## `GET /api/v1/vehicles/:vehicleId/reminder-rules`

**Response** `200`: `{ "reminderRules": ReminderRule[] }`, each with the same computed status
shape as the create response, freshly computed on every call (never reading `cachedStatus`).

**Response** `404`: same not-found-or-not-yours contract as `POST`, for the vehicle itself.

## `GET /api/v1/reminder-rules/:id`

**Response** `200`: the rule with computed status. **Response** `404`: not found or not yours.

## `PATCH /api/v1/reminder-rules/:id`

**Request**: any subset of `{ label, intervalDays, intervalDistance, lastDoneDate,
lastDoneOdometer }`. Setting `intervalDays`/`intervalDistance` to `null` is rejected if it would
leave the rule with neither interval (FR-002 applies to updates too).

**Response** `200`: the updated rule with freshly-computed status. `400` on an invalid or
constraint-violating field. `404` on not-found-or-not-yours.

Rate-limited via `rateLimitBySession`.

## `DELETE /api/v1/reminder-rules/:id`

**Response** `204`. **Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## `POST /api/v1/reminder-rules/:id/mark-done`

**Request**: no body.

**Response** `200`: the rule with `lastDoneDate` reset to today, `lastDoneOdometer` reset to the
vehicle's current known odometer reading (only if the rule has `intervalDistance` set), and status
freshly recomputed (should be `on_track`, or `not_enough_data` if the vehicle still has no
odometer history for a mileage-based rule).

**Response** `404`: not found or not yours.

Rate-limited via `rateLimitBySession`.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership always comes from
  the caller's resolved `tenantContext`.
- `cachedStatus`/`lastEvaluatedAt` are never accepted in any request body and never appear in any
  response from this feature's own routes — they exist solely for a future feature (#14/#15) to
  read directly from the database, not through this API (contracts/api.md's own scope is this
  feature's HTTP surface, which never exposes them).
