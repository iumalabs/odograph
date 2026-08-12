# Quickstart: VIN Lookup on Vehicle Add

## Prerequisites

- `deno task migrate:local` has been run at least once against this worktree's local D1.
- `deno task dev` running (client + Worker), with outbound internet access (the live NHTSA call is
  real — this is not mocked in the dev environment).
- A signed-in dev session.

## Validation scenario 1 — successful lookup pre-fills the form

1. On the Garage screen's add-vehicle form, enter a name, and a real, decodable VIN (e.g. a
   well-known US-market VIN such as `1FTFW1ET5BFC10312` — a public NHTSA example VIN).
2. Trigger the lookup action.
3. Confirm the make/model/year fields populate with NHTSA's decoded values.
4. Edit one of the pre-filled fields; confirm the edit sticks (not overwritten).
5. Save the vehicle; confirm the created vehicle has the edited value, not the original decode.

## Validation scenario 2 — undecodable VIN degrades gracefully

1. Enter an obviously fabricated/undecodable VIN (e.g. all zeros or a short garbage string).
2. Trigger the lookup action.
3. Confirm a non-blocking "couldn't find details, enter manually" message appears, and make/model/
   year remain empty and editable.
4. Fill in make/model/year manually and save; confirm vehicle creation succeeds.

## Validation scenario 3 — no VIN at all still works, including offline

1. With the dev server's network throttled/disconnected (or simply skipping VIN entry entirely),
   add a vehicle using only name + odometer unit.
2. Confirm it saves via the existing offline queue exactly as before this feature (spec.md User
   Story 3 — zero regression to the pre-existing flow).

## Validation scenario 4 — partial decode leaves ungiven fields blank

1. Find or construct a scenario where the lookup route returns `found: true` with only some fields
   populated (e.g. `make` present, `model`/`year` null) — confirm only `make` pre-fills; `model`/
   `year` remain blank, never guessed (FR-003).
