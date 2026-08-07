# Feature Specification: Offline Write Queue

**Feature Branch**: `020-offline-write-queue`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Offline write queue (issue #20, milestone M7, constitution Principle
III): let users create and edit vehicles, service records, fuel records, and reminders while
offline, with every write queued locally, carrying a client-generated idempotency key, applied in
creation order per vehicle once connectivity returns, and never silently dropped or silently
succeeded if the server rejects it. The full triage/resolution screen for rejected writes is a
separate feature (issue #21) that builds on this one."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Log a record with no signal (Priority: P1)

An owner is in a garage, a parking structure, or anywhere else with no signal, and wants to log a
fuel-up or a service they just had done. They shouldn't have to remember to come back and enter it
later — they enter it now, it appears in their records immediately, and it reaches the server on its
own once they're back in range.

**Why this priority**: This is the entire reason this feature exists. Without it, a user with no
signal either loses the moment (has to remember to redo it later) or the app blocks them entirely —
both defeat the purpose of a maintenance/fuel log that's supposed to be reliable.

**Independent Test**: With the device's network disabled, create a service record and a fuel record
for a vehicle. Confirm both appear in the record list immediately, marked as not yet confirmed by
the server. Re-enable the network and confirm both sync automatically within a short time, with no
action required from the user, and the "not yet confirmed" marking clears.

**Acceptance Scenarios**:

1. **Given** the device has no network connection, **When** the user creates, edits, or deletes a
   service record, fuel record, vehicle, or reminder (or dismisses a possible-duplicate flag, or
   marks a reminder done), **Then** the action is saved locally right away and appears in the UI
   marked as pending, without any error or block.
2. **Given** one or more pending actions exist, **When** the device regains connectivity, **Then**
   the system syncs them automatically, with no manual retry or resubmission needed from the user.
3. **Given** a pending action has successfully synced, **When** the user views that record, **Then**
   its pending marker is gone and it looks identical to a record that was always online.

---

### User Story 2 - Nothing gets lost or reordered (Priority: P1)

An owner logs several things offline in sequence — say, creates a fuel record, then immediately
edits it to fix a typo, then closes the app before getting signal again. When they're back online
later (possibly after restarting the app or the device), every one of those actions is still there
and still applies in the order they made them, not reordered or partially lost.

**Why this priority**: A queue that loses entries when the app closes, or applies edits before the
create they depend on, is worse than not having offline support at all — it would produce silently
wrong records, which directly conflicts with this project's existing commitment to never presenting
invented or corrupted data as fact.

**Independent Test**: Offline, create a fuel record, then edit it, then delete a different, older
service record for the same vehicle — all before reconnecting. Close and reopen the app while still
offline. Reconnect. Confirm all three actions apply in the order they were made (the fuel record
ends up correctly edited, not reverted or duplicated; the service record ends up deleted) and none
were lost by the app restart.

**Acceptance Scenarios**:

1. **Given** multiple pending actions for the same vehicle, **When** they sync, **Then** they are
   applied in the exact order the user originally made them.
2. **Given** pending actions exist and the app is closed (tab closed, browser restarted, device
   restarted) while still offline, **When** the app is reopened, **Then** every pending action is
   still there, still pending, in the same order.
3. **Given** a sync attempt is interrupted partway (e.g. the connection drops mid-sync), **When**
   connectivity returns again, **Then** already-applied actions are not re-applied a second time and
   not-yet-applied actions still sync — nothing is duplicated and nothing is skipped.

---

### User Story 3 - A rejected write is never invisible (Priority: P2)

An owner's queued edit turns out to be invalid by the time it reaches the server (for example, they
tried to edit a record that was deleted from another device in the meantime, or their session
expired after being offline a long time). The user finds out about it — the action is clearly marked
as needing attention, not silently thrown away and not silently shown as if it had succeeded.

