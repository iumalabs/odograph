# Tasks: Sync Rejection Review Screen

**Input**: Design documents from `/specs/021-sync-rejection-review/` **Prerequisites**: plan.md,
spec.md, data-model.md, research.md, quickstart.md

**Tests**: No new `deno task test` coverage — this feature has no server-side behavior (see plan.md
Testing section); correctness rests on #20's existing `tests/server/idempotency.test.ts` plus live
verification per quickstart.md.

## Phase 1: Setup

No setup tasks — no new dependency, no scaffolding.

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T001 [P] Create `src/client/offline/describe-action.ts`: given a `PendingAction`, returns a
      plain-language "what was attempted" string (entity + action type + a recognizable field from
      `body` where one exists — description/fuelDate/label/name; nothing extra for
      delete/dismissDuplicate/markDone, which act on an id rather than a fresh payload)
- [ ] T002 [P] Create `src/client/offline/reject-reason.ts`: formats a stored `rejectReason` for
      display — recognizes `{"error":"invalid_request"}`-shaped JSON and maps it to a friendlier
      phrase, falls back to the raw stored text otherwise (e.g. Hono's default plain-text 404 body)
- [ ] T003 [P] Add `AlertIcon` to `src/client/design/icons.tsx`, hand-rolled to the file's existing
      icon spec since it isn't in the mockup's icon sheet (matching `CameraIcon`'s precedent)
- [ ] T004 [P] Add to `src/client/i18n/strings.ts`: nav label, review-screen heading, empty-state
      message, a label per entity type (vehicle/service record/fuel record/reminder) and per action
      type (create/edit/delete/dismiss duplicate/mark done), `discardAction`, `retryAction`,
      `rejectReasonLabel`

**Checkpoint**: The description/reason formatting and the vocabulary the screen needs both exist,
but nothing renders them yet.

---

## Phase 3: User Story 1 - Find out what needs attention, in one place (P1) 🎯 MVP

**Goal**: A dedicated screen lists every currently-rejected action across all vehicles, each with a
recognizable description and the rejection reason; reachable in one click from anywhere, with an
at-a-glance signal when something's there.

- [ ] T005 [US1] Extend `src/client/components/AppShell.tsx`: add a `"review"` value to `AppView`
      and a corresponding nav-rail entry (`AlertIcon` + new nav label)
- [ ] T006 [US1] Create `src/client/components/SyncReviewScreen.tsx`: given the queue snapshot,
      lists every action with `status === "rejected"` (across all vehicles — no `vehicleId`
      filtering), each row showing `describe-action.ts`'s description and `reject-reason.ts`'s
      formatted reason; a clear empty-state message when there are none (FR-009); no action buttons
      yet (US2/US3)
- [ ] T007 [US1] Extend `src/client/components/SyncStatusIndicator.tsx`: the rejected-count badge
      becomes clickable (a new `onOpenReview` prop), navigating to the `"review"` view instead of
      being purely informational
- [ ] T008 [US1] Wire `src/client/App.tsx`: new `"review"` view branch rendering
      `SyncReviewScreen` with the current queue snapshot; pass the navigation handler through to
      `SyncStatusIndicator`
- [ ] T009 [US1] Live-verify (quickstart.md steps 1-4): a rejection is discoverable at a glance and
      reachable in one click; rejections from a non-selected vehicle still show up; the empty state
      reads clearly when nothing is rejected

**Checkpoint**: Constitution Principle III's "surface in a user-facing review screen" clause is now
satisfied — every rejection is visible in one place, even before Discard/Retry exist (SC-001).

---

## Phase 4: User Story 2 - Discard a rejected action (P2)

**Goal**: A rejected action the user no longer wants to pursue can be cleanly abandoned from the
review screen.

- [ ] T010 [US2] Extend `SyncReviewScreen.tsx`: a "Discard" button per row calling
      `discardRejected(id)` (already exported from `offline/queue.ts` since spec 020, unused until
      now)
- [ ] T011 [US2] Live-verify (quickstart.md step 5): discarding removes the item from the screen and
      leaves its target record exactly as it was before the rejected attempt

**Checkpoint**: A rejection can now be permanently resolved, not just seen (SC-002 partial).

---

## Phase 5: User Story 3 - Retry a rejected action (P2)

**Goal**: A rejected action can be resubmitted unchanged, without the user having to redo it from
scratch.

- [ ] T012 [US3] Add `retryRejected(id)` to `src/client/offline/queue.ts`: transitions the matching
      action back to `"pending"` with `rejectReason` cleared, reusing its existing `id` unchanged
      (research.md — the same id is both the idempotency key and, for creates, the resource id;
      generating a new one would reopen the double-application risk idempotency exists to prevent),
      persists it, and triggers a drain attempt
- [ ] T013 [US3] Extend `SyncReviewScreen.tsx`: a "Retry" button per row calling `retryRejected(id)`
- [ ] T014 [US3] Live-verify (quickstart.md steps 6-7): retrying a rejection whose underlying problem
      is resolved succeeds and clears from the screen; retrying one that isn't resolved is rejected
      again and shows a current (not stale) reason

**Checkpoint**: Every rejection now reaches a deterministic, visible outcome — discarded, retried and
pending, or retried and rejected again (SC-002/SC-004 complete).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T015 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T016 [P] Live-verify (quickstart.md step 8): discard and retry both work while offline (discard
      immediately; retry marks pending and waits for reconnection like any other queued action)
- [ ] T017 [P] Regression check: #20's existing per-record pending/rejected badges (Garage and the
      three record panels) still work unchanged alongside the new global review screen

## Dependencies

- **Phase 2 (Foundational)** → **User Story 1 (Phase 3)**: the description/reason formatting and
  vocabulary must exist before the screen can render anything meaningful.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** and **User Story 3 (Phase 5)**: both need
  the screen and its per-row list to exist before an action button can be added to a row. US2 and
  US3 are independent of each other (different files/functions: `discardRejected` already exists,
  `retryRejected` is new) and can proceed in parallel once Phase 3 is done.
- **Phase 6 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, all four tasks touch different files with no dependency on each other:

```text
T001 [P] src/client/offline/describe-action.ts
T002 [P] src/client/offline/reject-reason.ts
T003 [P] src/client/design/icons.tsx
T004 [P] src/client/i18n/strings.ts
```

Once Phase 3 is done, User Story 2 and User Story 3 can proceed together:

```text
T010-T011 [US2] discard wiring + live-verify
T012-T014 [US3] retryRejected() + retry wiring + live-verify
```

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** A screen that actually lists every rejection in one
place, reachable at a glance, already satisfies constitution Principle III's core requirement — the
one this whole feature exists for. User Story 2 (discard) and User Story 3 (retry) are the
resolution actions layered on top, buildable and shippable independently of each other once the
screen itself exists.
