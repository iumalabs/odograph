# Tasks: Mark-Done Logs a Service Record

**Input**: Design documents from `/specs/049-mark-done-logs-service/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: `tests/server/reminder-rules.test.ts` already covers mark-done via route-level tests —
extend it, matching `tests/server/plan-card-crud.test.ts`'s existing pattern for the analogous
Planner-done case.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational

None — a single, self-contained function extension.

## Phase 3: User Story 1 - See a durable service-history entry after marking a reminder done (Priority: P1)

- [ ] MDS-001 [US1] `src/server/db/repository.ts`: in `markReminderRuleDone`, after the existing
      `UPDATE reminder_rules` call, call `createServiceRecord(db, ctx, existing.vehicleId, {
      serviceDate: todayDateOnly(), description: existing.label, odometerReading: await
      getVehicleCurrentOdometer(db, ctx, existing.vehicleId), cost: null, notes: "Created from
      marking a reminder done — fill in the real details.", performedBy: null })` — mirroring
      `updatePlanCard`'s done-transition exactly (research.md).
- [ ] MDS-002 [US1] `tests/server/reminder-rules.test.ts`: extend the "mark reminder rule done"
      describe block with: (a) marking done on a vehicle with a known current odometer produces a
      service record with the reminder's label, today's date, that odometer, `cost: null`,
      `performedBy: null`; (b) marking done on a vehicle with no fuel/service history produces a
      record with `odometerReading: null`; (c) retrying the same mark-done request with an
      `Idempotency-Key` header produces only one service record.

**Checkpoint**: `deno task check` passes; marking a reminder done always produces exactly one new
service record with correctly-blank unknown fields, never duplicated on retry.

## Phase 4: Polish & Cross-Cutting

- [ ] MDS-003 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [ ] MDS-004 Walk through quickstart.md's three scenarios plus the regression check against
      `deno task dev`.

## Dependencies

- Single-task feature — no ordering constraints beyond Polish running last.

## Implementation strategy

**MVP = the whole feature** — one function extension mirroring an already-shipped pattern.
