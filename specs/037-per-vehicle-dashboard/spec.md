# Feature Specification: Per-Vehicle Dashboard

**Feature Branch**: `037-per-vehicle-dashboard`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Dashboard shows all-vehicles overview instead of the mockup's
per-vehicle deep-dive (GitHub issue #125). Replace the Dashboard nav screen's content — currently a
list of every vehicle's summary card — with a deep-dive into the currently selected vehicle: spend
KPIs, a monthly expense chart, an upcoming-reminders list, and a recent-activity list, matching the
design prototype's actual 'Дашборд' screen."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a selected vehicle's spend KPIs at a glance (Priority: P1)

An owner who has selected a vehicle wants to see, on the Dashboard screen, a quick summary of that
vehicle's spending: total spend, how much of it was fuel, how much was service, and cost per unit of
distance — for that one vehicle specifically.

**Why this priority**: The core of what "Дашборд" means in the approved design — a spend summary
for the vehicle you're currently looking at. Every other widget on this screen builds on the same
selected-vehicle context this establishes.

**Independent Test**: Can be fully tested by selecting a vehicle with existing service/fuel records
and viewing the Dashboard screen, confirming the four KPI figures match that vehicle's actual
records.

**Acceptance Scenarios**:

1. **Given** a vehicle is selected and has service and fuel records, **When** the owner views the
   Dashboard screen, **Then** it shows that vehicle's total spend, fuel spend, service spend, and
   cost-per-distance — not any other vehicle's figures, and not a combined figure across vehicles.
2. **Given** no vehicle is currently selected, **When** the owner views the Dashboard screen,
   **Then** it prompts them to select a vehicle from the Garage screen rather than showing empty or
   fabricated figures.
3. **Given** a selected vehicle has no records yet, **When** the owner views the Dashboard screen,
   **Then** every KPI reads as zero/not-available rather than erroring or showing stale data from a
   previously selected vehicle.

---

### User Story 2 - See the selected vehicle's spending trend over time (Priority: P2)

An owner wants to see how a selected vehicle's spending has trended over recent months, split
between fuel and service costs, to spot patterns (e.g. a recent spike).

**Why this priority**: A natural companion to the KPIs (User Story 1) — valuable, but the screen is
still useful without it, unlike the KPIs themselves.

**Independent Test**: Can be fully tested by selecting a vehicle with records spanning several
months and confirming the chart shows one bar per month, each split between fuel and service
amounts, matching that vehicle's actual per-month totals.

**Acceptance Scenarios**:

1. **Given** a selected vehicle has records in at least two different months, **When** the owner
   views the Dashboard screen, **Then** it shows one bar per month, each visually split between fuel
   and service spend for that month.
2. **Given** a selected vehicle has no records in a given recent month, **When** the owner views the
   chart, **Then** that month still appears with a zero/empty bar, not skipped — so months are
   directly comparable at a glance.

---

### User Story 3 - See upcoming reminders and recent activity at a glance (Priority: P3)

An owner wants a quick glance at what's coming up (next reminders) and what's already been logged
recently (last few service/fuel entries) for the selected vehicle, without navigating to the
reminder or record panels individually.

**Why this priority**: Useful convenience widgets, but the screen delivers its core value (spend
visibility) without them — lowest priority of the three.

**Independent Test**: Can be fully tested by selecting a vehicle with reminders in coming-up/overdue
status and recent service/fuel entries, and confirming both lists show the correct, most-relevant
items for that vehicle.

**Acceptance Scenarios**:

1. **Given** a selected vehicle has reminders in "coming up" or "overdue" status, **When** the owner
   views the Dashboard screen, **Then** it shows a short list of the next few, most urgent first.
2. **Given** a selected vehicle has no reminders needing attention, **When** the owner views the
   Dashboard screen, **Then** the upcoming-reminders list shows an empty/all-clear state, not an
   error.
3. **Given** a selected vehicle has service and/or fuel records, **When** the owner views the
   Dashboard screen, **Then** it shows a short list of the most recent entries (mixing both record
   types), most recent first.

---

### Edge Cases

- What happens while the selected vehicle's data is still loading? The screen shows its structure
  immediately with each widget in a not-yet-loaded state, rather than blocking the whole screen —
  matching how every other per-vehicle panel in this app already behaves (fetch-on-select, no full-
  screen spinner).
- What happens if the owner switches which vehicle is selected while on the Dashboard screen (e.g.
  by navigating back to Garage, selecting a different vehicle)? The Dashboard reflects the newly
  selected vehicle the next time it's viewed — no stale data from the previous selection.
- What happens to the all-vehicles overview capability the current Dashboard screen provides
  (a quick "which of my vehicles needs attention" scan)? See Assumptions — this is intentionally
  superseded, not preserved as a second screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Dashboard screen MUST show spend KPIs (total spend, fuel spend, service spend,
  cost-per-distance) scoped to the currently selected vehicle only.
- **FR-002**: The Dashboard screen MUST prompt the owner to select a vehicle when none is currently
  selected, rather than showing any vehicle's data by default or an empty/broken layout.
- **FR-003**: The Dashboard screen MUST show a monthly spend chart for the selected vehicle,
  covering a bounded, recent window of months, with each month split between fuel and service
  amounts.
- **FR-004**: A month with no records for the selected vehicle MUST still appear in the chart as a
  zero-value entry, not be omitted.
- **FR-005**: The Dashboard screen MUST show a short list of the selected vehicle's most urgent
  upcoming reminders (coming-up or overdue), when any exist.
- **FR-006**: The Dashboard screen MUST show a short list of the selected vehicle's most recent
  service and/or fuel entries, when any exist.
- **FR-007**: None of the Dashboard screen's figures MAY be computed or estimated by the client —
  every KPI and chart value must come from data the server already computes (existing aggregate/
  expense-breakdown endpoints), consistent with every other numeric display already in this app.

### Key Entities

- No new entity. This feature only changes what the Dashboard screen displays, reusing already-
  computed vehicle aggregates, expense-breakdown periods, reminder rules, and service/fuel records —
  all of which already exist and are already exposed to the client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can see a selected vehicle's total, fuel, and service spend, plus its
  cost-per-distance, without navigating away from the Dashboard screen.
- **SC-002**: An owner can identify, from the Dashboard screen alone, whether a selected vehicle's
  spending has recently spiked compared to prior months.
- **SC-003**: An owner can identify a selected vehicle's most pressing upcoming reminder and its
  most recent maintenance/fuel activity without opening any other screen.

## Assumptions

- **Replaces, does not duplicate, the current all-vehicles overview**: the existing Dashboard
  screen's "list every vehicle, flag which needs attention" capability is superseded by this
  feature, not kept as a second screen — Garage's own cards (issue/spec 034) already show each
  vehicle's current odometer and most-urgent-reminder at a glance, making a second, separate
  all-vehicles summary screen redundant. This is a deliberate design decision for this feature, not
  an oversight to flag.
- **No navigation restructuring**: this feature does not change how a vehicle gets selected, add a
  header vehicle-switcher, or make any other screen a top-level nav destination — those are
  out-of-scope, tracked separately (GitHub issues #126, #127). The Dashboard nav item continues to
  be reached exactly as it is today; only its content changes once there.
- **"Recent"/"bounded window" left to implementation, not a fixed count from the source mockup**:
  the source design hardcodes exactly 7 months and exactly 3 upcoming/2 recent items — this feature
  preserves the *shape* (a bounded, glanceable list/chart) without treating those exact counts as
  requirements; the implementation may choose reasonable bounds.
- **No live currency conversion, no fabricated figures**: every value shown is either already
  computed server-side or a direct sum of already-fetched records — matching constitution Principle
  II (server-computed aggregates) and Principle IV (no interpolated data), the same constraint every
  other feature in this app already follows.
