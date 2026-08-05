# Implementation Plan: Semantic Duplicate Detection & Resolution

**Branch**: `010-semantic-duplicate-detection` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-semantic-duplicate-detection/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

At creation time, both `createFuelRecord` and `createServiceRecord` check the new record against
that vehicle's existing, unflagged records for a match (fuel: same date + odometer reading within
a tolerance; service: same date + same description) and, if found, set a new `duplicateOfId`
column pointing at the match — never blocking creation, never merging or dropping either record
(D-005). A flagged fuel record is skipped entirely by the fuel-economy odometer-ordering pass
(spec 009) — neither contributing as a "previous" reference nor receiving its own computed figure.
Two new dismiss endpoints let an owner clear the flag; deleting either record in a flagged pair
clears it automatically via `ON DELETE SET NULL`.

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers; React 19/Vite client) — same as
the existing server/client split.

**Primary Dependencies**: None new.

**Storage**: D1 — one additive column (`duplicate_of_id`, self-referencing FK) on each of
`fuel_records` and `service_records` (migration 0009). No new tables, no R2 involvement.

**Testing**: `deno task test` (vitest against the real D1 local simulation) plus live browser
verification for the resolution UI.

**Target Platform**: Cloudflare Workers (`workerd`) API + Vite-built React SPA — unchanged.

**Project Type**: Web application (existing structure).

**Performance Goals**: Detection is a single additional indexed query per create (same vehicle,
same date, unflagged) — negligible cost added to an already-single-write operation.

**Constraints**: Detection MUST NOT block or reject record creation (FR-004/D-005) — it only
annotates the created record. The fuel-economy calculation MUST treat a flagged record as
transparent (skipped) in the odometer-ordered pass, not as a broken link in the chain (FR-005).

**Scale/Scope**: 1 new migration (2 columns total, one per table), ~6 new/modified repository
functions, 2 new routes (dismiss, one per record type), UI additions to `ServiceRecordPanel.tsx`/
`FuelRecordPanel.tsx` (both already exist — spec 008/009) rather than new components.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: the duplicate-match query and the dismiss
  functions both take a resolved `TenantContext` and scope by `tenant_id`, same as every existing
  repository function; route handlers never reach D1 directly.
- **II. Server-Computed, Division-Safe Aggregates** — directly extended by this feature: flagged
  records are excluded from the fuel-economy odometer-ordering pass (FR-005), the one computed
  figure that currently exists — the exact "excluded from aggregates" behavior D-005 calls for.
- **III. Idempotent, Ordered Offline Sync** — N/A to this feature's mechanism (research.md
  distinguishes semantic duplicate detection from the client-UUID idempotency key Principle III
  governs, which belongs to the still-unbuilt M7 offline queue).
- **IV. No Interpolated Data** — PASS: neither record's data is altered, guessed, or merged; both
  stay exactly as entered, only an additional `duplicateOfId` annotation is added (D-005: "store
  both records").
- **V. Private Object Storage with Validated Uploads** — N/A, no attachment-handling change.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: the new dismiss routes sit behind
  `rateLimitBySession`, matching every existing write route.
- **VIII. GDPR Erasure by Design** — addressed in data-model.md: `duplicate_of_id` is
  `ON DELETE SET NULL`, so deleting the referenced record never leaves a dangling reference and
  never blocks the delete (D-001/D-005 both already established this project's no-orphan
  discipline; this is the same discipline applied to a same-table self-reference instead of R2).
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS (FR-010): all new UI copy
  routes through `src/client/i18n/strings.ts`.
- **X. Toolchain Discipline** — PASS: no new dependencies.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — N/A, no deploy-process change.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/010-semantic-duplicate-detection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/api.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
migrations/0009_duplicate_flags.sql   # new: duplicate_of_id on fuel_records and service_records

src/server/
├── db/repository.ts                   # extended: duplicate-match query + flag-setting inside
│                                        # createFuelRecord/createServiceRecord, economy-pass
│                                        # exclusion in listFuelRecordsWithEconomy,
│                                        # dismissFuelRecordDuplicate/dismissServiceRecordDuplicate
└── routes/v1/
    ├── fuel-records.ts                 # extended: POST /:id/dismiss-duplicate
    └── service-records.ts              # extended: POST /:id/dismiss-duplicate

src/client/
├── fuel-records.ts                     # extended: duplicateOfId field, dismissDuplicate()
├── service-records.ts                  # extended: duplicateOfId field, dismissDuplicate()
├── components/
│   ├── FuelRecordPanel.tsx              # extended: flagged-state badge + dismiss button
│   └── ServiceRecordPanel.tsx           # extended: flagged-state badge + dismiss button
└── i18n/strings.ts                     # extended: flagged/dismiss copy

tests/server/
├── fuel-record-crud.test.ts             # extended: duplicate-detection + dismiss section
└── service-record-crud.test.ts          # extended: duplicate-detection + dismiss section
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level
directories, no new components. This feature extends the four files spec 007/008/009 already
created (`repository.ts`, the two record route files, the two record panel components) rather
than introducing a parallel "duplicates" subsystem — the flag is an attribute of an existing
record, not a new entity with its own CRUD surface.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
