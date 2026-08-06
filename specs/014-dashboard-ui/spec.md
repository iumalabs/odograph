# Feature Specification: Dashboard UI

**Feature Branch**: `014-dashboard-ui`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Dashboard UI (issue #17, milestone M6): a new signed-in screen giving
an owner an at-a-glance overview across all their vehicles — the second nav-rail entry (alongside
the existing Garage screen), matching the 'dashboard' entry already present in the design mockups
that spec 008 didn't implement yet. For each vehicle, show a summary card with its identity, its
server-computed cost-per-distance/cost-per-time/average-fuel-economy (spec 013's already-shipped
aggregates endpoint), and a compact summary of reminders needing attention (spec 011's reminder
rules). Selecting a vehicle's card navigates to its existing Garage detail view. Every aggregate
figure must render its established 'not enough data' treatment rather than blank space or an error;
a vehicle with zero reminders needing attention shows a clear 'all good' state. Out of scope:
fleet-wide/combined-across-vehicles totals — this screen surfaces aggregates per vehicle, not
summed. No new data or computation ships with this feature; it is a pure consumer of the two
already-shipped read endpoints. Follows the design system already shipped in spec 008."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner sees which vehicle needs attention at a glance (Priority: P1)

An owner with multiple vehicles opens the Dashboard and immediately sees, for every vehicle they
own, its running costs and whether it has anything overdue or coming up — without opening each
vehicle individually to check.

**Why this priority**: This is the entire reason the Dashboard exists — everything else (jumping to
a vehicle's detail) is secondary to being able to see the overview in the first place.

**Independent Test**: Sign in as an owner with two or more vehicles in different states (one with an
overdue reminder, one fully on track) and confirm the Dashboard surfaces both vehicles' cost figures
and correctly distinguishes which one needs attention.

**Acceptance Scenarios**:

1. **Given** a signed-in owner with one or more vehicles, **When** they open the Dashboard, **Then**
   every one of their vehicles appears with its own cost-per-distance, cost-per-time, and average
   fuel economy figures.
2. **Given** a vehicle with too little history to compute one or more of those figures, **When** the
   owner views its card, **Then** each affected figure shows an explicit "not enough data" state,
   never blank space, a zero, or an error.
3. **Given** a vehicle with at least one reminder in "coming up" or "overdue" status, **When** the
   owner views its card, **Then** the card clearly indicates it needs attention.
4. **Given** a vehicle with no reminders in "coming up" or "overdue" status (none at all, or all "on
   track"/"not enough data"), **When** the owner views its card, **Then** it shows an explicit "all
   good" state, not an empty gap that could be mistaken for missing data.
5. **Given** a signed-in owner with no vehicles at all, **When** they open the Dashboard, **Then**
   they see a clear empty state, not a blank screen.
6. **Given** two different tenants each with their own vehicles, **When** either opens the
   Dashboard, **Then** they only ever see their own vehicles.

---

### User Story 2 - An owner jumps from the Dashboard to a vehicle that needs attention (Priority: P2)

Having spotted a vehicle that needs attention, the owner selects its card and lands directly in that
vehicle's existing detail view, where the full service/fuel/reminder history already lives.

**Why this priority**: The Dashboard's value as a pure overview (User Story 1) stands on its own;
this shortcut removes a manual "find this vehicle in the Garage list" step but isn't required for
the overview itself to be useful.

**Independent Test**: From the Dashboard, select a vehicle's card and confirm the owner lands on
that exact vehicle's detail view with no intermediate step.

**Acceptance Scenarios**:

1. **Given** the owner is viewing the Dashboard, **When** they select a vehicle's card, **Then**
   they land on that vehicle's existing detail view (service records, fuel records, reminders).
2. **Given** the owner has just navigated to a vehicle's detail view from the Dashboard, **When**
   they look for a way back, **Then** returning to the Dashboard is possible via the same nav-rail
   entry that got them there.

### Edge Cases

- A vehicle with zero service or fuel records at all shows "not enough data" for every one of its
  aggregate figures, not a zero or a blank — this screen renders what spec 013 already computes, it
  never re-derives or guesses around a missing value.
- A vehicle with reminders in a mix of states (some overdue, some coming up, some on track, some
  not-enough-data) is flagged as needing attention if and only if at least one reminder is "coming
  up" or "overdue" — "on track" and "not enough data" reminders never trigger the needs-attention
  state on their own.
- No pagination or scroll-virtualization is assumed necessary for the vehicle list at this stage,
  consistent with the existing Garage screen's own no-pagination assumption at this project's
  current scale.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST provide a Dashboard screen reachable as its own entry point, alongside
  the existing Garage screen, for any signed-in owner.
- **FR-002**: For each of the owner's own vehicles, the Dashboard MUST display that vehicle's
  identity, its cost-per-distance, cost-per-time, and average fuel economy.
- **FR-003**: Any aggregate figure that has no computable value MUST render an explicit "not enough
  data" state, never blank space, a zero standing in for missing data, or an error.
- **FR-004**: For each vehicle, the Dashboard MUST display whether it has any reminder in "coming
  up" or "overdue" status, and MUST show an explicit "all good" state when it does not.
- **FR-005**: Selecting a vehicle on the Dashboard MUST take the owner to that vehicle's existing
  detail view.
- **FR-006**: The Dashboard MUST show only vehicles belonging to the signed-in owner's own tenant.
- **FR-007**: An owner with zero vehicles MUST see a clear empty state on the Dashboard, not a blank
  screen.
- **FR-008**: Every new or changed piece of user-facing text this feature introduces MUST be routed
  through the existing i18n string infrastructure (constitution Principle IX).
- **FR-009**: This feature's UI MUST use the design system already shipped (spec 008) — the same
  tokens, shell, and component patterns already applied to every other screen.

### Key Entities

No new entities — this feature is a read-only UI consumer of data that already exists: the vehicle
list (spec 006), each vehicle's aggregate summary (spec 013), and each vehicle's reminder rules with
computed status (spec 011). It stores nothing of its own.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner with two or more vehicles, at least one needing attention, can correctly
  identify which vehicle needs attention from the Dashboard alone, without opening any vehicle's
  detail view.
- **SC-002**: Every aggregate and reminder-summary figure the Dashboard displays is either a real
  computed value or an explicit "not enough data"/"all good" state, across every tested combination
  of vehicle data (zero records, partial records, all reminders on track, some overdue) — never
  blank space or a rendering error.
- **SC-003**: Selecting a vehicle from the Dashboard reaches that vehicle's full detail view in a
  single interaction.
- **SC-004**: A tenant only ever sees their own vehicles on the Dashboard, verified across every
  view of the screen.

## Assumptions

- **No fleet-wide totals**: this screen surfaces each vehicle's own aggregate figures side by side,
  never a combined/summed figure across vehicles — consistent with spec 013's own vehicle-level-only
  scope boundary.
- **No new data or computation**: this feature is a pure consumer of the vehicle list, each
  vehicle's aggregate summary (spec 013), and each vehicle's reminder rules with status (spec 011),
  all of which already exist; nothing new is stored.
- **"Needing attention" is a status flag, not a full reminder list**: the Dashboard indicates _that_
  a vehicle has one or more "coming up"/"overdue" reminders (and reasonably surfaces enough detail,
  such as a count or the single most urgent one, to make the flag meaningful at a glance), rather
  than reproducing each vehicle's full reminder list — that already exists on the detail view this
  screen links to.
- **No pagination**: matches the existing Garage screen's own assumption that the current expected
  scale (an individual or small fleet's worth of vehicles) doesn't need it yet.
