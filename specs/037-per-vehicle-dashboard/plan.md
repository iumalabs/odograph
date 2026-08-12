# Implementation Plan: Per-Vehicle Dashboard

**Branch**: `037-per-vehicle-dashboard` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-per-vehicle-dashboard/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Rewrite `DashboardView.tsx` from "map over every vehicle, show a summary card" to "show a deep-dive
for the currently selected vehicle," built entirely from data already exposed to the client today:
`getVehicleAggregates` (KPIs' cost-per-distance), `getVehicleExpenseBreakdown` (KPIs' spend totals
and the monthly chart, client-side zero-filled for months with no records), `listReminderRules`
(upcoming list), and `listServiceRecords`/`listFuelRecords` (recent-activity list, merged and
sorted). No new server route, no new server computation — a purely client-side reassembly of
already-computed data.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — no schema/API change; reuses four already-existing client API functions verbatim

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-036

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — same request shape/count as the current DashboardView (one call per
data source, now for one vehicle instead of N vehicles — strictly less work, not more)

**Constraints**: Every displayed figure must trace back to an existing server computation (FR-007) —
no new aggregate logic; the zero-fill for empty months is a client-side display transform over
already-fetched real data, not a new computed value

**Scale/Scope**: One component fully rewritten (`DashboardView.tsx`), its prop shape changed
(`vehicles: Vehicle[]` → `vehicle: Vehicle | null`, since it's no longer a list), and its one caller
in `App.tsx` updated to pass the selected vehicle instead of the full list

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS — every KPI/chart/list value is either an
  already-server-computed aggregate or a direct, unmodified field off an already-fetched record; no
  new computation is introduced client-side beyond zero-filling empty months and sorting/merging two
  already-fetched lists (neither is a "computed aggregate" in the sense this principle guards
  against — no division, no derived business figure).
- **IV. No Interpolated Data**: PASS — a selected-but-empty vehicle shows real zeros from real (empty)
  data, never a fabricated or estimated figure (FR-003 edge case).
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — every new label routes
  through `src/client/i18n/strings.ts`.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/037-per-vehicle-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── i18n/strings.ts                   # new labels (KPI/chart/list headings) (extend)
├── App.tsx                            # pass selectedVehicleId's Vehicle, not the full list (extend)
└── components/DashboardView.tsx      # full rewrite: per-vehicle deep-dive, not an all-vehicles list
```

**Structure Decision**: Single-component rewrite plus its one call site in `App.tsx` — no new files,
no server files touched. `Garage.tsx` (which already shows the all-vehicles overview data this
feature supersedes on Dashboard) is explicitly untouched.

## Complexity Tracking

*No violations — section not applicable.*
