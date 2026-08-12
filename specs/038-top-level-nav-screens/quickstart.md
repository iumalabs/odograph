# Quickstart: Top-Level Nav Screens

Client-only feature — no new API scenarios (every panel already uses already-tested API calls).
Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — nav rail shows all nine destinations

1. Sign in.
2. Look at the nav rail.
   **Expected**: Garage, Dashboard, Fuel, Service, Reminders, Planner, Documents, Review, Settings —
   nine icons, in that order.

## Scenario 2 — selecting a vehicle from Garage navigates to Dashboard

1. On the Garage screen, click a vehicle's card.
   **Expected**: the app navigates to the Dashboard screen, showing that vehicle's deep-dive
   (spec 037).

## Scenario 3 — Garage shows no inline panels

1. Return to the Garage screen (with a vehicle selected).
   **Expected**: only the vehicle list and the add-vehicle form are visible — no service, fuel,
   reminder, planner, or document content.

## Scenario 4 — each new screen shows the selected vehicle's data

1. With a vehicle selected, click Fuel, then Service, then Reminders, then Planner, then Documents
   in turn.
   **Expected**: each screen shows that same vehicle's data, with every capability the old inline
   panel had (add, edit, delete, attachment upload where applicable, dismiss-duplicate, mark-done/
   advance-stage/renew as applicable per panel).

## Scenario 5 — no vehicle selected

1. In a fresh session (or after navigating directly without selecting a vehicle — e.g. reloading
   while on one of the five new screens with no prior selection), visit Fuel, Service, Reminders,
   Planner, and Documents in turn.
   **Expected**: each shows a "select a vehicle from Garage" prompt, not an empty or broken layout.

## Scenario 6 — expense breakdown and PDF export now live on Dashboard

1. With a vehicle that has records, view the Dashboard screen.
   **Expected**: below the existing spend KPIs/chart/lists (spec 037), the month/year expense-
   breakdown table and the "download maintenance history (PDF)" link both appear and work exactly as
   they did when inline on Garage.

## Scenario 7 — search still works

1. Use the search bar to find and select a different vehicle.
   **Expected**: the app navigates to Dashboard for that vehicle, same as clicking its Garage card
   would.
