# Implementation Plan: Dashboard Chart Bar Totals

**Branch**: `042-dashboard-bar-totals` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/042-dashboard-bar-totals/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`DashboardView.tsx`'s six-month bar chart already computes `total = m.maintenanceCost + m.fuelCost`
per month (used for `heightPct`); this adds one text element above each bar rendering that exact
same `total`, formatted via the existing `formatCostFigure(total, currencySymbol)` helper the
component already uses elsewhere on the same screen.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — no schema/API change, purely a rendering addition using data already in scope

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-041

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — no new computation, no new data fetch

**Constraints**: The label MUST use the exact same `total` value already driving `heightPct` — no
parallel computation (spec.md FR-003/SC-002)

**Scale/Scope**: `src/client/components/DashboardView.tsx` only (one JSX addition inside the
existing `chartMonths.map(...)` block)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- No principle implicated — no new aggregate (Principle II N/A, reuses an existing client-side sum
  of already-server-computed period costs), no new data (Principle IV N/A), no new user-facing
  string beyond existing currency formatting (Principle IX: `formatCostFigure` is already used
  elsewhere on this screen, not a new literal string).

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/042-dashboard-bar-totals/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/components/DashboardView.tsx   # one JSX addition inside the bar-chart render (extend)
```

**Structure Decision**: No new files, no new data-model.md/contracts (nothing new is persisted or
exposed via any API) — this is the smallest possible change: one label element inside an existing
loop, using a value that loop already computes.

## Complexity Tracking

*No violations — section not applicable.*
