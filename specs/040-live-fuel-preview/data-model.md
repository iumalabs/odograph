# Phase 1 Data Model: Live Fuel Consumption & Cost Preview

No new persisted entity, no schema change. This feature reads existing `fuel_records`/`vehicles`
rows and returns a transient, never-stored computation.

## `FuelPreview` (response shape only — not a stored entity)

| Field | Type | Notes |
|---|---|---|
| `economy` | `number \| null` | Same formula/units as a saved record's `fuelEconomy` (L/100km for `km`-odometer vehicles, MPG for `mi`-odometer vehicles). `null` when no prior record exists, or the resulting distance is `<= 0`, or volume isn't a positive number. |
| `costPerDistance` | `number \| null` | `cost / deltaDistance`, using the same `deltaDistance` as `economy`. `null` whenever `economy` would be `null`, or `cost` isn't a positive number, or `cost` wasn't supplied at all. |

## Inputs (query parameters, not persisted)

| Param | Type | Required | Notes |
|---|---|---|---|
| `odometerReading` | number (query string) | yes | The draft form's odometer field. Non-numeric or missing → `400 invalid_request`, matching every other validated GET/POST in this route file. |
| `volume` | number (query string) | yes | The draft form's volume field. Same validation posture as `odometerReading`. |
| `cost` | number (query string) | no | The draft form's cost field. Omitted entirely when the owner hasn't typed a cost yet — this is the one param allowed to be absent, since `costPerDistance` is an optional secondary preview (spec.md User Story 2). |

## Relationships

- Reads `vehicles` (for `odometerUnit`) and `fuel_records` (for the vehicle's existing rows) —
  exactly the same two reads `listFuelRecordsWithEconomy` already performs, scoped by the same
  `tenantId`/`vehicleId` pair.
- Does not write to any table.
