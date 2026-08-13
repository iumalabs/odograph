# Feature Specification: Replace Russian Ruble with Kyrgyzstani Som

**Feature Branch**: `048-kgs-currency-swap`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Replace Russian Ruble with Kyrgyzstani Som in the currency list."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose Kyrgyzstani Som as the display currency (Priority: P1)

An owner who tracks their vehicle's costs in Kyrgyzstani som wants to select it as their display
currency, the same way they could already select US Dollar, Euro, or British Pound.

**Why this priority**: This is the entire scope of the change — swapping one entry in an existing,
already-working four-currency list (spec 035) for another.

**Independent Test**: From either Settings or the header currency pill (spec 047), select
Kyrgyzstani Som and confirm cost figures across the app show its symbol.

**Acceptance Scenarios**:

1. **Given** the owner opens the currency selector (Settings or header), **When** they view the
   list of choices, **Then** Kyrgyzstani Som appears where Russian Ruble previously did, and
   Russian Ruble no longer appears anywhere.
2. **Given** the owner selects Kyrgyzstani Som, **When** they view any cost figure across the app,
   **Then** it displays with the Som symbol, identically to how the other three currencies already
   behave.
3. **Given** an owner who had previously selected Russian Ruble (before this change), **When** they
   open the app after this change ships, **Then** the app does not crash or show a blank/invalid
   currency — it falls back to the existing default behavior for an unrecognized stored value.

---

### Edge Cases

- What happens to a browser that still has the old `"RUB"` value stored from before this change? →
  Treated as an unrecognized value, falling back to the app's existing default currency (USD) —
  the same fallback behavior already used for any invalid/missing stored value, not a new special
  case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The currency selector (in both Settings and the header quick-toggle) MUST offer
  Kyrgyzstani Som as one of its four choices, in place of Russian Ruble.
- **FR-002**: Russian Ruble MUST NOT appear anywhere in the currency selector or related labels
  after this change.
- **FR-003**: Selecting Kyrgyzstani Som MUST display its currency symbol on every cost figure
  currently formatted with the selected currency's symbol — no different treatment from the other
  three currencies.
- **FR-004**: A previously-stored `"RUB"` preference MUST NOT cause an error or an unlabeled/blank
  currency display — it falls back to the app's existing default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can select Kyrgyzstani Som from either currency entry point and see it
  reflected everywhere cost figures are shown, with zero errors.
- **SC-002**: Zero remaining references to Russian Ruble anywhere in the currency selection UI.

## Assumptions

- This is a straightforward swap of one fixed-list entry for another, matching the existing
  four-currency data shape (spec 035) — no new capability (e.g. no real currency conversion is
  introduced or implied; this app has never converted currency values, only changed the displayed
  symbol, and that remains unchanged here).
- Symbol choice: Kyrgyzstani Som has no single dedicated Unicode currency symbol in common use
  (unlike $/€/£); "с" (the informal, widely-used single-glyph abbreviation) is used to match the
  existing single-character symbol convention of the other three currencies.
