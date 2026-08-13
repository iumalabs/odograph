# Feature Specification: Richer Garage Cards

**Feature Branch**: `041-richer-garage-cards`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Garage cards show far less at-a-glance data than the mockup (GitHub
issue #138). Add the vehicle's average fuel economy as a large stat next to the odometer (already
computed server-side, division-safe), and a progress-bar visualization of how close the vehicle is
to its most urgent reminder (needs a new server-computed, division-safe 'percent of the way through
the interval' value — the status enum already exists but no percentage does). Give the odometer and
fuel-economy figures the mockup's large-number visual treatment. Out of scope: a third
total-consumption stat and a free-text maintenance note, neither of which map onto this app's real
data model."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See each vehicle's fuel economy at a glance in the Garage (Priority: P1)

An owner with one or more vehicles looks at the Garage screen and wants to see how efficiently each
vehicle is running without opening it.

**Why this priority**: The single biggest information-density gap versus the approved design — the
data is already fetched, this is the smallest change that meaningfully closes the gap.

**Independent Test**: With a vehicle that has at least two fuel records (enough to compute an
economy figure), view the Garage screen and confirm a fuel-economy figure appears prominently on
that vehicle's card, in the vehicle's own unit convention.

**Acceptance Scenarios**:

1. **Given** a vehicle with enough fuel history to compute an average fuel economy, **When** the
   owner views the Garage screen, **Then** that vehicle's card shows the figure as a large,
   prominent number, styled distinctly from the smaller chips already on the card.
2. **Given** a vehicle with zero or one fuel record (not enough history), **When** the owner views
   the Garage screen, **Then** the card shows the same not-enough-data placeholder already used
   elsewhere in the app for this figure — never a fabricated number.

---

### User Story 2 - See how close a vehicle is to its next reminder as a visual bar (Priority: P2)

An owner wants to see, without opening a vehicle, how much runway is left before its most urgent
reminder comes due — not just a status label, but a sense of "how close."

**Why this priority**: Adds real, previously-uncomputed information (a numeric progress fraction),
so it's scoped as a distinct, slightly higher-risk increment after the simpler fuel-economy stat.

**Independent Test**: With a vehicle that has a reminder with enough history to compute a status,
view the Garage screen and confirm a progress bar appears on that vehicle's card, visually
reflecting the reminder's urgency (e.g. more "used up" as the reminder gets closer to due, a
distinct color once overdue).

**Acceptance Scenarios**:

1. **Given** a vehicle whose most urgent reminder has enough history to compute a status, **When**
   the owner views the Garage screen, **Then** a progress bar appears on the card whose fill
   proportion reflects how far through the reminder's interval the vehicle currently is, colored
   consistently with the reminder's status (on-track / coming-up / overdue).
2. **Given** a vehicle whose most urgent reminder does not have enough history to compute a status
   (`not_enough_data`), **When** the owner views the Garage screen, **Then** no progress bar is
   shown for it — never a guessed fill proportion.
3. **Given** a vehicle with no reminders at all, **When** the owner views the Garage screen,
   **Then** no progress bar area appears on that card.

---

### Edge Cases

- What happens when a reminder is overdue? → The bar reflects "past full" (e.g. shown as 100%+ or
  visually capped at full with the overdue color), never a negative or nonsensical fill percentage.
- What happens when a vehicle has a most-urgent reminder driven by date only, distance only, or
  both? → The bar reflects whichever side actually determined the reminder's overall status (the
  same "more urgent side wins" rule the existing status computation already uses) — not a separate,
  inconsistent calculation.
- What happens when a vehicle has fuel records but they're all flagged as semantic duplicates? →
  The fuel-economy figure follows the exact same exclusion rule the saved-record economy figure
  already uses; if that leaves not enough data, show the not-enough-data placeholder.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Garage screen MUST show each vehicle's average fuel economy as a large, visually
  prominent figure on that vehicle's card, using the vehicle's existing unit convention.
- **FR-002**: The fuel-economy figure MUST use the exact same server-computed value and
  not-enough-data handling already used elsewhere in the app for this figure (no new computation,
  no new fabricated placeholder).
- **FR-003**: The Garage screen MUST show a progress bar on a vehicle's card reflecting how far
  through its most urgent reminder's interval the vehicle currently is, whenever that reminder has
  enough history to compute a status.
- **FR-004**: The system MUST NOT display a progress bar (or any numeric percentage) for a reminder
  whose status is not-enough-data, and MUST NOT display one at all for a vehicle with no reminders.
- **FR-005**: The progress-fraction computation MUST be performed server-side, reusing the existing
  reminder-status computation's own interval/remaining-fraction logic, and MUST be guarded against
  division by a zero-length interval — consistent with how every other aggregate in this app is
  computed.
- **FR-006**: The progress bar's color MUST be visually consistent with the reminder's existing
  status coloring (on-track / coming-up / overdue) already used elsewhere in the app.
- **FR-007**: The odometer and fuel-economy figures MUST be styled with greater visual weight
  (larger font, distinct from the card's existing small chips) than the card's other, secondary
  details (VIN, unit, sync status).

### Key Entities

- **Reminder status result (existing, extended)**: the server's existing per-rule status
  computation gains one new field — the numeric fraction of the interval remaining/elapsed for
  whichever side (date or distance) determined the rule's overall status. No new entity, no new
  persisted field — purely a derived value already available to be exposed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can see a vehicle's fuel economy and its progress toward its next reminder
  directly from the Garage screen, without opening the vehicle, for every vehicle with enough
  history to support each figure.
- **SC-002**: Zero fabricated figures are ever shown — every vehicle/reminder combination lacking
  enough history shows the established not-enough-data treatment instead of a guessed number.
- **SC-003**: The progress bar's fill percentage for a given reminder is numerically consistent with
  that reminder's own status (e.g. a reminder shown as "coming up" is never rendered with a bar
  that looks barely started).

## Assumptions

- "Most urgent reminder" reuses Garage.tsx's existing `mostUrgentReminder()` selection (overdue
  outranks coming-up; on-track/not-enough-data never qualify) — this feature doesn't change which
  reminder is picked, only how much detail is shown about it.
- Out of scope (per the originating issue): a third "total consumption" stat and a free-text
  maintenance note — neither has a real, non-fabricated backing field in this app's data model.
- Out of scope: any change to the reminder-rules API's existing status/urgency semantics — this
  only adds one new read-only field alongside the existing ones.
