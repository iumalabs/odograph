# Implementation Plan: Header Vehicle Switcher

**Branch**: `039-header-vehicle-switcher` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-header-vehicle-switcher/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`AppShell.tsx`'s header gains three new props (`vehicles: Vehicle[]`, `selectedVehicleId: string |
null`, `onSelectVehicle: (id: string) => void`) rendering a row of pill buttons, plus a persistent
"quick fuel" button that reuses the already-existing `onSelectView` prop to navigate to `"fuel"` — no
new navigation prop needed. `App.tsx`'s nine `<AppShell>` call sites each gain the three new props,
passing `mergedVehicles`, `selectedVehicleId`, and a plain `setSelectedVehicleId` (never navigating —
distinct from the select-and-navigate handler Garage/SearchBar use, per spec.md's Assumptions).

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — no schema/API change; reuses the already-fetched `mergedVehicles` list and
already-existing `selectedVehicleId` state, both already computed in `App.tsx`

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-038

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — no new data fetching; the pill row renders from data `App.tsx` already
holds in state

**Constraints**: Pill selection must never trigger navigation (spec.md's key Assumption) — verified
by using a distinct, plain `setSelectedVehicleId` handler, never the select-and-navigate one

**Scale/Scope**: `AppShell.tsx` (new props + pill row + quick-fuel button), `App.tsx` (three new
props threaded into all nine `<AppShell>` call sites), `i18n/strings.ts` (one new label for the
quick-fuel button)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — the new quick-fuel button
  label routes through `i18n/strings.ts`; pill labels are vehicle names, already user-entered data,
  not a new hardcoded string.
- No other principle is implicated — no server change, no new data, no new computation.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/039-header-vehicle-switcher/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── i18n/strings.ts               # new quickFuelLabel key (extend)
├── components/AppShell.tsx       # 3 new props, pill row, quick-fuel button (extend)
└── App.tsx                        # 3 new props threaded to all 9 <AppShell> call sites (extend)
```

**Structure Decision**: No new component files — the pill row and quick-fuel button are added
directly to `AppShell.tsx`'s existing header markup, since they're part of the same persistent
chrome that component already owns.

## Complexity Tracking

*No violations — section not applicable.*
