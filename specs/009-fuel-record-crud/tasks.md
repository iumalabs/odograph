# Tasks: Fuel Record CRUD + Attachments

**Input**: Design documents from `/specs/009-fuel-record-crud/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — CRUD lifecycle, cross-tenant isolation, dedicated fuel-economy calculation
cases (first record, same-odometer, backfill-recompute), attachment validation/EXIF-stripping, and
the vehicle-delete R2-cleanup retrofit extended to fuel attachments.

**Reuse note**: This feature deliberately mirrors spec 007 (Service Record CRUD) closely —
`src/server/attachments/{validate,strip-exif,storage}.ts` are reused completely unchanged, no new
R2 bucket or binding is needed (the existing `ATTACHMENTS` binding is reused), and the route/
repository/test file organization matches spec 007's shape task-for-task except where noted.

## Phase 1: Setup

- [ ] T001 Create D1 migration `migrations/0008_fuel_records.sql`: `fuel_records`,
      `fuel_record_attachments` per data-model.md — no `wrangler.toml` change needed (reuses the
      existing `ATTACHMENTS` R2 binding from spec 007)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [ ] T003 In `src/server/db/repository.ts`, per data-model.md's "Repository layer additions":
      `FuelRecord`/`FuelRecordInput` types, `createFuelRecord`, `listFuelRecordsWithEconomy` (the
      core new logic — fetches all of a vehicle's fuel records ordered by `odometer_reading ASC,
      created_at ASC`, walks the list computing `fuelEconomy` per research.md's formulas:
      `volume / (delta_km / 100)` for `odometerUnit: "km"`, `delta_mi / volume` for `"mi"`; `null`
      whenever there's no previous record or `delta <= 0` — never `Infinity`/`NaN`/a thrown error),
      `findFuelRecordById` (resolves the record's `vehicleId` then delegates to
      `listFuelRecordsWithEconomy` for that vehicle and returns the matching entry, so detail and
      list always agree), `updateFuelRecord`, `deleteFuelRecord` (returns attachments' R2 keys),
      `listAttachmentKeysForVehicleFuelRecords`, `Attachment`-shaped `createFuelAttachment`,
      `findFuelAttachmentById`, `listAttachmentsForFuelRecord` — every function takes a resolved
      `TenantContext` and scopes by `ctx.tenantId`, mirroring `createServiceRecord`'s exact pattern

**Checkpoint**: Repository additions exist, type-check, and the economy calculation is unit-provable
against hand-constructed fuel-record rows — no route wired up yet.

---

## Phase 3: User Story 1 - An owner logs a fuel-up (P1) 🎯 MVP

**Goal**: Complete create → list end-to-end, refusing a cross-tenant/nonexistent vehicle before
anything is written — same shape as spec 007's Phase 3.

- [ ] T004 [US1] Implement `POST /:vehicleId/fuel-records` and `GET /:vehicleId/fuel-records`
      **directly in the existing** `src/server/routes/v1/vehicles.ts` (same one-file-one-prefix
      convention spec 007's analyze finding C1 established — not a new mount point). `POST`
      behind `rateLimitBySession`: resolves `vehicleId` via the existing `findVehicleById` first
      (`404` if not found/not yours, *before* validating the body), validates `fuelDate`
      (non-empty), `odometerReading`/`volume`/`cost` (all required numbers) and optional
      `station`/`notes` — `400` with nothing created on failure; `GET` returns
      `{ fuelRecords: [...] }` with each record including `fuelEconomy`
- [ ] T005 [P] [US1] Create `tests/server/fuel-record-crud.test.ts` (creation section): 1.
      Creating a record with only the four required fields succeeds, appears in the vehicle's
      list, and has `fuelEconomy: null` (it's the vehicle's first record). 2. Creating one with
      `station`/`notes` set stores every value exactly. 3. Omitting any required field is rejected
      (`400`) and creates nothing. 4. Creating against a vehicle belonging to a different tenant
      (or a made-up vehicle id) is refused (`404`), identically for both cases.

**Checkpoint**: `deno task test` passes for the creation section.

---

## Phase 4: User Story 2 - An owner reviews fuel history and consumption (P1)

**Goal**: Fetch-by-id (with attachments array), full tenant-isolation, and the fuel-economy
calculation proven correct across its key edge cases.

- [ ] T006 [US2] Implement `GET /api/v1/fuel-records/:id` in `src/server/routes/v1/fuel-records.ts`
      (new file, mounted at `/api/v1/fuel-records` in `src/server/index.ts`, matching
      `service-records.ts`'s exact structure): `404` under the not-found-or-not-yours contract;
      response includes `fuelEconomy` and an `attachments` array (id, contentType, size,
      createdAt — never the raw `r2Key`)
- [ ] T007 [P] [US2] Extend `fuel-record-crud.test.ts` (read + economy section): 1. Logging a
      second fuel-up at a higher odometer reading than the first shows a computed `fuelEconomy` on
      the second record, correct for the vehicle's `odometerUnit` (L/100km for `km`, MPG for
      `mi`). 2. Logging a third fuel-up at the *same* odometer reading as the second shows
      `fuelEconomy: null` on the third, not a crash or an infinite value. 3. Listing/fetching
      across two different tenants' vehicles — each sees only their own. 4. Listing or fetching
      against a different tenant's vehicle/record is refused (`404`), identically to a made-up id.

**Checkpoint**: `deno task test` passes for the read + economy section — this is the feature's
core Principle II proof.

---

## Phase 5: User Story 3 - An owner corrects or removes a fuel record (P2)

**Goal**: Partial update (including the backfill-recompute guarantee) and delete.

- [ ] T008 [US3] Implement `PATCH /api/v1/fuel-records/:id` and
      `DELETE /api/v1/fuel-records/:id` in `fuel-records.ts`, both behind `rateLimitBySession`:
      `PATCH` validates only included fields, applies a partial update, refreshes `updatedAt`,
      returns the record with `fuelEconomy` recomputed against the vehicle's current full
      ordering; `DELETE` calls `deleteFuelRecord` to get the record's attachments' R2 keys, then
      `deleteAttachments` to remove them from R2, *then* returns `204`
- [ ] T009 [P] [US3] Extend `fuel-record-crud.test.ts` (update/delete section): 1. Updating one
      field leaves every other field unchanged. 2. `PATCH` with an invalid field value is rejected
      (`400`) with no change applied. 3. Editing an earlier record's `odometerReading` upward (a
      backfill correction) changes a later record's `fuelEconomy` on the next fetch, proving
      FR-008's "always derived, never stale" guarantee. 4. A deleted record is unreachable from
      list/fetch immediately, *and* — for a record that had an uploaded attachment — a direct
      `env.ATTACHMENTS.get(key)` against that attachment's R2 key (built via `attachmentKey()`,
      same technique as the Phase 7 retrofit test) confirms the object itself is gone, not just
      the D1-facing API returning 404 (SC-004, both deletion paths verified independently). 5.
      Updating or deleting a different tenant's record is refused (`404`) and leaves it intact.

**Checkpoint**: `deno task test` passes for the update/delete section, including the
backfill-recompute proof.

---

## Phase 6: User Story 4 - An owner attaches a receipt to a fuel-up (P2)

**Goal**: Validated upload and ownership-checked download, reusing spec 007's attachment pipeline
completely unchanged.

- [ ] T010 [US4] Implement `POST /api/v1/fuel-records/:id/attachments` in `fuel-records.ts` behind
      `rateLimitBySession`: resolves `:id` via `findFuelRecordById` first (`404` if not found/not
      yours); reads the body via `c.req.arrayBuffer()` with the same `Content-Length` fast-fail as
      spec 007; runs `detectFileType` — `400` if not in the allowlist; runs `stripJpegExif` for
      JPEG; writes via `putAttachment` at `attachmentKey(tenant, fuelRecordId, newId)` (same
      `attachmentKey` function from spec 007 — the key convention already takes any parent-record
      id, no code change needed there); calls `createFuelAttachment`; returns `201`
- [ ] T011 [US4] Implement
      `GET /api/v1/fuel-records/:id/attachments/:attachmentId` in `fuel-records.ts`: resolves
      both ids via `findFuelRecordById`/`findFuelAttachmentById` (`404` under the
      not-found-or-not-yours contract for either); streams the R2 object back via `getAttachment`
      with `Content-Type` set to the stored type — never a redirect
- [ ] T012 [P] [US4] Extend `fuel-record-crud.test.ts` (attachments section), reusing
      `tests/server/fixtures/jpeg.ts` unchanged: 1. Uploading a valid JPEG succeeds and appears on
      the record. 2. Uploading a file whose magic bytes don't match any allowed format is rejected
      (`400`) and creates nothing, even with a spoofed `Content-Type`. 3. Uploading an oversized
      body is rejected (`400`) and creates nothing. 4. Uploading the fixture JPEG's EXIF/GPS
      variant, then downloading it back, confirms the GPS marker is absent from the stored bytes.
      5. Downloading an attachment belonging to a different tenant's fuel record is refused
      (`404`), identically to a made-up attachment id.

**Checkpoint**: `deno task test` passes for the attachments section.

---

## Phase 7: Retrofit — vehicle deletion cleans up fuel-record R2 attachments too

**Goal**: Extend spec 007's existing vehicle-delete R2-cleanup retrofit to also cover this
feature's new attachment type — no fuel attachment may outlive its vehicle (FR-012).

- [ ] T013 Modify `DELETE /api/v1/vehicles/:id` in `src/server/routes/v1/vehicles.ts`: alongside
      the existing `listAttachmentKeysForVehicle`/`deleteAttachments` call for service-record
      attachments, add a second call to `listAttachmentKeysForVehicleFuelRecords` (T003) and
      include those keys in the same `deleteAttachments` batch (or a second call) before
      `deleteVehicle` runs — no change to the route's request/response contract, only its side
      effects
- [ ] T014 [P] Extend `fuel-record-crud.test.ts` (retrofit section, mirroring spec 007's T020):
      create a vehicle, a fuel record on it, and an attachment on that record; delete the vehicle;
      confirm the fuel record, its attachment's D1 row, *and* the R2 object are all gone (verified
      by attempting a direct `getAttachment` against the same key and confirming it's null) —
      alongside a service record + attachment on the same vehicle, to prove both attachment types
      are cleaned up by the one retrofitted delete path

**Checkpoint**: `deno task test` passes for the retrofit section; no R2 object of either
attachment type outlives the D1 rows that referenced it.

---

## Phase 8: Client UI

- [ ] T015 [P] Implement `src/client/fuel-records.ts`: thin wrapper for the 7 endpoints
      (`listFuelRecords`, `createFuelRecord`, `getFuelRecord`, `updateFuelRecord`,
      `deleteFuelRecord`, `uploadAttachment`, attachment download URL builder), mirroring
      `service-records.ts`'s exact structure and `FuelRecord`/`Attachment` types including
      `fuelEconomy: number | null`
- [ ] T016 Create `src/client/components/FuelRecordPanel.tsx`, styled per spec 008's design system
      (mirrors `ServiceRecordPanel.tsx`'s list/empty-state/form/attachment structure exactly):
      list shows date, odometer reading, volume, cost, and `fuelEconomy` right-aligned in
      `var(--acc)` when present or an explicit "—" in `var(--dim)` when `null` (never a blank
      cell); add-record form with the four required fields plus optional station/notes; attachment
      upload reusing the same upload-button/success-toast/chip pattern as `ServiceRecordPanel.tsx`
- [ ] T017 Modify `src/client/App.tsx`: render `FuelRecordPanel` alongside `ServiceRecordPanel`
      for the selected vehicle (two sections under the same vehicle-selected block), wiring the
      same `handle()` error-handling pattern already used for service records
- [ ] T018 [P] Add new i18n keys to `src/client/i18n/strings.ts` for fuel-record UI copy
      (heading, field labels, empty state, "not enough data" label) — FR-013

**Checkpoint**: Fuel records are fully usable end-to-end from the garage UI, styled consistently
with the rest of the redesigned app.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T019 [P] Update `src/server/db/schema.sql` reference copy with `fuel_records`,
      `fuel_record_attachments`
- [ ] T020 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [ ] T021 Walk through quickstart.md end-to-end against `deno task dev`, including a live browser
      check of the economy figures rendering correctly and the backfill-recompute behavior

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — the economy-calculation
  repository function is shared by every story that touches a fuel record's response shape.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)** → **User
  Story 4 (Phase 6)**: soft — each extends the same route/test files, but Phase 6 needs Phase 3's
  create route to have something to attach to.
- **Phase 7 (Retrofit)**: depends on Phase 6 (needs fuel-attachment creation to exist to have
  something to retrofit against) — done right after attachments land, same reasoning spec 007
  gave for its own retrofit.
- **Phase 8 (Client UI)** → after Phase 7 (needs all CRUD + attachment + retrofit routes stable).
- **Phase 9 (Polish)**: after everything else.

## Parallel execution examples

Within each phase, the test-extension task and the i18n-string task (where present) touch
different files than the main route/repository task and can proceed alongside it once that file
exists:

```text
T005 [P] tests/server/fuel-record-crud.test.ts (creation section)
T015 [P] src/client/fuel-records.ts
T018 [P] src/client/i18n/strings.ts additions
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "log a fuel-up, see it in the
vehicle's history" — fully testable without any economy calculation being exercised yet (a
vehicle's first record has none). User Story 2 is where this feature's actual Principle II work
concentrates (the economy calculation and its edge cases) and is scheduled immediately after,
since both are P1; User Stories 3-4 round out CRUD + attachments, matching spec 007's own
MVP-first sequencing.