**Why this priority**: Silently dropping or silently "succeeding" a rejected write would mean the
user's log quietly diverges from what they actually recorded — exactly the kind of invisible data
loss this project's records exist to prevent. This depends on User Story 1/2's queue existing first;
the full screen for reviewing and resolving these is a separate, later feature (issue #21) — this
story only requires that a rejection is never invisible.

**Independent Test**: Queue an offline edit to a record, then (simulating a conflicting change) have
the record deleted through another session before the edit syncs. Reconnect and confirm the edit is
marked as needing attention rather than disappearing or appearing to have succeeded, and that the
user's original input for that edit is still available to see.

**Acceptance Scenarios**:

1. **Given** a pending action that the server rejects once synced, **When** the sync completes,
   **Then** that action is visibly marked as needing attention, distinct from both "pending" and
   "synced," and the user's original input for it remains available.
2. **Given** a pending action fails for a reason that will resolve on its own (still offline, a brief
   server hiccup, being asked to slow down), **When** the sync completes or is retried, **Then** the
   user is not shown it as a rejection — only failures that need the user's own action are surfaced
   that way.
3. **Given** the device has been offline long enough that the user's session has expired, **When**
   the app tries to sync, **Then** the user is told they need to sign in again to sync their pending
   actions, distinct from any individual action being rejected.

---

### Edge Cases

- What happens when a user edits or deletes a record they created moments earlier, before it has
  ever synced? The edit/delete is queued after the create, in the same per-vehicle order; when
  connectivity returns, the create is applied first and then the edit/delete — the end result is
  correct (e.g. the record ends up deleted) even though it costs an extra round trip the user never
  needs to know about.
- What happens if two different devices belonging to the same account both queue offline writes for
  the same vehicle at the same time? Ordering is guaranteed only within a single device's own queue;
  this feature does not attempt to interleave or reconcile ordering across multiple devices'
  independent queues. A duplicate-looking record created this way is still caught by the existing,
  separate possible-duplicate detection (specs/010-semantic-duplicate-detection) the same way it
  would be for two normal online submissions.
- What happens if a large backlog of pending actions all become syncable at once (e.g. after being
  offline for a long trip) and the server asks the client to slow down? The client waits and resumes
  rather than treating "asked to slow down" as a rejection or abandoning the rest of the backlog.
- What happens to a photo/file attachment the user tried to add to a record while offline? Not
  covered by this feature — see Assumptions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Users MUST be able to do the following while offline, with each one saved locally
  immediately: create a vehicle; create, edit, or delete a service record; create, edit, or delete a
  fuel record; dismiss a possible-duplicate flag on a service or fuel record; create, delete, or mark
  done a reminder.
- **FR-002**: Each action performed while offline MUST appear in the UI right away, visibly marked
  as not yet confirmed by the server ("pending"), distinguishable from an action that has already
  synced.
- **FR-003**: The app MUST indicate when it currently has no connection to the server, distinct from
  the per-action pending/rejected markers, so the user understands why their actions haven't synced
  yet.
- **FR-004**: When connectivity returns, the system MUST automatically sync all pending actions
  without requiring the user to manually retry or resubmit anything.
- **FR-005**: Actions for the same vehicle MUST sync in the exact order the user originally made
  them — an edit or delete MUST NOT be applied before the create (or earlier edit) it depends on.
- **FR-006**: Every offline action MUST carry a unique identifier generated at the moment it's made.
  A repeated sync attempt of the same action (e.g. after a dropped connection mid-sync) MUST be
  treated as already-done rather than applied a second time.
- **FR-007**: A record created while offline MUST be assigned a stable identity immediately, before
  it ever syncs, so that further offline edits or deletes to that same not-yet-synced record can
  still be queued and later applied correctly.
- **FR-008**: Pending actions MUST survive the app being closed, the browser or device restarting,
  or the tab being reloaded while still offline — they are not lost just because the app wasn't kept
  open continuously.
- **FR-009**: If the server rejects a pending action, the system MUST mark that action as needing
  the user's attention and MUST NOT silently discard it or silently present it as having succeeded.
- **FR-010**: The system MUST distinguish a rejection that needs the user's attention from a failure
  that will resolve on its own (still offline, a brief server-side hiccup, being asked to slow down)
  — the user MUST NOT be shown a false alarm for something the system will automatically retry.
- **FR-011**: If the device has been offline long enough that the user's session has expired, the
  system MUST tell the user they need to sign in again before their pending actions can sync, rather
  than showing each pending action as individually rejected.
- **FR-012**: A user MUST be able to see, at a glance, whether they currently have any pending or
  rejected actions waiting, without needing this feature's full review/resolution screen (a separate
  feature, issue #21) to know something needs attention.
- **FR-013**: A rejected action's changes MUST NOT be applied, and the user's original input for it
  MUST remain available for them to see — it is not lost even though it didn't take effect.

### Key Entities

- **Pending action**: A single queued write (create/edit/delete/dismiss-duplicate/mark-done) a user
  made while offline — carries what the user entered, which record/vehicle it applies to, the order
  it was made in relative to other pending actions for that vehicle, its unique identifier, and its
  current state (pending, synced, or rejected/needs-attention).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user who creates or edits records while offline sees them appear immediately, and
  every one of them syncs automatically once connectivity returns, with zero manual resubmission
  steps required.
- **SC-002**: Closing the app, restarting the browser, or restarting the device while offline never
  causes a pending action to disappear — 100% of pending actions are still present and still pending
  the next time the app opens, until they sync or are rejected.
- **SC-003**: Actions for a single vehicle always end up applied in the order the user made them,
  even across an app restart or an interrupted sync, and even when some of them are later rejected.
- **SC-004**: 100% of server-rejected actions are visibly flagged to the user — none are silently
  dropped and none are silently presented as having succeeded.
- **SC-005**: A large backlog of pending actions completes syncing once reconnected rather than
  failing outright partway through when the server asks the client to slow down.

## Assumptions

- **Attachment uploads are not covered by this feature.** Photo/file attachments (including camera
  captures from issue #19) made while offline are out of scope here — persisting binary file data
  offline and replaying large uploads is a meaningfully different technical problem from queuing
  small structured writes, and the core value of this feature (never losing a logged service or fuel
  record because of no signal) is fully delivered without it. A user can still queue the record
  itself while offline and add a photo to it later once back online. This boundary was left open by
  issue #19's own spec and is decided here, not deferred further.
- **Vehicle edit/delete and reminder edit are not covered**, because no part of the app today lets a
  user trigger them at all (no edit-vehicle or edit-reminder screen exists yet) — there is nothing
  for this feature to make work offline for those specific actions. If/when that UI is added, it
  should get the same offline treatment as the actions this feature does cover.
- **Ordering is guaranteed within a single device's own queue, not across multiple devices.** Two
  devices on the same account queuing writes for the same vehicle at the same time is not
  specially reconciled by this feature; a resulting duplicate-looking record is still caught by the
  existing, separate possible-duplicate detection (specs/010-semantic-duplicate-detection), which
  already exists precisely to handle "the same real-world event logged twice."
- **This feature does not solve semantic duplicate detection** — that already exists
  (specs/010-semantic-duplicate-detection) and continues to work unchanged for any write that passes
  through it, whether it arrived online or from this queue. This feature's idempotency key only
  prevents the *same* queued action from being applied twice; it is not a duplicate-event detector.
- **A rejected action's full review/triage experience is a separate feature** (issue #21) that
  builds on this one. This feature is only responsible for the action never being lost or invisible
  — not for offering ways to edit, retry, or discard it.
- **The app shell itself still requires a live connection to load** (per specs/018-pwa-installability
  — a genuine offline cold start is out of scope there). This feature applies once the app is
  already open in a tab; it does not change that boundary.
