# Tasks: Vehicle CRUD

**Input**: Design documents from `/specs/006-vehicle-crud/` **Prerequisites**: plan.md, spec.md,
data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — CRUD lifecycle, field-level update isolation (SC-003), cross-tenant refusal
(SC-002), and validation rejection cases.

> Updated after `/speckit-analyze`: T006 gained a case for FR-009's invalid-*value* rejection
> (distinct from omission, finding M1); T008 gained a case for `PATCH`'s documented `400` response
> (finding M2) — neither was previously exercised despite being in contracts/api.md.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0006_vehicles.sql`: `CREATE TABLE vehicles` per
      data-model.md, plus `DROP TABLE probe_resources` (research.md — retired by this feature)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T003 In `src/server/db/repository.ts`: remove `createProbeResource`,
      `findProbeResourceById`, and the `ProbeResource` type (research.md); add the `Vehicle` type
      and `createVehicle`, `listVehicles`, `findVehicleById`, `updateVehicle`, `deleteVehicle` per
      data-model.md's "Repository layer additions" — every function takes a resolved
      `TenantContext` and scopes its query by `ctx.tenantId` internally, mirroring
      `createProbeResource`/`findProbeResourceById`'s exact pattern before removal.

**Checkpoint**: Repository layer has vehicles support and no longer references
`probe_resources`.

---

## Phase 3: User Story 1 - An owner adds their first vehicle (P1) 🎯 MVP

**Goal**: Complete create → list end-to-end, with validation rejecting bad input before any row is
written.

**Independent Test**: Per spec.md — starting from no vehicles, submit a new vehicle and confirm it
appears in the list with exactly the submitted values.

- [X] T004 [US1] Implement `POST /api/v1/vehicles` and `GET /api/v1/vehicles` in
      `src/server/routes/v1/vehicles.ts` behind `tenantContext` (all routes) — `POST` additionally
      behind `rateLimitBySession` (write path): validates `name` (non-empty), `odometerUnit`
      (`'km'`/`'mi'`), and `year` if present (`[1900, currentYear + 10]`) — `400` with nothing
      created on any failure (contracts/api.md); `GET` returns `{ vehicles: [...] }` scoped to the
      caller's tenant
- [X] T005 [US1] Wire `vehicles.ts` into `src/server/index.ts` under `/api/v1/vehicles`; remove the
      `_tenant-isolation-probe` import and mount point (research.md)
- [X] T006 [P] [US1] Create `tests/server/vehicle-crud.test.ts` (creation section): 1. Creating a
      vehicle with only `name`/`odometerUnit` succeeds and appears in the list. 2. Creating a
      vehicle with all optional fields stores every value exactly. 3. Omitting `name` or
      `odometerUnit` is rejected (`400`) and creates nothing (verify via an empty subsequent list).
      4. Two vehicles with identical `make`/`model` are both created as distinct records
      (FR-010). 5. A `year` of `1899` and a `year` of `currentYear + 11` are both rejected; a
      `year` at each bound (`1900`, `currentYear + 10`) is accepted. 6. An `odometerUnit` value
      that isn't `'km'`/`'mi'` (e.g. `"gallons"`) is rejected (`400`) and creates nothing (FR-009,
      analyze finding M1 — distinct from case 3's *omitted*-field check).

**Checkpoint**: User Story 1 is independently complete and testable — `deno task test` passes for the
creation section.

---

## Phase 4: User Story 2 - An owner views and updates a vehicle's details (P1)

**Goal**: Fetch-by-id, partial update, and tenant-isolation refusal.

**Independent Test**: Per spec.md — create a vehicle, fetch it back, update one field, and confirm
the fetched record reflects only that change; confirm a different tenant can't reach it at all.

- [X] T007 [US2] Implement `GET /api/v1/vehicles/:id` and `PATCH /api/v1/vehicles/:id` in
      `src/server/routes/v1/vehicles.ts` — `PATCH` behind `rateLimitBySession`: `GET`/`PATCH` both
      `404` under the same not-found-or-not-yours contract as the retired probe route; `PATCH`
      validates only the fields present in the body (same rules as `POST`), applies a partial
      update, and refreshes `updatedAt`
- [X] T008 [P] [US2] Extend `tests/server/vehicle-crud.test.ts` (read/update section): 1. Listing
      vehicles across two different tenants — each sees only their own (FR-003). 2. Fetching a
      vehicle by id returns its full current details. 3. Updating one field leaves every other
      field byte-for-byte unchanged (SC-003). 4. Fetching, updating, or deleting a vehicle from a
      *different* tenant's session returns `404`, identical to a made-up id (FR-007/SC-002) —
      mirrors `tenant-isolation.test.ts`'s existing structure before that file is deleted (T013).
      5. `PATCH` with an invalid value (an out-of-range `year` or an unsupported `odometerUnit`)
      returns `400` and applies no change — verified by fetching the vehicle afterward and
      confirming it's identical to before the request (analyze finding M2; contracts/api.md
      documents this response but no prior case exercised it).

**Checkpoint**: `deno task test` passes for the read/update section.

---

## Phase 5: User Story 3 - An owner removes a vehicle (P2)

**Goal**: Delete, with immediate unreachability on every read path.

**Independent Test**: Per spec.md — create a vehicle, delete it, confirm it's gone from both the
list and fetch-by-id.

- [X] T009 [US3] Implement `DELETE /api/v1/vehicles/:id` in `src/server/routes/v1/vehicles.ts`
      behind `rateLimitBySession` — `204` on success, `404` under the same not-found-or-not-yours
      contract; deleting a different tenant's vehicle is refused the same way
- [X] T010 [P] [US3] Extend `tests/server/vehicle-crud.test.ts` (deletion section): 1. A deleted
      vehicle no longer appears in the list or is fetchable by id, with no propagation delay
      (SC-004). 2. Deleting a different tenant's vehicle returns `404` and leaves it intact
      (verified by the owning tenant still being able to fetch it afterward).

**Checkpoint**: `deno task test` passes for the deletion section.

---

## Phase 6: Retire the tenant-isolation probe (research.md)

**Goal**: Remove the now-superseded placeholder and every test's dependency on it, per its own
"delete... in the first PR that adds one" comment.

- [X] T011 [P] Delete `src/server/routes/v1/_tenant-isolation-probe.ts` and
      `tests/server/tenant-isolation.test.ts` (superseded by vehicle-crud.test.ts's isolation
      cases from T008/T010)
- [X] T012 [P] In `tests/server/passkey-auth.test.ts`, `tests/server/magic-link-auth.test.ts`,
      `tests/server/oidc-auth.test.ts`, `tests/server/session.test.ts`: replace each file's
      `POST /api/v1/_tenant-isolation-probe` call (used purely as a "resolve this session cookie to
      a tenantId" helper) with `POST /api/v1/vehicles` sending a minimal valid body
      (`{ name: "probe", odometerUnit: "km" }`), reading `tenantId` from the response the same way.
      No change to what any of these tests actually assert.
- [X] T013 [P] In `tests/server/rate-limit.test.ts`: change its write-path-under-test from
      `POST /api/v1/_tenant-isolation-probe` to `POST /api/v1/vehicles` (same minimal body as T012)
      — the rate limiter's behavior under test is unchanged, only the endpoint it's exercised
      against.

**Checkpoint**: No remaining reference to `_tenant-isolation-probe`/`probe_resources` anywhere in
`src/` or `tests/`; every test file that depended on the probe still passes with the same
assertions.

## Phase 7: Client UI

- [X] T014 [P] Implement `src/client/vehicles.ts`: thin wrapper for the 5 endpoints
      (`listVehicles`, `createVehicle`, `getVehicle`, `updateVehicle`, `deleteVehicle`)
- [X] T015 Modify `src/client/App.tsx`: in the authenticated view, a vehicle list (name +
      make/model/year if present) and a minimal add-vehicle form (name + odometer-unit select, the
      two required fields — optional fields omitted from the v1 UI for minimalism, still settable
      via the API); new UI strings routed through `src/client/i18n/strings.ts` (constitution
      Principle IX)

## Phase 8: Polish & Cross-Cutting

- [X] T016 [P] Update `src/server/db/schema.sql` reference copy: add `vehicles`, remove
      `probe_resources`
- [X] T017 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] T018 Walked through quickstart.md end-to-end against `deno task dev` (curl, since the preview
      browser tool couldn't attach to a port here — unrelated processes from other projects/chat
      sessions held both 5173 and the fallback ports tried): created a vehicle with only required
      fields, created a second with all optional fields (all stored exactly), listed both, patched
      one field on the first (only that field changed), deleted it, confirmed it's gone from the
      list. The client UI's list/form rendering wasn't pixel-verified in a browser this round — it
      reuses the same conditional-render patterns (list, form inputs, button handlers) already
      visually confirmed earlier this session for banners/forms in the same file.

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository additions are shared
  by every story, and the migration must drop `probe_resources` before Phase 6 removes the code
  that reads it.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)**: soft — each
  extends the same route file and test file, but each story's own scenarios don't depend on the
  next story's routes existing.
- **Phase 6 (Retire the probe)**: depends on Phase 3 at minimum (needs `POST /vehicles` to exist as
  the replacement target) — done right after the MVP story rather than deferred, per research.md.
- **Phase 7 (Client UI)** → after Phase 5 (needs all CRUD routes).
- **Phase 8 (Polish)**: after everything else.

## Parallel execution examples

Phase 6's three cleanup tasks touch entirely different test files and have no dependency on each
other beyond Phase 3 being done:

```text
T011 [P] src/server/routes/v1/_tenant-isolation-probe.ts, tests/server/tenant-isolation.test.ts
T012 [P] tests/server/passkey-auth.test.ts, magic-link-auth.test.ts, oidc-auth.test.ts, session.test.ts
T013 [P] tests/server/rate-limit.test.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "add a vehicle, see it in your
list" — the minimum needed for every later milestone to have something to attach data to. User
Story 2 (read/update) and User Story 3 (delete) round out CRUD at equal-then-lower priority. The
probe's retirement (Phase 6) is scheduled right after the MVP story specifically so it doesn't sit
half-done — once `/vehicles` exists as a replacement target, there's no reason to leave six test
files depending on a placeholder its own comment already earmarked for removal at this exact point.
