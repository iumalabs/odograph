# Phase 0 Research: Monthly/Annual Expense Analytics

## Decision: Bucket key derived by string-slicing the existing date-only field, no Date parsing

**Decision**: A period key is `serviceDate.slice(0, 7)` (month, e.g. `"2026-03"`) or
`serviceDate.slice(0, 4)` (year, e.g. `"2026"`) — the same slice applied to `fuelDate` for fuel
records — never `new Date(...)` parsing.

**Rationale**: `service_records.service_date`/`fuel_records.fuel_date` are already stored as plain
ISO 8601 date-only strings (`YYYY-MM-DD`), exactly like `documents.expiry_date` (specs/023). String
slicing avoids any timezone-conversion ambiguity a `Date` object's local-vs-UTC interpretation
could introduce — the recorded date string is the source of truth, not a re-parsed and
re-formatted derivative of it. String comparison of `"YYYY-MM"`/`"YYYY"` keys also sorts
chronologically for free (FR-008), no separate sort-key needed.

**Alternatives considered**:
- *Parse via `Date.parse` and reformat with `getUTCFullYear()`/`getUTCMonth()`*: Rejected —
  strictly more code for an identical result, and introduces a parse/reformat round-trip this
  codebase's existing date-only-string precedent (`todayDateOnly()`, specs/023/024) already avoids
  for the exact same reason.

## Decision: One function, one route, `groupBy` is a required, validated query parameter

**Decision**: `computeVehicleExpenseBreakdown(db, ctx, vehicleId, groupBy: "month" | "year")` and
`GET /:vehicleId/expense-breakdown?groupBy=month|year` — `groupBy` is required and validated
against exactly those two values; missing or any other value is a `400`, never a silent default
(FR-001, FR-002).

**Rationale**: spec.md's own FR-001 says grouping is "selected explicitly per request" — an
implicit default would contradict that. A single function taking the granularity as a parameter
(rather than two near-duplicate functions, `computeMonthlyBreakdown`/`computeYearlyBreakdown`)
keeps the bucketing logic in one place; only the slice length (4 vs. 7 characters) differs between
the two modes.

**Alternatives considered**:
- *Two separate functions/routes*: Rejected — the only difference between month and year grouping
  is the slice length; a single parameterized function avoids duplicating the identical
  filter/sum/sort logic twice.
- *Default `groupBy` to `"month"` when omitted*: Rejected — spec.md explicitly frames grouping as
  an explicit per-request choice (FR-001), and an implicit default is exactly the "silently
  defaulting" FR-002 rules out for invalid values; extending that same explicitness to the omitted
  case is simpler to reason about than two different fallback behaviors for "missing" vs. "wrong."

## Decision: No new charting dependency — plain table, optional CSS-only bar

**Decision**: `DashboardView.tsx` renders the breakdown as a table (period, maintenance, fuel,
total) with an optional inline CSS `width: X%` bar per row for relative visual comparison — no JS
charting library.

**Rationale**: spec.md's own Assumptions section settles this — the project currently has zero
charting dependencies (confirmed: no recharts/d3/victory/nivo/chart.js in `deno.json`), and every
existing panel (including the current all-time aggregate chips) already presents figures as plain
text, not charts. Introducing a charting library for one small feature would be a disproportionate
new dependency for a "no design polish yet" UI posture every other panel in this codebase shares.

**Alternatives considered**:
- *Add a lightweight charting library (e.g. a small SVG-based one)*: Rejected — explicitly ruled
  out by spec.md; a CSS-only bar (a `<div>` with a percentage width) achieves the same
  at-a-glance relative-comparison value with zero new dependencies.
