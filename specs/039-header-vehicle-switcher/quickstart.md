# Quickstart: Header Vehicle Switcher

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — switch vehicle without leaving the screen

1. Create at least two vehicles.
2. Select one, navigate to the Fuel screen.
3. Click a different vehicle's pill in the header.
   **Expected**: still on the Fuel screen, now showing the newly selected vehicle's fuel records —
   no navigation occurred.

## Scenario 2 — selected pill is visually distinguished

1. With multiple vehicles and one selected, look at the header pills.
   **Expected**: the currently selected vehicle's pill looks different from the others (e.g.
   highlighted).

## Scenario 3 — single-vehicle owner

1. With exactly one vehicle, view the header.
   **Expected**: exactly one pill, no broken layout.

## Scenario 4 — zero-vehicle owner

1. With no vehicles at all, view the header.
   **Expected**: no pills shown, nothing broken.

## Scenario 5 — quick-fuel button

1. From the Documents screen (or any non-Fuel screen), click the header's quick-fuel button.
   **Expected**: navigates to the Fuel screen.

## Regression check

Confirm Garage card clicks and search-result selection still navigate to Dashboard (spec 038's
behavior) — this feature adds a second, non-navigating selection path, it doesn't change the first.
