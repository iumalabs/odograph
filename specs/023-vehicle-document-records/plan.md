# Implementation Plan: Vehicle Document Records — CRUD, Expiry Tracking, and Attachments

**Branch**: `023-vehicle-document-records` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-vehicle-document-records/spec.md`

## Summary

Add a tenant/vehicle-scoped `documents` table (title, category, nullable expiry date, notes) and a
`document_attachments` table (R2-backed, metadata-only in D1), following the exact
repository/route/attachment pattern `specs/007-service-record-crud` established and
`specs/009-fuel-record-crud` (fuel records) already reused. The one new piece of logic beyond
copying that pattern is an `isExpired` flag computed server-side (expiry date <= today) so the
client never has to compare dates itself (FR-007). Attachment validation, EXIF stripping, and R2
storage reuse the existing `src/server/attachments/` module as-is — no new validation logic. The
existing `attachmentKey()` helper is generalized to take a resource-type segment (`"documents"`)
instead of hardcoding `"service-records"`, fixing a latent mislabeling where fuel record
attachments were already being stored under a path literally saying `service-records` (see
research.md). `deleteVehicle`'s R2-cleanup retrofit (specs/007, specs/009) gets a third call
alongside the existing two, for the vehicle's documents' attachments.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — reuses `src/server/attachments/{validate,strip-exif,storage}.ts`
as-is (magic-byte sniffing, JPEG EXIF stripping, R2 put/get/delete) with no new validation logic.

**Storage**: D1 — two new tables, `documents` (tenant + vehicle scoped) and `document_attachments`
(metadata only — `r2_key`, `content_type`, `size`), directly mirroring `service_records` /
`service_record_attachments`. R2 — reuses the existing `ATTACHMENTS` bucket binding (no new
bucket), with document attachments living under a new `documents/{documentId}/{attachmentId}` key
segment instead of `service-records/...`.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup) — same real
D1/R2-simulation approach as specs/007. No new fixtures needed; the existing hand-built
GPS/EXIF-bearing JPEG fixture (`tests/server/fixtures/jpeg.ts`) is reused for the stripping test.

**Target Platform**: Cloudflare Workers (`workerd`); client UI runs in evergreen browsers (existing
SPA) — a minimal per-vehicle document list/form plus a file input for attachments, same
"no design polish yet" posture as every prior CRUD feature's UI, mirroring
`ServiceRecordPanel.tsx`'s shape.

**Project Type**: Web application (existing single-Worker structure) — touches `src/server/db/`,
`src/server/routes/v1/`, `src/server/attachments/storage.ts` (generalized key builder),
`migrations/`, and `src/client/`.

**Performance Goals**: No new target — CRUD over a small per-vehicle list, same shape as service
records.

**Constraints**: Repository layer remains the only D1 access point (Principle I); R2 access stays
in `src/server/attachments/storage.ts`, never folded into `repository.ts` (unchanged from
specs/007's precedent); every write path is rate-limited (Principle VII); cross-tenant access
refused indistinguishably from a nonexistent resource (Principle I); attachment uploads validated
by magic bytes/size/allowlist and JPEG EXIF-stripped before storage, never publicly reachable
(Principle V); the `isExpired` flag is computed server-side, never left to client date math
(FR-007); new tables get a documented GDPR erasure decision (Principle VIII), including R2 object
cleanup via the `deleteVehicle` retrofit.

**Scale/Scope**: Two new D1 tables, no new R2 bucket (reuses `ATTACHMENTS`), one generalized helper
function (`attachmentKey`), 7 routes (create/list/fetch/update/delete for documents,
upload/download for attachments — same count as specs/007), one small addition to
`deleteVehicle`'s R2-cleanup retrofit, minimal client UI panel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | All D1 access for `documents`/`document_attachments` goes through new `repository.ts` exports only, scoped by `ctx.tenantId`; R2 access stays in the existing separate `attachments/storage.ts` module | PASS |
| II, III | N/A — no aggregates or offline-queue writes in this feature | N/A |
| IV. No Interpolated Data | Expiry date is optional and never estimated/inferred if omitted (FR-003) | PASS |
| V. Private Object Storage with Validated Uploads | Reuses the existing R2-private, ownership-checked-route, magic-byte/size/allowlist/EXIF-strip pipeline unchanged | PASS |
| VI | N/A — no API tokens | N/A |
| VII. Session/CSP/rate limiting | Create/update/delete/upload pass through `rateLimitBySession`, matching every existing write route; list/fetch/download (reads) don't, matching every prior read route's posture | PASS |
| VIII. GDPR erasure by design | New tables get a documented delete-vs-anonymise decision (data-model.md) before any row is written in production; R2 object cleanup is explicit via the `deleteVehicle` retrofit (FR-017), not assumed via D1 cascade | PASS — see data-model.md |
| IX. i18n axes | New UI strings route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/023-vehicle-document-records/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts                  # ADD: createDocument, listDocuments, findDocumentById,
│                                        #      updateDocument, deleteDocument (returns deleted
│                                        #      attachments' r2 keys), createDocumentAttachment,
│                                        #      findDocumentAttachmentById,
│                                        #      listDocumentAttachmentsForDocument,
│                                        #      listAttachmentKeysForVehicleDocuments (for the
│                                        #      deleteVehicle retrofit)
├── attachments/
│   └── storage.ts                     # MODIFY: attachmentKey(tenantId, resourceType, resourceId,
│                                        #         attachmentId) — generalized from the
│                                        #         hardcoded "service-records" segment; the two
│                                        #         existing call sites (service-records.ts,
│                                        #         fuel-records.ts) pass their resource type
│                                        #         explicitly, fixing the latent fuel-record
│                                        #         mislabeling (research.md)
└── routes/v1/
    ├── vehicles.ts                     # MODIFY: adds POST/GET /:vehicleId/documents
    │                                    #         (create/list, same no-new-mount-point
    │                                    #         convention as service/fuel records); DELETE
    │                                    #         /:id also now deletes the vehicle's documents'
    │                                    #         R2 attachments first
    └── documents.ts                    # ADD: mounted at /api/v1/documents — fetch/update/
                                         #      delete/attachment upload/download (5 routes)

migrations/
└── 0015_documents.sql                  # ADD: documents, document_attachments

src/client/
├── App.tsx                             # MODIFY: mounts a new per-vehicle DocumentPanel
├── components/
│   └── DocumentPanel.tsx               # ADD: mirrors ServiceRecordPanel.tsx's shape (list, add
│                                        #      form, attachment upload input)
└── documents.ts                        # ADD: thin client wrapper for the 7 endpoints

tests/server/
└── document-crud.test.ts               # ADD: CRUD lifecycle, cross-tenant isolation, isExpired
                                         #      flag, attachment upload/download/validation/
                                         #      EXIF-stripping, vehicle-delete-cascades-R2-cleanup
```

**Structure Decision**: Follows the existing `src/server/{db,routes}` layout exactly, identical to
specs/007 and specs/009. No new top-level directory — `documents.ts` sits alongside
`service-records.ts` and `fuel-records.ts` as a third resource-scoped route file, and
`DocumentPanel` sits alongside the existing `ServiceRecordPanel`/`FuelRecordPanel` client
components (per the design mockups' original 7-section nav, Documents was always meant to be a
peer of these, not a sub-feature of one of them).
