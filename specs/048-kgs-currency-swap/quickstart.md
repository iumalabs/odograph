# Quickstart: Replace Russian Ruble with Kyrgyzstani Som

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — Kyrgyzstani Som selectable, Russian Ruble gone

1. Open the currency selector from Settings.
   **Expected**: four options — US Dollar, Euro, Kyrgyzstani Som, British Pound. No Russian Ruble.
2. Repeat from the header currency pill (spec 047).
   **Expected**: same four options, same result.

## Scenario 2 — selecting it works everywhere

1. Select Kyrgyzstani Som.
   **Expected**: cost figures across the app (Dashboard KPIs, fuel/service costs, expense
   breakdown, plan card costs) show the `с` symbol.

## Scenario 3 — old stored RUB value degrades gracefully

1. In browser dev tools, set `localStorage["odograph:currency"] = "RUB"`, then reload.
   **Expected**: the app shows US Dollar (the existing default), not a blank/broken currency —
   no console error.

## Regression check

Confirm the other three currencies (USD, EUR, GBP) are unaffected — same symbols, same behavior.
