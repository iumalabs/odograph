# Quickstart: Dashboard Chart Bar Totals

Client-only, no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — bar shows its total

1. Select a vehicle with fuel/service records in at least one of the last 6 months.
2. View the Dashboard.
   **Expected**: each bar shows a small total-spend label above it, in the selected currency,
   matching the relative height of the bars (a taller bar has a larger label value).

## Scenario 2 — zero-spend month

1. View a vehicle/month combination with no recorded spend.
   **Expected**: that month's bar still shows a zero-value label (e.g. "$0.00"), not blank.

## Regression check

Confirm the bar heights and the fuel/maintenance color split are visually unchanged — this feature
only adds a label, doesn't touch the height or color logic.
