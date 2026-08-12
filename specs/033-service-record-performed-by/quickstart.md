# Quickstart: Service Record Performed-By Field

Validates the feature end-to-end against a local dev server (`deno task dev` / the existing
`tests/server/service-record-crud.test.ts` Vitest suite, which already runs against Miniflare).

## Prerequisites

- Local dev environment already set up per `README.md` (D1 migrations applied via
  `wrangler d1 migrations apply` in the dev/test harness).
- An authenticated session and at least one vehicle (any existing fixture works — this feature adds
  no new authentication or vehicle-creation requirement).

## Scenario 1 — create a self-performed record

```http
POST /api/v1/vehicles/:vehicleId/service-records
Content-Type: application/json

{ "serviceDate": "2026-08-01", "description": "Oil change", "performedBy": "self" }
```

**Expected**: `201`, response body includes `"performedBy": "self"`.

## Scenario 2 — create a record with no performed-by value

```http
POST /api/v1/vehicles/:vehicleId/service-records
Content-Type: application/json

{ "serviceDate": "2026-08-01", "description": "Oil change" }
```

**Expected**: `201`, response body includes `"performedBy": null`.

## Scenario 3 — edit an existing record to set performed-by

```http
PATCH /api/v1/service-records/:id
Content-Type: application/json

{ "performedBy": "shop" }
```

**Expected**: `200`, response body includes `"performedBy": "shop"`; every other field unchanged
from before the patch.

## Scenario 4 — edit an existing record to clear performed-by

```http
PATCH /api/v1/service-records/:id
Content-Type: application/json

{ "performedBy": null }
```

**Expected**: `200`, response body includes `"performedBy": null`.

## Scenario 5 — reject an invalid value

```http
PATCH /api/v1/service-records/:id
Content-Type: application/json

{ "performedBy": "dealership" }
```

**Expected**: `400 { "error": "invalid_request" }`.

## Scenario 6 — pre-existing records are unaffected

Query a service record created before this migration (or any record created via Scenario 2).
**Expected**: `performedBy` is `null`, and every existing field/behavior (duplicate detection,
attachments, offline sync) works exactly as before — this feature changes no other behavior.

## Client verification

1. Open a vehicle's service records panel.
2. Add a new record, selecting "Self" from the performed-by control before submitting.
   **Expected**: the new row in the service history list shows a "Self" indicator.
3. Edit that record, switching the control to "Shop".
   **Expected**: the row updates to show "Shop".
4. Edit again, clearing the control back to unset.
   **Expected**: the row shows no performed-by indicator.
5. Add a record without touching the performed-by control at all.
   **Expected**: it saves successfully and shows no performed-by indicator.
