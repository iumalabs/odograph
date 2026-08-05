---

description: "Task list for Email Reminder Delivery"

---

# Tasks: Email Reminder Delivery

**Input**: Design documents from `/specs/012-email-reminder-delivery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/internal.md, quickstart.md

**Tests**: Included — this project's established convention (specs 006-011) is to cover new
repository/sweep behavior with `deno task test`, and this feature's spec.md leans on exact
notify/don't-notify counts as its acceptance criteria, which are only verifiable via tests.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent verification of
each story's acceptance scenarios. This feature adds no HTTP route and no client UI — Foundational
implements the complete send/track mechanism in one pass (matching spec 011's precedent of putting
the shared pure-computation core in Foundational), and each User Story phase adds the tests that
specifically prove that story's acceptance scenarios against the already-built mechanism.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Phase 1: Setup

**Purpose**: New column this feature needs, applied locally so every later task can rely on it.

- [ ] T001 Create `migrations/0011_reminder_notifications.sql` adding `last_notified_severity TEXT`
      (nullable) to `reminder_rules` (data-model.md). Apply locally:
      `wrangler d1 migrations apply odograph-preview --local`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The complete notify/track mechanism — every user story's acceptance scenarios are
different assertions against this same code path, so it's built once, here.

**⚠️ CRITICAL**: No user story task can be verified until this phase is complete.

- [ ] T002 [P] Add `isPlaceholderEmail(email: string): boolean` to `src/server/db/repository.ts` —
      pure helper, `true` iff `email` ends with `@example.invalid` (contracts/internal.md; matches
      `src/server/routes/v1/auth/passkey.ts`'s placeholder generation exactly — comment the link
      between the two so a future rename of one doesn't silently desync from the other).
- [ ] T003 [P] Add `findDeliverableReminderRecipient(db, tenantId): Promise<string | null>` to
      `src/server/db/repository.ts` (research.md Decision 3): return the tenant's `users.email` if
      not a placeholder; else the first `magic_link_identities.email` linked to that user's id; else
      `null`. Never throws.
- [ ] T004 [P] Create `src/server/email/reminder-notification.ts` with `sendReminderDueEmail(env,
      input: { to, vehicleName, ruleLabel, status })` (contracts/internal.md) — mirrors
      `sendMagicLinkEmail()`'s exact shape (`FROM_ADDRESS = "auth@odograph.dev"`, plain
      string-interpolated `text`/`html`, `try`/`catch` returning `{ sent: true } | { sent: false;
      error }`, never throws).
- [ ] T005 Extend `ReminderRule`'s type and `evaluateAllReminders` in
      `src/server/db/repository.ts` (data-model.md): add `lastNotifiedSeverity` to the type and its
      column mapping; inside the existing per-row `try`/`catch`, after computing `status`: reset
      `last_notified_severity` to `NULL` when `status` is `"on_track"`; when `status` is
      `"coming_up"`/`"overdue"` and more severe than the stored value (via the existing
      `REMINDER_URGENCY` map, treating `NULL` as `on_track`), call
      `findDeliverableReminderRecipient` and, if a recipient is found, `sendReminderDueEmail`: on a
      successful send, set `last_notified_severity` to the new `status` and increment `notified`;
      on `{ sent: false }`, leave `last_notified_severity` untouched and increment `failed` instead
      (same counter spec 011 uses for a row that "didn't complete as intended," now also covering a
      genuine send failure, not just an evaluation error); if no recipient is found (placeholder
      address), leave `last_notified_severity` untouched and increment neither counter — this is an
      expected no-attempt outcome, not a failure. Do nothing for `"not_enough_data"`. Extend the
      return type from `{ evaluated, failed }` to `{ evaluated, failed, notified }`.

**Checkpoint**: The full notify/track mechanism exists and compiles; every user story below is now
just test coverage proving a specific slice of this same code path.

---

## Phase 3: User Story 1 - Owner is emailed when a reminder first becomes due (Priority: P1) 🎯 MVP

**Goal**: Confirm the core "escalate → notify" path works for both escalation points and correctly
excludes "not enough data."

**Independent Test**: Drive a reminder rule's status to "coming up" then run the sweep; separately,
drive one to "overdue"; separately, drive one to "not enough data" — assert on
`last_notified_severity` per row per data-model.md, and on a before/after delta of the sweep's
`notified` count (never an exact absolute value — see the note on shared test-file storage below).

> **⚠️ Test-fixture note (required for every test in US1-US3)**: `tests/server/
> reminder-rules.test.ts`'s existing `createSession()` helper calls `POST /_dev/session` with no
> body, which (per `src/server/auth/dev-session.ts`) defaults the session's email to a
> `@example.invalid` placeholder — exactly what `isPlaceholderEmail`/
> `findDeliverableReminderRecipient` (T002/T003) are built to skip. Every test below MUST create
> its own session with an explicit, non-placeholder email instead (the route already accepts one):
> `SELF.fetch(".../_dev/session", { method: "POST", headers: {"Content-Type":"application/json"},
> body: JSON.stringify({ email: `owner-${crypto.randomUUID()}@example.com` }) })`. Reusing the
> shared no-body `createSession()`/`sharedCookie` pattern here would silently exercise the
> *skip* path instead of the *send* path and produce a false-green test — reserve the no-body
> default specifically for User Story 4 (T013), where the placeholder is the desired setup.
>
> Also, because D1 storage in `@cloudflare/vitest-pool-workers` is isolated per test *file*, not
> per `it()` (documented in `tests/server/magic-link-auth.test.ts`, and already hit once in spec
> 011's own scheduled-sweep test), do not assert an exact absolute value for the sweep-wide
> `notified`/`failed` counts — read them before and after the action under test and assert on the
> delta, or rely solely on the row's own `last_notified_severity` via a direct `env.DB` query.

### Tests for User Story 1

- [ ] T006 [P] [US1] In `tests/server/reminder-rules.test.ts`'s scheduled-sweep section, using a
      session created with an explicit non-placeholder email (see note above): a reminder whose
      status computes to `"coming_up"` on the sweep gets `last_notified_severity` set to
      `"coming_up"`, and the sweep's `notified` count increases by exactly 1 for this action.
- [ ] T007 [P] [US1] Same file, same fixture note: a reminder whose status computes to `"overdue"`
      (starting from `last_notified_severity: NULL`) gets `last_notified_severity` set to
      `"overdue"` directly (no intermediate `"coming_up"` email required first — FR-002 doesn't
      require passing through every lesser severity).
- [ ] T008 [P] [US1] Same file, same fixture note: a reminder whose status is `"not_enough_data"`
      never gets `last_notified_severity` set and does not contribute to the sweep's `notified`
      delta (FR-004).

**Checkpoint**: User Story 1's acceptance scenarios are verified; a reminder is notified exactly
once per escalation and never for "not enough data."

---

## Phase 4: User Story 2 - Owner is not spammed while a reminder stays overdue (Priority: P1)

**Goal**: Confirm repeated sweeps with no status change produce no further notification.

**Independent Test**: Run the sweep twice over the same unchanged "overdue" reminder and confirm
only the first run notified; same for "coming up."

### Tests for User Story 2

- [ ] T009 [P] [US2] In `tests/server/reminder-rules.test.ts`, using a session with an explicit
      non-placeholder email (same fixture note as US1): a reminder already at
      `last_notified_severity: "overdue"` produces no change to `last_notified_severity` and no
      increase in the sweep's `notified` count on a second sweep run where its status is still
      `"overdue"` (FR-003).
- [ ] T010 [P] [US2] Same file, same fixture note: a reminder already at
      `last_notified_severity: "coming_up"` produces no change and no `notified` increase on a
      second sweep run where its status is still `"coming_up"` (not yet `"overdue"`).

**Checkpoint**: User Stories 1 AND 2 both verified — a reminder notifies on new escalations only,
never on a repeat of the same severity.

---

## Phase 5: User Story 3 - Notifications resume after mark-done and recurrence (Priority: P2)

**Goal**: Confirm `last_notified_severity` resets to `NULL` once a reminder returns to "on track,"
so the next escalation notifies again from scratch.

**Independent Test**: Notify a reminder at "overdue," mark it done (status becomes "on track" or
"not enough data" depending on interval type), drive it back to "coming up," and confirm a second
notification fires.

### Tests for User Story 3

- [ ] T011 [US3] In `tests/server/reminder-rules.test.ts`, using a session with an explicit
      non-placeholder email (same fixture note as US1): a reminder with
      `last_notified_severity: "overdue"` whose status is recomputed as `"on_track"` (e.g. after
      `markReminderRuleDone`) has `last_notified_severity` reset to `NULL` on the next sweep.
- [ ] T012 [US3] Same file, same fixture note, continuing T011's scenario: once that same
      reminder's status later recomputes to `"coming_up"` again, it notifies again
      (`last_notified_severity` becomes `"coming_up"`, and the sweep's `notified` count increases by
      1 for this action) — proving FR-005 end-to-end, not just the reset step in isolation.

**Checkpoint**: All three of US1-US3 verified — the full notify → suppress-repeat → reset →
notify-again lifecycle works.

---

## Phase 6: User Story 4 - Owners without a real email are silently skipped (Priority: P3)

**Goal**: Confirm placeholder-only accounts never error, never block the rest of the sweep, and
remain eligible for notification once a real email is linked.

**Independent Test**: Create a reminder for an account whose only email is a placeholder, drive it
to "overdue," run the sweep, and confirm no error, `last_notified_severity` unchanged, and other
reminders in the same sweep still notified normally; then link a real magic-link identity to that
same account and confirm the next sweep does notify.

### Tests for User Story 4

- [ ] T013 [P] [US4] In `tests/server/reminder-rules.test.ts`, using the existing no-body
      `createSession()` helper (its default placeholder email is exactly the desired setup here,
      unlike US1-US3): a reminder rule owned by an account whose `users.email` is a placeholder and
      has no linked `magic_link_identities` row — driven to `"overdue"` — leaves
      `last_notified_severity` at `NULL`, does not increase the sweep's `notified` count, and the
      sweep raises no error (FR-008).
- [ ] T014 [US4] Same file: in the same sweep run as T013, a second, unrelated reminder belonging to
      a different tenant created with an explicit non-placeholder email (US1's fixture note) still
      notifies normally — proving the placeholder skip doesn't block the rest of the sweep (FR-010,
      same per-row isolation spec 011 already established for evaluation failures).
- [ ] T015 [US4] Same file: after linking a real `magic_link_identities` row to the T013 account
      (via `linkMagicLinkIdentity`), while that same reminder is still `"overdue"`, the next sweep
      run does notify (`last_notified_severity` becomes `"overdue"`) — proving FR-009's "a
      placeholder skip does not permanently suppress" requirement, not just the skip itself.
- [ ] T016 [US4] Same file: simulate a genuine (non-placeholder-related) send failure — e.g. a
      recipient resolved successfully but `sendReminderDueEmail` returns `{ sent: false, error }`
      (mockable at the module boundary, or by pointing `to` at a value the test `env.EMAIL` binding
      rejects) — and confirm the sweep's `failed` count increases by 1 for that row (not
      `notified`), `last_notified_severity` is left unchanged (so it retries the next day), and
      every other row in the same sweep still evaluates and notifies normally (FR-010's genuine
      failure case, distinct from T013's no-attempt skip case — see plan.md's Constitution Check
      /research.md for why these are different code paths).

**Checkpoint**: All four user stories verified independently.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T017 [P] Update `src/server/db/schema.sql` reference copy with `reminder_rules`'s new
      `last_notified_severity` column.
- [ ] T018 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [ ] T019 Walk through quickstart.md end-to-end: apply the migration locally, confirm the column
      exists via `PRAGMA table_info`, and confirm via direct D1 query that a manually-driven
      `evaluateAllReminders` run updates `last_notified_severity` as expected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (needs the new column) — BLOCKS every user story.
- **User Stories (Phase 3-6)**: All depend on Foundational; independent of each other (each is a
  distinct set of assertions against the same already-built mechanism, not new implementation), so
  they can be done in any order or in parallel.
- **Polish (Phase 7)**: Depends on all four user stories being verified.

### Within Each User Story

- Tests are the entire content of every story phase in this feature (Foundational already holds
  all the implementation) — there is no separate "write test, watch it fail, then implement" step
  per story, since the mechanism under test was built once in Phase 2.

### Parallel Opportunities

- T002, T003, T004 (Foundational) touch different files/functions and can run in parallel; T005
  depends on T002-T004 existing (it calls both).
- T006-T008 (US1), T009-T010 (US2), T013 (US4) are marked [P] — independent assertions in the same
  test file's already-established multi-`it()` pattern, safe to write concurrently since D1 storage
  in `@cloudflare/vitest-pool-workers` is isolated per test file, and each `it()` creates its own
  fresh tenant/vehicle/rule (spec 011's established pattern).
- T011-T012 (US3) and T014-T015 (US4) are sequential within their own story (each builds on the
  previous test's setup) but independent of every other story's tasks.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration).
2. Complete Phase 2: Foundational (the entire notify/track mechanism — this is the bulk of the
   real implementation work in this feature).
3. Complete Phase 3: User Story 1 tests.
4. **STOP and VALIDATE**: `deno task test tests/server/reminder-rules.test.ts` passes for the new
   escalation assertions.
5. Continue through US2-US4 — each is pure test coverage against the same Foundational mechanism,
   so there's no meaningful "partial" deployment risk in doing all four before opening the PR.

### Incremental Delivery

Given how small and cohesive this feature is (one migration, one extended sweep function, one new
email helper, no route, no UI), all seven phases are intended to land in a single PR — consistent
with the constitution's slicing guidance ("features MUST be sliced small enough that a single
`/speckit-implement` run produces one reviewable pull request").

---

## Notes

- [P] tasks = different files or independent assertions, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Commit after each phase (Setup, Foundational, each User Story, Polish), matching the granularity
  established in specs 009-011.
- No client UI, no new HTTP route — this feature's entire surface is `repository.ts`'s existing
  scheduled sweep plus one new email-sending module.
