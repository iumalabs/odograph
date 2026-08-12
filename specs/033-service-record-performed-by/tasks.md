# Tasks: Service Record Performed-By Field

**Input**: Design documents from `/specs/033-service-record-performed-by/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included for server-side behavior (`tests/server/service-record-crud.test.ts` already
covers this entity's CRUD/validation contract). No client-side test suite exists in this project for
component-level UI (this project relies on server Vitest tests plus a separately QA-owned e2e suite
for client behavior) — client display/edit behavior is instead verified manually via quickstart.md as
a Polish-phase task, matching the established pattern from specs/032.

## Phase 1: Setup

- [X] PB-001 Create `migrations/0018_service_record_performed_by.sql`: `ALTER TABLE service_records
      ADD COLUMN performed_by TEXT CHECK (performed_by IN ('self', 'shop') OR performed_by IS
      NULL);` (data-model.md — additive, no backfill, existing rows get `NULL`)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] PB-002 `src/server/db/repository.ts`: add `performedBy: "self" | "shop" | null` to the
      `ServiceRecord` type and to the `ServiceRecordInput` type; add `performed_by AS performedBy` to
      `SERVICE_RECORD_COLUMNS`; add `performed_by` to `insertServiceRecordWithDuplicateDetection`'s
      INSERT column list/VALUES/bind (bind `input.performedBy`); add `performedBy: input.performedBy`
      to `createServiceRecord`'s returned object
- [X] PB-003 [P] `src/client/service-records.ts`: add `performedBy: "self" | "shop" | null` to the
      `ServiceRecord` type

**Checkpoint**: `deno task typecheck` passes; `GET`/list endpoints already return `performedBy` (via
`SERVICE_RECORD_COLUMNS`) even though nothing can set it to a non-null value yet.

---

## Phase 3: User Story 1 - Record who performed a service (Priority: P1)

**Goal**: A user can choose "self" or "shop" when creating a service record, or leave it unset.

- [X] PB-004 [US1] `src/server/routes/v1/vehicles.ts`: add `performedBy?: unknown` to
      `ServiceRecordBody`; in `validateServiceRecordCreate`, if `body.performedBy !== undefined` it
      MUST be exactly `"self"` or `"shop"` (else return `null` → `400 invalid_request`, matching this
      function's existing validation style); include `performedBy: body.performedBy === "self" ||
      body.performedBy === "shop" ? body.performedBy : null` in the returned `ServiceRecordInput`
- [X] PB-005 [US1] `src/client/service-records.ts`: add `performedBy?: "self" | "shop"` to
      `createServiceRecord`'s `input` parameter type; in `hydrateOptimisticServiceRecord`, read
      `body.performedBy` (add it to the local `body` shape) and default to `null` if absent, same
      pattern as `odometerReading`/`cost`/`notes`
- [X] PB-006 [US1] `src/client/i18n/strings.ts`: add `performedByLabel: "Performed by"`,
      `performedBySelf: "Self"`, `performedByShop: "Shop"` near the existing
      `serviceDate/serviceDescription` label keys
- [X] PB-007 [US1] `src/client/components/ServiceRecordPanel.tsx`: add `performedBy: "self" | "shop"
      | null` and `onPerformedByChange: (value: "self" | "shop" | null) => void` to
      `ServiceRecordPanelProps`; add a `performedByLabel()` helper function (switch on
      `"self"|"shop"|null`, routed through `t()`, following `DocumentPanel.tsx`'s `categoryLabel()`
      pattern); add a `<select>` control to the create-record form block (options: empty-string →
      unset, `"self"`, `"shop"`) bound to the new prop; replace the stale comment at the top of the
      file (lines 54-56) noting "no self/shop toggle" now that it exists
- [X] PB-008 [US1] `src/client/App.tsx`: add `serviceRecordPerformedBy` lifted state (mirroring
      `serviceDate`/`serviceDescription`); pass `performedBy`/`onPerformedByChange` to
      `<ServiceRecordPanel>`; include `performedBy: serviceRecordPerformedBy ?? undefined` in the
      `createServiceRecord` call's input; reset the state to `null` alongside the existing
      `serviceDate`/`serviceDescription` reset on success
- [X] PB-009 [P] [US1] `tests/server/service-record-crud.test.ts`: add cases — creating a record with
      `performedBy: "self"` persists and is returned as `"self"`; with `"shop"` likewise; omitting
      `performedBy` entirely returns `performedBy: null`; creating with an invalid value (e.g.
      `"dealership"`) returns `400 invalid_request`

**Checkpoint**: A record can be created with `performedBy` set to `"self"`, `"shop"`, or left unset,
via both the API directly and the create form.

---

## Phase 4: User Story 2 - See who performed past services at a glance (Priority: P1)

**Goal**: The service history list visibly shows each record's performed-by value, with no indicator
for unset records.

- [X] PB-010 [US2] `src/client/components/ServiceRecordPanel.tsx`: in the per-row (non-editing)
      display block, add a badge showing `performedByLabel(record.performedBy)` when
      `record.performedBy != null` (styled consistently with the existing `duplicateOfId`/sync-status
      badges already in that block) — render nothing when `record.performedBy` is `null`

**Checkpoint**: Viewing a service history list with a mix of self/shop/unset records shows the
correct indicator (or none) per row.

---

## Phase 5: User Story 3 - Change who performed a service after the fact (Priority: P2)

**Goal**: The existing edit flow lets a user set, change, or clear a record's performed-by value.

- [X] PB-011 [US3] `src/server/routes/v1/service-records.ts`: add `performedBy?: unknown` to
      `PatchBody`; in `validatePatch`, if `"performedBy" in body`, it MUST be `"self"`, `"shop"`, or
      `null` (else return `null` → `400 invalid_request`); set `patch.performedBy` accordingly
- [X] PB-012 [US3] `src/server/db/repository.ts`: in `updateServiceRecord`, add `performedBy:
      "performedBy" in patch ? patch.performedBy ?? null : existing.performedBy` to `merged`; add
      `performed_by = ?` to the `UPDATE service_records SET ...` statement and bind
      `merged.performedBy`
- [X] PB-013 [US3] `src/client/components/ServiceRecordPanel.tsx`: add a `draftPerformedBy` state
      (mirroring `draftOdometerReading` etc.); populate it in `startEdit` from
      `record.performedBy`; add the same `<select>` control (from PB-007) to the edit-form block,
      bound to `draftPerformedBy`; include `performedBy: draftPerformedBy` in `saveEdit`'s call to
      `onUpdateRecord`
- [X] PB-014 [US3] `src/client/App.tsx`: add `performedBy: "self" | "shop" | null` to
      `handleUpdateServiceRecord`'s `patch` parameter type (it already forwards `patch` verbatim to
      `updateServiceRecord`, so no other change needed there)
- [X] PB-015 [P] [US3] `tests/server/service-record-crud.test.ts`: add cases — patching an existing
      record's `performedBy` to `"shop"` persists the change and leaves other fields untouched;
      patching `performedBy` to `null` clears a previously-set value; omitting `performedBy` from a
      patch leaves the existing value unchanged; patching with an invalid value returns `400
      invalid_request`

**Checkpoint**: An existing record's performed-by value can be set, changed, or cleared via the edit
flow, both via the API and the edit form.

---

## Phase 6: Polish & Cross-Cutting

- [X] PB-016 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard) and
      fix any failures across all files touched by this feature
- [X] PB-017 Walk through quickstart.md's six API scenarios plus the five client-verification steps
      end-to-end against `deno task dev`

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: the column must exist before repository code
  references it.
- **Phase 2 (Foundational)** → **all user story phases**: strict — the type/column plumbing must be
  in place before any story-specific code can compile against it.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4's display code reads
  `record.performedBy`, which Phase 3 is what first makes non-null in practice, but Phase 4's own
  code has no hard dependency beyond the type already added in Phase 2.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: soft — Phase 5 reuses the `<select>`
  control and label helper Phase 3 introduces (PB-013 depends on PB-007 existing); the server-side
  patch validation (PB-011/PB-012) has no hard dependency on Phase 3 beyond Phase 2's plumbing.
- **Phase 6 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That alone lets a user record the value on
creation via the API and the form. Phase 4 (display) is needed for the value to be visible at all
without opening dev tools, so in practice Phases 3 and 4 ship together as this feature's minimum
useful slice; Phase 5 (edit/clear) is the lower-priority correction path per spec.md.
