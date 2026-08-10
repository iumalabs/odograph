# Tasks: Vehicle Document Records — CRUD, Expiry Tracking, and Attachments

**Input**: Design documents from `/specs/023-vehicle-document-records/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — CRUD lifecycle, cross-tenant isolation, the `isExpired` flag, attachment
validation/EXIF-stripping (reusing existing infra), and the vehicle-delete R2-cleanup retrofit.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0015_documents.sql`: `documents`,
      `document_attachments` per data-model.md

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T003 In `src/server/attachments/storage.ts`, generalize `attachmentKey(tenantId,
      serviceRecordId, attachmentId)` to `attachmentKey(tenantId, resourceType, resourceId,
      attachmentId)` where `resourceType` is `"service-records" | "fuel-records" | "documents"`
      (research.md) — building `tenants/{tenantId}/{resourceType}/{resourceId}/{attachmentId}`
- [X] T004 [P] Update every existing call site of `attachmentKey` to pass its real resource type
      explicitly (research.md fixes the pre-existing fuel-record mislabeling as part of this
      change): the two route call sites (`src/server/routes/v1/service-records.ts`,
      `src/server/routes/v1/fuel-records.ts`, `"service-records"`/`"fuel-records"`) **and** the
      four existing test call sites that import `attachmentKey` directly
      (`tests/server/service-record-crud.test.ts:439`, `tests/server/fuel-record-crud.test.ts:453,
      585, 605` — the last two calls in the same retrofit test, one per resource type) — otherwise
      T003's signature change breaks these currently-passing suites at type-check time
      (speckit-analyze finding C1)
