# Tasks: Document Expiry Reminders (Email + Push)

**Input**: Design documents from `/specs/024-document-expiry-reminders/` **Prerequisites**:
plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — status transitions, escalation/dedup, email+push delivery, missing-channel
skip, renewal-clears-state, and Cron scheduling.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0016_document_reminder_state.sql`: `ALTER TABLE
      documents ADD COLUMN cached_status TEXT`, `ADD COLUMN last_evaluated_at TEXT`,
      `ADD COLUMN last_notified_severity TEXT` per data-model.md

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T003 In `src/server/email/reminder-notification.ts`, rename `sendReminderDueEmail`'s
      `ruleLabel` input field to `itemLabel` (research.md) — no other behavior change
- [X] T004 [P] In `src/server/push/send-reminder-push.ts`, apply the identical `ruleLabel` →
      `itemLabel` rename to `sendReminderPushNotification`'s input type
- [X] T005 In `src/server/db/repository.ts`'s `evaluateAllReminders`, update both call sites
      (email and push) to pass `itemLabel: rule.label` instead of `ruleLabel: rule.label` —
      otherwise T003/T004's rename breaks compilation here
- [X] T006 [P] In `src/server/db/repository.ts`'s documents section, add
      `DOCUMENT_COMING_UP_WINDOW_DAYS = 30` and the pure function
      `computeDocumentReminderStatus(expiryDate: string, now: Date): "on_track" | "coming_up" |
      "overdue"` per data-model.md — no D1 access, directly unit-testable
- [X] T007 In `src/server/db/repository.ts`, extend `findDocumentById`/`listDocuments` to compute
      and include `reminderStatus` (via `computeDocumentReminderStatus` when `expiryDate` is
      non-null, else `null`) alongside the existing `isExpired` computation — both derived at read
      time, never from `cached_status` (research.md)

**Checkpoint**: `computeDocumentReminderStatus` exists and type-checks; `deno task test` still
passes for the existing `reminder-rules.test.ts`/`document-crud.test.ts` suites (proving T003-T005
didn't break maintenance-reminder delivery and T007 didn't break existing document reads).

---

## Phase 3: User Story 1 - An owner sees which documents are coming up or overdue (P1) 🎯 MVP

**Goal**: `reminderStatus` is visible and correct in the document API responses, for all four
cases (on track, coming up, overdue, no expiry date).

- [X] T008 [US1] Confirm `GET /api/v1/vehicles/:vehicleId/documents` and
      `GET /api/v1/documents/:id` (`src/server/routes/v1/documents.ts`, specs/023) already pass
      the repository's document object straight through as JSON — if so, `reminderStatus` from
      T007 is already exposed with no route code change needed; if the routes destructure/rebuild
      the response object, add `reminderStatus` explicitly
- [X] T009 [P] [US1] Create `tests/server/document-reminders.test.ts` (status section): 1. A
      document with `expiryDate` 45 days out reads as `on_track`. 2. One with `expiryDate` 10 days
      out reads as `coming_up`. 3. One with `expiryDate` in the past reads as `overdue`. 4. One
      with no `expiryDate` reads `reminderStatus: null` and is never assigned any of the three
      states.

**Checkpoint**: `deno task test` passes for the status section.

---

## Phase 4: User Story 2 - An owner is notified by email and push when a document becomes due (P1)

**Goal**: The Cron-triggered sweep evaluates documents, escalates through email/push exactly once
per transition, and never repeats while unchanged.

- [X] T010 [US2] Implement `evaluateAllDocumentReminders(env: Env & VapidSecrets)` in
      `src/server/db/repository.ts`'s documents section, mirroring `evaluateAllReminders`'s exact
      structure (data-model.md): select every `documents` row with `expiry_date IS NOT NULL`
      (no `TenantContext`, same documented exception); for each, compute status via
      `computeDocumentReminderStatus`, persist `cached_status`/`last_evaluated_at`; on `on_track`
      clear `last_notified_severity` if set; on `coming_up`/`overdue` more urgent than
      `last_notified_severity`, look up the vehicle name, attempt email via
      `findDeliverableReminderRecipient` + `sendReminderDueEmail` (now `itemLabel: document.title`)
      and push via `listPushSubscriptions` + `sendReminderPushNotification`, advance
      `last_notified_severity` only if at least one channel actually sent, prune any push
      subscription reported expired — isolate each row's failure in a try/catch so one bad row
      doesn't stop the sweep
- [X] T011 [US2] Modify the `scheduled` handler in `src/server/index.ts` to also call
      `await evaluateAllDocumentReminders(env)`, right after the existing
      `await evaluateAllReminders(env)` call (research.md — same handler, no new Cron trigger)
- [X] T012 [P] [US2] Extend `document-reminders.test.ts` (escalation section, mirroring
      `reminder-rules.test.ts`'s equivalent): 1. A document transitioning to `coming_up` is
      notified exactly once (`evaluateAllDocumentReminders(env)` result `.notified === 1`) and
      `last_notified_severity` becomes `"coming_up"`. 2. One created already overdue is notified
      directly at `overdue`, no `coming_up` step required. 3. Re-running the sweep with no state
      change produces `.notified === 0` and leaves `last_notified_severity` unchanged, for both a
      still-`coming_up` and a still-`overdue` document.
- [X] T013 [P] [US2] Extend `document-reminders.test.ts` (missing-channel section): an owner with
      only a placeholder email and no push subscription still gets `evaluated` incremented and the
      sweep completes without throwing, `notified` stays `0` and `last_notified_severity` stays
      `null` for that document (skip, not failure — mirrors `reminder-rules.test.ts`'s "owners
      without a deliverable email" section) — followed in the same test file by a second document
      belonging to a *different*, deliverable-email owner to confirm the sweep doesn't stop after
      the skip
- [X] T013a [P] [US2] Extend `document-reminders.test.ts` (deletion & isolation section,
      speckit-analyze finding C1): 1. Delete a document with an active `coming_up`/`overdue`
      status, run the sweep, and confirm `.evaluated` doesn't count it and no notification is sent
      for it (FR-008) — same for a document removed via its vehicle being deleted. 2. Seed two
      different tenants each with their own overdue document and confirm each tenant's owner is
      notified only for their own document, never the other's (FR-009) — a direct sweep-level
      check, since the sweep itself has no `TenantContext` to rely on structurally beyond each
      row's own `tenant_id`

**Checkpoint**: `deno task test` passes for the escalation, missing-channel, and deletion/isolation
sections.

---

## Phase 5: User Story 3 - Renewing a document clears its reminder state (P2)

**Goal**: Editing a document's `expiryDate` (to a new date or to `null`) clears its notification
escalation state so a renewed document can be notified again on its own future cycle.

- [X] T014 [US3] Modify `updateDocument` in `src/server/db/repository.ts` (specs/023): when the
      patch includes `expiryDate` (present in the patch object, matching the existing
      omitted-vs-null convention — a new date or an explicit `null`), also set
      `last_notified_severity = NULL` in the same `UPDATE` statement (FR-007)
- [X] T015 [P] [US3] Extend `document-reminders.test.ts` (renewal section): 1. Create a document
      already overdue, run the sweep so it's notified and `last_notified_severity` is `"overdue"`,
      `PATCH` its `expiryDate` to a future date, and confirm `last_notified_severity` is now
      `null` and `reminderStatus` reads `on_track` immediately (no sweep needed for the read). 2.
      Run the sweep again with the new future date within the coming-up window and confirm it
      notifies again (`.notified === 1`), exactly as for a document's first expiry cycle. 3.
      Clearing `expiryDate` to `null` on a previously-`coming_up`/`overdue` document also clears
      `last_notified_severity` and the document is skipped by the next sweep entirely.

**Checkpoint**: `deno task test` passes for the renewal section.

---

## Phase 6: Client UI

- [X] T016 [P] Modify `src/client/documents.ts`: add `reminderStatus: "on_track" | "coming_up" |
      "overdue" | null` to the `VehicleDocument` type (matches the repository/API shape from T007)
- [X] T017 Modify `src/client/components/DocumentPanel.tsx`: show a "coming up" badge (distinct
      styling from the existing "Expired" badge) when `reminderStatus === "coming_up"`; the
      existing expired badge continues to use `isExpired`/`reminderStatus === "overdue"` — no
      change to that condition; new UI string routed through the existing i18n infrastructure
      (constitution Principle IX)

## Phase 7: Polish & Cross-Cutting

- [X] T018 [P] Update `src/server/db/schema.sql` reference copy: add `cached_status`,
      `last_evaluated_at`, `last_notified_severity` to the `documents` table definition
- [X] T019 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [X] T020 Walk through quickstart.md end-to-end against `deno task dev`

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — the rename (T003-T005) and the
  pure status function (T006-T007) are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)**: soft — US2
  needs US1's `reminderStatus` computation to exist as the thing the sweep persists/reacts to; US3
  needs US2's sweep and escalation state to exist to have something to clear.
- **Phase 6 (Client UI)** → after Phase 3 (needs `reminderStatus` in API responses).
- **Phase 7 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, T004 (push rename) and T006 (new pure function) touch different files and have no
dependency on each other or on T003 beyond the shared rename concept:

```text
T003     src/server/email/reminder-notification.ts (rename)
T004 [P] src/server/push/send-reminder-push.ts (same rename, independent file)
T006 [P] src/server/db/repository.ts — computeDocumentReminderStatus (independent of T003/T004)
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "an owner can see a document's
renewal urgency at a glance" — the visible half of this feature, fully testable via pure-function
unit tests with no Cron/email/push involved yet. User Story 2 (Phase 4) is where the actual
notification delivery — this feature's core point per spec.md's own priority ordering — lands,
reusing the existing sweep/escalation/delivery machinery almost line-for-line. User Story 3
(Phase 5) is the smallest phase (one `repository.ts` change) but closes a real, spec'd gap
(spec.md Edge Cases: a renewed document must not stay silently suppressed).
