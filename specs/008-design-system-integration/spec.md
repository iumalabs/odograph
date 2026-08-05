# Feature Specification: Design System Integration

**Feature Branch**: `008-design-system-integration`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Design system integration: apply the approved Claude-design mockups
(docs/odograph-design.zip) to the existing client UI. The dark 'cockpit' direction is the
converged/production-intended design: near-black background, lime accent, a display font for UI
text and a monospace font for numeric telemetry, flat hairline-bordered cards, a slim icon nav
rail, warning-light-style status colors (orange-red for overdue, blue for secondary data). A
fully-specified light theme exists and should be included as a toggle. Scope: restyle only the
screens this app currently has working, real functionality for — sign-in/sign-up, the vehicle
garage (list + add vehicle), and a vehicle's service record history (list + add record +
attachment upload/download). Do not build UI for fuel records, dashboard, reminders, documents, or
the planner — those appear in the mockups but have no backend yet."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor recognizes the product and can sign in without confusion (Priority: P1)

A new or returning visitor lands on the sign-in screen. Instead of unstyled form controls, they
see the product's actual visual identity — logo, name, and a coherent dark theme — and can tell at
a glance which actions are available (sign up with passkey, sign in with passkey, email link,
Google) without hunting through plain-text links and buttons.

**Why this priority**: Every other screen is unreachable without signing in first; a visitor's
first impression of the product happens here, and an unstyled auth screen undermines trust before
they've done anything else.

**Independent Test**: Load the app while signed out. Confirm the logo, product name, and themed
sign-in controls render correctly, and that every existing sign-in path (passkey, magic link,
Google) still completes successfully.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor, **When** they load the app, **Then** they see the product logo,
   name, and a styled sign-in screen matching the approved design, with all existing sign-in
   options (passkey sign up/sign in, email magic link, Google) visibly distinguishable from one
   another.
2. **Given** a signed-out visitor on the styled sign-in screen, **When** they complete any
   supported sign-in method, **Then** they land on the styled, signed-in garage view exactly as
   they would have on the unstyled UI (no functional regression).

---

### User Story 2 - An owner reviews their garage at a glance (Priority: P1)

A signed-in owner sees their vehicles presented as the design's card layout — name, make/model/
year at a glance — instead of a plain bulleted list, and can add a new vehicle through a styled
form that matches the rest of the product.

**Why this priority**: The garage is the home screen for every returning user; it is the highest-
traffic screen in the product and currently the least differentiated from a bare HTML form.

**Independent Test**: Sign in, confirm existing vehicles render as styled cards with their details
legible, add a new vehicle through the styled form, and confirm it appears immediately as a new
card without a page reload.

**Acceptance Scenarios**:

1. **Given** a signed-in owner with existing vehicles, **When** they view the garage, **Then**
   each vehicle renders as a styled card showing its name and available details (make, model,
   year), visually consistent with the approved design.
2. **Given** a signed-in owner with no vehicles yet, **When** they view the garage, **Then** they
   see a styled empty state (not a bare line of text) inviting them to add their first vehicle.
3. **Given** a signed-in owner, **When** they fill in and submit the add-vehicle form, **Then**
   the new vehicle appears as a card in the garage without a full page reload, using the same
   styled form controls as the rest of the product.

---

### User Story 3 - An owner reviews and adds to a vehicle's service history (Priority: P2)

An owner selects a vehicle and sees its service record history presented clearly (date,
description, odometer reading), can add a new record through a styled form, and can attach a
photo or receipt to a record with clear visual feedback that the attachment succeeded.

**Why this priority**: Service records are the core record-keeping value of the product, but this
screen is reached only after the garage (P1), so it follows in priority.

**Independent Test**: Select a vehicle with existing service records, confirm they render legibly
in the styled layout, add a new record, and upload an attachment to a record, confirming visual
confirmation of success at each step.

**Acceptance Scenarios**:

1. **Given** a vehicle with existing service records, **When** the owner selects it, **Then** its
   service history renders in the styled layout with date, description, and odometer reading (if
   present) all legible.
2. **Given** a vehicle with no service records yet, **When** the owner selects it, **Then** they
   see a styled empty state inviting them to log the first service record.
3. **Given** a selected vehicle, **When** the owner submits the add-service-record form, **Then**
   the new record appears in the styled history list without a full page reload.
4. **Given** a service record, **When** the owner uploads an attachment to it, **Then** the UI
   gives clear visual confirmation that the upload succeeded and the attachment is now listed
   against that record.

---

### User Story 4 - An owner switches between light and dark theme (Priority: P3)

An owner who prefers a light interface (or is in bright ambient light) can toggle from the default
dark theme to the light theme specified in the same design system, and the choice persists across
visits.

**Why this priority**: Both themes are fully specified in the approved design, but dark is the
converged/primary direction; light-theme support is valuable but not blocking for the core
redesign to ship.

