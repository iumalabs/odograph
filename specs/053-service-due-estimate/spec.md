# Feature Specification: History-Based Service Due Estimate

**Feature Branch**: `053-service-due-estimate`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Issue #167: Service form doesn't surface a next-service-due estimate
from history. Infer next-due mileage for recurring service work from the vehicle's own
service-record history (matching by description similarity), not a hardcoded interval. See issue
#167 for full context and open scoping questions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See an estimated next-due mileage for recurring work (Priority: P1)

An owner who has logged two or more past service records describing the same recurring work (e.g.
several "Замена масла и фильтров" entries) opens the service-entry form and sees an estimate of
when that work is next likely due, based on their own vehicle's real history — without ever having
set up a reminder for it themselves.

**Why this priority**: This is the entire point of the feature — closing the gap between "the
data to predict this already exists in the service log" and "the owner has to notice the pattern
and do the math themselves."

**Independent Test**: Log two service records for the same vehicle with an identical description
and different odometer readings, then open the service-entry form and confirm an estimate appears
for that work, computed from the real interval between those records.

**Acceptance Scenarios**:

1. **Given** a vehicle has exactly two service records sharing the same description, **When** the
   owner opens that vehicle's service-entry form, **Then** an estimate is shown for that work,
   equal to the more recent record's odometer reading plus the distance between the two records.
2. **Given** a vehicle has three or more service records sharing the same description, **When**
   the estimate is computed, **Then** it uses the average distance across all consecutive pairs in
   that group, not just the single most recent gap.
3. **Given** a vehicle has multiple different recurring work groups (each with ≥2 matching
   records), **When** the owner opens the service-entry form, **Then** only the single
   soonest-due estimate is shown, clearly naming which work it's for.
4. **Given** the displayed estimate, **When** the owner reads it, **Then** it is visibly labeled
   as an estimate (e.g. "estimated", "based on your history") — never phrased as a confirmed
   due date or manufacturer schedule.

---

### User Story 2 - Accept an estimate to create a real reminder (Priority: P2)

An owner who sees a history-based estimate and trusts it can accept it with one action, turning it
into a real reminder — the same kind they'd get for anything they configured by hand, including the
existing push/email delivery when it comes due.

**Why this priority**: A number the owner has to remember to act on themselves delivers only part
of the value; turning it into an actual tracked reminder is what makes the estimate load-bearing
rather than trivia. Depends on User Story 1 existing first (nothing to accept otherwise).

**Independent Test**: With a qualifying estimate showing, trigger the accept action and confirm a
new `reminder_rules` entry now exists for that vehicle with the estimate's work description and
computed interval, and that it behaves exactly like any other reminder rule from then on (shows up
in the Reminders screen, is eligible for the existing due-soon/overdue push and email delivery).

**Acceptance Scenarios**:

1. **Given** a qualifying estimate is shown, **When** the owner accepts it, **Then** a new
   `reminder_rules` entry is created for that vehicle using the work group's description as its
   label and the computed average distance as its mileage interval.
2. **Given** an estimate has just been accepted, **When** the service-entry form is shown again,
   **Then** the history-based estimate for that same work no longer appears (FR-006's
   duplicate-suppression now applies, since a real reminder exists).
3. **Given** the owner retries the same accept action (e.g. a dropped connection triggers the
   existing offline-queue retry), **When** the server processes the retry, **Then** at most one
   `reminder_rules` entry is created — never a duplicate.
4. **Given** a newly accepted reminder's computed due point is later reached, **When** the existing
   daily reminder evaluation runs, **Then** the owner receives push/email exactly as they would for
   any manually-created reminder rule — no special-casing needed downstream.

---

### User Story 3 - Never show a misleading or duplicate estimate (Priority: P3)

An owner whose vehicle has too little history for a given work item, or who already maintains an
explicit reminder for that exact work, never sees a fabricated or conflicting estimate.

**Why this priority**: A wrong or duplicated "due" number is worse than no number — it erodes
trust in every other real figure the app shows (constitution Principle IV: never fabricate data).

**Independent Test**: (a) Log exactly one service record for a vehicle and confirm no estimate
appears referencing it. (b) Create an explicit reminder rule with the same description as an
existing 2+-record work group and confirm the history-based estimate for that same work no longer
appears (the explicit reminder is shown instead, via the existing reminders feature).

**Acceptance Scenarios**:

1. **Given** a vehicle has zero or exactly one service record for a given description, **When**
   the service-entry form is shown, **Then** no estimate is surfaced for that description — there
   is no interval to measure from fewer than two occurrences.
2. **Given** a vehicle already has an explicit `reminder_rules` entry whose label matches a
   recurring work group's description, **When** the service-entry form is shown, **Then** the
   history-based estimate for that specific work is suppressed (the owner's own explicit reminder
   takes precedence and is not duplicated).
3. **Given** new service records are logged over time, **When** the owner next opens the
   service-entry form, **Then** the estimate reflects the latest history automatically — no stale
   number, no manual refresh step.

---

### Edge Cases

- Two records in the same work group share the identical odometer reading (zero-distance
  interval) → that pair contributes no usable interval; if it's the only pair in the group, no
  estimate is shown for that work (same as having fewer than two usable data points).
