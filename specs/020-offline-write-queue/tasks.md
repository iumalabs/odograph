# Tasks: Offline Write Queue

**Input**: Design documents from `/specs/020-offline-write-queue/` **Prerequisites**: plan.md,
spec.md, data-model.md, research.md, quickstart.md

**Tests**: Server-side idempotency logic gets real `deno task test` coverage (T006) — unlike
specs/018/019, this feature has genuinely testable server behavior. The client queue engine
(IndexedDB, drain loop, `navigator.onLine`) has no equivalent under `vitest`/`workerd` and is
verified live via quickstart.md. Automated e2e coverage is out of scope (owned by a separate QA
process, not touched here).

**Size note**: this is the largest feature built under this workflow so far — plan.md's Constitution
Check explicitly notes the size is managed through this phase/user-story slicing, not through a
constitution exception. Read the whole list before starting; Foundational alone is substantial.

## Phase 1: Setup

- [X] T001 Add `idb` to `deno.json`'s `imports` (`npm:idb@^8`), run `deno install` to resolve it

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 [P] Create `migrations/0013_idempotency_keys.sql`: `write_operations` table per
      data-model.md (`tenant_id`, `idempotency_key`, `method`, `path`, `status_code`,
      `response_body`, `created_at`; primary key `(tenant_id, idempotency_key)`,
      `tenant_id ... ON DELETE CASCADE`)
