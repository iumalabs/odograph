# Tasks: Document Renew Shortcut

**Input**: Design documents from `/specs/036-document-renew-shortcut/`
**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md

**Tests**: No client-side test suite exists in this project for component-level UI — verified
manually via quickstart.md against `deno task dev`, matching specs/033/034/035. This feature touches
zero server files, so no server test coverage applies either.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

None — this feature is small enough that Foundational and User Story 1 collapse into one phase; see
Phase 3.

## Phase 3: User Story 1 - Quickly start renewing a stale document (Priority: P1)

**Goal**: A "Renew" action appears on Expired/Coming-up document rows and opens the edit form with
the expiry-date field blank; Edit's existing behavior is untouched.

- [X] DR-001 [US1] `src/client/i18n/strings.ts`: add `renewRecord: "Renew"` near the existing
      `editRecord`/`deleteRecord` keys (data-model.md/research: matches this project's established
      convention of one shared generic key reused across ServiceRecordPanel/FuelRecordPanel/
      DocumentPanel's row-action buttons, not a document-specific key name)
- [X] DR-002 [US1] `src/client/components/DocumentPanel.tsx`: add a `startRenew(document:
      VehicleDocument)` function, identical to the existing `startEdit` except
      `setDraftExpiryDate("")` unconditionally instead of `setDraftExpiryDate(document.expiryDate ??
      "")`
- [X] DR-003 [US1] `src/client/components/DocumentPanel.tsx`: render a "Renew" button (styled
      identically to the existing "Edit" button, same `editRecord`-style border/color) immediately
      before the existing Edit button, conditioned on `document.isExpired ||
      document.reminderStatus === "coming_up"`; its `onClick` calls `startRenew(document)`

**Checkpoint**: A document flagged Expired or Coming up shows Renew + Edit; any other document shows
only Edit; clicking Renew opens the form with expiry blank; clicking Edit still pre-fills the stale
date; saving from either path writes exactly what the owner typed (or clears it if left blank) —
`saveEdit` itself needed no change.

## Phase 4: Polish & Cross-Cutting

- [X] DR-004 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] DR-005 Walk through quickstart.md's five scenarios end-to-end against `deno task dev`

## Dependencies

- DR-001 (i18n key) → DR-003 (button that renders it): straightforward ordering, both trivial.
- DR-002 (the new function) → DR-003 (the button that calls it).
- **Phase 4 (Polish)**: after everything else.

## Implementation strategy

**Single user story, single priority (P1), three tiny tasks** — there is no meaningful smaller or
larger slice; this is already the minimum complete change.
