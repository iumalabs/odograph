# API Contracts: Monthly/Annual Expense Analytics

## `GET /api/v1/vehicles/:vehicleId/expense-breakdown?groupBy=month|year`

Requires an authenticated session (`tenantContext`) — `401` without one.

**Query parameters**: `groupBy` — required, exactly `"month"` or `"year"`.

**Response** `200`: `{ "periods": ExpensePeriod[] }`, sorted chronologically ascending, where each
`ExpensePeriod` is `{ "period": string, "maintenanceCost": number, "fuelCost": number,
"totalCost": number }`. `period` is `"YYYY-MM"` when `groupBy=month`, `"YYYY"` when
`groupBy=year`. Empty array for a vehicle with no qualifying records (FR-004) — never an error.

**Response** `400`: `groupBy` missing or not one of the two valid values — nothing computed.

**Response** `404`: `vehicleId` doesn't exist or belongs to a different tenant (FR-007) —
indistinguishable from either case, same contract `GET /:vehicleId/aggregates` already has.

Read-only, not rate-limited — matches every other GET route in `vehicles.ts`.

## Cross-cutting

- Nothing here ever accepts or trusts a client-supplied tenant id — ownership is always the
  caller's resolved `tenantContext`.
- No write path, no side effects, no new stored state — a pure derived read over existing
  `service_records`/`fuel_records`.
