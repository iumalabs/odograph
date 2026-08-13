# Feature Specification: Dashboard Chart Bar Totals

**Feature Branch**: `042-dashboard-bar-totals`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Dashboard's monthly spend chart doesn't label each bar with its total
(GitHub issue #140). The design mockup prints each month's total spend as text directly above its
bar. The real Dashboard's chart shows only the month label below each bar, no total figure above
it. Purely presentational — the chart already computes the per-month sum used for bar height; this
only needs that same sum rendered as a text label, formatted with the existing currency symbol."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See each month's total spend directly on the chart (Priority: P1)

An owner looking at their vehicle's Dashboard wants to read off how much they spent in a given
month without hovering, clicking, or doing mental arithmetic from the bar's height alone.

**Why this priority**: The chart already communicates relative spend via bar height; the totals
label adds the missing absolute number, closing a small but real information gap versus the
approved design — this is the entire scope of the feature.

**Independent Test**: View the Dashboard for a vehicle with at least one month of recorded spend
and confirm each bar shows its total spend as text, positioned above the bar.

**Acceptance Scenarios**:

1. **Given** a vehicle with spend recorded in one or more of the chart's six months, **When** the
   owner views the Dashboard, **Then** each bar with nonzero spend shows its total (fuel + service)
   cost as text above the bar, formatted in the owner's selected currency.
2. **Given** a month with zero recorded spend, **When** the owner views the Dashboard, **Then** that
   bar's total-spend label reads as zero in the same currency format, not blank and not omitted —
   consistent with the chart's existing zero-fill treatment for months with no data.

---

### Edge Cases

- What happens when a vehicle has no spend at all across all six charted months? → Every bar shows
  a zero-value total label, matching the chart's existing all-zero rendering (no special case).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Dashboard's monthly spend chart MUST display each month's total spend (fuel plus
  maintenance cost combined) as a text label positioned above that month's bar.
- **FR-002**: The total-spend label MUST use the exact same currency formatting already used
  elsewhere on the Dashboard (the owner's selected currency symbol).
- **FR-003**: The total-spend label MUST reflect the exact same sum already used to determine that
  month's bar height — no separate or inconsistent computation.

### Key Entities

None — this reuses data the chart already computes; no new entity or field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can read every charted month's total spend directly from the Dashboard
  without any additional interaction (hover, click, or navigation).
- **SC-002**: The displayed total for a given month is always numerically identical to the value
  implied by that month's bar height — no discrepancy between the visual and the label.

## Assumptions

- "Total spend" for the label is the same `maintenanceCost + fuelCost` sum the chart's bar height
  already uses — no distinction between the two categories is introduced in the label itself (the
  existing legend already communicates the fuel/maintenance color split within each bar).
- Out of scope: any change to the chart's bar-height computation, zero-fill logic, or the six-month
  window — this feature only adds a label, changes nothing else about the chart.
