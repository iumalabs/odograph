# Feature Specification: Reminder Rules & Cron Scheduling

**Feature Branch**: `011-reminder-rules-cron`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Reminder rules & Cron scheduling (issue #13, milestone M5): let an
owner define recurring maintenance reminders per vehicle — due by date, by mileage, or both,
whichever comes first — and have the system evaluate every reminder's status (on track, coming
up, or overdue) both live when viewed and on a recurring schedule (Cron Trigger, never
Cloudflare Queues), so a due reminder is detectable even if nobody happens to open the app. Actual
delivery of a notification (email, web push) is explicitly out of scope for this issue — those are
separate milestone issues (#14, #15) that will build on the status this issue establishes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An owner sets up a recurring reminder for a vehicle (Priority: P1)

An owner defines a maintenance reminder for a vehicle — e.g. "oil change every 6 months or 8,000
km, whichever comes first" — giving it a label and one or both of a date interval and a mileage
interval.

**Why this priority**: This is the foundational write path — without a rule, there's nothing to
evaluate or ever remind anyone about.

**Independent Test**: Create a reminder rule with a date interval only, one with a mileage
interval only, and one with both; confirm all three are created and appear in the vehicle's
reminder list; confirm a rule with neither interval is rejected.

**Acceptance Scenarios**:

1. **Given** a signed-in owner viewing one of their vehicles, **When** they create a reminder rule
   with a label and a date interval, **Then** it's created and appears in that vehicle's reminder
   list.
2. **Given** the same flow, **When** they create a rule with a mileage interval instead, or with
   both a date and mileage interval, **Then** both are created successfully.
3. **Given** a rule submission with neither a date nor a mileage interval, **When** submitted,
   **Then** it's rejected and nothing is created — a reminder that can never become due isn't a
   reminder.
4. **Given** a rule submission for a vehicle belonging to a different tenant, or a nonexistent
   vehicle, **When** submitted, **Then** it's refused identically in both cases.

---

### User Story 2 - An owner sees which reminders are coming up or overdue (Priority: P1)

An owner views a vehicle's reminders and immediately sees, for each one, whether it's on track,
coming up soon, or already overdue — computed from the interval, when it was last done, and (for
mileage-based rules) the vehicle's most recently known odometer reading.

**Why this priority**: Status is the entire value of a reminder system — a list of rules with no
indication of urgency is just a static list, not a reminder.

**Independent Test**: Create a rule due by date in the near future and confirm it shows "coming
up"; create one due far in the future and confirm "on track"; create one whose due date has
already passed and confirm "overdue"; create a mileage-only rule for a vehicle with no fuel or
service records yet and confirm it shows a distinct "not enough data" state rather than a false
status.

**Acceptance Scenarios**:

1. **Given** a date-based reminder rule, **When** its computed due date is in the past, **Then**
   its status is "overdue"; when it's soon (within the rule's own "coming up" threshold), status is
   "coming up"; otherwise "on track."
2. **Given** a mileage-based reminder rule, **When** the vehicle's most recent known odometer
   reading has passed the rule's due-mileage threshold, **Then** its status is "overdue," using the
   same "coming up"/"on track" thresholds by remaining distance.
3. **Given** a rule with both a date and mileage interval, **When** the two intervals disagree on
   urgency (e.g. on track by date but overdue by mileage), **Then** the more urgent of the two
   determines the rule's overall status — "whichever comes first."
4. **Given** a mileage-based (or mileage-and-date) rule for a vehicle with no fuel or service
   records yet, **When** the owner views it, **Then** the mileage side shows "not enough data"
   rather than a guessed or default status, and the rule's overall status falls back to whatever
   the date side alone indicates (or "not enough data" if the rule is mileage-only).
5. **Given** two tenants each with their own vehicle's reminder rules, **When** either fetches
   their reminders, **Then** they only ever see their own.

---

### User Story 3 - An owner marks a reminder as done (Priority: P2)

An owner completes the maintenance a reminder was tracking and marks it done in one action,
resetting the rule so it's next due a full interval from now.

**Why this priority**: Without this, a rule can only ever be edited field-by-field to reset it,
which is more friction than the everyday "I just did this" action deserves — but the rule and its
computed status (User Stories 1-2) already deliver value without it.

**Independent Test**: Mark an overdue rule done and confirm its status returns to "on track," with
its next-due date/mileage recalculated from today/the vehicle's current odometer reading rather
than the old anchor.

**Acceptance Scenarios**:

1. **Given** an overdue or coming-up reminder rule, **When** the owner marks it done, **Then** its
   last-done date resets to today and (if the rule has a mileage interval) its last-done odometer
   reading resets to the vehicle's most recently known reading, and its status recalculates to "on
   track."
