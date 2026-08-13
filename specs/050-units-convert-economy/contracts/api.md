# API Contract Changes: Units Toggle Converts Fuel Economy

All three endpoints below gain one new **optional** query parameter, `unit`. Every other aspect of
each contract (path, method, auth, rate limiting, response shape, status codes) is unchanged from
its existing spec (040/013/014).

## `GET /api/v1/vehicles/:vehicleId/fuel-records`

**New query parameter**:

- `unit` (optional, `"km" | "mi"`): expresses every returned record's `fuelEconomy` in this unit
  system instead of the vehicle's own `odometerUnit`. Omitted or unrecognized non-empty value →
  `400 { "error": "invalid_request" }` (matches `expense-breakdown`'s `groupBy` validation
  pattern) — **except** omitted entirely, which is valid and defaults to the vehicle's native unit
  (FR-003), preserving the existing contract for every caller unaware of this feature.

Response shape unchanged: `{ fuelRecords: FuelRecordWithEconomy[] }`.

## `GET /api/v1/vehicles/:vehicleId/aggregates`

**New query parameter**:

- `unit` (optional, `"km" | "mi"`, same validation as above): `averageFuelEconomy` is computed by
  averaging each qualifying fuel record's economy already converted to this unit system (never by
  converting the final native-unit average — see research.md's Jensen's-inequality rationale).
  `costPerDistance`/`costPerTime`/`currentOdometer` are unaffected by this parameter (out of scope
  per spec.md's Assumptions — `costPerDistance` conversion remains excluded per spec 047 FR-006).

Response shape unchanged: `VehicleAggregates`.

## `GET /api/v1/vehicles/:vehicleId/fuel-preview`

**New query parameter**:

- `unit` (optional, `"km" | "mi"`, same validation as above): `economy` is expressed in this unit
  system. `odometerReading`/`volume` (the existing required params) remain in the vehicle's own
  native unit, unchanged (spec 047 FR-004 — form inputs are never unit-toggled). `costPerDistance`
  is unaffected (out of scope, same as aggregates above).

Response shape unchanged: `FuelPreview`.

## Backward compatibility

Every existing caller that doesn't send `?unit=` gets byte-identical responses to today (FR-003) —
this is purely additive.
