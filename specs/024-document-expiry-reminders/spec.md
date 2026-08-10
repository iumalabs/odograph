# Feature Specification: Document Expiry Reminders (Email + Push)

**Feature Branch**: `024-document-expiry-reminders`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Document expiry reminders (email + push) (GitHub issue #74,
milestone M9). Surface upcoming/overdue document expirations (registration, insurance, warranty,
inspection documents from specs/023) the same way maintenance reminders already do for service
intervals. This feature MUST reuse the existing reminder evaluation, escalation, dedup, email, and
web-push machinery from specs/011-reminder-rules-cron, specs/012-email-reminder-delivery, and
specs/022-web-push-reminders rather than building a second parallel notification system — same
status model (on track / coming up / overdue), same escalation policy (notify once per transition
into a more urgent state, never repeat while unchanged), same email+push delivery channels, same
Cron-triggered sweep pattern. Unlike reminder_rules (which are interval-based: due every N
days/distance since last done), a document's due date is a single fixed expiry_date with no
interval or "last done" concept — renewing a document is just editing its expiry_date to a new
future date via the existing PATCH endpoint from specs/023, which should naturally clear any prior
notification state the same way completing a reminder rule does. Depends on the documents entity
merged in specs/023-vehicle-document-records (title, category, expiry_date, notes — expiry_date is
nullable, and a document with no expiry_date is never a reminder candidate). Do not build a "mark
as renewed" UI action — editing expiry_date already exists and should be sufficient."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner sees which documents are coming up or overdue for renewal (Priority: P1)

An owner with a document that has an expiry date (e.g. an insurance policy or vehicle
registration) sees, without doing anything extra, whether that document is on track, coming up
for renewal soon, or already expired — the same way they already see this for maintenance
reminders.

**Why this priority**: Status is the entire value of this feature — a document with an expiry
date but no visible urgency indicator is no better than the plain expiry-date field specs/023
already shows.

**Independent Test**: Create a document with an expiry date in the near future and confirm it
shows "coming up"; create one with an expiry date far in the future and confirm "on track";
create one whose expiry date has already passed and confirm "overdue"; create one with no expiry
date at all and confirm it never shows any of these three states.

**Acceptance Scenarios**:

1. **Given** a signed-in owner viewing a vehicle's documents, **When** a document's expiry date
   is far enough in the future, **Then** it shows as on track.
2. **Given** the same flow, **When** a document's expiry date is within the renewal window,
   **Then** it shows as coming up.
3. **Given** the same flow, **When** a document's expiry date has already passed, **Then** it
   shows as overdue.
4. **Given** the same flow, **When** a document has no expiry date at all, **Then** it never
   shows an on-track/coming-up/overdue status — it simply isn't a reminder candidate.

---

### User Story 2 - An owner is notified by email and push when a document becomes due (Priority: P1)

An owner is notified — by email and, if they've enabled it, by push notification — the moment a
document's status changes to "coming up," and again if it later changes to "overdue," the same
way they're already notified for maintenance reminders. They are never notified again and again
for a document that stays in the same state.

**Why this priority**: This is the actual point of the feature — a status visible only when the
owner happens to open the app doesn't solve "I forgot to renew my insurance."

**Independent Test**: Let a document's status transition from on track to coming up and confirm
exactly one notification (email, and push if subscribed) is sent for that transition; let it
transition further to overdue and confirm exactly one more notification is sent; confirm no
additional notification is sent while it stays in either state.

**Acceptance Scenarios**:

1. **Given** a document whose status changes from on track to coming up, **When** the system next
   evaluates it, **Then** the owner receives exactly one email (and one push notification, if
   they have an active subscription) about that document.
2. **Given** a document already flagged as coming up, **When** its status changes to overdue,
   **Then** the owner receives exactly one further notification for that escalation.
3. **Given** a document whose status hasn't changed since the last evaluation, **When** the
   system evaluates it again, **Then** no additional notification is sent.
4. **Given** an owner with no deliverable email or no active push subscription, **When** a
   document they own becomes due, **Then** the notification attempt for the unavailable channel
   is skipped without blocking the other channel or crashing the evaluation sweep.

---

### User Story 3 - Renewing a document clears its reminder state (Priority: P2)

An owner renews a document — for example, updating an expired insurance policy's expiry date to
next year's renewal date — using the document edit flow that already exists, and its reminder
status and any pending "already notified" state reset accordingly, without any separate "mark as
renewed" step.

**Why this priority**: Without this, a renewed document would either keep showing as overdue
(confusing and wrong) or silently stop notifying about a *new* future expiry it's approaching
again — both are real gaps, but the feature is still useful without this story since Stories 1-2
already deliver the core notify-before-expiry value for a document's first expiry cycle.

**Independent Test**: Create a document with a past expiry date (confirmed overdue and already
notified), edit its expiry date to a future date, and confirm its status recomputes to on track
and it can be notified again on a later transition — without ever needing a dedicated
"renewed"/"done" action.

