# Tasks: Semantic Duplicate Detection & Resolution

**Input**: Design documents from `/specs/010-semantic-duplicate-detection/` **Prerequisites**:
plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — detection (matching and non-matching cases, cross-tenant isolation),
fuel-economy exclusion, dismiss (success and not-flagged/not-found/not-yours), and
delete-clears-the-flag via `ON DELETE SET NULL`.

**Scope note**: This feature extends four existing files (`repository.ts`, `fuel-records.ts`/
`service-records.ts` route files, and their client-side + panel-component counterparts) — no new
tables beyond one additive column each, no new components, no new attachment handling.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0009_duplicate_flags.sql`: add `duplicate_of_id TEXT
      REFERENCES fuel_records(id) ON DELETE SET NULL` to `fuel_records` and the equivalent
      self-referencing column to `service_records`, plus
      `idx_fuel_records_duplicate_of_id`/`idx_service_records_duplicate_of_id` indexes
      (data-model.md)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T003 In `src/server/db/repository.ts`: add `duplicateOfId: string | null` to the
      `FuelRecord` and `ServiceRecord` types, and `duplicate_of_id AS duplicateOfId` to
      `FUEL_RECORD_COLUMNS`/`SERVICE_RECORD_COLUMNS` — no matching logic yet, just the schema
      surface every subsequent task builds on

**Checkpoint**: Repository types/queries reflect the new column; every existing test still passes
unchanged (the column is additive and always `null` until Phase 3 wires detection in).

---

## Phase 3: User Story 1 - An owner is warned when they log what looks like the same event twice (P1) 🎯 MVP

**Goal**: Creation-time detection for both record types, per research.md's exact matching rules.

- [X] T004 [US1] In `repository.ts`, add a private `findFuelDuplicateCandidate(db, ctx, vehicleId,
      input): Promise<string | null>` helper — queries `fuel_records` for the same `vehicle_id`/
      `tenant_id`, `duplicate_of_id IS NULL` (only unflagged/original records), matching
      `fuel_date` exactly, and `ABS(odometer_reading - input.odometerReading) <= 5`, ordered by
      that delta ascending, returning the closest match's id or `null`; wire it into
      `createFuelRecord` so the `INSERT` includes the found id as `duplicate_of_id` (research.md)
- [X] T005 [US1] In `repository.ts`, add the equivalent `findServiceDuplicateCandidate(db, ctx,
      vehicleId, input): Promise<string | null>` — same shape, matching `service_date` exactly and
      `description` case-insensitively (`LOWER(description) = LOWER(?)`); wire into
      `createServiceRecord`
- [X] T006 [P] [US1] Create the duplicate-detection section in `tests/server/fuel-record-crud.test.ts`
      and `tests/server/service-record-crud.test.ts`: 1. A same-date, near-odometer (fuel) or
      same-date-same-description (service) second record is created with `duplicateOfId` pointing
      at the first, *and* the first (original) record is still fetchable with its own fields
      unchanged and its own `duplicateOfId: null` — flagging never merges, modifies, or removes
      either record (FR-004). 2. A meaningfully different second record (different date, or
      odometer >5 apart / different description) is created with `duplicateOfId: null`. 3.
      Detection never compares across tenants or across different vehicles — two tenants each
      logging matching-looking records for their own vehicles are both unflagged.

**Checkpoint**: `deno task test` passes for the detection section — logging a likely-duplicate
visibly flags it, logging a genuinely different record doesn't.

---

## Phase 4: User Story 2 - A flagged record doesn't corrupt fuel-economy figures (P1)

**Goal**: The fuel-economy odometer-ordering pass treats a flagged record as transparent —
neither a valid "previous" reference nor a recipient of its own computed figure.

- [X] T007 [US2] Modify `listFuelRecordsWithEconomy` in `repository.ts`: in the odometer-ordered
      walk, a record with `duplicateOfId != null` is assigned `fuelEconomy: null` and does **not**
      update the `previous` pointer used to compute the next unflagged record's economy
      (research.md's exclusion design) — `findFuelRecordById` needs no separate change, since it
      already delegates to this function
- [X] T008 [P] [US2] Extend `fuel-record-crud.test.ts` (economy-exclusion section): 1. Given fuel
      records A, B (a flagged duplicate of A), and C at increasing odometer readings, C's
      `fuelEconomy` is computed from A's odometer reading, not B's. 2. B itself has
      `fuelEconomy: null` while flagged.

**Checkpoint**: `deno task test` passes for the economy-exclusion section — this is the feature's
core Principle II/D-005 proof.

---

## Phase 5: User Story 3 - An owner resolves a flagged duplicate (P1)

**Goal**: Dismiss clears the flag and restores normal (included-in-economy) behavior; deleting
either record in a pair clears the flag automatically via the FK constraint.

- [X] T009 [US3] In `repository.ts`, add `dismissFuelRecordDuplicate(db, ctx, id):
      Promise<FuelRecordWithEconomy | null>` — `null` if the record doesn't exist, belongs to a
      different tenant, or has `duplicate_of_id IS NULL` already (nothing to dismiss, same
      not-found-or-not-yours-shaped contract per contracts/api.md); otherwise sets
      `duplicate_of_id = NULL` and returns the record via `findFuelRecordById` (fresh economy).
      Implement `POST /api/v1/fuel-records/:id/dismiss-duplicate` in
      `src/server/routes/v1/fuel-records.ts` behind `rateLimitBySession` calling it
- [X] T010 [US3] In `repository.ts`, add the equivalent `dismissServiceRecordDuplicate(db, ctx,
      id): Promise<ServiceRecord | null>`. Implement
      `POST /api/v1/service-records/:id/dismiss-duplicate` in
      `src/server/routes/v1/service-records.ts` behind `rateLimitBySession` calling it
- [X] T011 [P] [US3] Extend both `fuel-record-crud.test.ts` and `service-record-crud.test.ts`
      (resolution section): 1. Dismissing a flagged record clears `duplicateOfId` and (fuel only)
      the next fetch of a later record recomputes its economy against the now-unflagged one. 2.
      Dismissing an already-unflagged record, a made-up id, or a different tenant's record all
      return `404`. 3. Deleting the *original* record of a still-flagged pair leaves the
      previously-flagged record with `duplicateOfId: null` afterward (the `ON DELETE SET NULL`
      constraint, verified via a fetch after the delete).

**Checkpoint**: `deno task test` passes for the resolution section.

---

## Phase 6: Client UI

- [X] T012 [P] Extend `src/client/fuel-records.ts`: add `duplicateOfId: string | null` to the
      `FuelRecord` type and a `dismissDuplicate(id): Promise<FuelRecord>` function
      (`POST /api/v1/fuel-records/:id/dismiss-duplicate`)
- [X] T013 [P] Extend `src/client/service-records.ts`: add `duplicateOfId: string | null` to the
      `ServiceRecord` type and a `dismissDuplicate(id): Promise<ServiceRecord>` function
- [X] T014 Modify `src/client/components/FuelRecordPanel.tsx`: when `record.duplicateOfId` is
      non-null, render a `var(--warn)`-bordered badge ("possible duplicate") in place of the
      economy figure's normal position, plus a small dismiss button (reusing the existing chip/
      button visual language); wire the dismiss button to a new `onDismissDuplicate` prop
- [X] T015 Modify `src/client/components/ServiceRecordPanel.tsx`: same badge + dismiss button
      treatment as T014, added to each record row when `record.duplicateOfId` is non-null
- [X] T016 [P] Add new i18n keys to `src/client/i18n/strings.ts` (e.g. `possibleDuplicateLabel`,
      `dismissDuplicate`) — FR-010; wire both panel components' new copy through them, and wire
      `App.tsx`'s handlers to call `dismissDuplicate` and update local state on success

**Checkpoint**: A flagged record is visibly distinguishable in both panels, with a working dismiss
action, end to end from the UI.

## Phase 7: Polish & Cross-Cutting

- [X] T017 [P] Update `src/server/db/schema.sql` reference copy with the new `duplicate_of_id`
      columns and indexes on both tables
- [X] T018 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [X] T019 Walk through quickstart.md end-to-end against `deno task dev` in a real browser,
      confirming SC-001 through SC-004

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — every story reads/writes
  `duplicateOfId`, which must exist in the type/column surface first.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: strict — economy exclusion has nothing
  to exclude until records can actually get flagged.
- **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)**: soft — dismiss's "economy recomputes
  correctly afterward" test needs the exclusion logic to exist, but the dismiss mechanism itself
  (clearing the column) doesn't depend on it.
- **Phase 6 (Client UI)** → after Phase 5 (needs the dismiss endpoint to call).
- **Phase 7 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 6, the two client-wrapper tasks touch different files and have no dependency on each
other or on the panel-component tasks:

```text
T012 [P] src/client/fuel-records.ts
T013 [P] src/client/service-records.ts
T016 [P] src/client/i18n/strings.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** Detection alone — flagging a likely
duplicate at creation time — is independently valuable and testable even before the economy
exclusion or resolution UI exist (a flagged record is still visible and usable, just not yet
distinguished in the UI or excluded from figures). User Stories 2 and 3 complete the D-005 picture
(never let a flag silently corrupt data, always give the owner a way out) and are sequenced
immediately after since both are P1.
