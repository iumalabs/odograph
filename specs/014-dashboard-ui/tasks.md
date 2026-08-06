# Tasks: Dashboard UI

**Input**: Design documents from `/specs/014-dashboard-ui/` **Prerequisites**: plan.md, spec.md,
data-model.md, contracts/ui.md, research.md, quickstart.md

**Tests**: None — no automated client test exists anywhere in this project yet; every prior UI
feature was verified live via `deno task dev`, and this feature follows the same established pattern
(plan.md Technical Context). Verification happens in the Polish phase via quickstart.md.

**Scope note**: No new server route, table, or computation — this feature is entirely `src/client/`,
consuming the already-shipped aggregates (spec 013) and reminder-status (spec 011) endpoints.

## Phase 1: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 [P] Create `src/client/vehicle-aggregates.ts`: `VehicleAggregates` type (mirrors the
      server's exported type of the same name) and
      `getVehicleAggregates(vehicleId): Promise<VehicleAggregates>`, same `jsonFetch`-wrapper shape
      as `src/client/reminder-rules.ts`
- [X] T002 [P] Add new i18n keys to `src/client/i18n/strings.ts`: a Dashboard nav-rail label, a
      Dashboard heading, a zero-vehicles empty-state message, a needs-attention indicator label, and
      an all-good indicator label — reuse the existing `fuelEconomyNotEnoughData` treatment for null
      aggregate figures rather than adding a duplicate key (research.md)
- [X] T003 In `src/client/components/AppShell.tsx` and `src/client/App.tsx`: introduce a
      `view: "garage" | "dashboard"` state in `App.tsx` (defaulting to `"garage"`, preserving
      today's behavior exactly); make `AppShell`'s nav rail render both the existing Garage entry
      and a new Dashboard entry (T002's label) as clickable buttons that call back into `App.tsx` to
      set `view`; `App.tsx` renders its existing Garage-flow content only when `view === "garage"`

**Checkpoint**: The nav rail switches between the existing, unchanged Garage flow and an empty
`view === "dashboard"` branch (no Dashboard content yet) — provable by clicking the nav and
confirming the Garage screen disappears/reappears correctly, with zero regression to existing
behavior.

---

## Phase 2: User Story 1 - An owner sees which vehicle needs attention at a glance (P1) 🎯 MVP

**Goal**: The Dashboard renders a correct, data-complete summary card per vehicle — cost figures
with a "not enough data" fallback, a needs-attention/all-good indicator, and a zero-vehicles empty
state — reachable from the nav rail, before any card-click navigation exists.

- [X] T004 [US1] Create `src/client/components/DashboardView.tsx` (styled per spec 008, mirroring
      `Garage.tsx`'s card/empty-state structure): accepts `vehicles: Vehicle[]` and
      `onSelectVehicle: (id: string) => void` props. For each vehicle, fetches its aggregates
      (T001's `getVehicleAggregates`) and reminder rules (existing `listReminderRules`) in parallel
      (`Promise.all`, research.md). Renders one card per vehicle: identity line (mirrors
      `Garage.tsx`'s name/make/model/year/odometer-unit chip), `costPerDistance`/`costPerTime`/
      `averageFuelEconomy` each independently showing a formatted number or the
      `fuelEconomyNotEnoughData` treatment when `null`, and a needs-attention indicator that's
      `true` when any of that vehicle's reminder rules has `status` `"coming_up"` or `"overdue"`
      (research.md), else an all-good indicator. Renders T002's empty-state message when
      `vehicles.length === 0`. Wire it into `App.tsx`'s `view === "dashboard"` branch, passing the
      existing `vehicles` state and a temporary no-op `onSelectVehicle={() => {}}` — real navigation
      lands in User Story 2

**Checkpoint**: Selecting the Dashboard nav entry shows every owned vehicle's real cost figures and
needs-attention state, correctly null-safe, correctly tenant-scoped (inherited from the existing
session-scoped routes) — independently verifiable via `deno task dev` without any card being
clickable yet.

---

## Phase 3: User Story 2 - An owner jumps from the Dashboard to a vehicle that needs attention (P2)

**Goal**: Selecting a card lands the owner on that exact vehicle's existing detail view.

- [X] T005 [US2] In `src/client/App.tsx`: replace the Phase 2 placeholder `onSelectVehicle` passed
      to `DashboardView` with a real handler that sets `selectedVehicleId` to the chosen vehicle's
      id and `view` to `"garage"` together, landing on the existing Garage/detail flow for exactly
      that vehicle (FR-005) — no changes needed to the Garage flow itself, which already renders
      correctly from `selectedVehicleId` regardless of how it was set

**Checkpoint**: Selecting any Dashboard card reaches that vehicle's full service/fuel/reminder
history in one click; returning to the Dashboard via the nav rail and re-selecting shows current
(re-fetched, not stale) data.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T006 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] T007 Walk through quickstart.md end-to-end against `deno task dev`, including a live browser
      check of: zero-vehicles empty state, a vehicle with no records ("not enough data" + "all
      good"), a vehicle with computed figures and an overdue reminder (needs-attention state), two
      vehicles shown independently side by side, card-click navigation to the correct vehicle,
      returning to the Dashboard showing fresh data, and cross-tenant isolation

## Dependencies

- **Phase 1 (Foundational)** → **all user story phases**: strict — `DashboardView` needs T001's data
  wrapper, T002's strings, and T003's nav/view-switch plumbing to exist at all.
- **User Story 1 (Phase 2)** → **User Story 2 (Phase 3)**: soft — the Dashboard is fully viewable
  and independently valuable after Phase 2 alone; Phase 3 only replaces a no-op callback with a real
  one, touching the same two files (`App.tsx`, indirectly `DashboardView.tsx`'s already- defined
  prop) rather than adding new surface area.
- **Phase 4 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 1, the data wrapper and i18n additions touch different files and have no dependency on
each other (T003 depends on both, but they don't depend on each other):

```text
T001 [P] src/client/vehicle-aggregates.ts
T002 [P] src/client/i18n/strings.ts additions
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 (User Story 1).** A Dashboard an owner can view — correct cost figures,
correct needs-attention signal, correct empty/null states — is independently valuable and demoable
before the click-to-navigate shortcut (User Story 2) exists; an owner can still reach any vehicle
via the pre-existing Garage nav entry in the meantime.
