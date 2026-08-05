# Tasks: Service Record CRUD + Attachments

**Input**: Design documents from `/specs/007-service-record-crud/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — CRUD lifecycle, cross-tenant isolation, attachment validation/EXIF-stripping,
and the vehicle-delete R2-cleanup retrofit.

> Updated after `/speckit-analyze`: T009/T010 no longer mount a new sub-app at the bare `/api/v1`
> prefix (finding C1) — the two vehicle-nested routes move into the existing `vehicles.ts`, and
> `service-records.ts` is mounted normally at `/api/v1/service-records`, matching every other
> route file's one-file-one-prefix convention.

## Phase 1: Setup

- [X] T001 Add an `[[r2_buckets]]` binding (`ATTACHMENTS`) to `wrangler.toml`'s default/preview/
      production sections, following the `odograph-preview-attachments`/
      `odograph-production-attachments` naming convention (quickstart.md) — the bucket names
      themselves need to exist on the account before a real deploy works (external, owner action,
      research.md); local dev/test use Miniflare's local R2 simulation regardless
- [X] T002 Create D1 migration `migrations/0007_service_records.sql`: `service_records`,
      `service_record_attachments` per data-model.md

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T003 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T004 In `src/server/db/repository.ts`, per data-model.md's "Repository layer additions":
      `createServiceRecord`, `listServiceRecords`, `findServiceRecordById`, `updateServiceRecord`,
      `deleteServiceRecord` (returns the deleted record's attachments' R2 keys, doesn't touch R2
      itself), `listAttachmentKeysForVehicle`, `createAttachment`, `findAttachmentById` — every
      function takes a resolved `TenantContext` and scopes by `ctx.tenantId`, mirroring
      `createVehicle`'s exact pattern. No existing export's signature changes.
- [X] T005 [P] Implement `src/server/attachments/validate.ts`: `detectFileType(bytes): "jpeg" |
      "png" | "webp" | "pdf" | null` (magic-byte sniff per research.md's exact byte signatures —
      JPEG `FF D8 FF`, PNG the 8-byte PNG signature, WebP `RIFF`+`WEBP` with the 4-byte chunk-size
      gap, PDF `%PDF-`) and a size-cap check (10MB, spec.md Assumptions)
- [X] T006 [P] Implement `src/server/attachments/strip-exif.ts`: `stripJpegExif(bytes):
      Uint8Array` — walks JPEG marker segments from SOI, drops every APP1 (`FFE1`) segment, copies
      everything else (including the SOS entropy-coded scan data) through unmodified, per
      research.md's exact algorithm. A no-op passthrough for non-JPEG bytes (PNG/WebP callers never
      call this — see T016).
- [X] T007 [P] Implement `src/server/attachments/storage.ts`: `putAttachment(bucket, key, bytes,
      contentType)`, `getAttachment(bucket, key)`, `deleteAttachments(bucket, keys)` — thin wrapper
      around the R2 binding, plus a `attachmentKey(tenantId, serviceRecordId, attachmentId):
      string` builder for the `tenants/{tenantId}/service-records/{serviceRecordId}/{attachmentId}`
      convention (research.md, data-model.md)
- [X] T008 [P] Create `tests/server/fixtures/jpeg.ts`: hand-built minimal valid JPEG byte sequence
      (SOI, an APP1/EXIF segment containing a GPS IFD tag, SOS, minimal scan data, EOI) small
      enough to construct literally in test code — proves `stripJpegExif` end-to-end without an
      external test-image file

**Checkpoint**: Repository additions and the attachments module (validation, EXIF-stripping,
storage) exist, type-check, and are unit-provable against the fixture — no real R2 bucket needed
yet (Miniflare's local simulation covers tests).

---

## Phase 3: User Story 1 - An owner logs a service event (P1) 🎯 MVP

**Goal**: Complete create → list end-to-end, refusing a cross-tenant/nonexistent vehicle before
anything is written.

- [X] T009 [US1] Implement `POST /:vehicleId/service-records` and `GET
      /:vehicleId/service-records` **directly in the existing** `src/server/routes/v1/vehicles.ts`
      (analyze finding C1 — not a new mount point: `vehicles.ts` is already mounted at
      `/api/v1/vehicles` with its own scoped `tenantContext`, so adding these two routes there
      avoids a second sub-app mounted at the bare `/api/v1` prefix, which risked its
      `tenantContext` middleware intercepting requests meant for other route files). `POST`
      additionally behind `rateLimitBySession`: resolves `vehicleId` via the existing
      `findVehicleById` first (`404` if not found/not yours, FR-003, *before* validating the
      body), validates `serviceDate`/`description` (non-empty) and optional
      `odometerReading`/`cost`/`notes` — `400` with nothing created on failure; `GET` returns
      `{ serviceRecords: [...] }`
- [X] T010 [US1] Create `src/server/routes/v1/service-records.ts` (empty of routes yet — T012/T014/
      T016/T017 add them) and wire it into `src/server/index.ts` under `/api/v1/service-records`,
      following the normal one-file-one-prefix convention every other route file uses (analyze
      finding C1)
- [X] T011 [P] [US1] Create `tests/server/service-record-crud.test.ts` (creation section): 1.
      Creating a record with only the two required fields succeeds and appears in the vehicle's
      list. 2. Creating one with all optional fields stores every value exactly. 3. Omitting
      `serviceDate` or `description` is rejected (`400`) and creates nothing. 4. Creating a record
      against a vehicle belonging to a different tenant (or a made-up vehicle id) is refused
      (`404`), identically for both cases.

**Checkpoint**: `npm test` passes for the creation section.

---

## Phase 4: User Story 2 - An owner reviews a vehicle's service history (P1)

**Goal**: Fetch-by-id (with attachment metadata) and full tenant-isolation across list/fetch.

- [ ] T012 [US2] Implement `GET /api/v1/service-records/:id` in `service-records.ts`: `404` under
      the not-found-or-not-yours contract; response includes an `attachments` array (id,
      contentType, size, createdAt — never the raw `r2Key`, contracts/api.md)
- [ ] T013 [P] [US2] Extend `service-record-crud.test.ts` (read section): 1. Listing records across
      two different tenants' vehicles — each sees only their own. 2. Fetching a record by id
      returns its full detail. 3. Listing or fetching against a different tenant's vehicle/record
      is refused (`404`), identically to a made-up id.

**Checkpoint**: `npm test` passes for the read section.

---

## Phase 5: User Story 3 - An owner corrects or removes a service record (P2)

**Goal**: Partial update and delete (records only — attachment deletion happens via T019's
vehicle-delete retrofit and the record-delete path itself, not a standalone
delete-one-attachment operation, per spec.md's Assumptions).

- [ ] T014 [US3] Implement `PATCH /api/v1/service-records/:id` and
      `DELETE /api/v1/service-records/:id` in `service-records.ts`, both behind
      `rateLimitBySession`: `PATCH` validates only included fields, applies a partial update,
      refreshes `updatedAt`; `DELETE` calls `deleteServiceRecord` to get the record's attachments'
      R2 keys, then `deleteAttachments` (T007) to remove them from R2, *then* returns `204` — R2
      cleanup happens before the response, not fire-and-forget (data-model.md's erasure
      requirement)
- [ ] T015 [P] [US3] Extend `service-record-crud.test.ts` (update/delete section): 1. Updating one
      field leaves every other field unchanged. 2. `PATCH` with an invalid field value is rejected
      (`400`) with no change applied. 3. A deleted record is unreachable from list/fetch
      immediately. 4. Updating or deleting a different tenant's record is refused (`404`) and
      leaves it intact.

**Checkpoint**: `npm test` passes for the update/delete section.

---

## Phase 6: User Story 4 - An owner attaches a photo or receipt (P2)

**Goal**: Validated upload (magic bytes, size cap, JPEG EXIF-stripped) and ownership-checked
download — the core of this feature's Principle V compliance.

- [ ] T016 [US4] Implement `POST /api/v1/service-records/:id/attachments` in
      `service-records.ts` behind `rateLimitBySession`: resolves `:id` via `findServiceRecordById`
      first (`404` if not found/not yours); reads the raw body via `c.req.arrayBuffer()` (checking
      `Content-Length` against the 10MB cap *before* reading, per research.md's fast-fail); runs
      `detectFileType` (T005) — `400` if not in the allowlist; for JPEG, runs `stripJpegExif`
      (T006) before storing; writes the (possibly stripped) bytes via `putAttachment` (T007) at
      `attachmentKey(tenant, serviceRecordId, newId)`; calls `createAttachment` with the sniffed
      type and final byte length; returns `201`
- [ ] T017 [US4] Implement `GET /api/v1/service-records/:id/attachments/:attachmentId`: resolves
      both ids via `findServiceRecordById`/`findAttachmentById` (`404` under the
      not-found-or-not-yours contract for either); streams the R2 object back via `getAttachment`
      with `Content-Type` set to the stored (sniffed) type — never a redirect to a public URL
      (FR-013)
- [ ] T018 [P] [US4] Extend `service-record-crud.test.ts` (attachments section): 1. Uploading a
      valid JPEG (built from T008's fixture, without the EXIF segment, to isolate "valid upload
      succeeds" from "EXIF gets stripped") succeeds and the attachment appears on the record. 2.
      Uploading a file whose magic bytes don't match any allowed format is rejected (`400`) and
      creates nothing (SC-003) — verified with a body that claims `Content-Type: image/jpeg` but
      isn't actually JPEG bytes, proving the header is never trusted. 3. Uploading a body larger
      than the size cap is rejected (`400`) and creates nothing (SC-004). 4. Uploading T008's
      fixture JPEG *with* its crafted GPS/EXIF segment, then downloading the stored attachment back
      and inspecting its bytes directly — confirms the EXIF/APP1 segment (and the GPS data inside
      it) is not present in what's stored (SC-005). 5. Downloading an attachment belonging to a
      different tenant's service record is refused (`404`), identically to a made-up attachment id
      (SC-002).

**Checkpoint**: `npm test` passes for the attachments section — this is the feature's core
Principle V proof.

---

## Phase 7: Retrofit — vehicle deletion cleans up R2 attachments (research.md)

**Goal**: Close the gap this feature's own R2 usage newly creates: `deleteVehicle` (specs/006)
cascades D1 rows but has never had R2 objects to clean up until now.

- [X] T019 Modify `DELETE /api/v1/vehicles/:id` in `src/server/routes/v1/vehicles.ts`: before
      calling the existing `deleteVehicle` repository function, call
      `listAttachmentKeysForVehicle` (T004) and `deleteAttachments` (T007) to remove every R2
      object belonging to that vehicle's service records' attachments — no change to the route's
      request/response contract (still `204`/`404`), only its side effects (contracts/api.md)
- [ ] T020 [P] Extend `service-record-crud.test.ts` (retrofit section): create a vehicle, a
      service record on it, and an attachment on that record; delete the vehicle; confirm the
      service record, its attachment's D1 row, *and* the R2 object are all gone (verified by
      attempting a direct `getAttachment` against the same key and confirming it's null, not just
      that the D1-facing API returns 404)

**Checkpoint**: `npm test` passes for the retrofit section; no R2 object outlives the D1 rows that
referenced it, for either deletion path.

---

## Phase 8: Client UI

- [ ] T021 [P] Implement `src/client/service-records.ts`: thin wrapper for the 7 endpoints
      (`listServiceRecords`, `createServiceRecord`, `getServiceRecord`, `updateServiceRecord`,
      `deleteServiceRecord`, `uploadAttachment`, attachment download URL builder)
- [ ] T022 Modify `src/client/App.tsx`: per-vehicle service-record list (date, description,
      odometer reading if present) with a minimal add-record form (date + description, the two
      required fields) and a file input for uploading an attachment to a selected record; new UI
      strings routed through `src/client/i18n/strings.ts` (constitution Principle IX)

## Phase 9: Polish & Cross-Cutting

- [ ] T023 [P] Update `src/server/db/schema.sql` reference copy with `service_records`,
      `service_record_attachments`
- [ ] T024 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [ ] T025 Walk through quickstart.md end-to-end against `deno task dev`. Steps 1 (R2 bucket
      creation) needs the real, owner-provisioned bucket from T001's note — record whatever isn't
      verifiable locally as a pending live-smoke-test item, same shape as prior features' external
      dependencies (Google OAuth client, Cloudflare Email Service domain onboarding)

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository and attachments-module
  additions are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)** → **User
  Story 4 (Phase 6)**: soft — each extends the same route/test files, but each story's own
  scenarios don't depend on the next story's routes existing, except Phase 6 needing Phase 3's
  create route to have something to attach to.
- **Phase 7 (Retrofit)**: depends on Phase 6 (needs `deleteAttachments`/attachment creation to
  exist to have something to retrofit against) — done right after attachments land, not deferred,
  same reasoning specs/006 gave for retiring the tenant-isolation probe promptly rather than
  leaving a known gap open.
- **Phase 8 (Client UI)** → after Phase 6 (needs all CRUD + attachment routes).
- **Phase 9 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, T005/T006/T007/T008 touch different files and have no dependency on each other
(T004 is the only one they share a *conceptual* dependency on, not a file one):

```text
T005 [P] src/server/attachments/validate.ts
T006 [P] src/server/attachments/strip-exif.ts
T007 [P] src/server/attachments/storage.ts
T008 [P] tests/server/fixtures/jpeg.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "log a service event, see it in
the vehicle's history" — record-keeping's core purpose, fully testable without a real R2 bucket
(Miniflare's local simulation covers every test in this feature). User Stories 2-3 round out CRUD;
User Story 4 (attachments) is where this feature's actual Principle V work concentrates, and is
scheduled after the record CRUD it depends on rather than blocking it — a maintenance history with
no photos yet is still a working maintenance history.