- [X] T003 [P] Create `src/server/middleware/idempotency.ts`: reads the `Idempotency-Key` header; if
      a matching `(tenant_id, key)` row exists, returns the stored `status_code`/`response_body`
      verbatim without calling `next()`; otherwise calls `next()`, then persists the handler's actual
      response before returning it. No-op (today's exact behavior) when the header is absent
      (research.md: keeps existing API-token callers, specs/017, unaffected)
- [X] T004 Extend `src/server/db/repository.ts`: `createVehicle`, `createServiceRecord`,
      `createFuelRecord`, `createReminderRule` each accept an optional `id` parameter, used as the
      new row's id when present (and a syntactically valid UUID) instead of
      `crypto.randomUUID()`; behavior is unchanged when absent
- [X] T005 Wire the idempotency middleware (T003) onto: `src/server/routes/v1/vehicles.ts`'s
      create-vehicle route and its nested create-service-record/create-fuel-record/
      create-reminder-rule routes (passing a client-supplied body `id` through to T004's repository
      functions on all four); `src/server/routes/v1/service-records.ts`'s update/delete/
      dismiss-duplicate routes; `src/server/routes/v1/fuel-records.ts`'s update/delete/
      dismiss-duplicate routes; `src/server/routes/v1/reminder-rules.ts`'s delete/mark-done routes
- [X] T006 [P] `tests/server/idempotency.test.ts`: replaying the same `Idempotency-Key` returns the
      original stored response without re-executing the handler (assert no second row is created);
      the same key under a *different* tenant is not short-circuited; a client-supplied `id` on
      create is honored; a request with no `Idempotency-Key` header behaves exactly as it did before
      this feature (regression)
- [X] T007 [P] Create `src/client/offline/types.ts`: `PendingAction` type and its unions
      (`entity`, `actionType`, `status`) per data-model.md
- [X] T008 [P] Create `src/client/offline/db.ts`: `idb`-based wrapper opening the
      `odograph-offline-queue` IndexedDB database and its `pendingActions` object store per
      data-model.md
- [X] T009 [P] Create `src/client/offline/network-status.ts`: subscribable online/offline state from
      `navigator.onLine` plus `online`/`offline` window events (research.md: used only as a trigger
      to attempt a drain, never as proof a request will succeed)
- [X] T010 Create `src/client/offline/queue.ts`: `enqueue()` (assigns a UUID + monotonic `sequence`,
      persists via T008, updates an in-memory mirror, triggers a drain attempt); `init()` (loads
      persisted actions from IndexedDB into the mirror at startup and resumes draining if online);
      `subscribe()`/`getSnapshot()` (for `useSyncExternalStore`); a single-flight drain loop that
      processes actions strictly in `sequence` order, marking an action `"syncing"` before its
      request goes out and only removing it from the store on a confirmed `2xx` (so an interrupted
      request leaves it safely `"pending"`/`"syncing"` for the next drain attempt, never lost or
      double-applied) — for now, treat every non-2xx/network failure identically (fixed backoff,
      retry the same action); refined into the full four-case handling in US3 (T023)
- [X] T011 Call `queue.init()` once at startup in `src/client/main.tsx`

**Checkpoint**: The idempotency contract and the queue engine both exist and are exercised by T006's
tests, but nothing in the app calls either of them yet.

---

## Phase 3: User Story 1 - Log a record with no signal (P1) 🎯 MVP

**Goal**: Creating or editing a vehicle/service record/fuel record/reminder while offline saves
locally right away, shows as pending, and syncs automatically once connectivity returns.

- [X] T012 [US1] Extend `src/client/vehicles.ts`'s `createVehicle` to call `queue.enqueue()`
      (entity `"vehicle"`, actionType `"create"`) instead of `fetch` directly
- [X] T013 [P] [US1] Extend `src/client/service-records.ts`: `createServiceRecord`,
      `updateServiceRecord`, `deleteServiceRecord`, `dismissDuplicate` all route through
      `queue.enqueue()`
- [X] T014 [P] [US1] Extend `src/client/fuel-records.ts`: the same four functions
- [X] T015 [P] [US1] Extend `src/client/reminder-rules.ts`: `createReminderRule`,
      `deleteReminderRule`, `markDone` route through `queue.enqueue()`
- [X] T016 [US1] Create `src/client/offline/merge.ts`: given a server-fetched list and the current
      queue snapshot for an entity type, returns the list with pending-or-rejected creates appended,
      pending-or-rejected edits overlaid, pending deletes removed, each tagged with a `syncStatus`
      (`"pending"` or `"rejected"` — a rejected create/edit MUST still render, per FR-013's
      "user's original input remains available to see," not disappear once US3 (T023) starts
      marking actions rejected instead of only ever pending)
- [X] T017 [US1] Wire `src/client/App.tsx`: subscribe to `queue.subscribe()`, pass
      `serviceRecords`/`fuelRecords`/`reminderRules`/`vehicles` through `merge.ts` before rendering
- [X] T018 [US1] Add `pendingLabel` to `src/client/i18n/strings.ts`; add a small "pending" marker
      (mirroring the existing "possible duplicate" badge styling) to `ServiceRecordPanel.tsx`,
      `FuelRecordPanel.tsx`, `ReminderRulePanel.tsx`, and `Garage.tsx` for items whose `syncStatus`
      is `"pending"`
- [X] T019 [US1] Create `src/client/components/SyncStatusIndicator.tsx` (pending count only for
      now) and mount it in `AppShell`/`App.tsx`
- [ ] T020 [US1] Live-verify (quickstart.md steps 1-2): offline-created service and fuel records
      appear immediately marked pending; reconnecting syncs both automatically with no manual step,
      and the pending marker clears

**Checkpoint**: The core promise of this feature — nothing is lost or blocked by having no signal —
works end to end for the happy path (SC-001). This is the MVP.

---

## Phase 4: User Story 2 - Nothing gets lost or reordered (P2)

**Goal**: Confirm the ordering and durability guarantees Phase 2's queue design already provides
(IndexedDB persistence + single global FIFO drain) actually hold across a restart and an interrupted
sync — no new implementation, only verification, same precedent as specs/018's User Story 2.

- [ ] T021 [US2] Live-verify (quickstart.md step 3): offline create-then-edit-then-delete sequence
      for the same vehicle survives a page reload while still offline (all three still pending, same
      order), and applies correctly once reconnected
- [ ] T022 [US2] Live-verify (quickstart.md step 4): toggling offline/online mid-drain doesn't
      duplicate or skip any queued action

**Checkpoint**: SC-002 and SC-003 are confirmed live, not just designed — T010's interrupted-request
handling and T011's startup hydration are proven to actually deliver what they were built for.

---

## Phase 5: User Story 3 - A rejected write is never invisible (P3)

**Goal**: A write the server actually rejects (not a transient failure) is clearly marked as needing
attention, doesn't block the rest of the queue, and a dead session pauses syncing with a clear
prompt instead of looking like a wave of individual rejections.

- [X] T023 [US3] Extend `queue.ts`'s drain loop (T010) to the full four-case handling from
      research.md: `2xx` unchanged; `401` pauses the whole queue and exposes a "needs reauth" state
      without marking any action rejected; `429` waits for the response's `Retry-After` and retries
      the same action; any other `4xx` marks *that* action `"rejected"` with the response body as
      `rejectReason` and continues draining the next one
- [X] T024 [US3] Add `rejectedLabel`, `syncNeedsReauthLabel`, `offlineIndicatorLabel` to
      `src/client/i18n/strings.ts`
- [X] T025 [US3] Extend `ServiceRecordPanel.tsx`, `FuelRecordPanel.tsx`, `ReminderRulePanel.tsx`,
      `Garage.tsx`'s pending markers (T018) to also show a distinct "rejected" marker (surfacing
      `rejectReason`, e.g. via a title attribute) for items whose `syncStatus` is `"rejected"`
