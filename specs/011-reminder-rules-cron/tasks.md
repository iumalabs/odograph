# Tasks: Reminder Rules & Cron Scheduling

**Input**: Design documents from `/specs/011-reminder-rules-cron/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — CRUD lifecycle, cross-tenant isolation, dedicated status-computation cases
(all four states, both-intervals-disagree), mark-done, and the scheduled handler invoked directly
via `createScheduledController()`.

**Scope note**: Delivery of an actual notification (email #14, web push #15) is explicitly out of
scope — this feature only establishes computed/cached status for those to build on later.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0010_reminder_rules.sql`: `reminder_rules` per
      data-model.md, including the `CHECK (interval_days IS NOT NULL OR interval_distance IS NOT
      NULL)` table constraint (FR-002) and both indexes
- [X] T002 [P] Add `[triggers]` sections with `crons = ["0 8 * * *"]` (research.md — once daily,
      08:00 UTC) to `wrangler.toml`'s default, `[env.preview]`, and `[env.production]` sections

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T003 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T004 In `src/server/db/repository.ts`: `ReminderRule`/`ReminderRuleInput` types,
      `ReminderStatus` union type, `getVehicleCurrentOdometer(db, ctx, vehicleId)` (the `MAX()`-
      over-`UNION` query from research.md, `null` if no fuel/service records exist yet), and
      `computeReminderStatus(rule, currentOdometer, now)` — a pure function (no D1 access) per
      research.md's proportional-remaining/10%-threshold logic, returning `{ status, byDate,
      byMileage, dueDate, dueOdometer }` (the top-level key is named `status`, matching the API
      response field in contracts/api.md exactly — no rename step at the route layer). Also add
      `listReminderRulesWithStatus(db, ctx, vehicleId)` (fetches the vehicle's rules + current
      odometer once, maps `computeReminderStatus` over each — avoids an N+1 odometer lookup) and
      `findReminderRuleById(db, ctx, id)`, since Phase 3 already needs a working status-aware list
      endpoint

**Checkpoint**: The status-computation logic is unit-provable against hand-constructed rule
objects — no route or CRUD wired up yet.

---

## Phase 3: User Story 1 - An owner sets up a recurring reminder for a vehicle (P1) 🎯 MVP

**Goal**: Complete create → list end-to-end, rejecting a rule with neither interval and refusing a
cross-tenant/nonexistent vehicle.

- [ ] T005 [US1] Add `createReminderRule(db, ctx, vehicleId, input)` to `repository.ts` (same
      bootstrap shape as `createFuelRecord`). Implement `POST /:vehicleId/reminder-rules` and
      `GET /:vehicleId/reminder-rules` **directly in the existing**
      `src/server/routes/v1/vehicles.ts` (one-file-one-prefix convention established since spec
      007's analyze finding C1). `POST` behind `rateLimitBySession`: resolves `vehicleId` via the
      existing `findVehicleById` first (`404` if not found/not yours); validates `label`
      non-empty, at least one of `intervalDays`/`intervalDistance` present, and the matching
      anchor field(s) present — `400` with nothing created on failure; `GET` returns
      `{ reminderRules: [...] }` via T004's `listReminderRulesWithStatus`
- [ ] T006 [P] [US1] Create `tests/server/reminder-rules.test.ts` (creation section): 1. Creating
      a rule with only a date interval, only a mileage interval, and both, all succeed and appear
      in the vehicle's list. 2. Creating a rule with neither interval is rejected (`400`) and
      creates nothing. 3. Creating a date-interval rule without `lastDoneDate` (or a
      mileage-interval rule without `lastDoneOdometer`) is rejected. 4. Creating against a
      vehicle belonging to a different tenant (or a made-up vehicle id) is refused (`404`),
      identically for both cases.

**Checkpoint**: `deno task test` passes for the creation section.

---

## Phase 4: User Story 2 - An owner sees which reminders are coming up or overdue (P1)

**Goal**: Fetch-by-id and the full status-computation contract proven correct across its key
cases, including the "not enough data" and both-intervals-disagree cases.

- [ ] T007 [US2] Implement `GET /api/v1/reminder-rules/:id` in new
      `src/server/routes/v1/reminder-rules.ts` (mounted at `/api/v1/reminder-rules` in
      `src/server/index.ts`, matching `fuel-records.ts`'s structure), using T004's
      `findReminderRuleById`: `404` under the not-found-or-not-yours contract; response includes
      the same computed-status shape as the list endpoint
- [ ] T008 [P] [US2] Extend `reminder-rules.test.ts` (status computation section): 1. A date rule
      due far in the future is `on_track`; one due within its 10% threshold is `coming_up`; one
      past due is `overdue`. 2. The same three cases for a mileage rule, using a logged fuel
      record to establish the vehicle's current odometer reading. 3. A mileage-only rule on a
      vehicle with no fuel/service records shows `not_enough_data`, never a crash or a guessed
      status. 4. A rule with both intervals where one is `overdue` and the other `on_track`
      reports `overdue` overall. 5. Listing/fetching across two different tenants' vehicles —
      each sees only their own. 6. Listing or fetching against a different tenant's vehicle/rule
      is refused (`404`), identically to a made-up id.

**Checkpoint**: `deno task test` passes for the status-computation section — this is the
feature's core Principle II/IV proof.

---

## Phase 5: User Story 3 - An owner marks a reminder as done (P2)

**Goal**: Mark-done resets the rule's anchor(s) and recomputed status.

- [ ] T009 [US3] Add `markReminderRuleDone(db, ctx, id)` to `repository.ts` — sets
      `last_done_date` to today, and (only if `interval_distance` is set) `last_done_odometer` to
      `getVehicleCurrentOdometer`'s result. Implement `POST /api/v1/reminder-rules/:id/mark-done`
      in `reminder-rules.ts` behind `rateLimitBySession`
- [ ] T010 [P] [US3] Extend `reminder-rules.test.ts` (mark-done section): 1. Marking an overdue
      rule done resets its status to `on_track` (or `not_enough_data` if the vehicle still has no
      odometer history for a mileage-based rule) and its `lastDoneDate`/`lastDoneOdometer` update
      accordingly. 2. Marking a different tenant's rule done is refused (`404`) and leaves it
      untouched.

**Checkpoint**: `deno task test` passes for the mark-done section.

---

## Phase 6: User Story 4 - An owner edits or removes a reminder rule (P2)

**Goal**: Partial update (respecting the at-least-one-interval constraint) and delete.

- [ ] T011 [US4] Add `updateReminderRule(db, ctx, id, patch)` and `deleteReminderRule(db, ctx,
      id)` to `repository.ts` (same partial-update/delete shapes as the equivalent fuel/service
      record functions). Implement `PATCH /api/v1/reminder-rules/:id` and
      `DELETE /api/v1/reminder-rules/:id` in `reminder-rules.ts`, both behind
      `rateLimitBySession`: `PATCH` rejects (`400`) an update that would leave the rule with
      neither interval
- [ ] T012 [P] [US4] Extend `reminder-rules.test.ts` (update/delete section): 1. Updating one
      field leaves every other field unchanged and recomputes status. 2. Clearing the only
      interval a rule has (without setting the other) is rejected (`400`) with no change applied.
      3. A deleted rule is unreachable from list/fetch immediately. 4. Updating or deleting a
      different tenant's rule is refused (`404`) and leaves it intact.

**Checkpoint**: `deno task test` passes for the update/delete section.

---

## Phase 7: User Story 5 - The system checks every reminder on a recurring schedule (P1)

**Goal**: The scheduled sweep runs the identical status logic across every tenant, persists a
cache, and survives a single rule's evaluation failure.

- [ ] T013 [US5] Add `evaluateAllReminders(db): Promise<{ evaluated: number; failed: number }>`
      to `repository.ts` — iterates every `reminder_rules` row across every tenant (no
      `TenantContext`, the documented exception per data-model.md), computing status via T004's
      function and writing `cached_status`/`last_evaluated_at` per row inside a per-row try/catch
      so one failure doesn't stop the rest (FR-011). Change `src/server/index.ts`'s default export
      from the bare Hono `app` to `{ fetch: app.fetch, scheduled: async (_event, env) => {
      await evaluateAllReminders(env.DB); } }` (research.md's modules-worker convention)
- [ ] T014 [P] [US5] Extend `reminder-rules.test.ts` (scheduled section): 1. Create reminder rules
      across multiple tenants/vehicles in varying due states; invoke the exported `scheduled`
      handler directly via `createScheduledController()` (research.md); confirm every rule's
      `cachedStatus`/`lastEvaluatedAt` (queryable directly via `env.DB`, since these fields are
      never exposed through this feature's own API — contracts/api.md) match what T004's function
      would compute fresh. 2. Simulate one rule's evaluation throwing (e.g. a malformed row) and
      confirm every other rule in the same run still gets evaluated (`evaluated`/`failed` counts
      reflect this).

**Checkpoint**: `deno task test` passes for the scheduled section — this is the feature's
"Cron scheduling" half proven end-to-end.

---

## Phase 8: Client UI

- [ ] T015 [P] Implement `src/client/reminder-rules.ts`: thin wrapper for the 6 endpoints
      (`listReminderRules`, `createReminderRule`, `getReminderRule`, `updateReminderRule`,
      `deleteReminderRule`, `markDone`), mirroring `fuel-records.ts`'s exact structure and the
      `ReminderRule`/status-shape types (never including `cachedStatus`/`lastEvaluatedAt` —
      contracts/api.md)
- [ ] T016 Create `src/client/components/ReminderRulePanel.tsx`, styled per spec 008's design
      system (mirrors `FuelRecordPanel.tsx`'s list/empty-state/form structure): each rule shows
      its label, interval(s), and a status badge — `var(--warn)` for `overdue`, `var(--acc)` for
      `coming_up`, `var(--dim)` for `on_track`, and a distinct "not enough data" treatment
      (matching the fuel-economy precedent, spec 009) for `not_enough_data`; a "Mark done" button
      per rule; add-rule form with label + interval fields
- [ ] T017 Modify `src/client/App.tsx`: render `ReminderRulePanel` alongside the existing
      service/fuel panels for the selected vehicle, wiring the same `handle()` error-handling
      pattern already used for the other two record types
- [ ] T018 [P] Add new i18n keys to `src/client/i18n/strings.ts` for reminder-rule UI copy
      (heading, field labels, empty state, the four status labels, mark-done button) — FR-012

**Checkpoint**: Reminder rules are fully usable end-to-end from the garage UI, styled consistently
with the rest of the redesigned app.

## Phase 9: Polish & Cross-Cutting

- [ ] T019 [P] Update `src/server/db/schema.sql` reference copy with `reminder_rules`, including
      its `CHECK` constraint
- [ ] T020 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [ ] T021 Walk through quickstart.md end-to-end against `deno task dev`, including a live browser
      check of all four status states and mark-done; confirm the Cron Trigger declaration is
      present in `wrangler.toml`

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — every story reads or writes
  through the shared status-computation function.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: strict — status display has nothing to
  display until rules can be created.
- **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)** → **User Story 4 (Phase 6)**: soft — each
  extends the same route/test files, but mark-done and update/delete don't depend on each other.
- **User Story 5 (Phase 7)**: depends on Phase 2 only (the same status function), not on Phases
  3-6 — it could in principle be built in parallel with them, but is sequenced last among the
  P1/P2 stories since it has no user-facing UI of its own to demo incrementally.
- **Phase 8 (Client UI)** → after Phase 6 (needs all CRUD + mark-done routes stable).
- **Phase 9 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 8, the client-wrapper and i18n tasks touch different files than the panel-component
task and can proceed alongside it once the wrapper's types exist:

```text
T015 [P] src/client/reminder-rules.ts
T018 [P] src/client/i18n/strings.ts additions
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 + Phase 4 (User Stories 1-2).** Both are P1 — together they
deliver "define a reminder, see its real status" end-to-end, without which nothing else in this
feature (mark-done, edit/delete, the Cron sweep) has any value. User Story 5 (Cron scheduling) is
also P1 but has no UI of its own — it's the feature's other half (the reason a reminder differs
from a static checklist) and is sequenced right after the read path it depends on. User Stories
3-4 round out CRUD.
