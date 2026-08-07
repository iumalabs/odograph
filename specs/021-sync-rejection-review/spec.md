# Feature Specification: Sync Rejection Review Screen

**Feature Branch**: `021-sync-rejection-review`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Sync rejection review screen (issue #21, milestone M7, constitution
Principle III): server-rejected offline write-queue operations (issue #20) surface in a dedicated,
user-facing review screen — gathered in one place, never only a per-record badge, with a way to
discard or retry each one. Builds directly on the offline write queue (#20); no new server
endpoints or schema."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Find out what needs attention, in one place (Priority: P1)

An owner has been offline-editing records across a couple of vehicles. Back online, some of those
writes were rejected by the server for one reason or another. Instead of having to notice a small
badge on each affected record scattered across different vehicles, the owner can go to one screen
and see everything that needs their attention at once, with enough detail to understand what they
were trying to do and why it didn't go through.

**Why this priority**: This is the entire reason this feature exists — constitution Principle III
requires a rejected write to surface in a review screen, not just a per-record marker. Without this,
issue #20's per-record badges are the only signal, which is easy to miss if the rejection happened
on a vehicle the owner isn't currently looking at.

**Independent Test**: With one or more rejected actions across different vehicles (set up via
issue #20's own mechanism — e.g. a queued edit to a record deleted from elsewhere), open the review
screen and confirm every rejected action appears, each showing what was attempted and the reason it
was rejected, regardless of which vehicle it belongs to or which one is currently selected.

**Acceptance Scenarios**:

1. **Given** rejected actions exist for more than one vehicle, **When** the owner opens the review
   screen, **Then** all of them are listed together, not only the ones for the currently selected
   vehicle.
2. **Given** a rejected action is listed, **When** the owner looks at it, **Then** they can tell
   what they were trying to do (create/edit/delete, and enough about the record to recognize it)
   and why the server rejected it.
3. **Given** no actions are currently rejected, **When** the owner opens the review screen,
   **Then** it clearly says there's nothing to review, rather than looking broken or empty by
   accident.

---

### User Story 2 - Discard a rejected action (Priority: P2)

An owner reviews a rejected action and decides they don't want to pursue it anymore (for example, an
edit to a record that's since been handled another way). They discard it directly from the review
screen and it's gone — cleanly abandoned, not applied.

**Why this priority**: Without a way to resolve a rejection, the review screen would just be a
permanent list of stuck items — this is the minimum needed to actually clear one.

**Independent Test**: From the review screen, discard a rejected action and confirm it disappears
from the screen, its change was never applied, and the record it targeted is otherwise unaffected.

**Acceptance Scenarios**:

1. **Given** a rejected action is listed, **When** the owner discards it, **Then** it's removed from
   the review screen and its attempted change is never applied.
2. **Given** a rejected action targeted an existing record, **When** it's discarded, **Then** that
   record is left exactly as it was before the rejected attempt — no partial or guessed change.

---

### User Story 3 - Retry a rejected action (Priority: P2)

An owner reviews a rejected action and, believing the underlying problem has been resolved (for
example, whatever conflict caused the rejection no longer applies), retries it directly from the
review screen without having to redo the original action from scratch.

**Why this priority**: Discarding is sometimes the wrong outcome — the owner's original input was
often still correct and worth keeping. Letting them retry without retyping everything is the
difference between this feature actually helping and just being a place to give up on things.

**Independent Test**: From the review screen, retry a rejected action whose underlying problem has
been resolved and confirm it succeeds and disappears from the review screen; separately, retry one
whose problem has not been resolved and confirm it's rejected again and still shown, with an
up-to-date reason.

**Acceptance Scenarios**:

1. **Given** a rejected action whose underlying problem no longer applies, **When** the owner
   retries it, **Then** it succeeds, disappears from the review screen, and its effect appears in
   the normal record view.
2. **Given** a rejected action whose underlying problem still applies, **When** the owner retries
   it, **Then** it's rejected again, remains listed, and shows the current reason — it never
   silently disappears or looks like it succeeded.

---

### Edge Cases

- What happens when the owner discards or retries a rejected action while offline? Discard always
  works immediately (it's a local decision). Retry is accepted and the action goes back to waiting
  for connectivity, the same as any other queued action — the owner isn't blocked from retrying just
  because they're still offline.
- What happens if a retried action is rejected again for a different reason than before? The review
  screen shows the new reason, replacing the old one — never both, never neither.
- What happens if the review screen is opened with a very large number of rejected actions at once?
  Every one is still listed and individually actionable — none are silently capped or hidden.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Users MUST be able to see every currently rejected action gathered in one screen,
  regardless of which vehicle it belongs to or which vehicle is currently selected elsewhere in the
  app.
- **FR-002**: Each rejected action shown MUST convey what the user was trying to do (which kind of
  action, and enough about the record to recognize it) and the reason the server rejected it.
- **FR-003**: Users MUST be able to discard a rejected action, removing it without ever applying its
  change.
- **FR-004**: Users MUST be able to retry a rejected action, re-attempting the same action.
- **FR-005**: A discarded or successfully-retried action MUST disappear from the review screen.
- **FR-006**: An action rejected again after a retry MUST remain listed with an up-to-date reason —
  never silently dropped and never presented as if it had succeeded.
- **FR-007**: The app MUST show, at a glance and from outside the review screen, whether anything is
  currently rejected and needs attention, so the owner knows to go check.
- **FR-008**: The review screen MUST be reachable from anywhere in the signed-in app in at most a
  couple of actions.
- **FR-009**: When nothing is currently rejected, the review screen MUST say so clearly rather than
  appearing empty by accident.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of rejected actions are discoverable through the review screen — none are ever
  visible only via a per-record marker elsewhere in the app.
- **SC-002**: A user can discard or retry any given rejected action in a single action from the
  review screen, without additional navigation per item.
- **SC-003**: A retried action that succeeds is reflected in the normal record view and cleared from
  the review screen within moments of connectivity being available.
- **SC-004**: Every rejected action reaches a deterministic, visible outcome (discarded, retried and
  now pending, or retried and rejected again with a current reason) — none are ever left in an
  ambiguous or silently-dropped state.

## Assumptions

- **Builds directly on issue #20's offline write queue** — the same client-side queue, the same
  `PendingAction` rejected state and reason. No new server endpoint, no schema change; this feature
  is entirely about surfacing and resolving what #20 already detects and stores.
- **Retry resubmits the action unchanged.** Editing the data before resubmitting (e.g. fixing an
  invalid value on a rejected edit) is out of scope for this version — a reasonable boundary since,
  for an edit, the record's existing edit screen already provides an alternative path to submit a
  corrected version through the normal queue. A rejected *create* can only be discarded or retried
  as-is in this version, not edited first.
- **The review screen is global, not per-vehicle** — it lists rejected actions for every vehicle at
  once, since a rejection can happen on any vehicle regardless of which one the owner currently has
  open.
