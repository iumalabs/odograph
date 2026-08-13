# Feature Specification: Mark-Done Logs a Service Record

**Feature Branch**: `049-mark-done-logs-service`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Marking a reminder done doesn't log a corresponding service record
(GitHub issue #154). The design mockup's reminder mark-done action both resets the reminder and
appends a service-record journal entry, so the maintenance history has a durable record of what was
done. The real app only resets the reminder's own last-done fields, leaving zero trace in service
history. Mirrors the already-shipped Planner-card-to-done behavior. Auto-created record must never
fabricate unknown data (cost, performer) — only reuse real, already-known values (label, date,
current odometer) plus an explicit placeholder note flagging it needs the owner to fill in details."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a durable service-history entry after marking a reminder done (Priority: P1)

An owner marks a maintenance reminder as done and later wants to look back at the vehicle's service
history and see that this work actually happened, without having to separately, manually log it.

**Why this priority**: Closes a real gap between two features that are currently disconnected —
today, marking a reminder done leaves no trace anywhere else in the app.

**Independent Test**: Mark a reminder done, then view the vehicle's service records and confirm a
new entry exists reflecting that action.

**Acceptance Scenarios**:

1. **Given** an owner marks a reminder done, **When** they view the vehicle's service history,
   **Then** a new service record appears, using the reminder's own label as its description and
   today's date.
2. **Given** the vehicle has a known current odometer reading at the time a reminder is marked
   done, **When** the new service record is created, **Then** it carries that real odometer value.
3. **Given** the vehicle has no known odometer reading yet, **When** a reminder is marked done,
   **Then** the new service record's odometer field is left blank — never a guessed number.
4. **Given** the auto-created service record, **When** the owner views it, **Then** its cost and
   performed-by fields are blank (not a guessed value) and its notes clearly indicate it was
   auto-created from a reminder and needs the owner to fill in real details.
5. **Given** a client retries the same mark-done request (e.g. after a dropped connection, via the
   offline queue's existing retry mechanism), **When** the server processes the retry, **Then**
   at most one service record is created for that mark-done action — never a duplicate.

---

### Edge Cases

- What happens if the owner never fills in the auto-created record's placeholder details? → No
  different from any other service record the owner leaves sparse — this feature doesn't add any
  new enforcement, just a starting entry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Marking a reminder done MUST create a new service record for that reminder's vehicle,
  in addition to the reminder's own existing reset behavior (last-done date/odometer fields).
- **FR-002**: The created service record's description MUST be the reminder's own label text.
- **FR-003**: The created service record's date MUST be the date the mark-done action occurred.
- **FR-004**: The created service record's odometer reading MUST be the vehicle's current known
  odometer reading if one exists, or left blank if the vehicle has no odometer history yet — never
  a guessed number.
- **FR-005**: The created service record's cost and performed-by fields MUST be left blank — the
  system MUST NOT guess either value.
- **FR-006**: The created service record's notes MUST clearly indicate it was automatically created
  from marking a reminder done, and that the owner should fill in real details.
- **FR-007**: Retrying the same mark-done request (already-established idempotency behavior) MUST
  NOT create more than one service record for a single mark-done action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every reminder marked done produces exactly one new service-history entry, with zero
  duplicates even under request retries.
- **SC-002**: Zero fabricated figures ever appear on the auto-created record — cost and performer
  are always blank, never guessed.

## Assumptions

- Mirrors the already-shipped Planner-card "done" stage behavior (advancing a plan card to done
  already creates a real service record) — same underlying idea, applied to the reminders flow.
- Out of scope: any UI change to how service records are displayed or edited — the auto-created
  record is a normal service record in every respect once created, editable like any other.
- Out of scope: any user-facing toggle to opt out of this behavior — matches the mockup's own
  unconditional behavior, and the originating issue's framing.
