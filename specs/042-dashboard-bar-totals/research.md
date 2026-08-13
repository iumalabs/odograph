# Phase 0 Research: Dashboard Chart Bar Totals

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Reuse the existing `total` variable and `formatCostFigure` helper, add no new code path

**Decision**: The label reads `formatCostFigure(total, currencySymbol)` where `total` is the exact
same `m.maintenanceCost + m.fuelCost` value the bar-height calculation (`heightPct`) already derives
inside the same `chartMonths.map(...)` iteration.

**Rationale**: Guarantees FR-003/SC-002 (label always numerically consistent with the bar) by
construction — there is no second computation to drift from the first.

## Decision: Label placement is above the bar, small/dim text — matching the mockup and this app's existing convention

**Decision**: A `font: "400 9.5px var(--font-mono)"; color: var(--dim)` label directly above each
bar's track, matching the mockup's own `b.total` styling and this component's existing small-label
conventions elsewhere (e.g. the month label already below each bar).

**Rationale**: Consistency with both the source design and this component's own existing type
scale — no new style vocabulary introduced for one label.
