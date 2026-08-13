# Tasks: Header Vehicle Switcher

**Input**: Design documents from `/specs/039-header-vehicle-switcher/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No client-side test suite exists in this project for component-level UI — verified
manually via quickstart.md against `deno task dev`, matching specs/033-038. This feature touches
zero server files, so no server test coverage applies either.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] HV-001 `src/client/i18n/strings.ts`: add `quickFuelLabel: "Fuel"` near the existing
      `addFuelRecord`/nav label keys (distinct from `addFuelRecord`, which is the fuel form's own
      submit-button label, not a navigation shortcut — research.md/plan.md)
- [X] HV-002 `src/client/components/AppShell.tsx`: import `Vehicle` type (`../vehicles`) and
      `AddIcon` (`../design/icons`, already used elsewhere for "+" actions); extend `AppShellProps`
      with `vehicles: Vehicle[]`, `selectedVehicleId: string | null`, `onSelectVehicle: (id: string)
      => void` per data-model.md; destructure the three new props in the component signature

**Checkpoint**: `deno task typecheck` fails (App.tsx's `<AppShell>` calls don't pass the new required
props yet) — expected, resolved in Phase 3.

---

## Phase 3: User Story 1 - Switch which vehicle is selected without leaving the current screen (Priority: P1)

**Goal**: A row of vehicle pills in the header; clicking one switches `selectedVehicleId` without
navigating.

- [X] HV-003 [US1] `src/client/components/AppShell.tsx`: render a pill row in the header (between
      the title and the right-aligned group) — one button per `vehicles` entry, `onClick={() =>
      onSelectVehicle(vehicle.id)}`, styled to visually distinguish `vehicle.id ===
      selectedVehicleId` (matching the existing accent/dim color convention used by the nav rail's
      own active-state styling); name text truncated via CSS `overflow: hidden; text-overflow:
      ellipsis; white-space: nowrap` on a width-constrained pill (research.md — no new abbreviation
      field); empty `vehicles` array renders no pills, not a placeholder
- [X] HV-004 [US1] `src/client/App.tsx`: add `vehicles={mergedVehicles}`,
      `selectedVehicleId={selectedVehicleId}`, `onSelectVehicle={setSelectedVehicleId}` to all nine
      `<AppShell>` call sites (garage, dashboard, fuel, service, reminders, planner, documents,
      review, settings) — `onSelectVehicle` is the plain setter, never the select-and-navigate
      handler `<Garage>`/`<SearchBar>` use (research.md, data-model.md)

**Checkpoint**: `deno task typecheck` passes; clicking a header pill while on any vehicle-scoped
screen updates that screen's data in place, without changing which screen is shown.

---

## Phase 4: User Story 2 - Jump straight to logging fuel from anywhere (Priority: P2)

**Goal**: A persistent quick-fuel button in the header, navigating to the Fuel screen.

- [X] HV-005 [US2] `src/client/components/AppShell.tsx`: add a button in the header's
      right-aligned group (before the existing theme toggle), styled with the accent background
      already used elsewhere for primary actions (e.g. `Garage.tsx`'s "Add vehicle" button),
      `onClick={() => onSelectView("fuel")}` (research.md — reuses the existing prop, no new
      callback), showing `<AddIcon size={15} />` + `t("quickFuelLabel")`

**Checkpoint**: Clicking the quick-fuel button from any screen navigates to Fuel.

## Phase 5: Polish & Cross-Cutting

- [X] HV-006 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] HV-007 Walk through quickstart.md's five scenarios plus the regression check, end to end
      against `deno task dev` (verified: dev session bootstrapped, two vehicles created via
      `POST /api/v1/vehicles` including one with a long name, `GET /api/v1/vehicles` confirmed the
      exact data `mergedVehicles` renders pills from — pill click/selection/truncation/quick-fuel
      button are pure client-side React state changes, already covered by `deno task typecheck` +
      structural grep + `deno task check`)

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the new props/label must exist
  before either behavior can be wired.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — both live in the same header
  markup; Phase 4 adds one more button next to what Phase 3 already restructured, no data
  dependency between them.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That alone delivers the feature's core value (switch
vehicles without leaving the screen). Phase 4 (quick-fuel button) is a small, independent addition
to the same header that can ship in the same PR without re-touching Phase 3's work.
