# Tasks: History-Based Service Due Estimate

**Input**: Design documents from `/specs/053-service-due-estimate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Route-level integration tests via `SELF.fetch`, matching this project's established
convention (e.g. `tests/server/fuel-preview.test.ts`, `tests/server/plan-card-crud.test.ts`) — not
framework-agnostic unit tests, and not a separate contract-test layer.

## Phase 1: Setup

None — no new dependency, reuses the existing route file, middleware, and repository patterns.

## Phase 2: Foundational

**Purpose**: The compute function both `GET` and `POST` routes below depend on.

- [X] SDE-001 `src/server/db/repository.ts`: add the `ServiceDueEstimate` type and
      `computeServiceDueEstimate(db, ctx, vehicleId)` per data-model.md — fetch
      `listServiceRecords`, exclude records with `duplicateOfId != null` or `odometerReading ==
      null`, group by `description.trim().toLowerCase()`, discard groups with fewer than 2 records
      or whose only interval(s) are zero, compute each remaining group's average consecutive
      interval and `estimatedOdometer`, drop any group whose normalized description matches an
      existing `reminder_rules` label for the vehicle, and return the single group with the
      soonest `estimatedOdometer` (ties broken by most-recent contributing record's `serviceDate`)
      or `null`.

**Checkpoint**: `computeServiceDueEstimate` type-checks and is unit-reachable; no route wired to it
yet — nothing user-visible changes until Phase 3.

---

## Phase 3: User Story 1 - See an estimated next-due mileage for recurring work (Priority: P1) 🎯 MVP

**Goal**: Opening a vehicle's service-entry form surfaces a real, server-computed estimate for its
soonest-due recurring work, or nothing if none qualifies.

**Independent Test**: Log two service records for a vehicle with an identical description and
different odometer readings; open that vehicle's service-entry form and confirm the estimate
appears, matching quickstart.md scenarios 1–5.

### Implementation for User Story 1

- [X] SDE-002 [US1] `src/server/routes/v1/vehicles.ts`: add `GET
      /:vehicleId/service-due-estimate` — resolve the vehicle via `findVehicleById` (404 if
      missing or wrong tenant), call `computeServiceDueEstimate`, return `{ estimate }` per
      contracts/api.md. Not rate-limited, same posture as `/fuel-preview`.
- [X] SDE-003 [US1] `src/client/components/ServiceRecordPanel.tsx`: fetch the new route when the
      create-form is shown (mirror `FuelRecordPanel.tsx`'s existing fuel-preview fetch), and when
      `estimate` is non-null render a hint — via the i18n layer (Principle IX, no hardcoded
      strings) — naming `estimate.description` and `estimate.estimatedOdometer`, visibly labeled
      as a computed estimate (spec FR-005). Render nothing when `estimate` is `null`.

### Tests for User Story 1

- [X] SDE-004 [P] [US1] New `tests/server/service-due-estimate.test.ts` (helpers mirroring
      `fuel-preview.test.ts`'s `createSession`/`createVehicleId` pattern, plus a
      `createServiceRecord` helper analogous to its `createFuelRecord`): assert `GET
      .../service-due-estimate` returns `{estimate: null}` for a vehicle with zero records and
      with exactly one record; returns the correct `estimatedOdometer`/`averageInterval:
      <the gap>`/`basedOnRecordCount: 2` for two same-description records; returns the *averaged*
      (not most-recent-only) interval once a third same-description record exists; when two
      different-description groups both qualify, returns only the soonest one; 404 for an unknown
      vehicle id and for a vehicle belonging to a different tenant.

**Checkpoint**: `deno task check` passes; User Story 1 fully functional and independently
verifiable via quickstart.md scenarios 1–5 and the client walkthrough steps 1–2, 5.

---

## Phase 4: User Story 2 - Accept an estimate to create a real reminder (Priority: P2)

**Goal**: The owner can turn a shown estimate into a real, fully-functional `reminder_rules` entry
with one action.

**Independent Test**: With a qualifying estimate showing, accept it and confirm a new reminder
rule exists with the right label/interval and is eligible for the existing push/email delivery —
quickstart.md scenarios 7–9.

### Implementation for User Story 2

- [X] SDE-005 [US2] `src/server/db/repository.ts`: add `acceptServiceDueEstimate(db, ctx,
      vehicleId, description, clientId?)` — re-derive via `computeServiceDueEstimate` (never trust
      a client-supplied `estimatedOdometer`/`averageInterval`); if no group with that normalized
      `description` currently qualifies, return `null`; otherwise call the existing
      `createReminderRule` with `label: description`, `intervalDays: null`, `intervalDistance:
      <the estimate's averageInterval>`, `lastDoneDate`/`lastDoneOdometer` from the group's most
      recent contributing record, per data-model.md's field-mapping table.
