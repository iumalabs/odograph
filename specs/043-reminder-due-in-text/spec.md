# Feature Specification: Reminder Due-In Text

**Feature Branch**: `043-reminder-due-in-text`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Dashboard's upcoming-reminders list omits the due-in value shown in
the mockup (GitHub issue #139). The mockup shows each reminder's label plus a right-aligned due-in
value (e.g. 'in 1200 km' / 'due 14.09.26'), connected by a dotted-line separator. The real
Dashboard's list shows only the reminder's label, with no due-in text. This is not purely visual:
ReminderRule only exposes a status enum, no numeric days/distance-remaining field exists anywhere
server-side yet. Per constitution Principle II, that figure must be a new server-computed,
division-safe value, not something invented client-side."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how soon an upcoming reminder is due, from the Dashboard (Priority: P1)

An owner glancing at the Dashboard's upcoming-reminders list wants to know not just which
maintenance items are approaching, but roughly how soon — without opening the Reminders screen.

**Why this priority**: This is the entire feature — a single missing detail on an existing list.

**Independent Test**: With a reminder in coming-up or overdue status, view the Dashboard and
confirm the reminder's row shows a due-in value alongside its label.

**Acceptance Scenarios**:

1. **Given** a distance-based reminder that determined its own coming-up/overdue status via
   mileage, **When** the owner views the Dashboard's upcoming list, **Then** that reminder's row
   shows the remaining (or overdue) distance in the vehicle's own odometer unit.
2. **Given** a date-based reminder that determined its own coming-up/overdue status via date,
   **When** the owner views the Dashboard's upcoming list, **Then** that reminder's row shows the
   remaining (or overdue) number of days.
3. **Given** an overdue reminder, **When** the owner views its row, **Then** the due-in text
   clearly reads as past-due (e.g. distinct wording or sign) rather than looking identical to a
   reminder that still has time left.

---

### Edge Cases

- What happens for a reminder whose status is not-enough-data? → No due-in text is shown for it
  (this list already excludes not-enough-data reminders entirely, per its existing filtering) —
  no change needed here, just don't regress that.
- What happens when a reminder's status was determined by one side (date or mileage) but the other
  side also has an interval configured? → The due-in text reflects only the side that actually
  determined the status — the same "more urgent side wins" rule already governing `status` itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each reminder shown in the Dashboard's upcoming-reminders list MUST display a due-in
  value alongside its label, for any reminder whose status is `coming_up` or `overdue`.
- **FR-002**: The due-in value MUST be expressed in whichever unit (days, or distance in the
  vehicle's own odometer unit) corresponds to the side of the reminder's interval that actually
  determined its status — never a unit unrelated to what made the reminder due.
- **FR-003**: The underlying remaining-days or remaining-distance figure MUST be computed
  server-side, reusing the existing status-computation logic's own interval/remaining math, and
  MUST be guarded the same way that logic already guards against a zero-length interval.
- **FR-004**: An overdue reminder's due-in text MUST be visually/textually distinguishable from a
  coming-up reminder's due-in text (e.g. distinct wording), not just distinguishable by color.
- **FR-005**: The system MUST NOT display a due-in value for a reminder whose status is
  not-enough-data.

### Key Entities

- **Reminder status result (existing, extended)**: gains one new remaining-value/unit pair,
  alongside the `remainingFraction` field already added for the progress-bar feature (specs/041) —
  same "whichever side determined status" selection rule, expressed as an absolute number instead
  of a fraction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can tell how soon each upcoming/overdue reminder is due directly from the
  Dashboard, without opening the Reminders screen.
- **SC-002**: The due-in figure shown for a reminder is always in the unit that actually determined
  its status — never a distance figure for a reminder that became due by date, or vice versa.

## Assumptions

- Reuses the exact "which side determined status" selection already established for
  `remainingFraction` (specs/041) — this feature adds the absolute-value counterpart, not a
  separate selection rule.
- Out of scope: changing which reminders appear in the Dashboard's upcoming list (already filtered
  to coming_up/overdue, capped at 5) — this only adds detail to rows already shown.
- Out of scope: any change to the Reminders screen's own list (ReminderRulePanel.tsx) — that screen
  already shows richer detail than the Dashboard's abbreviated summary; this feature is scoped to
  the Dashboard panel only, per the originating issue.