- A vehicle's service records are logged out of chronological order (e.g. a past record added or
  edited after later ones already exist) → grouping and interval math is based on each record's
  own `serviceDate`/odometer values, not insertion order.
- Two or more recurring work groups tie exactly for soonest-due → show the one whose most recent
  matching record is most recent (tie-break, not user-facing ambiguity).
- A vehicle has no service records at all yet → no estimate shown; the form behaves exactly as it
  does today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an owner opens the service-entry form for a vehicle, System MUST look at that
  vehicle's own service-record history and group records that share the same description (exact
  match, case- and whitespace-normalized).
- **FR-002**: For any work group with two or more matching records, System MUST be able to compute
  an estimated next-due odometer reading: the most recent matching record's odometer reading plus
  the average distance between consecutive records in that group.
- **FR-003**: System MUST NOT compute or display an estimate for a work group with fewer than two
  usable (non-zero-interval) matching records.
- **FR-004**: When more than one work group qualifies, System MUST surface only the single
  soonest-due estimate in the service-entry form, naming the work it's for.
- **FR-005**: The displayed estimate MUST be clearly labeled as a computed estimate based on the
  vehicle's own history, never presented as a confirmed or manufacturer-specified schedule.
- **FR-006**: If an explicit `reminder_rules` entry already exists for the vehicle with a label
  matching a recurring work group's description, System MUST suppress the history-based estimate
  for that specific work (the explicit reminder is the source of truth for it instead).
- **FR-007**: The estimate MUST reflect the vehicle's current service-record data every time the
  form is opened — no caching that could show a number that's gone stale since the last record was
  logged.
- **FR-008**: The owner MUST be able to accept a shown estimate through a single explicit action;
  accepting it MUST create a real `reminder_rules` entry for that vehicle, using the work group's
  description as the reminder's label and the computed average distance as its mileage interval.
- **FR-009**: An accepted reminder MUST behave identically to one the owner created by hand from
  that point on — same fields, same eligibility for the existing due-soon/overdue push and email
  delivery, no distinct "auto-created" code path downstream of creation.
- **FR-010**: Retrying the same accept action MUST NOT create more than one `reminder_rules` entry
  (mirrors the existing idempotency guarantee already applied to other write actions, e.g. specs
  049's mark-done flow).
- **FR-011**: The estimate MUST remain purely computed/display-only (not written anywhere) unless
  and until the owner explicitly accepts it — an estimate the owner never acts on leaves no trace
  in storage.

### Key Entities *(include if feature involves data)*

- **Service Record** *(existing entity, unchanged)*: a logged maintenance event with a
  description, date, and odometer reading. This feature only reads from existing records — it adds
  no new fields to this entity.
- **Recurring Work Estimate** *(derived, not a new stored entity)*: a computed grouping of a
  vehicle's own service records sharing one description, with the average interval between them
  and a projected next-due odometer reading. Recomputed on every read; exists only in memory until
  (and unless) the owner accepts it, at which point it becomes a normal Reminder Rule row.
- **Reminder Rule** *(existing entity, read AND written by this feature)*: an owner-configured
  maintenance interval. Read to avoid showing a duplicate/conflicting estimate for work the owner
  already tracks explicitly (FR-006); written when the owner accepts an estimate (FR-008) — via
  the same existing creation path as a manually-added reminder rule, no new fields or table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner with two or more historical records of the same recurring work sees a
  next-due estimate for it without configuring anything manually.
- **SC-002**: Zero estimates are ever shown for work with fewer than two historical occurrences.
- **SC-003**: An owner who already maintains an explicit reminder for a given work item never sees
  a second, potentially conflicting estimate for that same work.
- **SC-004**: The estimate an owner sees always reflects service records logged up through their
  most recent visit to the form — never a number stale by more than the time since their last
  logged record.
- **SC-005**: An owner can turn a trusted estimate into a tracked reminder in a single action, with
  zero risk of ending up with duplicate reminders even if that action is retried.

## Assumptions

- Matching "the same work" means an exact, case/whitespace-normalized match on the service
  record's free-text description — no fuzzy or semantic matching in this iteration (the data model
  has no separate work-type taxonomy to match against instead).
- Only the single soonest-due recurring work group is surfaced, mirroring the source design
  mockup's one-line hint placement in the service-entry form — not a full list of every recurring
  item the vehicle has history for. Can be revisited as a later, separate enhancement.
- The estimate is distance-based only (odometer interval), not date-based — mirrors both the
  source mockup's own odometer-only formula and the originating issue's "next-due mileage" framing.
  Calendar-based recurrence inference is out of scope here.
- Surfaces only in the service-entry form, matching where the source mockup shows it — not on
  garage cards or the dashboard in this iteration.
- This feature introduces no schema changes: computing the estimate only reads existing
  `service_records`/`reminder_rules` data, and accepting an estimate reuses the existing
  reminder-rule creation path rather than adding new fields or tables.
- "Accept" is presumed to be a single explicit user action (e.g. a button next to the estimate),
  not an automatic/implicit creation — the owner always makes the call before anything is written.
