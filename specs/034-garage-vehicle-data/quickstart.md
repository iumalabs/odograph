# Quickstart: Garage Cards Show Vehicle Data

## Scenario 1 — vehicle with existing records shows its odometer

1. Create a vehicle, add a service or fuel record with an odometer reading (e.g. `50000`).
2. `GET /api/v1/vehicles/:vehicleId/aggregates`.
   **Expected**: response includes `"currentOdometer": 50000`.
3. Open the Garage screen.
   **Expected**: that vehicle's card shows `50000` as its current odometer.

## Scenario 2 — vehicle with no records shows no odometer

1. Create a vehicle with no service/fuel records.
2. `GET /api/v1/vehicles/:vehicleId/aggregates`.
   **Expected**: response includes `"currentOdometer": null`.
3. Open the Garage screen.
   **Expected**: that vehicle's card shows no odometer figure (not `0`, not a dash implying a real
   reading).

## Scenario 3 — overdue reminder shows on the card

1. Create a vehicle with a reminder rule whose computed status is `overdue`.
2. Open the Garage screen.
   **Expected**: that vehicle's card visibly indicates it needs attention (the overdue reminder,
   specifically — not a generic "ok" state).

## Scenario 4 — on-track-only vehicle shows no attention indicator

1. Create a vehicle with only `on_track` reminder rules (or none).
2. Open the Garage screen.
   **Expected**: that vehicle's card shows no needs-attention indicator.

## Scenario 5 — one vehicle's fetch failing doesn't break the rest

1. Have at least two vehicles in the Garage list.
2. Simulate one vehicle's aggregates/reminder fetch failing (e.g. temporarily block that request in
   dev tools).
   **Expected**: the other vehicle's card still renders its odometer/attention data normally; the
   affected vehicle's card falls back to showing no new data, not an error state, and the rest of
   the screen is unaffected.

Existing regression check: confirm `DashboardView.tsx`'s own cards (cost/distance, cost/time,
average fuel economy, needs-attention) are unchanged after this feature — the `aggregates` endpoint
gained a field, nothing was removed or renamed.