2. **Given** a reminder rule belonging to a different tenant, **When** a mark-done is attempted,
   **Then** it's refused identically to the not-found-or-not-yours contract every other write
   operation in this product already has.

---

### User Story 4 - An owner edits or removes a reminder rule (Priority: P2)

An owner corrects a rule's label or interval, or deletes a rule that no longer applies (e.g. after
selling a part of the vehicle it tracked, or realizing the interval was wrong).

**Why this priority**: Standard CRUD completeness — secondary to the rule actually existing and
showing correct status.

**Independent Test**: Update a rule's interval and confirm its computed status reflects the new
interval on the next fetch; delete a rule and confirm it's gone from the vehicle's list
immediately.

**Acceptance Scenarios**:

1. **Given** an existing reminder rule, **When** the owner updates its label or either interval,
   **Then** every other field keeps its previous value and the computed status reflects the change
   immediately on the next fetch.
2. **Given** an existing reminder rule, **When** the owner deletes it, **Then** it's immediately
   gone from the vehicle's reminder list.
3. **Given** a reminder rule belonging to a different tenant, **When** an update or delete is
   attempted, **Then** it's refused identically to a made-up id, and the rule is left untouched.

---

### User Story 5 - The system checks every reminder on a recurring schedule (Priority: P1)

Independently of any owner opening the app, the system periodically re-checks every reminder rule
across every tenant and records each one's freshly-computed status, so a reminder that becomes due
is detectable even if nobody happens to be looking — the foundation the still-to-come notification
delivery features (email, web push) will build on.

**Why this priority**: This is the "Cron scheduling" half of the feature and the reason a reminder
system is more useful than a manually-refreshed checklist — without it, a rule's status is only
ever as fresh as the last time someone happened to view it.

**Independent Test**: Trigger the scheduled evaluation directly (not through the HTTP API) and
confirm every reminder rule across every tenant has its cached status and last-evaluated timestamp
updated to reflect a fresh computation, using the exact same status logic User Story 2 already
established.

**Acceptance Scenarios**:

1. **Given** reminder rules across multiple tenants and vehicles in various due states, **When**
   the scheduled evaluation runs, **Then** every rule's cached status and last-evaluated timestamp
   are updated to the freshly-computed values, using the same status computation as the live,
   on-demand read path (User Story 2) — never a second, divergent implementation.
2. **Given** the scheduled evaluation has just run, **When** an owner views a reminder immediately
   afterward, **Then** they see the same status the schedule just computed (not a stale one) —
   status is still also computed live on every read, so it's never staler than the last read
   *or* the last scheduled run, whichever is more recent.

### Edge Cases

- A rule's "coming up" threshold (how close to due counts as "coming up" rather than "on track")
  is proportional to its own interval, not a fixed absolute value — a reminder due every 6 months
  and one due every 4 years shouldn't both start warning at exactly "30 days left."
- A vehicle's "most recently known odometer reading" is the highest odometer reading among all of
  its fuel and service records combined (not just one or the other) — whichever record type was
  logged most recently by mileage, not necessarily by date, since backfilling is possible (same
  reasoning spec 009 already established for fuel-economy ordering).
- Marking a rule done that has no mileage interval only resets its last-done date — there's no
  odometer reading to reset, and vice versa for a date-only rule.
- The scheduled evaluation MUST NOT fail (or leave rules partially updated) because of one
  vehicle's or one tenant's bad data — an error evaluating one rule must not prevent every other
  rule from being evaluated in the same run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Owners MUST be able to create a reminder rule for one of their own vehicles with a
  label and at least one of a date interval or a mileage interval (both allowed together).
- **FR-002**: The system MUST reject a reminder rule with neither a date nor a mileage interval,
  creating nothing.
- **FR-003**: The system MUST refuse to create, list, fetch, update, delete, or mark-done a
  reminder rule against a vehicle or rule that doesn't exist or belongs to a different tenant,
  indistinguishably from either case.
- **FR-004**: Owners MUST be able to list a vehicle's reminder rules and fetch a single rule's
  full detail, each including a freshly-computed status ("on track," "coming up," "overdue," or
  "not enough data"), scoped to their own tenant only.
- **FR-005**: The system MUST compute a date-based rule's status from its last-done date plus its
  date interval compared to the current date, and a mileage-based rule's status from its
  last-done odometer reading plus its mileage interval compared to the vehicle's most recently
  known odometer reading (Edge Cases).
- **FR-006**: For a rule with both a date and mileage interval, the system MUST report the more
  urgent of the two computed statuses as the rule's overall status ("whichever comes first").
