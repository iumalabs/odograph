# Feature Specification: Units Toggle Converts Fuel Economy

**Feature Branch**: `050-units-convert-economy`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Units toggle doesn't convert fuel economy (L/100km vs MPG) (GitHub
issue #155). Issue #136 (spec 047) added a header units toggle that converts read-only distance
figures, but explicitly scoped out fuel-economy conversion, reasoning it needed a reciprocal
formula and was riskier to get right. Having now read the mockup's own reference implementation
(cons(km, l), which recomputes economy from raw distance/volume in the target unit system rather
than reciprocally rescaling an already-computed number), that formula is well-defined and safe to
reuse. Extends the existing server-side fuel-economy computation to accept the requested display
unit and compute the reciprocal-correct figure directly from the same raw odometer/volume values
already used for the vehicle-native figure."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See fuel economy in the header's chosen unit system (Priority: P2)

An owner who set the header's units toggle to their preferred system (km or mi) wants every fuel-
economy figure in the app — not just odometer readings — to reflect that same choice.

**Why this priority**: Completes the units-toggle feature (spec 047) rather than leaving one class
of figure permanently stuck in each vehicle's own native unit, which was spec 047's own documented,
deliberate, but explicitly temporary exclusion.

**Independent Test**: With a vehicle whose own native unit differs from the header's units toggle,
view a fuel-economy figure (Garage's stat, Dashboard's chip, the fuel-record table's per-row
column, or the live fuel-form preview) and confirm it reflects the toggle's chosen unit system
(L/100km or MPG), not the vehicle's stored unit.

**Acceptance Scenarios**:

1. **Given** a vehicle stored in km with enough fuel history to compute an economy figure,
   **When** the owner sets the header units toggle to mi, **Then** every displayed fuel-economy
   figure for that vehicle switches from L/100km to MPG, computed correctly (not a naive reciprocal
   rescale of the already-computed L/100km number).
2. **Given** the header units toggle matches a vehicle's own native unit, **When** the owner views
   its fuel-economy figures, **Then** they're identical to what's already shown today (no behavior
   change in the common case).
3. **Given** a vehicle without enough fuel history to compute an economy figure, **When** the owner
   views it in either unit system, **Then** the existing not-enough-data treatment is shown — never
   a fabricated figure in either unit.

---

### Edge Cases

- What happens to the live fuel-form preview (spec 040) while the owner is mid-entry? → Reflects
  the header's currently-chosen unit system the same way the saved-record figures do.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every fuel-economy figure currently shown in the app (Garage's stat, Dashboard's
  chip, the fuel-record table's per-row column, the live fuel-form preview) MUST reflect the
  header's units toggle, not the vehicle's own stored unit, whenever they differ.
- **FR-002**: The conversion MUST be computed server-side by recomputing the economy ratio from the
  same underlying real distance/volume values already used for the vehicle-native figure, expressed
  in the target unit system — never by reciprocally rescaling an already-computed economy number.
- **FR-003**: When the header units toggle matches a vehicle's own native unit, the displayed
  figure MUST be identical to today's existing (pre-this-feature) value.
- **FR-004**: The system MUST NOT display a fabricated fuel-economy figure in either unit system —
  every existing not-enough-data case MUST remain not-enough-data regardless of which unit system
  is requested.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Toggling the header's units switches every visible fuel-economy figure to the
  correct value in the new unit system, with zero figures left stuck in the old system.
- **SC-002**: The converted figure is numerically exact for the standard L/100km↔MPG relationship —
  never an approximation presented as precision, and never mismatched between two figures that
  should represent the same underlying fill-up.

## Assumptions

- Reuses spec 047's existing `distanceUnit` header preference — no new user-facing control.
- A vehicle's fuel `volume` values are already implicitly paired with that vehicle's own stored
  odometer unit (liters for a km-native vehicle, gallons for a mi-native vehicle) — this is
  existing, unchanged behavior (the same pairing the vehicle-native economy formula already
  assumes); this feature converts both legs together when re-expressing in a different unit system,
  never distance alone.
- Out of scope: cost-per-distance conversion (a separate, still-excluded figure per spec 047 FR-006
  — not part of this issue).
