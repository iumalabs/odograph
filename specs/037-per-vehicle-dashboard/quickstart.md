# Quickstart: Per-Vehicle Dashboard

Client-only feature — no new API scenarios (every call already exists and is already tested at the
server level). Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — no vehicle selected

1. Sign in with no vehicle selected (fresh session, or after clearing selection).
2. Open the Dashboard nav screen.
   **Expected**: a prompt to select a vehicle from Garage — no figures, no error.

## Scenario 2 — selected vehicle's KPIs

1. Select a vehicle with a mix of service and fuel records.
2. Open the Dashboard screen.
   **Expected**: total spend, fuel spend, and service spend match that vehicle's actual record
   totals; cost-per-distance matches the value already shown on that vehicle's Garage card (spec
   034/035) — same underlying aggregate, same figure.

## Scenario 3 — monthly chart with a gap month

1. On the same vehicle, ensure there's at least one calendar month within the last 6 with zero
   records, sandwiched between months that do have records.
2. View the chart.
   **Expected**: the empty month still appears as its own zero-height bar in sequence — not skipped.

## Scenario 4 — empty vehicle

1. Select a freshly created vehicle with no records at all.
2. View the Dashboard screen.
   **Expected**: KPIs read zero/not-available, the chart shows 6 empty months, both lists show their
   empty state — no errors, no fabricated figures.

## Scenario 5 — upcoming and recent lists

1. Select a vehicle with at least one overdue/coming-up reminder and at least one recent service or
   fuel record.
2. View the Dashboard screen.
   **Expected**: the upcoming list shows the reminder (most urgent first if more than one); the
   recent-activity list shows the record, correctly labeled by type.

## Regression check

Confirm `Garage.tsx`'s own cards (odometer, most-urgent-reminder badge, spec 034) are unchanged —
this feature only rewrites the Dashboard screen, not Garage.
