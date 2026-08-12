# Implementation Plan: Top-Level Nav Screens

**Branch**: `038-top-level-nav-screens` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-top-level-nav-screens/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add five nav destinations (`fuel`, `service`, `reminders`, `planner`, `documents`) to
`AppShell.tsx`'s `AppView` union and `NAV_ITEMS`, each with a matching new icon where one doesn't
already exist. In `App.tsx`, add five new `if (view === "...")` branches, each rendering the
existing panel component (`FuelRecordPanel`/`ServiceRecordPanel`/`ReminderRulePanel`/`PlanBoard`/
`DocumentPanel`) verbatim — same props, same handlers, only relocated — behind a "select a vehicle"
guard when `selectedVehicleId` is null. Remove the entire `{selectedVehicleId && (...)}` block from
the Garage-view branch, along with `ExpenseBreakdownPanel` and the PDF download link, which move
into the Dashboard-view branch instead (spec.md Assumptions). Change Garage's card click handler to
select the vehicle and navigate to Dashboard.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — no schema/API change; every panel component keeps its exact existing props and
data-fetching, only its render location moves

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-037

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — no new data fetching; each panel's existing fetch-on-selected-vehicle
behavior is unchanged, it just now runs when its own nav screen is active instead of always running
whenever a vehicle is selected on Garage. Net effect: strictly less simultaneous work per screen
view, not more.

**Constraints**: FR-002/SC-003 require zero functional regression in any of the five panels — this
plan achieves that by moving each panel's existing JSX block as-is, not rewriting any of them

**Scale/Scope**: `AppShell.tsx` (nav items + `AppView` type), `App.tsx` (five new view branches,
Garage branch trimmed, Dashboard branch gains expense breakdown + PDF link, Garage card click
handler changed), `src/client/design/icons.tsx` (two new icons: Planner, Documents), `src/client/
i18n/strings.ts` (five new nav labels + one shared "select a vehicle" prompt)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — every new nav label and
  the shared prompt route through `src/client/i18n/strings.ts`.
- No other principle is implicated — no server change, no new data, no new computation.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/038-top-level-nav-screens/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── i18n/strings.ts                       # 5 new nav labels + 1 shared prompt (extend)
├── design/icons.tsx                      # PlannerIcon, DocumentIcon (new)
├── components/AppShell.tsx               # AppView union + NAV_ITEMS (extend)
└── App.tsx                                # 5 new view branches; Garage/Dashboard branches
                                            # restructured (extend)
```

**Structure Decision**: No new component files beyond two icons — every panel component
(`ServiceRecordPanel.tsx`, `FuelRecordPanel.tsx`, `ReminderRulePanel.tsx`, `PlanBoard.tsx`,
`DocumentPanel.tsx`, `ExpenseBreakdownPanel.tsx`) is reused completely unchanged; only where they're
rendered from moves.

## Complexity Tracking

*No violations — section not applicable.*
