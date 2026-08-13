# Quickstart: Header Currency and Units Toggles

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`,
plus hand-verification of the conversion formula.

## Scenario 1 — currency pill matches Settings

1. Change currency from the header pill.
2. Open Settings.
   **Expected**: Settings' currency control shows the same, newly-selected currency; cost figures
   across the app already reflect it.

## Scenario 2 — units toggle converts read-only distance figures

1. Create a vehicle with `odometerUnit: "km"` and a fuel record.
2. Toggle the header units pill to "mi".
   **Expected**: Garage's odometer stat, the fuel record table's odometer column, and (if a
   coming-up/overdue mileage-based reminder exists) its due-in text all show the correctly-
   converted mile value with an "mi" label.

## Scenario 3 — form inputs stay in the vehicle's native unit

1. With the units toggle set to "mi" (from Scenario 2), open the fuel-record create form for that
   km-native vehicle.
   **Expected**: the odometer field's label still reads "km" (or shows the vehicle's stored unit),
   not "mi" — typing a value stores it correctly as km, unaffected by the display toggle.

## Scenario 4 — matching units, no conversion

1. Toggle the units pill back to "km" (matching the vehicle's own native unit).
   **Expected**: all figures return to their exact, unconverted stored values.

## Scenario 5 — fuel economy and cost/distance untouched

1. With the units toggle set to "mi", check any fuel-economy or cost-per-distance figure (e.g.
   Garage's economy stat, Dashboard's cost/distance KPI).
   **Expected**: unchanged by the toggle — still shown in the vehicle's own native convention,
   exactly as before this feature (spec.md FR-006).

## Manual formula verification

`100 km * 0.621371 = 62.1371 mi`; `100 mi * 1.609344 = 160.9344 km` — confirm `convertDistance`
produces these exact values.

## Regression check

Confirm every other currency-dependent display (Dashboard KPIs, expense breakdown) and every other
distance display not explicitly covered above (e.g. a vehicle whose native unit already matches the
toggle) is visually unchanged.
