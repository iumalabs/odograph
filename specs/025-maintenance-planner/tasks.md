# Tasks: Maintenance Planner — Kanban Board

**Input**: Design documents from `/specs/025-maintenance-planner/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — CRUD lifecycle, cross-tenant isolation, stage validation, the
done-transition's service-record creation (and its no-duplicate/no-fabrication guarantees), delete
side-effect isolation, and vehicle-delete cascade.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0017_plan_cards.sql`: `plan_cards` per data-model.md

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T003 In `src/server/db/repository.ts`, per data-model.md's "Repository layer additions":
      `createPlanCard`, `listPlanCards`, `findPlanCardById`, `deletePlanCard`, and a *basic*
      `updatePlanCard` (partial update of title/stage/targetDate/estimatedCost/urgent, validating
      `stage` against the four defined values — no done-transition side effect yet, T010 adds
      that) — stage always starts `"idea"` at creation, not settable via input; every function
      takes a resolved `TenantContext` and scopes by `ctx.tenantId`, mirroring `createDocument`'s
      exact pattern (speckit-analyze finding C1: `updatePlanCard` must exist here, in the
      Foundational phase, since T008/Phase 4 calls it — not conditionally created later by T010)
- [X] T004 [P] In `src/client/offline/types.ts`, add `"planCard"` to `PendingActionEntity`

**Checkpoint**: Repository additions and the new queue entity type exist and type-check.

---

## Phase 3: User Story 1 - An owner captures a maintenance idea for later (P1) 🎯 MVP

**Goal**: Complete create → list end-to-end, refusing a cross-tenant/nonexistent vehicle and a
missing title before anything is written.

- [X] T005 [US1] Implement `POST /:vehicleId/plan-cards` and `GET /:vehicleId/plan-cards`
      **directly in the existing** `src/server/routes/v1/vehicles.ts` (same not-a-new-mount-point
      convention every prior nested resource established). `POST` behind `rateLimitBySession` +
      `idempotent`: resolves `vehicleId` via `findVehicleById` first (`404` if not found/not
      yours, FR-003, *before* validating the body), validates `title` (non-empty) and optional
      `targetDate`/`estimatedCost`/`urgent` — `400` with nothing created on failure; honors a
      client-supplied `id` the same way `POST .../service-records` does (FR-011); `GET` returns
      `{ planCards: [...] }`
- [X] T006 [US1] Create `src/server/routes/v1/plan-cards.ts` (empty of routes yet — T008/T010 add
      them) and wire it into `src/server/index.ts` under `/api/v1/plan-cards`, following the
      normal one-file-one-prefix convention every other route file uses
- [X] T007 [P] [US1] Create `tests/server/plan-card-crud.test.ts` (creation section): 1. Creating
      a card with only a title succeeds, appears in the vehicle's list, `stage: "idea"`. 2.
      Creating one with all optional fields stores every value exactly. 3. Omitting `title` is
      rejected (`400`) and creates nothing. 4. Creating a card against a vehicle belonging to a
      different tenant (or a made-up vehicle id) is refused (`404`), identically for both cases.

**Checkpoint**: `deno task test` passes for the creation section.

---

## Phase 4: User Story 2 - An owner moves a card through the board's stages (P1)

**Goal**: `PATCH` accepts any of the four valid stage values (research.md), rejects anything else,
and full tenant-isolation applies to fetch/update.

- [X] T008 [US2] Implement `GET /api/v1/plan-cards/:id` and `PATCH /api/v1/plan-cards/:id`
      (stage/title/targetDate/estimatedCost/urgent, without yet handling the done-transition side
      effect — T010 adds that) in `plan-cards.ts`, `PATCH` behind `rateLimitBySession` +
      `idempotent`: validates `stage` against the four defined values when included, `400` on an
      invalid value with no change applied
- [X] T009 [P] [US2] Extend `plan-card-crud.test.ts` (stage-move section): 1. Moving a card to
      each of the four valid stages in turn updates its stage and it appears in the matching
      column (via list). 2. Setting `stage` to an invalid value is rejected (`400`) and the card's
      stage is unchanged. 3. Fetching or updating a different tenant's card is refused (`404`),
      identically to a made-up id.

**Checkpoint**: `deno task test` passes for the stage-move section.

---

## Phase 5: User Story 3 - Completing a card logs a real maintenance record (P1)

**Goal**: The done-transition side effect (data-model.md) — the feature's actual point.

- [X] T010 [US3] Extend the `updatePlanCard` function already created in T003 (Foundational) in
      `src/server/db/repository.ts`: after computing the merged patch, if the existing
      row's `stage !== "done"` and the merged `stage === "done"`, call the existing
      `createServiceRecord(db, ctx, card.vehicleId, { serviceDate: todayDateOnly(), description:
      card.title, odometerReading: await getVehicleCurrentOdometer(db, ctx, card.vehicleId), cost:
      card.estimatedCost, notes: "Created from the maintenance planner" })` — never fabricating
      odometer/cost when unknown (FR-007); no service record is created if both existing and
      merged `stage` are already `"done"` (FR-008, a plain equality check, not a special flag)
