# Feature Specification: Monthly/Annual Expense Analytics

**Feature Branch**: `026-expense-analytics`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Monthly/annual expense analytics (GitHub issue #76, milestone M11).
Extend the already-built per-vehicle cost aggregates (specs/013 vehicle-aggregates, specs/014
dashboard) with a spending-over-time view: total maintenance (service record) and fuel spending
broken down by calendar month or calendar year for a vehicle, so an owner can see how their
spending trends rather than only the current all-time cost-per-distance/cost-per-time summary.
Reuses the exact same underlying data and the exact same semantic-duplicate exclusion (constitution
D-005) the existing aggregate already applies — this is a second view over the same source data,
not a new data source. No new database table is needed since this is a derived, computed-on-read
aggregate exactly like the existing one. Server-computed only (constitution Principle II) —
division-safe, and a null/missing cost on an individual record contributes zero to a period's
total rather than being fabricated or excluded from the period entirely. Only periods that
actually have at least one qualifying record are returned — no zero-filled gap periods invented
for months/years with no records. Split each period's total into its service-cost and fuel-cost
components separately, since an owner comparing maintenance vs fuel spend trends is a real,
low-cost addition given the data is already at hand. No new charting/visualization dependency
should be introduced — the UI should present this as a simple table/list (optionally with a
lightweight CSS-only bar visualization), not pull in a charting library."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner sees their vehicle's spending broken down by month (Priority: P1)

An owner viewing a vehicle's dashboard sees a list of calendar months, each showing that month's
total spending on the vehicle, split into maintenance (service records) and fuel — so they can
spot trends like "I spent much more in March" without manually adding up individual records.

**Why this priority**: This is the entire point of the feature — the existing all-time summary
already exists (specs/013); the value this feature adds is exclusively the over-time breakdown.

**Independent Test**: Create service and fuel records for a vehicle across two different calendar
months and confirm the monthly breakdown shows exactly two periods, each with the correct
maintenance/fuel/total figures for just the records in that month.

**Acceptance Scenarios**:

1. **Given** a vehicle with service and/or fuel records spread across multiple calendar months,
   **When** an owner requests the monthly breakdown, **Then** they see one entry per month that
   has at least one record, each showing that month's maintenance cost, fuel cost, and combined
   total.
2. **Given** a vehicle with no records at all, **When** an owner requests the monthly breakdown,
   **Then** they see an empty result — not an error, not a fabricated zero-value month.
3. **Given** a vehicle where some records have no cost recorded, **When** an owner requests the
   monthly breakdown, **Then** those records contribute zero to their period's total rather than
   being skipped entirely or causing an error.
4. **Given** a vehicle with a record flagged as a semantic duplicate of another (constitution
   D-005), **When** an owner requests the monthly breakdown, **Then** the flagged duplicate is
   excluded from the totals, identical to how the existing all-time summary already excludes it.

---

### User Story 2 - An owner switches to a yearly view (Priority: P2)

An owner viewing the same breakdown switches from monthly to yearly grouping, seeing the same
maintenance/fuel/total split but summed per calendar year instead of per month — useful once
enough history has accumulated that a month-by-month list becomes long.

**Why this priority**: Real, requested value (the issue explicitly asks for both granularities),
but the monthly view alone already delivers the feature's core value — yearly is an alternate lens
on the same computation, not a separate capability.

**Independent Test**: Using the same records from User Story 1's test, request the yearly
breakdown and confirm the same records are now grouped by year instead of by month, with the
year-level totals equal to the sum of their constituent months' totals.

**Acceptance Scenarios**:

1. **Given** a vehicle with records spanning multiple calendar years, **When** an owner requests
   the yearly breakdown, **Then** they see one entry per year that has at least one record, with
   correctly summed maintenance/fuel/total figures.
2. **Given** an invalid or unrecognized grouping option, **When** an owner requests a breakdown,
   **Then** the request is rejected rather than silently defaulting to an unexpected grouping.

### Edge Cases

- What happens to a record dated exactly on a month/year boundary (e.g. the last day of a month)?
  It's grouped by its own recorded date's calendar month/year, using the same date-parsing
  convention every other date-based feature in this system already uses — no special boundary
  handling needed.
- What happens if a vehicle is deleted? Its breakdown, like its underlying records, simply ceases
  to exist — no separate cleanup needed since nothing is stored for this feature beyond the
  records that already exist.
- What happens when only one of maintenance or fuel records exist for a given period? That
  period's other component is zero, and the period still appears (governed by whichever component
  has records, not both needing to).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user request a spending breakdown for a vehicle
  they own, grouped by calendar month or by calendar year, selected explicitly per request.
- **FR-002**: System MUST reject a request specifying a grouping other than month or year, rather
  than silently defaulting to one.
- **FR-003**: For each returned period, system MUST report the total maintenance (service record)
  cost, the total fuel cost, and their combined total, computed only from that vehicle's own
  records dated within that period.
- **FR-004**: System MUST include a period in the result only if at least one qualifying record
  falls within it — MUST NOT invent a zero-value entry for a period with no records.
- **FR-005**: System MUST treat a record with no recorded cost as contributing zero to its
  period's total — never fabricating a cost, and never silently dropping the record from
  consideration.
- **FR-006**: System MUST exclude any record currently flagged as a semantic duplicate from every
  period's totals, identical to the existing all-time aggregate's exclusion rule (constitution
  D-005).
- **FR-007**: System MUST refuse to compute or reveal a breakdown for a vehicle that doesn't exist
  or belongs to a different tenant, identically to how it refuses any other cross-tenant access
  (constitution Principle I).
- **FR-008**: System MUST return periods in chronological order.

### Key Entities

- **Spending period**: A derived, computed-on-read grouping of an existing vehicle's service and
  fuel records by calendar month or calendar year — not a stored entity. Has a period identifier
  (e.g. a specific month or year), a maintenance-cost total, a fuel-cost total, and a combined
  total.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can see exactly which calendar months (or years) they spent money on a
  vehicle, and how much, without manually reviewing individual service/fuel records.
- **SC-002**: 100% of a period's total is verifiably the sum of that period's own records' costs
  (with a missing cost counted as zero) — verified by a test that seeds records with known costs
  across periods and checks each period's reported totals against a hand-computed sum.
- **SC-003**: 0% of returned periods are ones with zero qualifying records — verified by a test
  that seeds records in some months but not others and confirms only the populated months appear.
- **SC-004**: 100% of attempts to view a breakdown for a different tenant's vehicle are refused,
  verified the same way every other cross-tenant guarantee in this system already is.

## Assumptions

- **Two granularities only (month, year)**: matches the issue's own scope; no week/quarter/custom
  range granularity is requested or needed for v1.
- **No new visualization dependency**: the UI presents this as a table/list (optionally with a
  simple CSS-only bar for relative visual comparison), consistent with every existing panel's
  plain-figures presentation — no charting library is introduced.
- **No pagination or date-range filtering**: a vehicle's full history is returned per request,
  matching the existing all-time aggregate's own unfiltered-read pattern; if this becomes a
  problem at scale it's a future, separately-scoped optimization, not a v1 requirement.
- **A vehicle's existing tenant/ownership model** (specs/006) governs access to its spending
  breakdown — no separate permission model.
