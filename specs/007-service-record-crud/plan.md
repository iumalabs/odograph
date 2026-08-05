# Implementation Plan: Service Record CRUD + Attachments

**Branch**: `007-service-record-crud` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-service-record-crud/spec.md`

## Summary

Add tenant-scoped `service_records` (vehicle-owned) and `service_record_attachments` (R2-backed)
tables and routes, following the same repository/route pattern vehicle CRUD established. Attachment
uploads are validated by hand-rolled magic-byte sniffing (never the declared content type) against a
4-format allowlist, capped at 10MB, with JPEG uploads passed through a hand-rolled EXIF/APP1-segment
stripper before being written to a private R2 bucket — no attachment content is ever reachable
except through an authenticated, ownership-checked route. Also closes a real gap this feature's own
R2 usage newly creates: `deleteVehicle` (specs/006) cascades its D1 rows today but has never had R2
objects to clean up until now — this feature makes vehicle deletion also delete its service records'
R2 attachments first.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — magic-byte detection and JPEG EXIF stripping are hand-rolled
(research.md: no well-maintained, Workers-compatible library does either well at this narrow scope).

**Storage**: D1 — two new tables, `service_records` (tenant + vehicle scoped) and
`service_record_attachments` (metadata only — `r2_key`, `content_type`, `size`). R2 — one new
private bucket (`ATTACHMENTS`, not yet provisioned — research.md flags this as an external,
owner-performed action, same category as the Google OAuth client and Cloudflare Email Service domain
onboarding before it).

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup) — `@cloudflare/
vitest-pool-workers` provides a real, local R2 simulation (Miniflare) the same way it does for D1/KV,
so attachment upload/download/validation tests run against a real (simulated) R2 binding, not a
mock, consistent with the constitution's D1/KV real-binding testing requirement extended to R2.
Fixture JPEG bytes with a crafted APP1/EXIF-with-GPS segment are hand-built in a test fixture (no
external test-image file needed) to prove stripping end-to-end.

**Target Platform**: Cloudflare Workers (`workerd`); client UI runs in evergreen browsers (existing
SPA) — a minimal service-history list/form per vehicle, plus a file input for attachments, same
"no design polish yet" posture as every prior feature's UI.

**Project Type**: Web application (existing single-Worker structure) — touches `src/server/`
(repository, new `attachments/` module for R2 + validation + EXIF-stripping, routes, migration,
`vehicles.ts`'s delete handler) and `src/client/`.

**Performance Goals**: No new target — CRUD over a small per-vehicle list; attachment upload is
bounded by the 10MB cap and buffers in memory (research.md — comfortably inside a Worker's default
memory limit, and necessary since both magic-byte sniffing and JPEG marker-walking need random
access to the full buffer, not a stream).

**Constraints**: Repository layer remains the only D1 access point (Principle I) — R2 access lives
in a separate, non-repository module (`src/server/attachments/storage.ts`), mirroring how
`session.ts` already orchestrates KV alongside repository-layer D1 calls rather than folding
non-D1 storage into `repository.ts` itself; every write path is rate-limited (Principle VII);
cross-tenant access refused indistinguishably from a nonexistent resource (Principle I); attachment
uploads validated by magic bytes/size/allowlist and JPEG EXIF-stripped before storage, never
publicly reachable (Principle V); new tables get a documented GDPR erasure decision (Principle
VIII), including R2 object cleanup, not just D1 row cleanup.

**Scale/Scope**: Two new D1 tables, one new R2 binding (not yet provisioned), one new
validation/storage module (~150 lines: magic-byte sniff, JPEG EXIF strip, R2 put/get/delete), 7
routes (create/list/fetch/update/delete for records, upload/download for attachments), one
modification to existing vehicle-delete logic, minimal client UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | All D1 access for `service_records`/`service_record_attachments` goes through new `repository.ts` exports only, scoped by `ctx.tenantId`; R2 access lives in a separate module, never bypassing the D1 ownership check that gates it (enforced by the existing CI guard script for the D1 side) | PASS |
| II, III | N/A — no aggregates or offline-queue writes in this feature | N/A |
| IV. No Interpolated Data | Odometer reading is optional and never estimated/backfilled if omitted (FR-002) | PASS |
| V. Private Object Storage with Validated Uploads | R2 objects never public; every read goes through an ownership-checked route; every upload validated by magic bytes + size cap + allowlist; EXIF/GPS stripped from JPEG before storage | PASS — this feature's entire attachment design exists to satisfy this principle |
| VI | N/A — no API tokens | N/A |
| VII. Session/CSP/rate limiting | Create/update/delete/upload pass through `rateLimitBySession`; list/fetch/download (reads) don't, matching every prior read route's posture | PASS |
| VIII. GDPR erasure by design | Both new tables get a documented delete-vs-anonymise decision (data-model.md) before any row is written in production; R2 object cleanup is explicit, not assumed via D1 cascade (which can't reach R2) — including retrofitting `deleteVehicle`'s now-real R2 cleanup responsibility | PASS — see data-model.md |
| IX. i18n axes | New UI strings route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency; hand-rolled validation/stripping code uses only Web-standard `Uint8Array`/`ArrayBuffer`, no Deno-runtime or Node-only APIs | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline; the R2 bucket itself is a one-time, owner-provisioned resource (same category as the D1/KV resources created once during bootstrap), not something CI provisions | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/007-service-record-crud/
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
│   └── repository.ts                  # ADD: createServiceRecord, listServiceRecords,
│                                        #      findServiceRecordById, updateServiceRecord,
│                                        #      deleteServiceRecord (returns deleted attachments'
│                                        #      r2 keys so the route can clean up R2),
│                                        #      createAttachment, findAttachmentById,
│                                        #      listAttachmentKeysForVehicle (for the
│                                        #      deleteVehicle retrofit)
├── attachments/
│   ├── validate.ts                    # ADD: detectFileType (magic-byte sniff), size-cap check
│   ├── strip-exif.ts                   # ADD: stripJpegExif (APP1 marker-segment removal)
│   └── storage.ts                     # ADD: put/get/delete against the R2 binding, key naming
│                                        #      (tenants/{tenantId}/service-records/{id}/{attId})
└── routes/v1/
    ├── vehicles.ts                     # MODIFY: adds POST/GET /:vehicleId/service-records
    │                                    #         (create/list — no new mount point, analyze
    │                                    #         finding C1); DELETE /:id also now deletes the
    │                                    #         vehicle's service records' R2 attachments first
    │                                    #         (research.md's retrofit)
    └── service-records.ts              # ADD: mounted at /api/v1/service-records (normal
                                         #      one-file-one-prefix convention) — fetch/update/
                                         #      delete/attachment upload/download (5 routes)

migrations/
└── 0007_service_records.sql            # ADD: service_records, service_record_attachments

wrangler.toml
                                         # ADD: [[r2_buckets]] binding = "ATTACHMENTS" (default/
                                         #      preview/production sections) — bucket_name/
                                         #      account-level provisioning is an external,
                                         #      owner-performed action (research.md)

src/client/
├── App.tsx                             # MODIFY: minimal per-vehicle service-record list + add
│                                        #         form + attachment upload input
└── service-records.ts                  # ADD: thin client wrapper for the 7 endpoints

tests/server/
├── fixtures/
│   └── jpeg.ts                         # ADD: hand-built minimal JPEG bytes with a crafted APP1/
│                                        #      EXIF-with-GPS segment, for the stripping test
└── service-record-crud.test.ts         # ADD: CRUD lifecycle, cross-tenant isolation, attachment
                                         #      upload/download/validation/EXIF-stripping,
                                         #      vehicle-delete-cascades-R2-cleanup
```

**Structure Decision**: Follows the existing `src/server/{db,routes}` layout exactly for the D1
side. A new `src/server/attachments/` directory holds the R2-specific logic (validation, EXIF
stripping, storage), kept separate from `repository.ts` (D1-only, per Principle I) the same way
`session.ts` already keeps KV logic separate from `repository.ts`'s D1-only scope.