**Acceptance Scenarios**:

1. **Given** a document currently flagged overdue and already notified, **When** its expiry date
   is edited to a future date, **Then** its status recomputes to on track and its notification
   state is cleared.
2. **Given** the renewed document from Scenario 1, **When** its new expiry date later enters the
   coming-up window, **Then** the owner is notified again, exactly as for a document's first
   expiry cycle.

### Edge Cases

- What happens when a document's expiry date is edited to remove it entirely (cleared to no
  expiry)? It immediately stops being a reminder candidate — same as User Story 1, Scenario 4 —
  and any pending notification state for it is cleared, identical to a renewal.
- What happens when a document is deleted while it has an active coming-up/overdue status? It's
  simply no longer evaluated going forward — no notification is sent about a document that no
  longer exists.
- What happens if a document's vehicle is deleted (specs/006), taking the document down with it
  (specs/023)? Same as document deletion above — nothing further is evaluated or notified for it.
- What happens to a document created with an expiry date already in the past? It's immediately
  evaluated as overdue and notified on the very next sweep, exactly as if it had just transitioned
  there — being overdue at creation time isn't treated differently from becoming overdue later.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST compute, for every document with a non-null expiry date, one of three
  states — on track, coming up, or overdue — using the same three-state model already used for
  maintenance reminders.
- **FR-002**: System MUST NOT compute or display any of these three states for a document with no
  expiry date — such a document is never a reminder candidate.
- **FR-003**: System MUST re-evaluate every document's status on the same recurring schedule
  already used to evaluate maintenance reminders, so a status change is detectable without anyone
  having opened the app.
- **FR-004**: System MUST send an email notification the first time a document's status advances
  to a more urgent state than it was last notified at (never notified → coming up → overdue), and
  MUST NOT send a repeat notification while the status stays the same or becomes less urgent.
- **FR-005**: System MUST additionally send a push notification under the same escalation rule as
  FR-004, for an owner with an active push subscription, using the same delivery mechanism already
  used for maintenance reminders.
- **FR-006**: System MUST skip (not fail, not block the other channel) a notification attempt for
  a channel the owner hasn't set up (no deliverable email, no active push subscription) — a
  missing channel never prevents evaluation or the other channel's delivery.
- **FR-007**: System MUST recompute a document's status, and clear any escalation state recorded
  for it, whenever its expiry date is edited (to a new date or cleared entirely) — a document
  renewed today is eligible to be notified about its new expiry date's own future cycle, not
  silently suppressed by stale state from before the edit.
- **FR-008**: System MUST stop evaluating and notifying about a document once it (or its owning
  vehicle) has been deleted.
- **FR-009**: System MUST NOT notify a tenant about another tenant's document — evaluation and
  delivery both stay scoped to the document's own tenant, identical to every other cross-tenant
  guarantee in this system.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can tell a document's renewal urgency (on track / coming up / overdue)
  at a glance, without needing to compare today's date against the expiry date themselves.
- **SC-002**: 100% of status transitions into a more urgent state produce exactly one email (and
  one push notification, where subscribed) — verified by a test that drives a document through
  on-track → coming-up → overdue and counts notifications sent at each step.
- **SC-003**: 0% of unchanged-status evaluations produce a duplicate notification, verified by
  re-evaluating an already-notified document with no state change and confirming no additional
  send.
- **SC-004**: Renewing an overdue, already-notified document (editing its expiry date forward)
  results in it being notified again once its new expiry date later re-enters the coming-up
  window — verified end to end, without any dedicated "mark as renewed" action existing in the
  product.
- **SC-005**: An owner with no deliverable email or push subscription never experiences a failed
  or crashed evaluation sweep because of their missing channel — verified by a test that seeds
  exactly this condition and confirms the sweep completes normally for every other document.

## Assumptions

- **Coming-up window**: A document is considered "coming up" starting 30 days before its expiry
  date — a reasonable default for the kinds of documents in scope (vehicle registration,
  insurance, inspection, warranty), all of which are typically renewed with weeks' notice rather
  than the interval-proportional window reminder rules use (which doesn't apply here since a
  document has no interval, only a fixed date).
- **No "mark as renewed" action**: explicitly out of scope per the issue's own text — editing a
  document's expiry date via the existing update flow (specs/023) is the renewal action; this
  feature only needs to react correctly (FR-007) when that happens, not add a new UI affordance.
- **Same two channels, no new ones**: email and web push only, matching the constitution's locked
  "Reminder channels (v1)" decision — no separate channel-configuration surface for documents.
- **One evaluation sweep, shared schedule**: documents are evaluated on the same recurring
  schedule as maintenance reminders (not a separate, differently-timed schedule) — there's no
  product reason for a document's due-soon detection to lag behind or run ahead of a maintenance
  reminder's.
