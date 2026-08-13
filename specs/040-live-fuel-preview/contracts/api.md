# API Contracts: Live Fuel Consumption & Cost Preview

All routes require an authenticated session (`tenantContext`) — `401` without one, throughout.

## `GET /api/v1/vehicles/:vehicleId/fuel-preview`

**Query parameters**:

| Param | Required | Validation |
|---|---|---|
| `odometerReading` | yes | Must parse as a finite number |
| `volume` | yes | Must parse as a finite number |
| `cost` | no | If present, must parse as a finite number |

**Response** `200`:

```json
{
  "economy": 7.8,
  "costPerDistance": 0.42
}
```

Both fields independently `number | null`:

- `economy` is `null` when the vehicle has no prior (non-duplicate) fuel record, or
  `odometerReading - <prior record's odometerReading> <= 0`, or `volume <= 0`.
- `costPerDistance` is `null` whenever `economy` is `null`, or `cost` was omitted, or `cost <= 0`.

**Response** `400` (`{"error": "invalid_request"}`): `odometerReading` or `volume` missing or not a
valid finite number, or `cost` present but not a valid finite number.

**Response** `404`: `vehicleId` doesn't exist, or belongs to a different tenant than the caller —
same not-found-or-not-yours contract every other vehicle-nested route in this codebase uses.

Not rate-limited (read-only, same as `/:vehicleId/aggregates` and `/:vehicleId/expense-breakdown`).

## Cross-cutting

- Nothing here accepts or trusts a client-supplied tenant id — ownership always comes from the
  caller's resolved `tenantContext`, and `:vehicleId` is checked via `findVehicleById` before any
  computation runs.
- No request body — this is a pure `GET`, called repeatedly (debounced) as the client's form
  values change; nothing it does is persisted or has side effects.
- The "prior record" lookup and the economy formula are identical to the ones
  `listFuelRecordsWithEconomy` already uses for saved records (research.md) — this endpoint adds no
  new division-safety rule, it reuses the existing one.
