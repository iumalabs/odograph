# Quickstart: Currency Display Setting

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — default currency with no prior choice

1. Clear `localStorage` (or use a fresh browser profile) and sign in.
2. View any vehicle with a fuel or service record carrying a cost.
   **Expected**: the cost figure shows a `$` prefix (USD default).

## Scenario 2 — change currency, see it everywhere

1. Open Settings, select "EUR".
2. Without reloading, navigate to a vehicle's service records, fuel records, plan board, expense
   breakdown, and the Dashboard screen.
   **Expected**: every cost figure on every one of those screens now shows `€` instead of `$`.

## Scenario 3 — choice persists across reload

1. With EUR selected (Scenario 2), reload the page.
2. View any cost figure.
   **Expected**: still shows `€` — no need to re-select in Settings.

## Scenario 4 — non-money figures are unaffected

1. On the Dashboard screen, view a vehicle's average fuel economy figure.
   **Expected**: no currency symbol appears next to it (it's a consumption figure, not money) —
   only cost-per-distance and cost-per-time on that same screen show the symbol.

## Scenario 5 — no conversion

1. Note a fuel record's cost value (e.g. `60`) while USD is selected.
2. Switch currency to GBP in Settings.
3. View that same fuel record again.
   **Expected**: shows `£60` — the exact same number `60`, only the symbol changed, no conversion
   math applied.