**Independent Test**: Toggle the theme control, confirm every screen re-renders in the light
palette with no illegible or unstyled elements, reload the page, and confirm the choice persisted.

**Acceptance Scenarios**:

1. **Given** the app in its default (dark) theme, **When** the owner activates the theme toggle,
   **Then** every visible screen switches to the light palette from the same design system, with
   all text remaining legible.
2. **Given** the owner has switched to light theme, **When** they reload the app or return in a
   new session, **Then** the app still shows the light theme (their choice persisted).

### Edge Cases

- What happens when a vehicle or service record has no optional fields set (e.g. no make/model, no
  odometer reading)? The styled card/row MUST omit the empty field cleanly, not show blank space
  or a literal "null"/"undefined".
- What happens when the garage or service-record list is very long? Layout MUST remain usable
  (scrollable, not overflowing or clipping content) without requiring new pagination functionality.
- What happens on a narrow (mobile-width) viewport? The layout MUST remain usable — no horizontal
  scrolling of the page, no overlapping controls — even though a dedicated mobile/PWA experience is
  a later milestone (M7).
- What happens if a font fails to load (slow network, offline)? Text MUST remain legible via a
  system-font fallback rather than becoming invisible or unstyled to the point of being unusable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST present its logo and product name using the approved design's
  logo mark on every screen (auth and signed-in).
- **FR-002**: The application MUST apply the approved dark color palette, typography, and layout
  patterns to the sign-in/sign-up screen, the garage (vehicle list + add-vehicle form) screen, and
  the vehicle service-record history (list + add-record form + attachment upload) screen.
- **FR-003**: The application MUST NOT change the behavior, request/response shape, or outcome of
  any existing sign-in, vehicle, service-record, or attachment operation — this is a presentation-
  layer change only.
- **FR-004**: The application MUST offer a control that switches the interface between the
  approved dark and light themes.
- **FR-005**: The application MUST persist the user's theme choice across page reloads and future
  sessions on the same device.
- **FR-006**: The application MUST render a styled empty state (not a bare text line) when the
  garage has no vehicles or a selected vehicle has no service records.
- **FR-007**: The application MUST remain usable (no unusable overlapping controls, no required
  horizontal scrolling) at both desktop and narrow mobile-width viewports.
- **FR-008**: The application MUST NOT render UI for fuel records, dashboard aggregates,
  reminders, documents, or the planner — screens present in the design mockups but without a
  backing feature in this codebase yet.
- **FR-009**: Every new or changed piece of user-facing text introduced by this feature MUST be
  routed through the existing i18n string infrastructure, per constitution Principle IX.
- **FR-010**: The application MUST remain legible if the design system's custom fonts fail to
  load, falling back to a system font stack.

### Key Entities

This feature introduces no new data entities — it restyles the presentation of existing Vehicle,
Service Record, and Attachment data (specs 006, 007) and adds one new piece of client-only state:
the user's theme preference (dark/light), persisted locally on the device rather than server-side.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the screens in scope (sign-in/sign-up, garage, service records) visually
  match the approved design system's color palette and typography, verified by side-by-side visual
  review against the mockups.
- **SC-002**: Every user-facing flow that worked before this change (sign up, sign in via any
  method, add/view vehicle, add/view service record, upload/download attachment) still completes
  successfully after the redesign, with zero functional regressions.
- **SC-003**: A user can toggle between dark and light theme in under 2 seconds with no visible
  layout breakage in either theme.
- **SC-004**: The redesigned screens remain fully usable (all controls reachable and operable, no
  horizontal page scroll) at a 375px-wide viewport, without requiring a dedicated mobile feature.

## Assumptions

- The dark "cockpit" direction from the mockups (the one expanded into a full standalone
  prototype, and already the source of the shipped favicon) is the correct one to implement, over
  the two alternate garage-screen directions explored in the same design file ("Журнал" /
  paper-journal and "Пульт" / bento-violet), which are treated as superseded exploration, not
  additional requirements.
- The design mockups' icon nav rail lists navigation items for screens that don't exist yet (fuel,
  dashboard, reminders, documents, planner). This feature implements only the nav entries that
  point to real, working screens (garage, service records reached via a vehicle) or represents the
  rail in a form that doesn't imply broken links for the not-yet-built items (e.g. omitting or
  visually disabling those entries) — no new functionality is added to satisfy the full nav rail.
- Theme preference is stored client-side only (e.g. local storage), not as a server-persisted user
  setting, since no user-settings storage exists yet and this feature does not introduce one.
- The mockups' Russian-language copy is a stand-in for the actual product content, not a
  requirement to ship a Russian UI; constitution Principle IX/D-002 already lock English as the v1
  interface language, and this feature reuses the existing English strings, only restyling their
  presentation.
