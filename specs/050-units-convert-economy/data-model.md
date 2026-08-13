# Data Model: Units Toggle Converts Fuel Economy

No schema change — no new table, column, or migration. This feature only affects how already-stored
values are expressed at read time.

## Existing entities touched (read-only)

- **`fuel_records`** (unchanged): `odometer_reading`, `volume` remain stored in the vehicle's own
  native unit exactly as today. This feature never writes a converted value back to storage — only
  the JSON response of the affected GET/preview endpoints changes shape based on the requested
  display unit.
- **`vehicles.odometer_unit`** (unchanged): still the source of truth for a vehicle's own native
  unit; used as the default `displayUnit` when no `?unit=` query parameter is supplied.

## New in-memory computation (no persistence)

- **`computeFuelEconomyForDisplay(nativeUnit, displayUnit, deltaDistance, volume)`**: pure function,
  server-side only, `src/server/db/repository.ts`. Not a stored entity — a computation step inserted
  between "read raw record" and "compute economy," matching the existing
  `computeFuelEconomy(odometerUnit, deltaDistance, volume)` it wraps.
- **`convertDistance(value, from, to)` / `convertVolume(value, from, to)`**: pure helper functions,
  server-side only, private to `repository.ts`. `from`/`to` reuse the existing `"km" | "mi"` union
  (volume's unit is implied by the paired distance unit: liters for `"km"`, gallons for `"mi"` —
  matching the existing, unchanged pairing `computeFuelEconomy` already assumes).

## API response shape changes

None of the three affected endpoints' response *shapes* change — `FuelRecordWithEconomy`,
`VehicleAggregates`, and `FuelPreview` (see `contracts/api.md`) keep every existing field. Only the
*values* inside `fuelEconomy`/`averageFuelEconomy`/`economy` change when a non-default `?unit=` is
requested — they're expressed in the requested unit system instead of the vehicle's native one.
