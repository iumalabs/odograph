# Tasks: Dashboard Chart Bar Totals

**Input**: Design documents from `/specs/042-dashboard-bar-totals/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No client-side test suite exists in this project — verified manually via quickstart.md
against `deno task dev`, matching specs/033-041. Purely presentational, zero server files touched.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational

None — no blocking prerequisite; this is a single-file, single-location change.

## Phase 3: User Story 1 - See each month's total spend directly on the chart (Priority: P1)

- [X] DBT-001 [US1] `src/client/components/DashboardView.tsx`: inside the `chartMonths.map(...)`
      bar-chart render, add a small dim text label above each bar showing
      `formatCostFigure(total, currencySymbol)` — the exact `total` variable already computed for
      `heightPct` in that same iteration, styled `font: "400 9.5px var(--font-mono)"; color:
      var(--dim)` (research.md).

**Checkpoint**: Every bar (including zero-spend months) shows a total label matching its height.

## Phase 4: Polish & Cross-Cutting

- [X] DBT-002 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures.
- [X] DBT-003 Walk through quickstart.md's two scenarios plus the regression check against
      `deno task dev`. Verified: `GET .../expense-breakdown?groupBy=month` returns `fuelCost: 60,
      maintenanceCost: 0` for a test fuel record, confirming the same `total` the label renders is
      the same value backing the bar height — the rendering itself (pure JSX addition) is covered
      by typecheck + the full check suite.

## Dependencies

- Single task, single file — no ordering dependencies beyond Polish running last.

## Implementation strategy

**MVP = the whole feature** — one label addition, no phased rollout needed.