- **FR-007**: The system MUST NOT compute a mileage-based status when the vehicle has no fuel or
  service records to derive a current odometer reading from — that side of the rule MUST show "not
  enough data" instead of a guessed or default status (constitution Principle IV).
- **FR-008**: Owners MUST be able to mark a reminder rule done, resetting its last-done date to
  today and (if it has a mileage interval) its last-done odometer reading to the vehicle's most
  recently known reading.
- **FR-009**: Owners MUST be able to update a reminder rule's label or either interval, with every
  field not included in the update keeping its previous value, and delete a reminder rule.
- **FR-010**: The system MUST evaluate every reminder rule across every tenant on a recurring
  schedule, independent of any user-initiated request, using the identical status-computation
  logic the live read path uses (User Story 5).
- **FR-011**: The scheduled evaluation MUST record each rule's freshly-computed status and the
  time it was evaluated, and MUST continue evaluating every other rule even if one rule's
  evaluation fails (Edge Cases).
- **FR-012**: Every new or changed piece of user-facing text this feature introduces MUST be
  routed through the existing i18n string infrastructure (constitution Principle IX).
- **FR-013**: This feature's UI MUST use the design system already shipped (spec 008).

### Key Entities

- **Reminder Rule**: A recurring maintenance reminder for one vehicle — label, an optional date
  interval, an optional mileage interval (at least one required), the date/odometer reading it was
  last done, and (written only by the scheduled evaluation, User Story 5) a cached status and
  last-evaluated timestamp. Belongs to exactly one vehicle and (via the vehicle) one tenant.
  Due date/due odometer/current status are not separately stored, writable fields on this
  entity — due date and due odometer are derived from the stored interval and last-done anchor,
  and current status is always freshly computed at read time (FR-004/FR-005), with the
  scheduler-written cache existing only so a not-yet-built future notification feature has
  something durable to read between requests (spec.md Assumptions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can create a complete reminder rule (label + at least one interval) and see
  it reflected in the vehicle's reminder list without a page reload.
- **SC-002**: For any reminder rule, the reported status is verifiably consistent with its interval
  and last-done anchor across 100% of tested cases (on track, coming up, overdue, not-enough-data
  for a mileage rule with no odometer data, and both-intervals-disagree).
- **SC-003**: The scheduled evaluation successfully updates every reminder rule's cached status
  across every tenant in a single run, and one rule's evaluation failure never prevents any other
  rule in the same run from being evaluated.
- **SC-004**: A tenant can never view, modify, delete, or mark-done another tenant's reminder
  rules, verified across every operation this feature exposes.
- **SC-005**: Marking a reminder done resets its status to "on track" (or the appropriate
  not-enough-data state) with zero lingering effect from its previous due state.

## Assumptions

- **The "coming up" threshold is proportional to each rule's own interval** (e.g. the last ~10% of
  the interval remaining), not a fixed absolute number of days or distance units — see Edge Cases;
  the exact proportion is a research.md decision, not a product requirement needing sign-off.
- **A vehicle's "current odometer reading"** is derived the same way spec 009's fuel-economy
  ordering already derives "the vehicle's history" — the highest odometer reading among all of the
  vehicle's fuel and service records combined — rather than introducing a new, separately-tracked
  "current mileage" field on the vehicle itself. This reuses data that already exists instead of
  asking the owner to maintain a second, potentially-inconsistent source of truth.
- **Actual notification delivery (email, web push) is explicitly out of scope** — issues #14 and
  #15 own that, per the milestone's own issue split. This feature's scheduled evaluation exists to
  make "which reminders are currently due, as of the last check" a durable, queryable fact (the
  cached status + last-evaluated timestamp) that those future features can read from, without this
  feature needing to guess at their eventual design (e.g. how they'll decide "already notified
  about this, don't resend").
- **No maintenance-type matching against service record descriptions** — a reminder rule's
  "last done" anchor is set explicitly by the owner (at creation, via edit, or via mark-done), not
  inferred by matching its label against service record text. This avoids the same fuzzy-matching
  complexity spec 010 already declined to build for duplicate detection, and keeps a reminder rule
  meaningful even for maintenance an owner tracks here but never logged as a formal service record.
- **The scheduled evaluation runs on a Cloudflare Cron Trigger** (constitution: Cron Triggers only,
  Cloudflare Queues MUST NOT be used) on a daily cadence — frequent enough that a reminder is never
  stale for more than about a day between scheduled checks, without evaluating far more often than
  a maintenance reminder (measured in days/weeks/months, not minutes) could ever need. The exact
  schedule expression is a research.md/implementation decision, not a product requirement.
