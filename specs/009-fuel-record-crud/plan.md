# Implementation Plan: Fuel Record CRUD + Attachments

**Branch**: `009-fuel-record-crud` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-fuel-record-crud/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Tenant-scoped CRUD for fuel-up records on a vehicle, following the exact repository/route/
attachment shape established by Service Record CRUD (spec 007), plus one new capability: a
server-computed, division-safe fuel-economy figure per record derived at read time from the
odometer delta to that vehicle's next-earlier fuel record (by odometer reading, not creation
order) — never stored, never computed client-side (constitution Principle II).

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers; React 19/Vite client) — same as
the existing server/client split.

**Primary Dependencies**: None new — reuses `src/server/attachments/*` (validate.ts,
strip-exif.ts, storage.ts) verbatim from spec 007, and spec 008's design system components
(`AppShell`, tokens, icons) for the UI.

**Storage**: D1 (new `fuel_records`/`fuel_record_attachments` tables, migration 0008), R2 (reuses
the existing `ATTACHMENTS` bucket binding — no new bucket).

**Testing**: `deno task test` (vitest against the real D1/R2 local simulation, matching spec 007's
approach) plus live browser verification for the UI, per the project's established discipline.

**Target Platform**: Cloudflare Workers (`workerd`) API + Vite-built React SPA — unchanged.

**Project Type**: Web application (existing structure).

**Performance Goals**: No new performance requirement; the economy calculation is a single
per-vehicle D1 query sorted by odometer reading, computed in-memory in the repository layer — not
an N+1 pattern.

**Constraints**: Fuel economy MUST be division-safe (constitution Principle II) — every zero or
missing denominator degrades to an explicit "not enough data" state, never `Infinity`/`NaN`/a
crash. Attachment validation MUST reuse spec 007's rules unchanged (research.md).

**Scale/Scope**: 2 new D1 tables, ~10 new repository functions, 7 new/extended API routes (2
vehicle-nested + 5 standalone, mirroring spec 007's contract shape), 1 retrofit (vehicle-delete R2
cleanup extended to fuel attachments), 1 new client screen reachable from the garage, styled per
spec 008's design system.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: every new repository function takes a
  resolved `TenantContext` and scopes by `tenant_id`, mirroring `createServiceRecord`'s exact
  pattern; route handlers never reach D1 directly (enforced by
  `scripts/check-repository-boundary.sh`, unchanged).
- **II. Server-Computed, Division-Safe Aggregates** — the central concern of this feature. Fuel
  economy is computed in `src/server/db/repository.ts`, never client-side; every denominator
  (odometer delta) is checked for `<= 0` before dividing, returning `null` (not `Infinity`/`NaN`/
  an error) for the first record and any zero-delta record (FR-009).
- **III. Idempotent, Ordered Offline Sync** — N/A, the offline write queue is a later milestone
  (M7); this feature's writes go through the normal synchronous request path, same as vehicles/
  service records today.
- **IV. No Interpolated Data** — PASS: a fuel record with no computable economy shows an explicit
  "not enough data" state (FR-009), never a guessed or interpolated figure; cost/volume of zero is
  accepted as entered, never second-guessed (spec.md Edge Cases).
- **V. Private Object Storage with Validated Uploads** — PASS: fuel-record attachments reuse spec
  007's validation pipeline unchanged (magic bytes, size cap, EXIF stripping, ownership-checked
  download, never a public URL).
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: new write routes
  (`POST`/`PATCH`/`DELETE`, attachment upload) sit behind `rateLimitBySession`, matching every
  existing write route.
- **VIII. GDPR Erasure by Design** — addressed in data-model.md: `fuel_records`/
  `fuel_record_attachments` cascade-delete from `vehicles`/`tenants` the same way service records
  do; R2 objects are explicitly cleaned up by the route layer (never relying on D1 cascade) on both
  fuel-record delete and the vehicle-delete retrofit (FR-006/FR-012).
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS (FR-013): all new UI copy
  routes through `src/client/i18n/strings.ts`; fuel volume/economy units are locale/data axis
  (derived from the vehicle's `odometerUnit`), never conflated with interface language.
- **X. Toolchain Discipline** — PASS: no new dependencies.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — N/A, no deploy-process change.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/009-fuel-record-crud/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/api.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
migrations/0008_fuel_records.sql       # new: fuel_records, fuel_record_attachments

src/server/
├── db/repository.ts                    # extended: fuel-record + fuel-attachment functions,
│                                         # the fuel-economy calculation, and a
│                                         # listAttachmentKeysForVehicleFuelRecords helper for
│                                         # the vehicle-delete retrofit
├── routes/v1/
│   ├── vehicles.ts                      # extended: POST/GET :vehicleId/fuel-records
│   │                                     # (same one-file-one-prefix convention spec 007 fixed),
│   │                                     # DELETE /:id retrofit extended to fuel attachments too
│   └── fuel-records.ts                  # new: GET/PATCH/DELETE /:id, POST /:id/attachments,
│                                         # GET /:id/attachments/:attachmentId — mirrors
│                                         # service-records.ts exactly
└── attachments/                         # unchanged — reused as-is (research.md)

src/client/
├── fuel-records.ts                      # new: thin client wrapper, mirrors service-records.ts
├── components/
│   └── FuelRecordPanel.tsx               # new: styled per spec 008's design system, mirrors
│                                          # ServiceRecordPanel.tsx's structure
└── App.tsx                               # extended: renders FuelRecordPanel alongside
                                           # ServiceRecordPanel for the selected vehicle

tests/server/
├── fixtures/jpeg.ts                      # unchanged, reused
└── fuel-record-crud.test.ts              # new: mirrors service-record-crud.test.ts's structure,
                                           # plus dedicated economy-calculation test cases
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level
directories. This feature is deliberately shaped as a close mirror of spec 007 (Service Record
CRUD): same repository/route/attachment/test file organization, same one-file-one-prefix routing
convention, same `AppShell`-composed UI pattern from spec 008 — the only genuinely new piece is
the fuel-economy calculation itself.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
