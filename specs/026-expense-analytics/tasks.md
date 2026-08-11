# Tasks: Monthly/Annual Expense Analytics

**Input**: Design documents from `/specs/026-expense-analytics/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — monthly/yearly grouping correctness, zero-record/missing-cost/duplicate
edge cases, chronological order, invalid-groupBy rejection, cross-tenant refusal.

## Phase 1: Setup

None — no migration, no new dependency (research.md).

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 In `src/server/db/repository.ts`, alongside `computeVehicleAggregates`, add
      `computeVehicleExpenseBreakdown(db, ctx, vehicleId, groupBy)` per data-model.md: reuses the
      same `Promise.all([listServiceRecords(...), listFuelRecordsWithEconomy(...)])` shape,
      filters `duplicateOfId === null` (D-005, FR-006), buckets each record by
      `record.serviceDate/fuelDate.slice(0, groupBy === "month" ? 7 : 4)` (research.md — string
      slicing, no `Date` parsing), sums `maintenanceCost`/`fuelCost` per bucket with a missing
      service-record cost contributing `0` (FR-005), and returns entries sorted by `period`
      ascending (free via string sort, FR-008)

**Checkpoint**: `computeVehicleExpenseBreakdown` exists, type-checks, and is directly callable —
no route wired yet.

---

## Phase 3: User Story 1 - An owner sees their vehicle's spending broken down by month (P1) 🎯 MVP

**Goal**: End-to-end monthly breakdown, correctly summed, correctly scoped, correctly empty when
there's nothing to show.

- [X] T002 [US1] Implement `GET /:vehicleId/expense-breakdown` in
      `src/server/routes/v1/vehicles.ts` (same not-a-new-mount-point convention every prior nested
      resource established, adjacent to the existing `/:vehicleId/aggregates` route): resolves
      `vehicleId` via `findVehicleById` first (`404` if not found/not yours, FR-007); validates
      the `groupBy` query param is exactly `"month"` or `"year"` — `400` with nothing computed on
      any other value or omission (FR-001, FR-002); calls `computeVehicleExpenseBreakdown` and
      returns `{ periods: [...] }`; read-only, not rate-limited, matching `/:vehicleId/aggregates`
- [X] T003 [P] [US1] Extend `tests/server/vehicle-aggregates.test.ts` with an "expense breakdown
      (monthly)" section: 1. Records across two different calendar months produce exactly two
      periods with correctly summed `maintenanceCost`/`fuelCost`/`totalCost` for each (SC-002). 2.
      A vehicle with no records returns `{ periods: [] }`, not an error (SC-003). 3. A service
      record with no cost contributes `0` to its period, not omitted from the count of records
      considered. 4. A record flagged as a semantic duplicate is excluded from its period's totals
      (FR-006). 5. Periods are returned in chronological order (FR-008).

**Checkpoint**: `deno task test` passes for the monthly-breakdown section.

---

## Phase 4: User Story 2 - An owner switches to a yearly view (P2)

**Goal**: Same computation, year-length bucketing; invalid grouping rejected.

- [X] T004 [P] [US2] Extend `vehicle-aggregates.test.ts` (yearly section): 1. The same records
      from the monthly test, requested with `groupBy=year`, produce year-level totals equal to
      the sum of their constituent months' totals (SC-001, SC-002). 2. An invalid `groupBy` value
      (e.g. `week`) is rejected (`400`) and nothing is computed. 3. A missing `groupBy` query
      param is rejected (`400`) — no silent default (FR-002, research.md).
- [X] T005 [P] [US2] Extend `vehicle-aggregates.test.ts` (cross-tenant section): requesting either
      grouping for a vehicle belonging to a different tenant, or a made-up vehicle id, is refused
      (`404`) identically for both cases (SC-004, FR-007).

**Checkpoint**: `deno task test` passes for the yearly and cross-tenant sections.

---

## Phase 5: Client UI

- [X] T006 [P] In `src/client/vehicle-aggregates.ts`, add `getVehicleExpenseBreakdown(vehicleId,
      groupBy)` — thin wrapper mirroring `getVehicleAggregates`'s exact shape, hitting the new
      route
- [X] T007 Implement `src/client/components/ExpenseBreakdownPanel.tsx`: a month/year toggle and a
      plain table (period, maintenance cost, fuel cost, total — optionally a lightweight
      CSS-only `width: X%` bar per row for relative comparison, no charting dependency,
      research.md); an empty-state message when there are no periods; new UI strings routed
      through the existing i18n infrastructure (constitution Principle IX)
- [X] T008 Modify `src/client/App.tsx`: mounts `ExpenseBreakdownPanel` alongside the existing
      per-selected-vehicle panels (`ServiceRecordPanel`/`FuelRecordPanel`/`DocumentPanel`/
      `PlanBoard`/`ReminderRulePanel`) — fetched fresh on vehicle selection and on toggle change,
      same plain-fetch posture as `DocumentPanel` (this feature has no writes to route through
      the offline queue at all — it's read-only)

## Phase 6: Polish & Cross-Cutting

- [X] T009 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [X] T010 Walk through quickstart.md end-to-end against `deno task dev`

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — `computeVehicleExpenseBreakdown`
  is shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — both exercise the same route;
  Phase 4 adds the yearly-specific and validation-specific assertions.
- **Phase 5 (Client UI)** → after Phase 4 (needs the full, validated route contract).
- **Phase 6 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That delivers "an owner can see monthly spending" —
this feature's core value, fully testable server-side without touching the client yet. User Story
2 (yearly view + validation) is a small, low-risk extension of the same function/route. Client UI
(Phase 5) is scheduled last since it depends on the finished, validated API contract.