- [X] SDE-006 [US2] `src/server/routes/v1/vehicles.ts`: add `POST
      /:vehicleId/service-due-estimate/accept` with `rateLimitBySession, idempotent` (identical
      wiring to `POST /:vehicleId/reminder-rules`) — validate `{ description: string }` (`400
      invalid_request` otherwise), call `acceptServiceDueEstimate`, respond `201` with the created
      rule or `409 {"error":"no_longer_available"}` when it returns `null`.
- [X] SDE-007 [US2] `src/client/components/ServiceRecordPanel.tsx`: add an accept action next to
      SDE-003's hint — posts the shown estimate's `description` to the new accept route; on `201`
      clear/hide the hint; on `409` show this component's existing error/toast pattern indicating
      the estimate is no longer available.

### Tests for User Story 2

- [X] SDE-008 [P] [US2] Extend `tests/server/service-due-estimate.test.ts`: accepting creates a
      matching row, verified by reading it back via the existing `GET /:vehicleId/reminder-rules`;
      retrying the same accept request with the same `Idempotency-Key` header still results in
      exactly one reminder rule; accepting a `description` with no currently-qualifying estimate
      returns `409`; the accepted rule's fields match data-model.md's mapping exactly (so it's
      indistinguishable from a manually-created one, per FR-009).

**Checkpoint**: `deno task check` passes; User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Never show a misleading or duplicate estimate (Priority: P3)

**Goal**: Confirm the guardrails already built into `computeServiceDueEstimate` (Phase 2) actually
hold at the route level — no estimate below the 2-record threshold (already covered by SDE-004),
and no duplicate estimate once an explicit reminder exists for that same work.

**Independent Test**: Create an explicit reminder rule with the same label as an already-qualifying
work group and confirm the history-based estimate for that work disappears — quickstart.md
scenario 6.

### Tests for User Story 3

- [X] SDE-009 [P] [US3] Extend `tests/server/service-due-estimate.test.ts`: with a qualifying
      two-record work group present, `POST` an explicit `reminder_rules` entry whose `label`
      matches that group's (normalized) description, then assert `GET
      .../service-due-estimate` no longer surfaces that group — falls back to `null`, or to the
      next-soonest still-qualifying group if a second one exists.

**Checkpoint**: All three user stories independently functional and covered.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] SDE-010 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across every file touched by this feature.
- [X] SDE-011 Walk through quickstart.md's 10 API scenarios, the 5-step client walkthrough, and the
      regression check against `deno task dev`. (10 API scenarios verified via curl against `deno
      task dev` — all matched contracts/api.md exactly. Client hint/accept wiring confirmed present
      in the production build output; not visually verified in a real browser — no browser
      automation tool was available in this session.)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2, SDE-001)**: blocks every route/UI task below it (SDE-002 through
  SDE-009 all call or exercise `computeServiceDueEstimate`, directly or via
  `acceptServiceDueEstimate`).
- **User Story 1 (Phase 3)**: depends only on Foundational. Ships the MVP.
- **User Story 2 (Phase 4)**: depends on Foundational; also depends on SDE-003's hint existing in
  the UI for SDE-007's accept action to attach to, and reuses SDE-004's test helpers.
- **User Story 3 (Phase 5)**: depends on Foundational only for the code (the suppression logic is
  already in SDE-001) — its task is test-only, added after Phase 3's test helpers exist to build
  on.
- **Polish (Phase 6)**: after all desired stories are complete.

### Parallel Opportunities

- SDE-004 (US1 tests) can be written in parallel with SDE-002/SDE-003 (US1 implementation) once
  SDE-001 lands, since it targets the same not-yet-written route — write the test first if
  preferring a test-first flow.
- SDE-008 (US2 tests) and SDE-009 (US3 tests) can both proceed in parallel with each other once
  SDE-004's shared test-file helpers exist, since they touch different describe blocks in the same
  file (coordinate to avoid a merge conflict on the shared helper section, not a real dependency).

## Implementation Strategy

### MVP First (User Story 1 only)

1. SDE-001 (Foundational).
2. SDE-002, SDE-003, SDE-004 (User Story 1).
3. **STOP and VALIDATE**: quickstart.md scenarios 1–5 plus client walkthrough steps 1–2, 5.

### Incremental Delivery

1. Foundational → User Story 1 → validate (MVP: owners see the estimate).
2. + User Story 2 → validate (owners can act on it with a real reminder).
3. + User Story 3 → validate (guardrail regression coverage).
4. Polish.

This entire feature is small enough to land as one pull request (constitution's Slicing rule) —
the phases above are for implementation and testing order, not separate PRs.