- [X] T026 [US3] Extend `SyncStatusIndicator.tsx` (T019): add a rejected count, an offline-state
      display (FR-003), and a distinct "sign in again to sync" state when the queue is paused on a
      401 (T023)
- [ ] T027 [US3] Live-verify (quickstart.md step 5): a queued edit whose target record was deleted
      elsewhere before it synced is shown rejected (not silently dropped, not shown as succeeded),
      and any *other* pending actions queued alongside it still sync normally
- [ ] T028 [US3] Live-verify (quickstart.md step 6): a backlog of 30+ queued actions completes in
      full once reconnected despite hitting the app's 30-requests/60s rate limit partway through
- [ ] T029 [US3] Live-verify (quickstart.md step 7): an expired session with a pending action queued
      shows the distinct "sign in again" state, not an individually-rejected action

**Checkpoint**: SC-004 and SC-005 are confirmed live. Every functional requirement in spec.md now has
working, verified behavior behind it.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T030 Run `deno task check` (fmt, lint, typecheck, full test suite including T006's new
      idempotency tests, repository-boundary guard) and fix any failures across all files touched by
      this feature
- [ ] T031 [P] Live-verify (quickstart.md step 8): the at-a-glance indicator (FR-003/FR-012) shows
      both offline state and pending/rejected count without needing to open any per-record detail
- [ ] T032 [P] Live-verify (quickstart.md step 9): attachment upload (issue #19) is unaffected by
      this feature and still requires being online
- [ ] T033 [P] Regression check: mutations behave identically, with no added perceptible delay, when
      the device is online the whole time — routing every mutation through the queue must not turn a
      normal online save into a visibly slower one

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: `idb` must be installed before `offline/db.ts`
  can import from it.
- **Phase 2 (Foundational)** → **User Story 1 (Phase 3)**: nothing can enqueue or display a pending
  action before the idempotency contract and the queue engine both exist.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: strict at the verification level, same
  pattern as specs/018 — Phase 4 verifies guarantees Phase 2/3's implementation already provides;
  there is no separate implementation phase for User Story 2.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: US3 replaces Phase 2's placeholder
  single-branch failure handling with the real four-case logic and adds rejection-specific UI on top
  of the pending-marker UI Phase 3 already built — it needs Phase 3's markers and indicator to exist
  first, even though its own new code (T023-T026) touches different specific branches/states within
  those same files.
- **Phase 6 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, most of the new files have no dependency on each other:

```text
T002 [P] migrations/0013_idempotency_keys.sql
T003 [P] src/server/middleware/idempotency.ts
T006 [P] tests/server/idempotency.test.ts (once T002-T005 land)
T007 [P] src/client/offline/types.ts
T008 [P] src/client/offline/db.ts
T009 [P] src/client/offline/network-status.ts
```

(T004 and T005 depend on T003 existing; T010 depends on T007-T009; sequenced after.)

Within Phase 3, the three record-type mutation modules are independent of each other:

```text
T013 [P] [US1] src/client/service-records.ts
T014 [P] [US1] src/client/fuel-records.ts
T015 [P] [US1] src/client/reminder-rules.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** A working, ordered, durable offline queue for
the happy path — create/edit while offline, see it pending, watch it sync automatically — already
delivers this feature's core promise (SC-001) for every covered mutation. User Story 2 adds no new
implementation, only live verification that the durability/ordering guarantees Phase 2 built in
actually hold (same precedent as specs/018-pwa-installability's own User Story 2). User Story 3 is
the resilience layer on top: without it the queue still works for the common case, but a genuine
rejection or a dead session would be handled by Phase 2's placeholder generic-retry logic instead of
being surfaced correctly — worth shipping in the same PR (this feature's whole reason for existing
is constitution Principle III, which User Story 3 is what actually satisfies), but structured so a
reviewer can evaluate it as a distinct, later increment on a working base rather than one
undifferentiated diff.
