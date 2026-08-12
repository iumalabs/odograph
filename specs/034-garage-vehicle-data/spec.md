# Feature Specification: Garage Cards Show Vehicle Data

**Feature Branch**: `034-garage-vehicle-data`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Garage cards show no vehicle data (GitHub issue #107). The Garage
screen is this app's default landing screen showing every vehicle as a card. Right now each card
shows only name, spec string, VIN, odometer unit, and sync status chips — no computed data about
the vehicle at all, even though this data (aggregates, reminders) is already computed server-side
and already shown on a different screen (Dashboard). This feature closes the specific gap Garage
has that Dashboard does not: current odometer reading and a next-upcoming-reminder indicator per
vehicle card."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a vehicle's current odometer at a glance (Priority: P1)

An owner looking at their list of vehicles wants to see each vehicle's current odometer reading
directly on its card, without opening the vehicle to find it.

**Why this priority**: The single most basic piece of vehicle status information; without it, the
other card additions have nothing to anchor to.

**Independent Test**: Can be fully tested by viewing the Garage screen for a vehicle with existing
service/fuel records and confirming its card shows the same current odometer value that its detail
view already computes.

**Acceptance Scenarios**:

1. **Given** a vehicle with at least one service or fuel record carrying an odometer reading,
   **When** the owner views the Garage screen, **Then** that vehicle's card shows its current
   (highest recorded) odometer reading.
2. **Given** a vehicle with no service or fuel records yet, **When** the owner views the Garage
   screen, **Then** that vehicle's card shows no odometer reading (not a fabricated zero or dash
   implying a real value).

---

### User Story 2 - See which vehicles need attention at a glance (Priority: P1)

An owner scanning their vehicle list wants to immediately see which vehicles have an upcoming or
overdue reminder, without opening each one individually.

**Why this priority**: Equal priority to User Story 1 — this is the other half of "the card actually
tells you something," and it's the piece most directly tied to the original design's intent (a
mini-dashboard, not just a name plate).

**Independent Test**: Can be fully tested by viewing the Garage screen for a vehicle with a
coming-up or overdue reminder rule and confirming its card visibly reflects that, and that a
vehicle with only on-track reminders (or none at all) does not show an alarm indicator.

**Acceptance Scenarios**:

1. **Given** a vehicle with at least one reminder rule whose status is "coming up" or "overdue",
   **When** the owner views the Garage screen, **Then** that vehicle's card visibly indicates it
   needs attention.
2. **Given** a vehicle whose reminder rules are all "on track" (or that has no reminder rules at
   all), **When** the owner views the Garage screen, **Then** that vehicle's card shows no
   needs-attention indicator.

---

### Edge Cases

- What happens while a vehicle's odometer/reminder data is still loading? The card renders
  immediately with its existing fields (name, spec, VIN, etc.); the new data appears once its
  fetch resolves, matching how Dashboard's own cards already behave (no blocking spinner over the
  whole card).
- What happens if the odometer/reminder fetch for one vehicle fails (e.g., a transient network
  error)? That vehicle's card simply omits the new data (falls back to the "no data yet" state from
  User Story 1's second scenario) rather than showing an error or blocking the rest of the list —
  matching Dashboard's existing `.catch(() => null)` resilience pattern.
- A vehicle can have multiple simultaneously due/overdue reminders — the card shows the
  single most urgent one (overdue takes priority over coming-up), not a list of all of them, to
  keep the card compact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Garage screen MUST show each vehicle's current odometer reading on its card when
  that vehicle has at least one service or fuel record with a recorded odometer value.
- **FR-002**: The Garage screen MUST show no odometer reading on a vehicle's card when that vehicle
  has no service or fuel records with a recorded odometer value yet.
- **FR-003**: The Garage screen MUST indicate, per vehicle card, whether that vehicle has at least
  one reminder in "coming up" or "overdue" status.
- **FR-004**: When a vehicle has more than one reminder needing attention, the card MUST reflect
  only the single most urgent one (overdue ranks above coming-up).
- **FR-005**: The Garage screen MUST NOT show a needs-attention indicator for a vehicle whose
  reminders are all on-track or that has no reminders.
- **FR-006**: A slow or failed fetch of a vehicle's odometer/reminder data MUST NOT block or error
  the rest of the Garage screen — every other vehicle's card renders normally regardless.

### Key Entities

- **Vehicle** (existing entity, no changes): the card now additionally surfaces two
  already-computed-elsewhere values — current odometer reading and reminder-attention status —
  neither of which is a new stored attribute of the vehicle itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can identify a vehicle's current odometer reading directly from the Garage
  screen, without opening that vehicle, for any vehicle that has at least one service or fuel
  record.
- **SC-002**: A user can identify which of their vehicles need attention (an upcoming or overdue
  reminder) directly from the Garage screen, without opening any vehicle individually.
- **SC-003**: Viewing the Garage screen with one vehicle's data temporarily unavailable does not
  prevent any other vehicle's card from displaying normally.

## Assumptions

- **Reuses existing computed data, no new stored fields**: both the odometer reading and the
  reminder-attention status are derived from data the server already computes elsewhere (service/
  fuel record odometer readings; reminder rule status) — this feature is about *surfacing* that
  data on a screen that currently omits it, not computing anything new.
- **No spend/trend visualization in this feature**: a spending-over-time indicator (sparkline or
  similar) is out of scope — that's a separate, already-distinct concern (expense analytics) from
  "the card shows basic vehicle status."
- **Text-based indicators, not exact mockup visual parity**: a progress bar or chart widget is not
  required — a plain, labeled figure (matching how the app's Dashboard screen already presents its
  own computed data) satisfies "the data is visible on the card."
- **Garage remains the default screen; Dashboard is unchanged**: this feature adds to Garage's
  cards: it does not remove, duplicate-and-diverge from, or replace anything Dashboard already
  shows.
