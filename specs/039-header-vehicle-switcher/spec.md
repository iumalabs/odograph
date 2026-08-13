# Feature Specification: Header Vehicle Switcher

**Feature Branch**: `039-header-vehicle-switcher`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "No global vehicle switcher or quick-add-fuel shortcut in the header
(GitHub issue #127). Add a row of small vehicle pills to the persistent header, letting the owner
switch which vehicle every vehicle-scoped screen shows data for without leaving the screen they're
on, plus a persistent quick-action button that jumps to the Fuel screen from anywhere. Now that
Fuel/Service/Reminders/Planner/Documents/Dashboard are all their own top-level nav screens for the
selected vehicle (issue #126), a header switcher is genuinely useful: switching vehicles no longer
requires returning to Garage first."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch which vehicle is selected without leaving the current screen (Priority: P1)

An owner viewing, say, the Fuel screen for one vehicle wants to check the same screen for a
different vehicle, without navigating back to Garage and re-selecting.

**Why this priority**: This is the entire feature — the quick-fuel shortcut (User Story 2) is a
smaller convenience on top of it.

**Independent Test**: Can be fully tested by, while viewing any vehicle-scoped screen, clicking a
different vehicle's pill in the header and confirming the current screen now shows that vehicle's
data, without navigating away.

**Acceptance Scenarios**:

1. **Given** the owner has more than one vehicle and is viewing any vehicle-scoped screen (Dashboard,
   Fuel, Service, Reminders, Planner, Documents), **When** they click a different vehicle's pill in
   the header, **Then** the current screen immediately shows that vehicle's data instead, without
   changing which screen they're on.
2. **Given** the owner has only one vehicle, **When** they view the header, **Then** exactly one
   pill appears (or the switcher is otherwise unobtrusive) — no broken layout for a single-vehicle
   owner.
3. **Given** the owner has no vehicles yet, **When** they view the header, **Then** no pills appear
   and nothing is broken.

---

### User Story 2 - Jump straight to logging fuel from anywhere (Priority: P2)

An owner wants a one-click way to get to the fuel-entry screen for whichever vehicle is currently
selected, from any screen, without first navigating to the Fuel nav icon.

**Why this priority**: A smaller convenience layered on top of User Story 1 — useful, but the header
switcher alone already delivers this feature's main value.

**Independent Test**: Can be fully tested by, while viewing any screen, clicking the header's
quick-fuel button and confirming it opens the Fuel screen for the currently selected vehicle.

**Acceptance Scenarios**:

1. **Given** the owner is on any screen, **When** they click the header's quick-fuel button,
   **Then** they land on the Fuel screen.

---

### Edge Cases

- What happens if the owner clicks the currently-already-selected vehicle's pill again? No change —
  it's already showing that vehicle's data.
- What happens on the Garage, Review, or Settings screens (not vehicle-scoped)? The header switcher
  and quick-fuel button still appear (persistent chrome, present on every screen, matching how the
  nav rail itself is already persistent) — clicking a pill there just changes which vehicle is
  selected for later use, with no visible effect on Garage/Review/Settings' own content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The header MUST show one small pill per vehicle the owner has, on every screen.
- **FR-002**: Clicking a vehicle's pill MUST make that vehicle the selected one, immediately
  reflected on whichever vehicle-scoped screen is currently open, without navigating to a different
  screen.
- **FR-003**: The currently selected vehicle's pill MUST be visually distinguished from the others.
- **FR-004**: The header MUST show a persistent quick-action control that navigates to the Fuel
  screen, available from every screen.
- **FR-005**: An owner with zero vehicles MUST see no pills, not a broken or empty-looking control.

### Key Entities

- No new entity. This feature only adds a UI control for selecting among already-fetched vehicles
  and a navigation shortcut to an already-existing screen.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner with multiple vehicles can switch which vehicle a screen shows data for in a
  single click, from any vehicle-scoped screen, without returning to Garage.
- **SC-002**: An owner can reach the Fuel screen in a single click from any screen.

## Assumptions

- **Pill label is the vehicle's name, not an invented abbreviation**: the source design's pills use
  a short hand-picked label (e.g. "LC200") that doesn't correspond to any real stored field on this
  project's `Vehicle` entity — inventing an abbreviation field would be new stored data this feature
  doesn't need. Pills show the vehicle's real `name`, truncated visually (ellipsis) if long, not a
  fabricated short form.
- **Selecting a pill never navigates**: distinct from how selecting a vehicle from Garage or search
  already works (select-and-jump-to-Dashboard, issue #126) — the header switcher is for staying on
  the current screen while changing context, which is the entire point of this feature; if it also
  navigated, User Story 1 would be indistinguishable from just using Garage.
- **No new "quick fuel" behavior beyond navigation**: the quick-action button is a shortcut to the
  existing Fuel screen (reachable identically via the nav rail already, per issue #126) — it does not
  open a modal, pre-fill anything, or skip any existing step; it exists purely to save a click from
  screens other than Garage/nav-rail-Fuel.
