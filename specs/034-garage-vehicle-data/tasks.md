# Tasks: Garage Cards Show Vehicle Data

**Input**: Design documents from `/specs/034-garage-vehicle-data/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included for the server-side response shape change (extending
`tests/server/vehicle-aggregates.test.ts`). No client-side test suite exists in this project for
component-level UI — client behavior is verified manually via quickstart.md, matching the
established pattern from specs/032/033.

## Phase 1: Setup

None — no new dependency, no new migration.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] GV-001 `src/server/db/repository.ts`: add `currentOdometer: number | null` to the
      `VehicleAggregates` type; in `computeVehicleAggregates`, derive it from the function's
      existing `odometerPoints` array (`odometerPoints.length > 0 ? Math.max(...odometerPoints) :
      null` — research.md's revised decision: no new query, and more correct than
      `getVehicleCurrentOdometer` since `odometerPoints` already excludes duplicate-flagged
      records) and include it in the returned object
- [X] GV-002 [P] `src/client/vehicle-aggregates.ts`: add `currentOdometer: number | null` to the
      `VehicleAggregates` type

**Checkpoint**: `deno task typecheck` passes; `GET /api/v1/vehicles/:vehicleId/aggregates` already
returns `currentOdometer` for every vehicle, even though nothing displays it yet.

---

## Phase 3: User Story 1 - See a vehicle's current odometer at a glance (Priority: P1)

**Goal**: Each Garage card shows the vehicle's current odometer reading, or nothing if none is
recorded yet.

- [X] GV-003 [US1] No new i18n key needed — `odometerLabel: "Odometer"` already exists
      (`src/client/i18n/strings.ts`) and fits this context; reuse it directly in GV-004
- [X] GV-004 [US1] `src/client/components/Garage.tsx`: add a `summaries` state
      (`Record<string, { currentOdometer: number | null }>`) populated via a `useEffect` that,
      per vehicle, calls `getVehicleAggregates(vehicle.id).catch(() => null)` (research.md's
      reused pattern), guarded by a `cancelled` flag; render the odometer as a chip (matching
      `chipStyle`, same convention as the existing VIN/odometer-unit chips) only when
      `currentOdometer != null`; update the stale top-of-file comment (currently: "no
      fuel-consumption or next-service stats, since those aren't tracked at the vehicle level
      yet") to reflect that this data now exists
- [X] GV-005 [P] [US1] `tests/server/vehicle-aggregates.test.ts`: add cases — a vehicle with a
      service record carrying an odometer reading returns that value as `currentOdometer`; a
      vehicle with only fuel records returns the highest fuel-record odometer reading; a vehicle
      with no records returns `currentOdometer: null`

**Checkpoint**: Garage cards show the current odometer for any vehicle with recorded readings, and
show nothing for vehicles without any.

---

## Phase 4: User Story 2 - See which vehicles need attention at a glance (Priority: P1)

**Goal**: Each Garage card indicates its single most urgent reminder, if any.

- [X] GV-006 [US2] `src/client/components/Garage.tsx`: extend the `summaries` state to also hold
      `mostUrgentReminder: ReminderRule | null`, populated in the same per-vehicle `useEffect` via
      `listReminderRules(vehicle.id).catch(() => [] as ReminderRule[])` run in `Promise.all`
      alongside GV-004's aggregates fetch (research.md — one fetch pass, not two); add a local
      (unexported) helper that reduces a `ReminderRule[]` to the single rule with status
      `"overdue"` if any exist, else the single rule with status `"coming_up"` if any exist, else
      `null`
- [X] GV-007 [US2] `src/client/components/Garage.tsx`: render a needs-attention badge on the card
      when `mostUrgentReminder` is non-null, showing that reminder's `label` and status (styled
      consistently with `DashboardView.tsx`'s existing `needsAttention` badge — reuse the same
      `var(--warn)` treatment for `"overdue"`, and a neutral treatment for `"coming_up"`); no badge
      when `mostUrgentReminder` is `null`
- [X] GV-008 [P] [US2] `tests/server/vehicle-aggregates.test.ts` or a new focused test (confirm
      during implementation which existing suite already covers reminder-rule status, e.g.
      `tests/server/reminder-rules.test.ts`): if reminder-status computation itself isn't already
      fully covered by existing tests (it should be, from spec 011/012 — this task is a coverage
      *check*, not new server logic), no new server test is needed; add a note in the PR
      description instead of a redundant test

**Checkpoint**: A vehicle with an overdue or coming-up reminder shows a visible indicator on its
Garage card; a vehicle with only on-track reminders (or none) shows none.

---

## Phase 5: Polish & Cross-Cutting

- [X] GV-009 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] GV-010 Walk through quickstart.md's five scenarios end-to-end against `deno task dev`
      (Scenario 5 — simulating a failed fetch — via browser dev tools request blocking); confirm
      `DashboardView.tsx`'s own cards are visually unchanged (regression check)

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — `currentOdometer` must exist on
  the aggregates response before Garage can display it.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — both extend the same `summaries`
  state and the same per-vehicle `useEffect` in `Garage.tsx`; implementing GV-004 before GV-006
  avoids two separate effects fetching overlapping data, but GV-006's own server-side dependency
  (reminder rule status) has no dependency on Phase 3's work.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That alone closes the more basic half of the gap
(odometer visible on the card). Phase 4 (reminder attention indicator) is equally P1 per spec.md, so
in practice both ship together as this feature's minimum useful slice — matching how they share one
fetch effect in `Garage.tsx` anyway.
