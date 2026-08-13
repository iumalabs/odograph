# Tasks: Richer Garage Cards

**Input**: Design documents from `/specs/041-richer-garage-cards/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: `computeReminderStatus` already has direct unit tests (pure function) — extend those.
`tests/server/reminder-rules.test.ts` already covers the route — extend for the new field. No
client-side test suite exists in this project; the card rendering is verified manually via
quickstart.md against `deno task dev`, matching specs/033-040.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] RGC-001 `src/server/db/repository.ts`: add `remainingFraction: number | null` to
      `ReminderStatusResult`; in `computeReminderStatus`, capture the raw fraction at each
      `classifyRemainingFraction` call site (byDate: `remainingDays / rule.intervalDays`; byMileage:
      `remainingDistance / rule.intervalDistance`) and return whichever one corresponds to the side
      that determined the final `status` (mirroring the existing byDate-vs-byMileage selection
      logic exactly); `null` when `status` resolves to `not_enough_data`.
- [X] RGC-002 `tests/server/reminder-rules.test.ts` (or wherever `computeReminderStatus` is directly
      unit-tested): extend existing on-track/coming-up/overdue/not-enough-data cases with
      `remainingFraction` assertions, plus a case confirming the both-sides-computable path returns
      the fraction belonging to whichever side won (not always byDate or always byMileage).
- [X] RGC-003 `src/client/reminder-rules.ts`: add `remainingFraction: number | null` to the
      `ReminderRule` type, matching the server's extended shape.

**Checkpoint**: `deno task typecheck` passes; `GET /:vehicleId/reminder-rules` returns the new field
end to end; no UI change yet.

---

## Phase 3: User Story 1 - See each vehicle's fuel economy at a glance in the Garage (Priority: P1)

**Goal**: Odometer and average fuel economy render as large, prominent stats on each Garage card.

- [X] RGC-004 [US1] `src/client/components/Garage.tsx`: extend the per-vehicle summary fetch/state
      to also carry `averageFuelEconomy` (already returned by the `getVehicleAggregates` call this
      component already makes — just read one more field off the existing response, no new
      request).
- [X] RGC-005 [US1] `src/client/components/Garage.tsx`: replace the odometer's current small-chip
      rendering with a large-stat treatment (per research.md: ~24-25px mono, tight letter-spacing),
      and add the fuel-economy figure next to it with the same treatment plus `color: var(--acc)`;
      use the existing `fuelEconomyNotEnoughData` ("—") placeholder when the value is `null`,
      matching `DashboardView.tsx`'s own convention for this exact field.

**Checkpoint**: A vehicle with fuel history shows both large figures; a vehicle with insufficient
fuel history shows the placeholder for economy, never a guessed number.

---

## Phase 4: User Story 2 - See reminder progress as a visual bar (Priority: P2)

**Goal**: A progress bar on each card reflects the most-urgent reminder's `remainingFraction`.

- [X] RGC-006 [US2] `src/client/components/Garage.tsx`: read `remainingFraction` off the
      `mostUrgentReminder()` result already selected for the existing badge; compute the bar's
      display fill as `clamp(1 - remainingFraction, 0, 1) * 100` (research.md — display-only
      clamping, not a new aggregate).
- [X] RGC-007 [US2] `src/client/components/Garage.tsx`: render the bar (a thin rounded track +
      filled inner div, mirroring the mockup's 5px bar) only when `mostUrgentReminder` is non-null
      and its `remainingFraction` is non-null; color the fill from the reminder's existing `status`
      (`overdue` → `var(--warn)`, `coming_up` → `var(--acc)`, `on_track` → dim), matching
      `ReminderRulePanel.tsx`'s existing status-color convention (research.md) rather than a new
      gradient.

**Checkpoint**: Bar appears and is colored correctly for on-track/coming-up/overdue reminders; no
bar appears for a not-enough-data reminder or a vehicle with zero reminders.

## Phase 5: Polish & Cross-Cutting

- [X] RGC-008 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] RGC-009 Walk through quickstart.md's five API scenarios plus the client walkthrough and
      regression check, end to end against `deno task dev`. Verified: on-track (remainingFraction
      0.5), coming-up (0.05), overdue (-0.2), not-enough-data (null) all match contracts/api.md;
      `GET .../aggregates` still returns `averageFuelEconomy: 8` unchanged (regression check
      passed). Card rendering itself is pure client-side React (large stats + progress bar),
      already covered by typecheck + the full check suite.

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — `remainingFraction` must exist
  and be typed before either card change can render it.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — both live in the same card
  markup; Phase 4 adds the bar below what Phase 3 already restyled, no data dependency between them.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That alone delivers the fuel-economy stat, the larger
share of the information-density gap this feature closes. Phase 4 (progress bar) is a small,
independent addition to the same card that can ship in the same PR without re-touching Phase 3's
work.
