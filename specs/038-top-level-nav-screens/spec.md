# Feature Specification: Top-Level Nav Screens for Fuel/Service/Reminders/Planner/Documents

**Feature Branch**: `038-top-level-nav-screens`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Fuel/Service/Reminders/Documents/Planner aren't top-level nav screens
(GitHub issue #126). The design mockup has 7 nav destinations (Гараж, Дашборд, Заправки, ТО,
Напоминания, Планировщик, Документы), each a full screen for the currently selected vehicle. The
built app has only 4 nav items (Garage, Dashboard, Review, Settings); fuel records, service records,
reminders, documents, and the maintenance planner exist and work, but only as panels stacked on the
Garage screen, not as their own nav destinations. Make each of these five capabilities its own
top-level nav screen, matching the design."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach fuel/service/reminders/planner/documents directly from the nav rail (Priority: P1)

An owner wants to jump straight to a selected vehicle's fuel log, service history, reminders,
maintenance planner, or documents from the nav rail — the same way they already jump straight to
Dashboard — instead of scrolling down a long combined page.

**Why this priority**: This is the entire feature — without dedicated nav destinations, nothing else
in this spec has anywhere to live.

**Independent Test**: Can be fully tested by selecting a vehicle, clicking each of the five new nav
icons in turn, and confirming each opens a screen showing exactly that vehicle's data for that
concern, with all of the same create/edit/delete/upload capabilities the existing panels already
have — none of that functionality regresses, it only moves.

**Acceptance Scenarios**:

1. **Given** a vehicle is selected, **When** the owner clicks the Fuel nav icon, **Then** they see
   that vehicle's fuel records screen, with the same add/edit/delete/attachment/duplicate-dismiss
   capabilities the current inline panel already has.
2. **Given** a vehicle is selected, **When** the owner clicks the Service nav icon, **Then** they see
   that vehicle's service records screen, with the same capabilities as today's inline panel
   (including the performed-by field, spec 033).
3. **Given** a vehicle is selected, **When** the owner clicks the Reminders nav icon, **Then** they
   see that vehicle's reminder rules screen, with the same add/mark-done/delete capabilities as
   today.
4. **Given** a vehicle is selected, **When** the owner clicks the Planner nav icon, **Then** they see
   that vehicle's maintenance-planner kanban board, with the same add/advance/delete capabilities as
   today.
5. **Given** a vehicle is selected, **When** the owner clicks the Documents nav icon, **Then** they
   see that vehicle's documents screen, with the same add/edit/renew/delete/attachment capabilities
   as today (including the renew shortcut, spec 036).

---

### User Story 2 - Garage becomes a vehicle list only (Priority: P1)

An owner viewing the Garage screen wants to see and manage their list of vehicles — without every
other concern (fuel, service, reminders, planner, documents) also appearing inline underneath once a
vehicle is selected, since those now have their own dedicated screens.

**Why this priority**: Equal priority to User Story 1 — moving the five panels to their own screens
without also removing them from Garage would just duplicate everything in two places, which is worse
than either the old or new layout alone.

**Independent Test**: Can be fully tested by selecting a vehicle on the Garage screen and confirming
no fuel/service/reminder/planner/document content appears inline anymore — only the vehicle list and
the add-vehicle form remain.

**Acceptance Scenarios**:

1. **Given** the owner selects a vehicle on the Garage screen, **When** they view the rest of the
   Garage screen, **Then** no service, fuel, reminder, planner, or document content appears inline
   below the vehicle list.
2. **Given** the owner clicks a vehicle's card on the Garage screen, **When** the click completes,
   **Then** that vehicle becomes the selected vehicle for every other screen (Dashboard, Fuel,
   Service, Reminders, Planner, Documents) — selecting a vehicle is a single, shared action, not a
   per-screen one.

---

### User Story 3 - Each new screen handles "no vehicle selected" gracefully (Priority: P2)

An owner who navigates directly to Fuel, Service, Reminders, Planner, or Documents without having
selected a vehicle yet (or after clearing a selection) wants a clear prompt to select one, not a
blank or broken screen.

