# Tasks: Web Push Reminder Delivery

**Input**: Design documents from `/specs/022-web-push-reminders/` **Prerequisites**: plan.md,
spec.md, data-model.md, research.md, quickstart.md

**Tests**: Server-side subscribe/unsubscribe/list and the extended `evaluateAllReminders` dedup
logic get real `deno task test` coverage — ordinary, fully-testable Worker/D1 behavior. The actual
outbound push send (a real call to a real push service) and the client-side subscribe/service-worker
flow have no equivalent under `vitest`/`workerd` and are verified live via quickstart.md, same
precedent as specs/012's own email send and specs/018-021's client-only pieces.

## Phase 1: Setup

- [X] T001 Add `web-push-browser` to `deno.json`'s `imports` (`npm:web-push-browser@^1.4.2`), run
      `deno install` to resolve it

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 [P] Create `migrations/0014_push_subscriptions.sql`: `push_subscriptions` table per
      data-model.md (`id`, `tenant_id ... ON DELETE CASCADE`, `endpoint`, `p256dh`, `auth`,
      `created_at`; unique on `(tenant_id, endpoint)`)
- [X] T003 [P] Extend `src/server/types.ts`: add a `VapidSecrets` type
      (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY: string`) to `AppEnv["Bindings"]`, mirroring
      `GoogleOidcSecrets`'s existing pattern
- [X] T004 Extend `src/server/db/repository.ts`: `listPushSubscriptions(db, tenantId)`,
      `createOrUpdatePushSubscription(db, tenantId, {endpoint, p256dh, auth})` (upsert on
      `(tenant_id, endpoint)`), `deletePushSubscriptionByEndpoint(db, tenantId, endpoint)`,
      `deletePushSubscriptionById(db, id)` (used by the sweep to prune an expired one)
- [X] T005 [P] Create `src/server/push/send-reminder-push.ts`: `sendReminderPushNotification(vapid,
      subscription, payload)` wrapping `web-push-browser`'s send call — never throws (mirrors
      `email/reminder-notification.ts`'s exact contract), resolves to
      `{sent: true} | {sent: false, expired: boolean, error: string}` (`expired: true` on a
      `404`/`410` response from the push service, research.md)
- [X] T006 Create `src/server/routes/v1/push.ts`: `GET /vapid-public-key` (session-only, no rate
      limit, returns `{publicKey}`), `POST /subscriptions` (session-only, `rateLimitBySession`,
      validates `endpoint`/`keys.p256dh`/`keys.auth`, upserts via T004), `DELETE /subscriptions`
      (session-only, `rateLimitBySession`, idempotent) — mounted under `/api/v1/push`
- [X] T007 [P] `tests/server/push-subscriptions.test.ts`: subscribing stores a row and re-subscribing
      the same endpoint upserts rather than duplicating; unsubscribing removes it and is idempotent
      on a second call; a malformed subscription body is rejected with `400` and nothing is stored;
      a different tenant's subscriptions are never visible to or deletable by another tenant;
      `vapid-public-key` requires a session

**Checkpoint**: The subscription CRUD contract exists and is tested, but nothing sends a push
notification yet.

---

## Phase 3: User Story 1 - Get notified without having the app open (P1) 🎯 MVP

**Goal**: An opted-in device receives a push notification the first time a reminder reaches "coming
up" or "overdue," via the same daily sweep and escalation gate email already uses, and selecting the
notification opens the app.

- [X] T008 [US1] Extend `evaluateAllReminders` (`src/server/db/repository.ts`): alongside the
      existing email send, fetch the tenant's push subscriptions (T004) and attempt
      `sendReminderPushNotification` (T005) to each; `last_notified_severity` advances if *either*
      channel succeeds, not per-channel (research.md); on an `expired: true` result, delete that
      subscription (T004) — all still inside the existing per-row `try/catch`, one subscription's
      failure never blocks email or another subscription
- [X] T009 [US1] Extend the reminder-evaluation test suite: a due reminder with an opted-in
      subscription sends both email and push on the same sweep; a dead subscription (mocked
      `404`/`410`) is removed without failing the sweep or blocking the email send; a subsequent
      sweep with nothing changed sends neither channel again (shared dedup gate)
- [X] T010 [US1] Extend `src/client/sw.ts`: a `push` listener parses the JSON payload and calls
      `self.registration.showNotification(title, {body})`; a `notificationclick` listener closes the
      notification and opens/focuses the app — neither touches the `fetch` path `sw.ts`'s own
      precache-only design deliberately avoids (specs/018)
- [X] T011 [US1] Create `src/client/push.ts`: `isPushSupported()`, `subscribeToPush()` (fetches the
      VAPID public key, calls `registration.pushManager.subscribe`, `POST`s the resulting
      `PushSubscriptionJSON` to `/api/v1/push/subscriptions`) — surfaces a distinct
      permission-denied outcome rather than throwing generically (FR-003)
- [X] T012 [US1] Create `src/client/components/PushNotifications.tsx`: an opt-in toggle mirroring
      `ApiTokens.tsx`'s shape/placement/styling, showing enabled/disabled/unavailable state
- [X] T013 [US1] Add push-related strings to `src/client/i18n/strings.ts`; mount
      `PushNotifications` in `src/client/App.tsx` alongside `ApiTokens`/`AccountDeletion`
- [ ] T014 [US1] Live-verify (quickstart.md steps 1-5): opt-in prompts for permission and registers;
      denied permission is shown clearly, not silently treated as enabled; a due reminder produces a
      push notification with the app closed; clicking it opens the app; a repeat sweep with nothing
      changed sends no duplicate

**Checkpoint**: The core promise of this feature works end to end for a single device (SC-001,
SC-004). This is the MVP.

---

## Phase 4: User Story 2 - Turn it back off (P2)

**Goal**: A user can disable push on a device and stop receiving notifications there, without
affecting email or any other device.

- [X] T015 [US2] Extend `src/client/push.ts`/`PushNotifications.tsx`: an "unsubscribe" action that
      calls the browser's `PushSubscription.unsubscribe()` and `DELETE /api/v1/push/subscriptions`
      with the same endpoint, then reflects the toggle back to "disabled"
- [ ] T016 [US2] Live-verify (quickstart.md step 7): disabling stops delivery to that device on the
      next sweep while email and any other opted-in device are unaffected

**Checkpoint**: Push is a real, reversible opt-in, not a one-way commitment (SC-003).

---

## Phase 5: User Story 3 - Enabled on more than one device (P3)

**Goal**: Confirm the per-subscription loop Phase 3 already implements naturally extends to more
than one device — no new implementation, only verification, same precedent as several earlier
features' later stories (e.g. specs/018's User Story 2).

- [ ] T017 [US3] Live-verify (quickstart.md step 6): opting in from two devices for the same account
      and triggering a due reminder notifies both; disabling one afterward doesn't affect the other

**Checkpoint**: SC-002 confirmed live — the per-subscription loop from T008 was never single-device
in the first place, this just proves it.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T019 [P] Live-verify (quickstart.md step 8): a dead subscription is pruned on its next sweep
      without erroring, and re-opting-in afterward produces a fresh row rather than a duplicate
- [ ] T020 [P] Regression: confirm existing email reminder delivery (specs/012) is unaffected —
      full existing test suite passes, and a live sweep still sends email exactly as before for a
      user with no push subscriptions
- [ ] T021 [P] Confirm quickstart.md's one-time VAPID key setup steps are accurate by actually
      generating a keypair and setting it via `wrangler secret put` for the preview environment

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: `web-push-browser` must be installed before
  `send-reminder-push.ts` can import from it.
- **Phase 2 (Foundational)** → **User Story 1 (Phase 3)**: the subscription CRUD contract and the
  push-send helper must exist before the sweep can use them, and before there's anything for the
  client to subscribe to.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: disabling needs an existing subscription
  (and the toggle UI) to disable.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: strict at the verification level, same
  pattern as specs/018/020's own later stories — T008's per-subscription loop already handles
  multiple devices; Phase 5 only proves it live.
- **Phase 6 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, most tasks touch different files with no dependency on each other:

```text
T002 [P] migrations/0014_push_subscriptions.sql
T003 [P] src/server/types.ts
T005 [P] src/server/push/send-reminder-push.ts
T007 [P] tests/server/push-subscriptions.test.ts (once T004/T006 land)
```

(T004 and T006 depend on T002/T003 existing; sequenced after.)

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** A single opted-in device receiving push
notifications for its due reminders, alongside the existing email channel, already delivers this
feature's entire reason for existing — the last item in D-002's locked v1 reminder-channel decision.
User Story 2 (opt-out) and User Story 3 (multi-device, verification-only) round out the guarantees a
real opt-in needs but don't change the core mechanism Phase 3 already ships.
