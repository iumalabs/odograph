# Quickstart: Units Toggle Converts Fuel Economy

## Prerequisites

- `deno task dev` running locally.
- A logged-in dev session (`GET /_dev/oidc-google?email=<any>` in dev, per existing dev-session
  bootstrap).

## Scenario: fuel economy follows the header's unit toggle, not the vehicle's native unit

1. Create a km-native vehicle.
2. Create two fuel records at increasing odometer readings (e.g. `odometerReading: 10000, volume: 40`
   then `odometerReading: 10600, volume: 42`) so the second has a computable economy.
3. `GET /api/v1/vehicles/:id/fuel-records` (no `?unit=`) → confirm the second record's `fuelEconomy`
   matches today's existing L/100km value (`42 / (600/100) = 7`).
4. `GET /api/v1/vehicles/:id/fuel-records?unit=mi` → confirm the same record's `fuelEconomy` is now
   expressed in MPG, computed from the converted distance/volume
   (`(600 * 0.621371)` mi / `(42 * 0.264172)` gal ≈ `33.6` MPG) — not a naive reciprocal rescale of
   `7`.
5. `GET /api/v1/vehicles/:id/aggregates?unit=mi` → confirm `averageFuelEconomy` is the mean of the
   already-mi-converted per-record economies (matches step 4's value when there's only one
   qualifying record).
6. `GET /api/v1/vehicles/:id/fuel-preview?odometerReading=11200&volume=41&unit=mi` → confirm
   `economy` is expressed in MPG using the same conversion.
7. Repeat step 3 with `?unit=km` explicitly → confirm identical to the no-param case (FR-003).
8. Create a vehicle with zero/one fuel record and confirm `fuelEconomy`/`averageFuelEconomy` stay
   `null` in both unit systems (FR-004 — never a fabricated figure).

## Client verification

With the header's units toggle (spec 047) set to a value different from a vehicle's native unit,
visually confirm all four figures — Garage's average-economy stat, Dashboard's economy chip, the
fuel-record table's per-row economy column, and the live fuel-form preview — switch to the toggled
unit system and match the values computed via the API calls above.
