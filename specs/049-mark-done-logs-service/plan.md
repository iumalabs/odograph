# Implementation Plan: Mark-Done Logs a Service Record

**Branch**: `049-mark-done-logs-service` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/049-mark-done-logs-service/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`markReminderRuleDone` (`src/server/db/repository.ts`) gains the exact same done-transition side
effect `updatePlanCard` already established for the Planner's "done" stage: after the existing
last-done-field update, it calls the existing `createServiceRecord` with the reminder's `label` as
`description`, today's date, the vehicle's current known odometer (via the already-existing
`getVehicleCurrentOdometer`, `null` if unknown), `cost: null`, `performedBy: null`, and a fixed
explanatory `notes` string. No new endpoint, no new client wiring — the existing `/mark-done` route
and its already-wired `idempotent` middleware cover this automatically.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Hono on Cloudflare Workers (server)

**Primary Dependencies**: Hono, D1 — no new dependency

**Storage**: D1 — a new `service_records` row per mark-done call; no schema change (reuses the
existing table/columns)

**Testing**: Extend `tests/server/reminder-rules.test.ts`'s existing "mark reminder rule done"
describe block with assertions on the newly-created service record, following the exact test
pattern `tests/server/plan-card-crud.test.ts` already uses for the analogous Planner-done case.

**Target Platform**: Cloudflare Workers (server only — no client changes needed, the existing
Service screen already renders whatever's in the table)

**Project Type**: Web application (server-only change)

**Performance Goals**: N/A — one additional insert per mark-done call, same cost class as the
Planner's already-shipped equivalent

**Constraints**: Per constitution Principle IV, no field is ever guessed — `cost`/`performedBy` are
always `null`, `odometerReading` is the vehicle's real current value or `null`, matching FR-004/
FR-005 exactly. Per Principle III (idempotent offline writes), the already-wired `idempotent`
middleware on `/mark-done` already prevents this side effect from duplicating on a retry — no new
idempotency logic needed (FR-007).

**Scale/Scope**: `src/server/db/repository.ts` (`markReminderRuleDone` extended),
`tests/server/reminder-rules.test.ts` (extended)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **III. Idempotent, Ordered Offline Sync**: PASS — the existing `idempotent` middleware on
  `POST /:id/mark-done` already short-circuits a retried request with a matching `Idempotency-Key`
  before the handler (and therefore this new side effect) ever runs again — the exact mechanism
  `updatePlanCard`'s analogous done-transition already relies on.
- **IV. No Interpolated Data**: PASS — every field on the auto-created record is either a real,
  already-known value (label, date, current odometer) or explicitly left blank (cost, performer),
  never a guess.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/049-mark-done-logs-service/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/db/repository.ts        # markReminderRuleDone: add the done-transition side effect (extend)
tests/server/reminder-rules.test.ts  # extend "mark reminder rule done" tests (extend)
```

**Structure Decision**: No new files — one function extended, mirroring an already-shipped sibling
pattern (`updatePlanCard`'s done-transition) as closely as possible.

## Complexity Tracking

*No violations — section not applicable.*
