# Quickstart: Live Fuel Consumption & Cost Preview

## API scenarios (curl against `deno task dev`)

Prereqs: a dev session (`POST /api/v1/_dev/session`), a vehicle, and at least one saved fuel record
for that vehicle.

1. **Valid preview** — `GET /api/v1/vehicles/:id/fuel-preview?odometerReading=<higher than the
   saved record's>&volume=<positive>` → `200`, `economy` is a positive number matching the same
   formula as the vehicle's saved records' `fuelEconomy`.
2. **Add cost** — same request plus `&cost=<positive>` → `costPerDistance` is also a positive
   number (`cost / (odometerReading - priorOdometerReading)`).
3. **No prior record** — repeat scenario 1 against a vehicle with zero fuel records → `200`,
   `economy: null`, `costPerDistance: null`.
4. **Non-positive distance** — `odometerReading` at or below the vehicle's existing max odometer
   reading → `200`, `economy: null`.
5. **Zero/blank volume** — `volume=0` → `200`, `economy: null`.
6. **Missing required param** — omit `odometerReading` → `400 invalid_request`.
7. **Wrong tenant / unknown vehicle** — `404`.

## Client walkthrough (manual, against `deno task dev`)

1. Open the Fuel screen for a vehicle with a prior fuel record.
2. Start typing an odometer reading and volume that produce a valid distance.
   **Expected**: within roughly a second of pausing typing, an estimated economy figure appears
   near the inputs, visually distinct (dimmer/hint-styled) from the saved-record economy column.
3. Also type a cost value.
   **Expected**: a cost-per-distance estimate appears alongside the economy figure.
4. Clear the volume field.
   **Expected**: the preview disappears.
5. Save the record.
   **Expected**: the live preview is gone; the new row shows only the real, server-computed
   `fuelEconomy` value (which should numerically match what the preview last showed for the same
   inputs).
6. Repeat step 2 for the vehicle's very first-ever fuel record (no prior record exists).
   **Expected**: no preview appears at any point, regardless of what's typed.

## Regression check

Confirm the edit-existing-record form is unaffected — no preview appears there, matching spec.md's
explicit out-of-scope note (FR-008).
