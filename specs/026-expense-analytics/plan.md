# Implementation Plan: Monthly/Annual Expense Analytics

**Branch**: `026-expense-analytics` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-expense-analytics/spec.md`

## Summary

Add `computeVehicleExpenseBreakdown(db, ctx, vehicleId, groupBy)` alongside the existing
`computeVehicleAggregates` (specs/013) — a second, derived read over the exact same
`listServiceRecords`/`listFuelRecordsWithEconomy` calls, grouping each non-duplicate record's cost
into a calendar-month or calendar-year bucket instead of folding everything into one all-time
figure. No new table, no new dependency — the same D-005 duplicate exclusion, the same
division-safety posture (Principle II, though this feature sums rather than divides, so the
"guard the denominator" rule doesn't directly apply, but "never fabricate a missing value" — FR-005
— is the same principle in spirit), and the same client-side plain-figures presentation every
other panel already uses.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — explicitly no charting library (spec.md Assumptions).

**Storage**: D1 — no new table or column. Reads `service_records`/`fuel_records` via the existing
`listServiceRecords`/`listFuelRecordsWithEconomy` functions, unchanged.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers`, same integration-style pattern
`vehicle-aggregates.test.ts` already establishes (`SELF.fetch` against the real Worker/D1, not a
unit test of the repository function in isolation).

**Target Platform**: Cloudflare Workers (`workerd`); client UI is a small new per-vehicle panel —
`DashboardView.tsx` is the compact multi-vehicle garage-overview list (one row per vehicle,
click-to-select), not a per-vehicle detail view, so a full month/year table belongs alongside
`App.tsx`'s existing per-selected-vehicle panels (`ServiceRecordPanel`, `FuelRecordPanel`,
`DocumentPanel`, `PlanBoard`, `ReminderRulePanel`), not crammed into that compact list.

**Project Type**: Web application (existing single-Worker structure) — touches
`src/server/db/repository.ts`, `src/server/routes/v1/vehicles.ts`, `src/client/vehicle-aggregates.ts`,
`src/client/App.tsx`, and a new `src/client/components/ExpenseBreakdownPanel.tsx`.

**Performance Goals**: No new target — same unfiltered full-history read
`computeVehicleAggregates` already does; this feature buckets the same in-memory list rather than
folding it into one number, no additional D1 round-trip.

**Constraints**: Repository layer remains the only D1 access point (Principle I); the route stays
read-only, unrated-limited, matching `/:vehicleId/aggregates`'s existing posture; every period's
total is computed only from that vehicle's own tenant-scoped records (Principle I); a missing cost
contributes zero, never a fabricated value (Principle IV, FR-005); cross-tenant access refused
identically to a nonexistent vehicle (Principle I).

**Scale/Scope**: One new repository function, one new route, one new client wrapper function, a
small `DashboardView.tsx` addition. No migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | New function lives in `repository.ts`, scoped by `ctx.tenantId` via the same `listServiceRecords`/`listFuelRecordsWithEconomy` calls `computeVehicleAggregates` already trusts | PASS |
| II. Server-computed, division-safe aggregates | Computed server-side only; this feature sums rather than divides, so there's no denominator to guard, but the equivalent "never fabricate" rule (a missing cost contributes zero, not a guess) is honored (FR-005) | PASS |
| III-VIII | N/A — no offline-queue writes, no interpolated data beyond FR-005's explicit rule, no attachments/tokens/session changes, no new erasure surface (nothing new is stored) | N/A |
| IX. i18n axes | New UI strings route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency — explicitly no charting library (spec.md Assumptions) | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/026-expense-analytics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts                  # ADD: computeVehicleExpenseBreakdown(db, ctx, vehicleId,
│                                        #      groupBy) — reuses listServiceRecords/
│                                        #      listFuelRecordsWithEconomy exactly as
│                                        #      computeVehicleAggregates does, buckets by
│                                        #      YYYY-MM or YYYY instead of folding to one total
└── routes/v1/
    └── vehicles.ts                     # ADD: GET /:vehicleId/expense-breakdown?groupBy=month|year
                                         #      (read-only, not rate-limited — matches
                                         #      /:vehicleId/aggregates's existing posture)

src/client/
├── vehicle-aggregates.ts               # ADD: getVehicleExpenseBreakdown(vehicleId, groupBy)
│                                        #      thin wrapper, mirrors getVehicleAggregates
├── App.tsx                             # MODIFY: mounts a new per-vehicle
│                                        #         ExpenseBreakdownPanel alongside the existing
│                                        #         per-selected-vehicle panels
└── components/
    └── ExpenseBreakdownPanel.tsx       # ADD: month/year toggle + plain table (spec.md
                                         #      Assumptions: optionally a lightweight CSS-only
                                         #      bar per row, no charting dependency)

tests/server/
└── vehicle-aggregates.test.ts          # MODIFY: add an expense-breakdown section, mirroring the
                                         #         existing file's edge-case checklist (zero
                                         #         records, missing cost, duplicate exclusion,
                                         #         cross-tenant refusal, chronological order)
```

**Structure Decision**: No new files beyond the two touched by the feature's own logic
(`repository.ts`, `vehicles.ts`) plus their client counterparts — this is a small, additive
extension of an existing, already-shipped aggregate feature, not a new subsystem.
