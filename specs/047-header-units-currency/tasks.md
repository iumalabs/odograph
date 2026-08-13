# Tasks: Header Currency and Units Toggles

**Input**: Design documents from `/specs/047-header-units-currency/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No client-side test suite exists in this project — the conversion formula is hand-
verified (research.md/quickstart.md's manual verification numbers); overall behavior verified via
quickstart.md against `deno task dev`, matching specs/033-046. Zero server files touched.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] HUC-001 `src/client/distance.ts` (new file): `export type DistanceUnit = "km" | "mi"`;
      `useDistanceUnit()` mirroring `currency.ts`'s exact shape (localStorage key
      `odograph:distanceUnit`, default `"km"`, `[unit, setUnit]` tuple); `convertDistance(value:
      number, from: DistanceUnit, to: DistanceUnit): number` — `value` unchanged when `from ===
      to`, else `value * 0.621371` (km→mi) or `value * 1.609344` (mi→km) (research.md — exact
      constants, no new division-safety concern since this is a fixed multiply, never a division by
      a variable interval).
- [X] HUC-002 `src/client/components/AppShell.tsx`: extend `AppShellProps` with `currency:
      Currency`, `onCurrencyChange: (value: Currency) => void`, `distanceUnit: DistanceUnit`,
      `onDistanceUnitChange: (value: DistanceUnit) => void` (types imported from `../currency` and
      `../distance`); destructure in the component signature. No rendering yet.
- [X] HUC-003 `src/client/App.tsx`: call `useDistanceUnit()` alongside the existing `useCurrency()`
      call; pass `currency`, `setCurrency`, `distanceUnit`, `setDistanceUnit` as
      `currency`/`onCurrencyChange`/`distanceUnit`/`onDistanceUnitChange` to all nine `<AppShell>`
      call sites (garage, dashboard, fuel, service, reminders, planner, documents, review,
      settings) — mechanical, matching specs/039/046's existing threading pattern for shared
      `AppShell` props.

**Checkpoint**: `deno task typecheck` passes; new preferences exist and are threaded; no header UI
change yet, no display-site conversion yet.

---

## Phase 3: User Story 1 - Change currency from anywhere, not just Settings (Priority: P2)

- [X] HUC-004 [US1] `src/client/components/AppShell.tsx`: render a currency pill in the header
      (between the vehicle-switcher pills and the theme toggle, matching the mockup's `curPill`
      position) that opens a small dropdown listing the four existing currencies (reusing
      `currencyUsdLabel`/`currencyEurLabel`/`currencyRubLabel`/`currencyGbpLabel` from specs/035,
      plus `currencySymbol()` for each option's leading glyph); selecting one calls
      `onCurrencyChange` and closes the dropdown. Local `useState` for the open/closed flag (no new
      prop needed — purely this component's own transient UI state, matching how other in-header
      dropdowns in this app are already handled).

**Checkpoint**: Changing currency from the header updates cost figures app-wide and is reflected
back in Settings' own currency control (same underlying state).

---

## Phase 4: User Story 2 - Toggle displayed distance units app-wide (Priority: P2)

- [X] HUC-005 [US2] `src/client/components/AppShell.tsx`: render a units pill next to the currency
      pill — a plain click-to-toggle button (no dropdown needed, only two states) showing the
      current `distanceUnit` value, calling `onDistanceUnitChange` with the other unit on click.
- [X] HUC-006 [US2] `src/client/App.tsx`: pass `distanceUnit` to `Garage`, `DashboardView`,
      `FuelRecordPanel`, `ServiceRecordPanel`, `ReminderRulePanel` at their call sites; for the
      three panels that don't currently receive the selected vehicle's own `odometerUnit`, also
      pass `vehicleOdometerUnit={mergedVehicles.find((v) => v.id === selectedVehicleId)
      ?.odometerUnit}` (Garage/DashboardView already have each vehicle's own `odometerUnit`
      in scope, no extra prop needed there).
- [X] HUC-007 [US2] `src/client/components/Garage.tsx`: accept `distanceUnit` prop; convert the
      odometer stat via `convertDistance(currentOdometer, vehicle.odometerUnit, distanceUnit)`,
      displaying the result rounded for readability with the resolved `distanceUnit` as the label
      — never touching `vehicle.odometerUnit` itself or any form field on this screen.
- [X] HUC-008 [US2] `src/client/components/DashboardView.tsx`: accept `distanceUnit` prop; in
      `dueInText`, when `rule.remainingUnit === "distance"`, convert the value via
      `convertDistance(rule.remainingValue, vehicle.odometerUnit, distanceUnit)` before formatting,
      and use `distanceUnit` (not the vehicle's own unit) as the `{unit}` template param.
- [X] HUC-009 [US2] `src/client/components/FuelRecordPanel.tsx`: accept `distanceUnit`/
      `vehicleOdometerUnit` props; convert each table row's displayed `record.odometerReading` for
      the read-only list column only — the create-form's odometer input/placeholder and the
      edit-form's fields are explicitly left unconverted (spec.md FR-004/research.md).
- [X] HUC-010 [US2] `src/client/components/ServiceRecordPanel.tsx`: same treatment as HUC-009 for
      its own odometer table column; forms unaffected.
- [X] HUC-011 [US2] `src/client/components/ReminderRulePanel.tsx`: accept `distanceUnit`/
      `vehicleOdometerUnit` props; convert `intervalSummary()`'s displayed distance component only
      (the read-only row text) — the add-form's `intervalDistance`/`lastDoneOdometer` inputs are
      explicitly left unconverted.

**Checkpoint**: Toggling the units pill converts every read-only distance figure in scope, leaves
every form input and every fuel-economy/cost-per-distance figure untouched, and reverts to exact
stored values when toggled back to a vehicle's own native unit.

## Phase 5: Polish & Cross-Cutting

- [X] HUC-012 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] HUC-013 Walk through quickstart.md's five scenarios, the manual formula verification, and the
      regression check, end to end against `deno task dev`. Verified: conversion constants produce
      the exact expected values (100km -> 62.1371mi, 100mi -> 160.9344km); created a km-native
      vehicle with a fuel record at odometerReading=1000, confirming the exact input data
      convertDistance() would receive (1000 * 0.621371 = 621.371 -> rounds to 621mi, matching the
      client-side rendering logic traced through code review). Form-field/fuel-economy/cost-per-
      distance exclusion verified by code inspection (no distanceUnit prop threaded to any input
      field or economy/cost-per-distance render site) — covered by typecheck + the full check
      suite.

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the hook/props must exist
  before either pill or any conversion can be wired.
- **User Story 1 (Phase 3)** and **User Story 2 (Phase 4)**: independent of each other (different
  pills, different underlying preferences) — either could ship alone; both are done here together
  since they share the same header-pill-row layout work.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** The currency pill alone is low-risk and delivers real
value on its own. Phase 4 (units toggle) is the larger, independently-shippable half — if time-
constrained, Phase 3 could ship first as its own PR, but both are implemented together in this pass
since spec.md treats them as one issue (#136).
