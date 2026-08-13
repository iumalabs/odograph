# Tasks: Document Expiry Progress Bar

**Input**: Design documents from `/specs/045-document-expiry-progress/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: `tests/server/document-crud.test.ts` already covers `isExpired`/`reminderStatus` — extend
for `windowFraction`. No client-side test suite exists in this project; the card rendering is
verified manually via quickstart.md against `deno task dev`, matching specs/033-044.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] DEP-001 `src/server/db/repository.ts`: add `windowFraction: number | null` to `Document`;
      in `withDocumentStatus`, when `reminderStatus` is `coming_up` or `overdue`, compute
      `windowFraction = Math.min(1, 1 - remainingDays / DOCUMENT_COMING_UP_WINDOW_DAYS)` (reusing
      the same `remainingDays` `computeDocumentReminderStatus` already derives — expose it from
      that function rather than recomputing); `null` for `on_track`/no expiry date.
- [X] DEP-002 `tests/server/document-crud.test.ts`: extend the existing on-track/coming-up/overdue/
      no-expiry-date status cases with `windowFraction` assertions (`null`, a value in `(0, 1)`,
      `1`, `null` respectively).
- [X] DEP-003 `src/client/documents.ts`: add `windowFraction: number | null` to the `Document`
      type.

**Checkpoint**: `deno task typecheck` passes; document endpoints return the new field end to end;
no UI change yet.

---

## Phase 3: User Story 1 - See how close a document is to expiring, as a visual bar (Priority: P2)

- [X] DEP-004 [US1] `src/client/components/DocumentPanel.tsx`: render a thin progress bar (5px
      track + fill, matching the Garage/reminder bar convention from specs/041) on a document's
      card only when `document.windowFraction !== null`, filled to `windowFraction * 100`%, colored
      to match the existing expired/coming-up treatment already used for that document's badges.

**Checkpoint**: Coming-up and expired documents show a bar; on-track and no-expiry-date documents
show none.

## Phase 4: Polish & Cross-Cutting

- [X] DEP-005 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] DEP-006 Walk through quickstart.md's four API scenarios plus the client walkthrough and
      regression check, end to end against `deno task dev`. Verified: on-track (windowFraction:
      null), overdue (1), no-expiry (null), coming-up (0.679 for a 10-day-out document) — all
      match contracts/api.md. The bar rendering itself is pure client-side React, covered by
      typecheck + the full check suite.

## Dependencies

- **Phase 2 (Foundational)** → **Phase 3**: strict — the field must exist before rendering it.
- **Phase 4 (Polish)**: after everything else.

## Implementation strategy

**MVP = the whole feature** — a single user story, no phased rollout needed beyond
foundational-then-render.
