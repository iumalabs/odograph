# Feature Specification: Header Currency and Units Toggles

**Feature Branch**: `047-header-units-currency`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Header lacks quick units (km/mi) and currency toggle pills (GitHub
issue #136). The mockup's header has two quick-toggle pills between the vehicle switcher and the
theme button: a global distance-units toggle and a currency toggle with an inline dropdown, usable
from any screen. Currency: relocate/duplicate the existing Settings currency control into a header
quick-toggle — no new capability. Units: a genuinely new capability, a global km/mi display
preference independent of each vehicle's own stored odometer unit, converted with an exact,
universal constant (never a guessed or fabricated conversion). Scope: applies to read-only
displayed distance figures across the app (odometer stats/columns, reminder due-in distance text);
does NOT apply to form input fields (which stay in each vehicle's own native unit, to protect data
entry correctness) and does NOT convert fuel-economy (L/100km vs MPG) or cost-per-distance figures
in this pass, since those need a more involved per-vehicle-aware conversion — documented as an
explicit boundary, not a silent gap."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change currency from anywhere, not just Settings (Priority: P2)

An owner wants to switch which currency symbol is shown without navigating to Settings first.

**Why this priority**: Small, low-risk — the underlying capability (spec 035) already exists and
works; this only adds a second, more convenient entry point to the exact same preference.

**Independent Test**: From any screen, open the header's currency pill, pick a different currency,
and confirm cost figures across the app immediately reflect the new symbol — identically to
changing it from Settings.

**Acceptance Scenarios**:

1. **Given** the owner is on any screen, **When** they open the header currency pill and select a
   currency, **Then** the app's displayed currency symbol updates everywhere, the same as if it had
   been changed from Settings.
2. **Given** the owner changes currency from the header, **When** they later open Settings,
   **Then** the Settings currency control shows the same, now-current selection (single shared
   preference, not two independent ones).

---

### User Story 2 - Toggle displayed distance units app-wide (Priority: P2)

An owner who thinks in miles (or km) but has a vehicle logged in the other unit wants to see
distance figures in their preferred unit without changing how the vehicle itself is configured.

**Why this priority**: The larger, riskier half of this feature — genuinely new capability, scoped
carefully to avoid touching stored data or fabricating conversions.

**Independent Test**: With a vehicle stored in km, toggle the header's units pill to "mi" and
confirm that vehicle's displayed odometer figures switch to a correctly-converted mile value with
the "mi" unit label, while the vehicle's own configuration and any open data-entry forms remain
unaffected.

**Acceptance Scenarios**:

1. **Given** a vehicle whose own odometer unit is km, **When** the owner sets the header units
   toggle to mi, **Then** every read-only displayed distance figure for that vehicle (current
   odometer stat, fuel/service record odometer columns, a reminder's due-in distance text) shows
   the exact, correctly-converted mile value with an "mi" label.
2. **Given** the same setup, **When** the owner opens a form that has a distance input field (e.g.
   adding a fuel record), **Then** that field's label and any value still reflect the vehicle's own
   native unit (km), never the display toggle's unit — so a number the owner types is never
   silently misinterpreted.
3. **Given** the header units toggle matches a vehicle's own native unit already, **When** the
   owner views that vehicle's figures, **Then** no conversion is applied (the number is shown
   exactly as stored).
4. **Given** a fuel-economy or cost-per-distance figure anywhere in the app, **When** the owner
   changes the units toggle, **Then** that figure is unaffected by this feature (explicitly out of
   scope, not silently wrong) — it continues to reflect the vehicle's own native unit as it always
   has.

---

### Edge Cases

- What happens for a vehicle with no odometer data yet? → No conversion is meaningful to apply; the
  existing not-enough-data treatment for that figure is unaffected.
- What happens if the owner has multiple vehicles in different native units? → Each vehicle's
  figures are converted independently, based on its own stored unit versus the one global display
  preference — never assumed to share one vehicle's unit with another's.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The header MUST show a currency pill, usable from any screen, that changes the same
  currency preference the Settings screen already controls.
- **FR-002**: The header MUST show a units pill toggling between km and mi, usable from any screen,
  independent of any individual vehicle's own stored odometer unit.
- **FR-003**: Every read-only displayed distance figure for a vehicle (current odometer, fuel/
  service record odometer columns, reminder due-in distance text) MUST reflect the units toggle's
  chosen unit, converted from that vehicle's own stored unit using an exact, fixed conversion
  factor — never an approximation presented as exact, never a guess.
- **FR-004**: Distance-related form input fields MUST continue to reflect and accept values in each
  vehicle's own native stored unit, unaffected by the units toggle — a value a user types must
  never be silently reinterpreted in the wrong unit.
- **FR-005**: When a vehicle's native unit already matches the units toggle's chosen unit, the
  system MUST show the value unconverted (no rounding-trip precision loss).
- **FR-006**: Fuel-economy and cost-per-distance figures MUST NOT be converted by this feature —
  they continue to reflect each vehicle's own native unit convention, unchanged from today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can change currency or distance-unit display preference from any screen,
  without navigating to Settings.
- **SC-002**: Every converted distance figure is numerically exact (matches the standard km↔mi
  conversion factor) — zero fabricated or approximated-but-presented-as-exact figures.
- **SC-003**: No data-entry form ever shows or accepts a value in a unit other than the vehicle's
  own native one, regardless of the display toggle's setting.

## Assumptions

- Currency: duplicates, doesn't replace, the existing Settings control — both read/write the same
  underlying preference (specs/035's `useCurrency()`), so they can never drift out of sync with
  each other.
- Units: a new, independent, app-wide display preference — not stored per-vehicle, not tied to
  Settings. Mirrors `useCurrency()`'s own localStorage-backed pattern (this codebase's established
  convention for such preferences, per specs/035 research.md — no Context API).
- Explicitly out of scope for this pass: converting fuel-economy or cost-per-distance figures
  (these need a more involved, per-vehicle-aware conversion — L/100km↔MPG is a reciprocal
  relationship, not a simple linear scale — and are called out here as a real, documented boundary
  rather than silently left inconsistent); converting any data-entry form field; converting fuel
  volume (liters/gallons is an entirely separate unit dimension the source design's own units pill
  doesn't clearly claim to control).
