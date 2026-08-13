# Feature Specification: Live Fuel Consumption & Cost Preview

**Feature Branch**: `040-live-fuel-preview`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "No live consumption/cost preview while filling the fuel form (GitHub
issue #128). The design mockup computes and shows fuel consumption and total cost live, as the
owner types into the new-fuel-entry form, before saving — a preview, not a stored value. Source:
docs/odograph-design.zip's 'Кокпит - прототип' mockup, calcFuel() (~lines 417-425) and its use in
the fuel form (~lines 136-138). What's built instead: FuelRecordPanel.tsx's create form has no live
preview — consumption is only ever computed and shown after a record is saved. Scoping constraint
(Principle II/IV): purely client-side, non-authoritative preview, computed from the current form's
odometer/volume fields against the vehicle's most recent prior fuel record; division-safe — no
prior record, non-positive odometer delta, or blank/zero volume shows nothing, never a fabricated
number."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See estimated fuel economy while filling out a new fill-up (Priority: P1)

While logging a new fuel record, an owner wants immediate feedback on how efficiently the vehicle
is running for this fill-up, without having to save the record first and look it up afterward.

**Why this priority**: This is the feature's entire value — an in-the-moment sanity check ("does
this number look right?") right where the owner is already typing, matching what the approved
design mockup shows.

**Independent Test**: Open the fuel form for a vehicle with at least one prior fuel record, type an
odometer reading and volume that produce a valid (positive) distance since the last fill-up, and
confirm an estimated economy figure appears next to the input fields before saving.

**Acceptance Scenarios**:

1. **Given** a vehicle with a prior fuel record at a lower odometer reading, **When** the owner
   types a new odometer reading and a volume, **Then** an estimated fuel-economy figure appears
   near the inputs, in the same unit convention (L/100km or MPG) the vehicle's saved records use.
2. **Given** the owner is still typing and has left the odometer or volume field blank, **When** the
   preview would require that field, **Then** no number is shown (a neutral placeholder, not a
   fabricated or zero value).
3. **Given** the owner edits the odometer reading after a preview was showing, **When** the new
   value produces a distance since the last fill-up that is zero or negative, **Then** the preview
   disappears rather than showing an invalid or negative number.
4. **Given** the owner saves the record, **When** the record is created, **Then** the live preview
   is discarded and the saved record's row shows only the real, server-computed economy value —
   the two are never displayed side by side as if both were authoritative.

---

### User Story 2 - See estimated cost per distance alongside the economy preview (Priority: P2)

