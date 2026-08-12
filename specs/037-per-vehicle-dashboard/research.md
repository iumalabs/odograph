# Phase 0 Research: Per-Vehicle Dashboard

No `[NEEDS CLARIFICATION]` markers were left in the spec. This phase confirms implementation-level
decisions already implied by the codebase's existing conventions and the source design's own shape.

## Decision: No new server route — reuse four existing client API calls

**Decision**: Fetch, for the selected vehicle only: `getVehicleAggregates` (for cost-per-distance),
`getVehicleExpenseBreakdown(vehicleId, "month")` (for both the spend KPIs — summed across returned
periods — and the monthly chart), `listReminderRules` (for the upcoming list), and
`listServiceRecords` + `listFuelRecords` (merged and sorted, for the recent-activity list).

**Rationale**: All four already exist, are already used elsewhere in this app for per-vehicle
panels, and together cover every figure spec.md's FR-001/003/005/006 ask for. Total/fuel/service
spend KPIs are the sum of `maintenanceCost`/`fuelCost`/`totalCost` across every period
`getVehicleExpenseBreakdown` returns — no separate "lifetime totals" endpoint needed, since summing
the already-fetched monthly breakdown gives the same number with one less request.

**Alternatives considered**: A new combined "dashboard summary" server endpoint bundling all four —
rejected as premature endpoint-per-screen design for a page that's just recombining data the client
already knows how to fetch; matches this codebase's established "no batch endpoint at this scale"
reasoning already used for the current DashboardView (research.md there made the same call for a
similar N-vehicle fan-out; this is now a fan-out of exactly 4 calls for 1 vehicle, strictly simpler).

## Decision: Client-side zero-fill for the monthly chart

**Decision**: Generate the last 6 calendar months' period keys (`YYYY-MM`, including the current
month) client-side, then look up each in `getVehicleExpenseBreakdown`'s returned array — defaulting
to `{ maintenanceCost: 0, fuelCost: 0, totalCost: 0 }` for any month absent from the response.

**Rationale**: The existing server aggregate only returns periods that have at least one record
(confirmed by reading `computeVehicleExpenseBreakdown`'s implementation — it builds a `Map` keyed
only by periods it actually saw a record for). FR-004 requires empty months to still appear as
zero-value bars so months stay directly comparable. This is a display-layer bucketing of real,
already-fetched data — not a new computed value (constitution Principle IV/FR-007 compliant).

**Alternatives considered**: Changing `computeVehicleExpenseBreakdown` itself to zero-fill — rejected
because that function is shared with `ExpenseBreakdownPanel.tsx` (specs/026), which has no such
requirement and whose existing tests assert the current sparse-periods behavior exactly; changing
shared server logic to satisfy one caller's display preference would risk that unrelated, already-
shipped feature.

## Decision: Window/count bounds (6 months, top 5 items)

**Decision**: The monthly chart covers the last 6 calendar months (including the current one); the
upcoming-reminders and recent-activity lists each show up to 5 items.

**Rationale**: Spec.md's Assumptions explicitly leave exact counts to implementation, only requiring
"a bounded, glanceable" shape. 6 months gives a meaningful trend view without an unbounded chart; 5
items keeps both lists genuinely "at a glance" (matching this app's existing UI density elsewhere —
e.g. Garage/Dashboard cards already show a small, fixed set of chips, never an unbounded list).

**Alternatives considered**: Mirroring the source design's exact counts (7 months, 3 + 2 items) —
rejected as arbitrary precision to copy from a mockup with placeholder data spanning a fixed
Feb-Aug 2026 window; this project's real data has no such fixed window, so "last N calendar months
from today" is the correct translation of that intent, not a literal count match.