- [X] T005 In `src/server/db/repository.ts`, per data-model.md's "Repository layer additions":
      `createDocument`, `listDocuments`, `findDocumentById`, `updateDocument`, `deleteDocument`
      (returns the deleted document's attachments' R2 keys, doesn't touch R2 itself),
      `listAttachmentKeysForVehicleDocuments`, `createDocumentAttachment`,
      `findDocumentAttachmentById`, `listDocumentAttachmentsForDocument` — every function takes a
      resolved `TenantContext` and scopes by `ctx.tenantId`, mirroring `createServiceRecord`'s
      exact pattern. `isExpired` is computed in `findDocumentById`/`listDocuments`/`updateDocument`
      at read time (`expiryDate !== null && expiryDate <= today`, research.md), never stored. No
      existing export's signature changes except `attachmentKey` (T003).

**Checkpoint**: Repository additions and the generalized `attachmentKey` exist, type-check, and
`deno task test` still passes for the existing `service-record-crud`/`fuel-record-crud` suites
(proving T003/T004 didn't break either).

---

## Phase 3: User Story 1 - An owner records a document for their vehicle (P1) 🎯 MVP

**Goal**: Complete create → list end-to-end, refusing a cross-tenant/nonexistent vehicle, and an
invalid category, before anything is written.

- [X] T006 [US1] Implement `POST /:vehicleId/documents` and `GET /:vehicleId/documents` **directly
      in the existing** `src/server/routes/v1/vehicles.ts` (same not-a-new-mount-point convention
      specs/007's analyze finding C1 established for service records, and specs/009 followed for
      fuel records). `POST` additionally behind `rateLimitBySession`: resolves `vehicleId` via the
      existing `findVehicleById` first (`404` if not found/not yours, FR-004, *before* validating
      the body), validates `title` (non-empty) and `category` (one of the five defined values,
      FR-002) and optional `expiryDate`/`notes` — `400` with nothing created on failure; `GET`
      returns `{ documents: [...] }`, each including `isExpired`
- [X] T007 [US1] Create `src/server/routes/v1/documents.ts` (empty of routes yet — T009/T011/T013/
      T014 add them) and wire it into `src/server/index.ts` under `/api/v1/documents`, following
      the normal one-file-one-prefix convention every other route file uses
- [X] T008 [P] [US1] Create `tests/server/document-crud.test.ts` (creation section): 1. Creating a
      document with only the two required fields succeeds and appears in the vehicle's list, with
      `isExpired: false`. 2. Creating one with all optional fields stores every value exactly. 3.
      Omitting `title` or `category`, or submitting a `category` outside the defined set, is
      rejected (`400`) and creates nothing. 4. Creating a document against a vehicle belonging to a
      different tenant (or a made-up vehicle id) is refused (`404`), identically for both cases.

**Checkpoint**: `deno task test` passes for the creation section.

---

## Phase 4: User Story 2 - An owner reviews a vehicle's documents (P1)

**Goal**: Fetch-by-id (with attachment metadata and `isExpired`) and full tenant-isolation across
list/fetch, including a document whose expiry date has already passed still being returned (never
hidden).

- [X] T009 [US2] Implement `GET /api/v1/documents/:id` in `documents.ts`: `404` under the
      not-found-or-not-yours contract; response includes `isExpired` and an `attachments` array
      (id, contentType, size, createdAt — never the raw `r2Key`, contracts/api.md)
- [X] T010 [P] [US2] Extend `document-crud.test.ts` (read section): 1. Listing documents across two
      different tenants' vehicles — each sees only their own. 2. Fetching a document by id returns
      its full detail. 3. A document with a past expiry date is still returned in full, flagged
      `isExpired: true`; one with a future expiry date or none is `isExpired: false` (SC-007). 4.
      Listing or fetching against a different tenant's vehicle/document is refused (`404`),
      identically to a made-up id.

**Checkpoint**: `deno task test` passes for the read section.

---

## Phase 5: User Story 3 - An owner corrects or removes a document (P2)

**Goal**: Partial update (including setting/clearing `expiryDate`) and delete (documents only —
attachment deletion happens via T016's vehicle-delete retrofit and the document-delete path itself,
not a standalone delete-one-attachment operation, per spec.md's Assumptions).

- [X] T011 [US3] Implement `PATCH /api/v1/documents/:id` and `DELETE /api/v1/documents/:id` in
      `documents.ts`, both behind `rateLimitBySession`: `PATCH` validates only included fields
      (rejecting an included-but-invalid `category`), applies a partial update (an explicit
      `expiryDate: null` clears it; an omitted `expiryDate` leaves it unchanged), refreshes
      `updatedAt`, and returns `isExpired` recomputed against the result; `DELETE` calls
      `deleteDocument` to get the document's attachments' R2 keys, then `deleteAttachments` to
      remove them from R2, *then* returns `204` — R2 cleanup happens before the response, not
      fire-and-forget (data-model.md's erasure requirement)
- [X] T012 [P] [US3] Extend `document-crud.test.ts` (update/delete section): 1. Updating one field
      leaves every other field unchanged. 2. `PATCH` with an invalid `category` is rejected (`400`)
      with no change applied. 3. `PATCH` with `expiryDate: null` clears a previously-set expiry and
      flips `isExpired` to `false`. 4. A deleted document is unreachable from list/fetch
      immediately. 5. Updating or deleting a different tenant's document is refused (`404`) and
      leaves it intact.

**Checkpoint**: `deno task test` passes for the update/delete section.

---

## Phase 6: User Story 4 - An owner attaches a scan or photo (P2)

**Goal**: Validated upload (magic bytes, size cap, JPEG EXIF-stripped) and ownership-checked
download, reusing the existing `validate.ts`/`strip-exif.ts` modules unchanged — no new validation
logic, only new call sites.

- [X] T013 [US4] Implement `POST /api/v1/documents/:id/attachments` in `documents.ts` behind
      `rateLimitBySession`: resolves `:id` via `findDocumentById` first (`404` if not found/not
      yours); reads the raw body via `c.req.arrayBuffer()` (checking `Content-Length` against the
      10MB cap before reading, matching `service-records.ts`'s existing pattern); runs
      `detectFileType` — `400` if not in the allowlist; for JPEG, runs `stripJpegExif` before
      storing; writes the (possibly stripped) bytes via `putAttachment` at `attachmentKey(tenant,
      "documents", documentId, newId)` (T003); calls `createDocumentAttachment` with the sniffed
      type and final byte length; returns `201`
- [X] T014 [US4] Implement `GET /api/v1/documents/:id/attachments/:attachmentId`: resolves both ids
      via `findDocumentById`/`findDocumentAttachmentById` (`404` under the not-found-or-not-yours
      contract for either); streams the R2 object back via `getAttachment` with `Content-Type` set
      to the stored (sniffed) type — never a redirect to a public URL (FR-015)
- [X] T015 [P] [US4] Extend `document-crud.test.ts` (attachments section): 1. Uploading a valid
      JPEG (reusing `tests/server/fixtures/jpeg.ts`, without the EXIF segment) succeeds and the
      attachment appears on the document. 2. Uploading a file whose magic bytes don't match any
      allowed format is rejected (`400`) and creates nothing (SC-003) — verified with a body that
      claims `Content-Type: image/jpeg` but isn't actually JPEG bytes. 3. Uploading a body larger
      than the size cap is rejected (`400`) and creates nothing (SC-004). 4. Uploading the fixture
      JPEG *with* its crafted GPS/EXIF segment, then downloading the stored attachment back and
      inspecting its bytes directly — confirms the EXIF/APP1 segment (and the GPS data inside it)
      is not present in what's stored (SC-005). 5. Downloading an attachment belonging to a
      different tenant's document is refused (`404`), identically to a made-up attachment id
      (SC-002).

**Checkpoint**: `deno task test` passes for the attachments section.

---

## Phase 7: Retrofit — vehicle deletion and account erasure clean up document R2 attachments

**Goal**: Extend both existing R2-cleanup retrofits — `deleteVehicle`'s (specs/007, specs/009) and
`DELETE /api/v1/account`'s (specs/016) — with a call for documents, closing the same gap for this
feature's own R2 usage in both places FR-017/Principle VIII require it. Caught during
`/speckit-analyze`-equivalent review of `src/server/routes/v1/account.ts`: the original tasks.md
draft only covered the vehicle-delete path, which would have left every document attachment
un-erased (a real GDPR-erasure gap, not just a vehicle-delete gap) when a tenant account is deleted.

- [X] T016 Modify `DELETE /api/v1/vehicles/:id` in `src/server/routes/v1/vehicles.ts`: alongside
      the existing `listAttachmentKeysForVehicle`/`listAttachmentKeysForVehicleFuelRecords` calls,
      add `listAttachmentKeysForVehicleDocuments` (T005) and include its keys in the same
      `deleteAttachments` batch, before calling the existing `deleteVehicle` repository function —
      no change to the route's request/response contract (still `204`/`404`), only its side effects
      (contracts/api.md)
- [X] T016a Add `listAttachmentKeysForTenantDocuments` to `repository.ts` (same no-join shape as
      `listAttachmentKeysForTenantFuelRecords`, since `document_attachments` already carries its
      own `tenant_id`), and call it in `DELETE /api/v1/account` (`src/server/routes/v1/account.ts`)
      alongside the existing `listAttachmentKeysForTenant`/`listAttachmentKeysForTenantFuelRecords`
      calls, folding its keys into the same `deleteAttachments` batch before
      `deleteTenantAccount` runs
- [X] T017 [P] Extend `document-crud.test.ts` (retrofit section): create a vehicle, a document on
      it, and an attachment on that document; delete the vehicle; confirm the document, its
      attachment's D1 row, *and* the R2 object are all gone (verified by attempting a direct
      `getAttachment` against the same key and confirming it's null, not just that the D1-facing
      API returns 404)
- [X] T017a [P] Extend `tests/server/account-erasure.test.ts`: alongside its existing service/fuel
      attachment assertions, seed a document with an attachment, delete the account, and confirm
      the document attachment's R2 object is gone too (same direct-`getAttachment` verification as
      T017)

**Checkpoint**: `deno task test` passes for the retrofit section; no R2 object outlives the D1 rows
that referenced it, for either deletion path.

---

## Phase 8: Client UI

- [X] T018 [P] Implement `src/client/documents.ts`: thin wrapper for the 7 endpoints
      (`listDocuments`, `createDocument`, `getDocument`, `updateDocument`, `deleteDocument`,
      `uploadDocumentAttachment`, attachment download URL builder)
- [X] T019 [P] Implement `src/client/components/DocumentPanel.tsx`: mirrors
      `ServiceRecordPanel.tsx`'s shape — per-vehicle document list (title, category, expiry date if
      present with an expired indicator when `isExpired`) with a minimal add-document form
      (title + category, the two required fields) and a file input for uploading an attachment to a
      selected document; new UI strings routed through the existing i18n infrastructure
      (constitution Principle IX)
- [X] T020 Modify `src/client/App.tsx`: mounts `DocumentPanel` alongside the existing
      `ServiceRecordPanel`/`FuelRecordPanel` for the selected vehicle

## Phase 9: Polish & Cross-Cutting

- [X] T021 [P] Update `src/server/db/schema.sql` reference copy with `documents`,
      `document_attachments`
- [X] T022 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] T023 Walk through quickstart.md end-to-end against `deno task dev`

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository additions and the
  generalized `attachmentKey` are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)** → **User
  Story 4 (Phase 6)**: soft — each extends the same route/test files, but each story's own
  scenarios don't depend on the next story's routes existing, except Phase 6 needing Phase 3's
  create route to have something to attach to.
- **Phase 7 (Retrofit)**: depends on Phase 6 (needs attachment creation to exist to have something
  to retrofit against).
- **Phase 8 (Client UI)** → after Phase 6 (needs all CRUD + attachment routes).
- **Phase 9 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, T004 (updating the two existing call sites) can run alongside T005 (new repository
functions) once T003 (the `attachmentKey` signature change) lands — T003 itself is a prerequisite
for both, not parallel with them:

```text
T003 src/server/attachments/storage.ts (prerequisite)
T004 [P] src/server/routes/v1/service-records.ts + fuel-records.ts (after T003)
T005     src/server/db/repository.ts (independent of T003/T004, can run in parallel with either)
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "record a document, see it in
the vehicle's document list" — this feature's core purpose, fully testable without a real R2 bucket
(Miniflare's local simulation covers every test, and no new bucket is provisioned — this feature
reuses the existing `ATTACHMENTS` binding). User Stories 2-3 round out CRUD; User Story 4
(attachments) reuses existing validation/EXIF-stripping infrastructure unchanged, so it's lower risk
than specs/007's original implementation of that machinery was.
