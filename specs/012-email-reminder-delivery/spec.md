# Feature Specification: Email Reminder Delivery

**Feature Branch**: `012-email-reminder-delivery`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Email reminder delivery (issue #14, milestone M5): send an email to the vehicle owner when a reminder rule's status becomes coming_up or overdue, so owners don't have to keep the app open to catch a due reminder. This extends the existing daily Cron sweep (evaluateAllReminders) — the same sweep that already recomputes and caches every reminder's status — rather than introducing a second Cron job. Never re-send the same email every single day for a reminder that stays overdue/coming_up indefinitely. Recipient resolution must skip placeholder (non-deliverable) addresses without erroring. Out of scope: web push delivery (issue #15), preferences/opt-out UI, digest batching, and any change to reminder status computation itself."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner is emailed when a reminder first becomes due (Priority: P1)

A vehicle owner has set up a reminder (e.g. "Oil change every 90 days"). They close the app and don't check back in. When the reminder's status crosses into "coming up" or "overdue," they receive an email telling them which vehicle, which reminder, and how overdue/soon it is — without having to open the app to find out.

**Why this priority**: This is the entire point of the feature — reminders that only show inside the app are easy to miss. Email delivery is what makes "reminders" actually work as reminders rather than a passive list.

**Independent Test**: Create a reminder rule whose computed status is "coming_up" or "overdue," run the scheduled sweep, and confirm exactly one email was sent to the owner's address referencing that reminder and vehicle.

**Acceptance Scenarios**:

1. **Given** a reminder rule that was "on track" on the previous sweep, **When** the next sweep computes its status as "coming up," **Then** the owner receives one email about that reminder.
2. **Given** a reminder rule that was "coming up" on the previous sweep, **When** the next sweep computes its status as "overdue," **Then** the owner receives one email about that reminder (a second, distinct email from the "coming up" one).
3. **Given** a reminder rule whose status is "not enough data" (e.g. a brand-new mileage-only reminder with no odometer history yet), **When** the sweep runs, **Then** no email is sent for that reminder.

---

### User Story 2 - Owner is not spammed while a reminder stays overdue (Priority: P1)

An owner ignores an overdue reminder for three weeks. The daily sweep re-evaluates every reminder every day. Without safeguards, this would email the owner once a day, every day, forever — training them to ignore or unsubscribe from Odograph email entirely. Instead, the owner gets exactly one email when the reminder first becomes overdue, and no further emails until something actually changes (it gets marked done, or, per User Story 1, it escalates further).

**Why this priority**: Equal to User Story 1 — a notification feature that spams its users is worse than no notification feature at all, and would undermine trust in every future email this project sends.

**Independent Test**: Run the scheduled sweep twice in a row with no change to a reminder's underlying data between runs, and confirm only the first run sent an email.

**Acceptance Scenarios**:

1. **Given** a reminder rule already emailed about at "overdue," **When** the next sweep runs and it's still "overdue," **Then** no additional email is sent.
2. **Given** a reminder rule already emailed about at "coming up," **When** the next sweep runs and it's still "coming up" (not yet "overdue"), **Then** no additional email is sent.

---

### User Story 3 - Notifications resume after a reminder is marked done and recurs (Priority: P2)

An owner gets emailed that their registration renewal is overdue, renews it, and marks the reminder done in the app. Months later, the reminder becomes due again on its normal recurring schedule. The owner expects to be notified again, exactly as if this were the first time — not silence, just because they were already notified once in the past.

**Why this priority**: Without this, User Story 2's spam prevention would silently break the feature for every recurring reminder after its first cycle, which is most reminders in this app (oil changes, registration, etc. all recur).

**Independent Test**: Email an owner about an overdue reminder, mark that reminder done (status returns to "on track" or "not enough data"), advance time until it becomes due again, run the sweep, and confirm a new email is sent.

**Acceptance Scenarios**:

1. **Given** a reminder rule that was previously emailed about and has since been marked done, **When** it later becomes "coming up" or "overdue" again, **Then** the owner receives a new email as if for the first time.

---

### User Story 4 - Owners without a real email address are silently skipped (Priority: P3)

Some owners sign up with a passkey and never supply an email address; their account has a non-deliverable placeholder address on file instead of a real one. When their reminders become due, the system should not attempt to email that placeholder (which would bounce or error) and should not treat this as a failure requiring a retry or an alert — it should simply skip sending for that owner, the same way it would for a mailbox nobody's using.

**Why this priority**: Correctness/robustness concern rather than core value — the feature must not crash or spam error logs for the subset of owners without email, but this doesn't block the core notification value for owners who do have email.

**Independent Test**: Create a reminder rule for an owner whose account has a placeholder (non-deliverable) email address, drive its status to "overdue," run the sweep, and confirm no email send was attempted and no error was raised for that reminder or any other reminder in the same sweep.

**Acceptance Scenarios**:

1. **Given** an owner account with only a placeholder email on file, **When** one of their reminders becomes due, **Then** no email is sent and the sweep continues normally for every other reminder.
2. **Given** that same owner later adds a real email address to their account while the reminder is still due, **When** the next sweep runs, **Then** they receive an email about it (the earlier skip does not permanently suppress notification for that due state).

---

### Edge Cases

- What happens when a reminder rule has both a date interval and a mileage interval, and only one of the two crosses into a more urgent status while the other doesn't? The overall reminder status (already computed by the existing status logic) is what drives notification — this feature reacts to the single combined status, not to each interval type separately.
- What happens if the same sweep run evaluates hundreds of due reminders across many tenants? Each reminder's email attempt is independent; one owner's send failing (e.g. a transient email-provider error) must not prevent other owners' reminders from being evaluated or emailed in the same run, consistent with how the sweep already isolates per-row evaluation failures.
- What happens if an owner has two different reminders on the same vehicle that both become due on the same day? They receive two separate emails, one per reminder (no batching in this feature).
- What happens if a reminder is deleted after being emailed about but before its next evaluation? Nothing further happens for it — there's no dangling state to clean up beyond the normal deletion of the reminder rule itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST send an email to a reminder's owner when that reminder's computed status becomes "coming up" for the first time since it was last "on track" (or since the reminder was created).
- **FR-002**: The system MUST send an email to a reminder's owner when that reminder's computed status becomes "overdue," if no email has yet been sent for this reminder at "overdue" severity since its last "on track" state.
- **FR-003**: The system MUST NOT send an email for a reminder whose status is unchanged in severity from the last state it already notified about (e.g. remaining "overdue" day after day sends nothing further).
- **FR-004**: The system MUST NOT send an email for a reminder whose computed status is "not enough data."
- **FR-005**: The system MUST reset a reminder's notification history when its status returns to "on track" (e.g. after being marked done), so a future recurrence into "coming up" or "overdue" notifies the owner again as if for the first time.
- **FR-006**: The system MUST evaluate and send reminder emails as part of the same daily scheduled sweep that already recomputes reminder status, not on a separate schedule.
- **FR-007**: The system MUST identify the correct recipient email address as the email on file for the account that owns the reminder's vehicle.
- **FR-008**: The system MUST detect when an account's email on file is a non-deliverable placeholder address and skip sending for that account's reminders without raising an error or blocking other reminders in the same sweep.
- **FR-009**: The system MUST NOT record a reminder as "notified" when the send was skipped due to a placeholder address, so that a real address added later still triggers a notification for a reminder that is still due.
- **FR-010**: A failure sending one reminder's email MUST NOT prevent any other reminder in the same sweep from being evaluated or notified.
- **FR-011**: Each email MUST identify the vehicle and the specific reminder (label) it concerns, so an owner with multiple reminders or vehicles can tell at a glance what needs attention.
- **FR-012**: The system MUST send at most one email per reminder per distinct escalation (crossing into "coming up," and separately crossing into "overdue").

### Key Entities

- **Reminder Rule** (existing entity, extended): gains a record of the most severe status level it has already been emailed about, so the system can tell a new escalation from a repeat of the same due state. This resets whenever the reminder's status returns to "on track."
- **Reminder Notification Email**: not a persisted entity — a transactional email sent to the owning account's email address, referencing one vehicle and one reminder rule, at the moment a reminder first crosses into "coming up" or "overdue."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner with a deliverable email address is notified within one day of any of their reminders first becoming "coming up" or "overdue."
- **SC-002**: An owner never receives more than one email for the same reminder remaining at the same urgency level, no matter how many days it stays there.
- **SC-003**: An owner who resolves a reminder (marks it done) and later lets it become due again is notified again, exactly as with a brand-new reminder.
- **SC-004**: Owners without a usable email address never see an error, and every other owner's reminders are still delivered normally in the same run.

## Assumptions

- Every reminder rule has exactly one owning account (via its vehicle's tenant), and that account's on-file email is the sole recipient — there is no separate "notify a different address" or multi-recipient concept in this feature.
- All accounts currently receive this notification with no per-account opt-out, matching the project's existing precedent that every account already receives other transactional email (magic-link, account-linking) with no preference control. Introducing an opt-out is future scope, not part of this feature.
- "Escalation" severity ordering is on track < coming up < overdue; "not enough data" is not part of this ordering and never triggers or resets a notification on its own.
- A reminder that regresses in severity without returning fully to "on track" (not a real scenario given how status is computed today, since status moves smoothly through the same ordering) is out of scope to reason about further.
- One email per reminder-rule escalation is the full extent of "delivery" for this feature — no digest, no daily summary, and no batching of multiple due reminders into a single message, even for the same vehicle or owner.
- The reminder email skip for placeholder addresses does not need to look at any address other than the codebase's existing placeholder-address pattern already used for passkey signups without a supplied email.
