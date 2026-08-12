# Tasks: Per-Vehicle Dashboard

**Input**: Design documents from `/specs/037-per-vehicle-dashboard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No client-side test suite exists in this project for component-level UI — verified
manually via quickstart.md against `deno task dev`, matching specs/033-036. This feature touches
zero server files, so no server test coverage applies either.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] PD-001 `src/client/i18n/strings.ts`: add `selectVehicleForDashboard: "Select a vehicle from
      the Garage to see its dashboard."`, `upcomingRemindersHeading: "Upcoming"`,
      `recentActivityHeading: "Recent activity"`, `noUpcomingReminders: "Nothing coming up."`,
      `noRecentActivityYet: "No recent activity."` near the existing `dashboardHeading`/
      `noVehiclesOnDashboard` keys — reuse existing `expenseTotalLabel`/`expenseFuelLabel`/
      `expenseMaintenanceLabel`/`costPerDistanceLabel` for the four KPI labels (data-model.md), no
      new keys needed for those
- [X] PD-002 `src/client/App.tsx`: change the `<DashboardView>` render call's props from
      `vehicles={mergedVehicles}` to `vehicle={mergedVehicles.find((v) => v.id ===
      selectedVehicleId) ?? null}` (find the currently selected vehicle object, or `null` if none
      selected/not found); remove the now-unused `onSelectVehicle` prop from that call site

**Checkpoint**: `deno task typecheck` passes; `App.tsx` compiles against the new prop shape (which
`DashboardView.tsx` doesn't accept yet — this phase only prepares the call site).

---

## Phase 3: User Story 1 - See a selected vehicle's spend KPIs at a glance (Priority: P1)

**Goal**: `DashboardView.tsx` is rewritten to accept `vehicle: Vehicle | null` and, when a vehicle is
selected, shows four spend KPIs for it.

- [X] PD-003 [US1] `src/client/components/DashboardView.tsx`: replace the `DashboardViewProps` type
      per data-model.md (`vehicle: Vehicle | null` instead of `vehicles: Vehicle[]` +
      `onSelectVehicle`); replace the per-vehicle-list `useEffect` with one that fetches, for
      `vehicle?.id` only, `getVehicleAggregates` and `getVehicleExpenseBreakdown(id, "month")` in
      parallel (each independently `.catch()`'d, matching the existing resilience pattern); handle
      `vehicle === null` by rendering the `selectVehicleForDashboard` prompt (reusing the existing
      empty-state box styling already in this file) instead of running any fetch
- [X] PD-004 [US1] `src/client/components/DashboardView.tsx`: sum `maintenanceCost`/`fuelCost`/
      `totalCost` across every period `getVehicleExpenseBreakdown` returned into the total/fuel/
      service spend KPIs; read `costPerDistance` from the aggregates response for the fourth KPI;
      render all four as cards (reuse the existing KPI-chip visual style already in this file where
      practical); a vehicle with zero records shows `0`/currency-zero for the three spend KPIs and
      the existing `fuelEconomyNotEnoughData` placeholder for cost-per-distance (matching
      `formatCostFigure`'s existing null-handling)

**Checkpoint**: Selecting a vehicle and viewing Dashboard shows its four spend KPIs; no vehicle
selected shows the prompt; a records-free vehicle shows zeros, not an error.

---

## Phase 4: User Story 2 - See the selected vehicle's spending trend over time (Priority: P2)

**Goal**: A monthly fuel-vs-service bar chart for the selected vehicle, zero-filled for empty
months.

- [X] PD-005 [US2] `src/client/components/DashboardView.tsx`: add a local helper that generates the
      last 6 `YYYY-MM` period keys ending at the current month (client-side `Date`, display-only —
      not persisted, not used for any business decision); for each key, look up the matching entry
      in the already-fetched `ExpensePeriod[]` (research.md — default to `{maintenanceCost: 0,
      fuelCost: 0}` when absent)
- [X] PD-006 [US2] `src/client/components/DashboardView.tsx`: render one bar per month (stacked two
      segments — fuel and service — proportional to the largest month's total in the 6-month
      window, matching the existing "width/height as a percentage of a computed max" pattern already
      used elsewhere in this app, e.g. `ExpenseBreakdownPanel.tsx`'s per-period bar); a month with
      both segments zero renders as an empty/flat bar, not an omitted one

**Checkpoint**: The chart shows exactly 6 months in order, every month present even if empty,
correctly split between fuel and service for the selected vehicle.

---

## Phase 5: User Story 3 - See upcoming reminders and recent activity at a glance (Priority: P3)

**Goal**: Two short lists — upcoming reminders and recent service/fuel activity — for the selected
vehicle.

- [X] PD-007 [US3] `src/client/components/DashboardView.tsx`: extend the per-vehicle fetch (PD-003)
      to also call `listReminderRules(vehicle.id)`; filter to `status === "coming_up" || status ===
      "overdue"`, sort overdue before coming-up (reusing the same urgency ordering already
      established in `Garage.tsx`'s `mostUrgentReminder` — research.md notes this is the second use
      of that ranking, still simple enough not to warrant extracting a shared helper), cap at 5;
      render as a list under `upcomingRemindersHeading`, or `noUpcomingReminders` when empty
- [X] PD-008 [US3] `src/client/components/DashboardView.tsx`: extend the per-vehicle fetch to also
      call `listServiceRecords(vehicle.id)` and `listFuelRecords(vehicle.id)`; merge into a single
      list of `{date, title, cost}` (service: `serviceDate`/`description`/`cost`; fuel:
      `fuelDate`/`station ?? t("fuelRecordsHeading")`/`cost`), sort by date descending, cap at 5;
      render under `recentActivityHeading`, or `noRecentActivityYet` when empty, with the currency
      symbol applied to non-null cost values (reusing the existing `currencySymbol` prop, specs/035)

**Checkpoint**: A selected vehicle with reminders/records shows both lists correctly, most-urgent/
most-recent first; an otherwise-empty vehicle shows both empty states, not errors.

## Phase 6: Polish & Cross-Cutting

- [X] PD-009 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] PD-010 Walk through quickstart.md's five scenarios plus the Garage regression check, end to
      end against `deno task dev`

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the prop shape and i18n keys
  must exist before any story-specific rendering can compile.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4 reuses the same per-vehicle
  fetch effect Phase 3 introduces (extends it, doesn't duplicate it), but has no data dependency on
  Phase 3's KPI rendering itself.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: soft, same reasoning — extends the same
  fetch effect.
- **Phase 6 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That alone replaces the screen's core meaning (spend
KPIs for the selected vehicle, matching the design). Phases 4 and 5 are additive enhancements to the
same screen and can ship in the same PR or follow-up PRs without re-touching Phase 3's work, since
all three phases share one fetch effect that simply grows a call at a time.