While filling out the same form, an owner who has also typed the fill-up's total cost wants to see
roughly what this fill-up costs per unit of distance driven, mirroring the spending-rate metric
already shown elsewhere in the app (Dashboard's cost/distance KPI).

**Why this priority**: Smaller, secondary value on top of User Story 1 — reuses the same distance
calculation, adds cost as an optional third input to the same preview, matching the mockup's
combined "consumption + total" preview.

**Independent Test**: With the conditions of User Story 1 already met, additionally type a cost
value and confirm a cost-per-distance estimate appears alongside the economy preview; leaving cost
blank continues to show the economy figure alone.

**Acceptance Scenarios**:

1. **Given** a valid economy preview is showing and the owner types a cost value, **When** the cost
   is a positive number, **Then** an estimated cost-per-distance figure appears alongside the
   economy preview.
2. **Given** the cost field is blank or zero, **When** the owner is otherwise filling out the form,
   **Then** only the economy preview is shown, with no cost-per-distance figure or placeholder.

---

### Edge Cases

- What happens when this is the vehicle's very first fuel record (no prior record exists at all)?
  → No preview is shown at all; there is nothing to compare the new entry against, and the feature
  must not invent a baseline.
- What happens when the owner types a valid preview, then clears the volume field entirely?
  → The preview disappears immediately, same as any other missing-input case.
- What happens when the owner types an odometer reading lower than or equal to the vehicle's most
  recent prior fuel record (e.g. correcting a typo, or the vehicle's odometer was reset)?
  → No preview is shown — a non-positive distance can never be presented as if it were valid,
  matching how the equivalent saved-record economy calculation already treats this case.
- What happens if the owner is editing an existing fuel record (not creating a new one)?
  → Out of scope for this feature; the live preview only applies to the create form, matching the
  mockup's own scope (a form for entering a new fill-up, not an edit form).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: While the create-fuel-record form's odometer-reading and volume fields both hold
  values that, compared against the vehicle's most recent prior fuel record, produce a positive
  distance and a positive volume, the system MUST display an estimated fuel-economy figure near
  those fields, before the record is saved.
- **FR-002**: The estimated fuel-economy figure MUST use the same unit convention (L/100km or MPG)
  and the same underlying formula the vehicle's saved fuel records already use for their
  post-save economy figure, so the preview and the eventual saved value are directly comparable in
  magnitude and meaning.
- **FR-003**: The system MUST NOT display any estimated fuel-economy figure — showing nothing (or a
  neutral placeholder) instead — whenever any of the following holds: the vehicle has no prior fuel
  record, the odometer reading field is blank or not a valid positive number, the resulting distance
  since the prior record is zero or negative, or the volume field is blank, zero, or not a valid
  positive number.
- **FR-004**: While a valid fuel-economy preview is showing and the cost field also holds a valid
  positive number, the system MUST additionally display an estimated cost-per-distance figure
  alongside the economy preview.
- **FR-005**: The system MUST NOT display a cost-per-distance figure whenever the cost field is
  blank, zero, or not a valid positive number, independent of whether the economy preview itself is
  showing.
- **FR-006**: The preview values MUST be visibly distinguishable from the form's real, saved data
  (e.g. styled as a hint/estimate) and MUST never be submitted, stored, or treated as the record's
  authoritative economy value — the authoritative value remains the existing server-computed
  economy figure attached to saved records.
- **FR-007**: The preview MUST update live as the owner edits the odometer, volume, or cost fields,
  without requiring an explicit recalculate action or the form to be saved.
- **FR-008**: This preview applies only to the form used to create a new fuel record; editing an
  existing fuel record is unaffected by this feature.

### Key Entities

- **Fuel record (existing)**: unchanged — this feature reads a vehicle's already-loaded fuel records
  to find the most recent prior one by odometer reading; no new persisted field or entity is
  introduced. The preview itself is transient UI state, never written to storage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner filling out a fuel record for a vehicle with prior history sees an estimated
  economy figure within the same interaction, without needing to save the record first.
- **SC-002**: The preview never displays a number for a vehicle/input combination where no valid
  prior-record comparison exists (first-ever fill-up, non-positive distance, or missing volume) —
  zero fabricated or misleading figures shown across all such cases.
- **SC-003**: The estimated figure shown while typing and the real figure shown after saving the
  same inputs are numerically consistent (same formula, same units) for any vehicle.

## Assumptions

- "Most recent prior fuel record" means the vehicle's already-saved fuel record with the highest
  odometer reading — matching the ordering the existing server-side economy calculation already
  uses (specs 009/013), not simply the most recently created or most recently dated record.
- Per this project's existing rule that aggregates (fuel economy, cost-per-distance, etc.) are
  always computed server-side and never client-side, the preview's calculation happens the same
  way — the "live" part refers to the form updating as the owner types, not to the arithmetic
  itself running in the browser. When the owner is offline, the preview simply does not appear
  (degrades the same way any other server-dependent figure already does while offline); this is not
  a regression, since no preview existed before this feature at all.
- "Visibly distinguishable from saved data" reuses this app's existing hint/dim-text visual
  convention for non-authoritative or placeholder values (e.g. the "—" shown for saved records with
  not-enough-data economy), rather than introducing a new visual language.
- Out of scope: any preview on the edit-existing-record form, any change to how the real
  server-computed economy value is calculated or stored, and any UI for switching which prior
  record the preview compares against.