**Why this priority**: An edge case of User Story 1, not its core value — but still needs explicit,
consistent handling across all five new screens, matching how the Dashboard screen already handles
this (spec 037).

**Independent Test**: Can be fully tested by clearing the selected vehicle (or in a fresh session)
and visiting each of the five new nav destinations, confirming each shows a prompt directing back to
Garage rather than an error or empty layout.

**Acceptance Scenarios**:

1. **Given** no vehicle is currently selected, **When** the owner visits any of the five new nav
   screens, **Then** each shows a prompt to select a vehicle from Garage, consistent with how the
   Dashboard screen already behaves in this situation.

---

### Edge Cases

- What happens to the expense-breakdown table (month/year spend summary) and the PDF maintenance-
  history export link, both currently inline on Garage alongside the five panels being moved? See
  Assumptions — they move to the Dashboard screen instead of getting a new nav item of their own,
  since the source design's nav list doesn't include a separate destination for either and Dashboard
  (spec 037) already shows spend data for the selected vehicle.
- What happens if the owner switches vehicles while on one of the five new screens (e.g. via
  returning to Garage and picking a different one, then navigating back)? The screen reflects
  whichever vehicle is currently selected — consistent with how Dashboard already behaves (spec
  037).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The nav rail MUST include five new destinations — Fuel, Service, Reminders, Planner,
  Documents — alongside the existing Garage, Dashboard, Review, and Settings destinations.
- **FR-002**: Each of the five new screens MUST show the currently selected vehicle's data for that
  concern, with every create/read/update/delete/attachment capability the corresponding panel
  already has today — no functional regression, only relocation.
- **FR-003**: The Garage screen MUST no longer show fuel, service, reminder, planner, or document
  content inline — it shows only the vehicle list and the add-vehicle form.
- **FR-004**: Selecting a vehicle MUST be a single, shared action whose effect is visible across
  every vehicle-scoped screen (Dashboard and the five new screens) — not a separate selection per
  screen.
- **FR-005**: Each of the five new screens MUST show a clear prompt to select a vehicle when none is
  currently selected, rather than an empty or broken layout.

### Key Entities

- No new entity. This feature only changes where five already-fully-built capabilities are reached
  from — the underlying service records, fuel records, reminder rules, plan cards, and documents are
  unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can reach a selected vehicle's fuel log, service history, reminders,
  maintenance planner, or documents directly from the nav rail, without scrolling through unrelated
  content first.
- **SC-002**: The Garage screen shows only vehicle-list content, regardless of whether a vehicle is
  selected.
- **SC-003**: Every capability the five panels had before this change (create, edit, delete,
  attachment upload, duplicate-dismiss, renew, mark-done, advance-stage, as applicable per panel)
  still works identically after this change — verified capability-by-capability, not just "the
  screen renders."

## Assumptions

- **Garage card clicks navigate to Dashboard**: matching the source design's own behavior
  (selecting a vehicle card jumps straight to its Dashboard), clicking a vehicle card on Garage both
  selects that vehicle and navigates to the Dashboard screen — giving the click a clear purpose now
  that Garage no longer expands inline detail in place. This is a deliberate UX decision, not an
  oversight.
- **Expense breakdown and PDF export move to Dashboard, not a new nav item**: the source design's
  7-screen nav list has no separate "reports" or "expense breakdown" destination — the mockup's
  monthly spend view *is* its Dashboard screen. Since Dashboard (spec 037) already shows a monthly
  spend chart for the selected vehicle, the existing month/year expense-breakdown table and PDF
  download link are relocated there as an additional section, not given a sixth new nav item.
- **No new "select a vehicle" i18n string duplicated per screen**: one shared prompt string is reused
  across all five new screens (Dashboard, shipped in spec 037, keeps its own existing, slightly
  differently-worded string — not worth touching already-shipped, tested code purely to unify
  wording).
- **Panel internals are unchanged**: `ServiceRecordPanel`, `FuelRecordPanel`, `ReminderRulePanel`,
  `PlanBoard`, and `DocumentPanel` keep their exact existing props, behavior, and internal logic —
  this feature only changes which screen renders each one and under what nav item, never what they
  do once rendered.