- [X] T011 [P] [US3] Extend `plan-card-crud.test.ts` (done-transition section): 1. Moving a card
      with an estimated cost to `"done"` creates exactly one new service record with that title,
      today's date, and that cost (SC-003). 2. When the vehicle has an existing fuel/service
      record establishing a known odometer, the created service record includes it; when it
      doesn't, the created record's odometer reading is `null`, never guessed. 3. Moving an
      already-`"done"` card to `"done"` again creates no additional service record (SC-004,
      FR-008) — verified by counting the vehicle's service records before and after. 4. After
      moving to `"done"`, the card itself is still returned by `GET`/list — completing it doesn't
      remove it from the board.

**Checkpoint**: `deno task test` passes for the done-transition section — this is the feature's
core value proof.

---

## Phase 6: User Story 4 - An owner removes a card that's no longer relevant (P2)

**Goal**: Delete, isolated from any `service_records` side effect.

- [X] T012 [US4] Implement `DELETE /api/v1/plan-cards/:id` in `plan-cards.ts` behind
      `rateLimitBySession` + `idempotent`: calls `deletePlanCard`, returns `204`/`404`
- [X] T013 [P] [US4] Extend `plan-card-crud.test.ts` (delete section): 1. Deleting a card removes
      it from the vehicle's list immediately. 2. Deleting a different tenant's card is refused
      (`404`) and leaves it intact. 3. Deleting a card (including a previously-`"done"` one) never
      creates, modifies, or removes any `service_records` row — verified by counting service
      records before and after the delete (FR-009).

**Checkpoint**: `deno task test` passes for the delete section.

---

## Phase 7: Retrofit — vehicle deletion cascades plan cards

**Goal**: Confirm the D1 foreign-key cascade actually removes a deleted vehicle's plan cards — no
R2 cleanup needed (cards have no attachments, research.md), unlike specs/007/009/023's retrofits.

- [X] T014 [P] Extend `plan-card-crud.test.ts` (retrofit section): create a vehicle and a plan
      card on it; delete the vehicle; confirm the plan card is gone (a direct D1 row-count check
      is sufficient here — no R2 object to verify, unlike the attachment-bearing entities'
      equivalent tests)

**Checkpoint**: `deno task test` passes for the retrofit section.

---

## Phase 8: Client — offline queue wiring and UI

- [X] T015 [P] In `src/client/offline/merge.ts`, add `hydrateOptimisticPlanCard` and
      `mergePlanCards` (data-model.md) — identical shape to `hydrateOptimisticServiceRecord`/
      `mergeServiceRecords`, stage always `"idea"` for an unsynced create
- [X] T016 [P] Implement `src/client/plan-cards.ts`: thin wrapper for the 5 endpoints
      (`listPlanCards`, `createPlanCard`, `getPlanCard`, `updatePlanCard`, `deletePlanCard`), all
      writes routed through `enqueue()` with `entity: "planCard"` — mirrors `service-records.ts`'s
      exact shape, not `documents.ts`'s plain-fetch one (research.md — this feature explicitly
      requires the offline queue)
- [X] T017 Implement `src/client/components/PlanBoard.tsx`: four columns (idea/buy/doing/done),
      a card per row within its column showing title/target date/estimated cost/urgent flag, a
      forward-advance button per card (PATCHes to the next stage in sequence — client-side-only
      ordering, per research.md) that's absent on a `"done"` card, a delete button, and a minimal
      add-card form (title, the one required field); new UI strings routed through the existing
      i18n infrastructure (constitution Principle IX)
- [X] T018 Modify `src/client/App.tsx`: mounts `PlanBoard` alongside the existing panels for the
      selected vehicle, wired to the offline queue's merge overlay the same way
      `ServiceRecordPanel`/`FuelRecordPanel`/`ReminderRulePanel` already are (`mergePlanCards`
      applied to the queue snapshot, not a plain-fetched list like `DocumentPanel`)

## Phase 9: Polish & Cross-Cutting

- [X] T019 [P] Update `src/server/db/schema.sql` reference copy with `plan_cards`
- [X] T020 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [X] T021 Walk through quickstart.md end-to-end against `deno task dev`, including the
      offline/reconnect step (devtools network throttling)

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository additions and the
  new queue entity type are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)** → **User
  Story 4 (Phase 6)**: soft — each extends the same route/test files; Phase 5 specifically needs
  Phase 4's `PATCH` to exist as the thing it extends with the done-transition side effect.
- **Phase 7 (Retrofit)**: after Phase 3 (needs card creation to have something to retrofit
  against) — can run any time after, not gated on Phases 4-6.
- **Phase 8 (Client)**: after Phase 6 (needs all CRUD routes, including delete, to wire up).
- **Phase 9 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, T004 (client queue entity type) has no dependency on T003 (server repository
additions) — different files, different layers:

```text
T003     src/server/db/repository.ts
T004 [P] src/client/offline/types.ts (independent of T003)
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "capture a maintenance idea,
see it on the board" — fully testable server-side without touching the client's offline-queue
wiring yet (T015-T018 land in Phase 8). User Story 3 (Phase 5) is where this feature's actual
point lands — closing the loop into the real service log — and is scheduled right after stage
moves exist (Phase 4) since it's a direct extension of the same `PATCH` handler, not a new route.
