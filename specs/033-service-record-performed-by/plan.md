# Implementation Plan: Service Record Performed-By Field

**Branch**: `033-service-record-performed-by` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-service-record-performed-by/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add one nullable `performed_by` attribute (`"self" | "shop" | null`) to the existing `service_records`
entity, matching the mockup's САМ/СЕРВИС toggle. Additive migration, a form control on the existing
create/edit forms, and a per-row indicator in the service history list — no new entity, no new route,
no downstream workflow logic (constitution-compliant: nothing about this field feeds reminders,
notifications, or aggregates).

## Technical Context

**Language/Version**: TypeScript (Deno-managed), targeting Cloudflare Workers runtime

**Primary Dependencies**: Hono (server routing), React 19 (client), D1 (SQLite), the project's existing
offline write-queue (`src/client/offline/queue.ts`)

**Storage**: D1 — one additive nullable `TEXT` column with a `CHECK` constraint on `service_records`

**Testing**: Vitest against `wrangler`/Miniflare (existing `tests/server/service-record-crud.test.ts`
suite)

**Target Platform**: Cloudflare Workers (server), browser PWA (client)

**Project Type**: Web application (single Worker serving API + static client)

**Performance Goals**: N/A — one extra nullable column read/written alongside existing fields, no new
query patterns

**Constraints**: Must not require a data backfill or break any existing service record row
(constitution: additive-only migration)

**Scale/Scope**: One column, one form control, one list-row indicator — smallest possible slice per
the source issue's own estimate

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer**: PASS — all reads/writes go through the existing
  `service_records` repository functions (`createServiceRecord`, `updateServiceRecord`,
  `findServiceRecordById`, `listServiceRecords`), all already tenant-scoped. No new query path.
- **II. Server-Computed, Division-Safe Aggregates**: N/A — this field feeds no aggregate.
- **III. Idempotent, Ordered Offline Sync**: PASS — `performedBy` rides the same offline-queue
  create/update actions every other service record field already uses; no new queue entity or action
  type.
- **IV. No Interpolated Data**: PASS — unset is represented as an explicit `null`, never guessed or
  defaulted to "self"/"shop".
- **V. Private Object Storage with Validated Uploads**: N/A — no attachment/file behavior involved.
- **VIII. GDPR Erasure by Design**: N/A — no new PII; existing erasure cascade (delete
  `service_records` row) already covers this column since it lives on the same row.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — both values and the field
  label go through `src/client/i18n/strings.ts` like every other user-facing string, not hardcoded.
- **X. Toolchain Discipline**: PASS — no new dependency; uses existing Hono/D1/React/Vitest stack.
- **XI. English-Only Project Artifacts**: PASS — code, comments, commit messages in English; only
  the mockup's own labels (САМ/СЕРВИС) are Russian source material being translated into the existing
  i18n string table, same as every other feature.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/033-service-record-performed-by/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory — the only interface change is two existing JSON request/response bodies
gaining one optional field each; documented inline in `quickstart.md` instead of a separate contracts
folder, consistent with how spec 020 (offline queue, a similarly small additive change) was planned.

### Source Code (repository root)

```text
migrations/
└── 0018_service_record_performed_by.sql   # new: additive column + CHECK constraint

src/server/
├── db/repository.ts                        # ServiceRecord/ServiceRecordInput types, SQL (extend)
└── routes/v1/
    ├── vehicles.ts                          # create-record validation (extend)
    └── service-records.ts                   # patch validation (extend)

src/client/
├── service-records.ts                       # ServiceRecord type, create/update input types (extend)
├── i18n/strings.ts                          # new labels (extend)
├── components/ServiceRecordPanel.tsx        # form control + per-row display (extend)
└── App.tsx                                  # lifted form state + wiring (extend)

tests/server/service-record-crud.test.ts     # extend with performedBy coverage
```

**Structure Decision**: This is a pure extension of the existing service-record vertical slice
(server routes → repository → D1, client module → panel component → App.tsx wiring) established in
`specs/007-service-record-crud`. No new files beyond the migration; every other change is additive to
an already-existing file in that same slice.

## Complexity Tracking

*No violations — section not applicable.*
