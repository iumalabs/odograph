# Feature Specification: Server-Computed Per-Vehicle Aggregates

**Feature Branch**: `013-vehicle-aggregates`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Server-computed per-vehicle aggregates (issue #16, milestone M6):
expose read-only, server-computed summary aggregates for a vehicle — average fuel economy,
cost-per-distance, and cost-per-time — via a new API endpoint, extending the division-safe
computation approach the constitution's Principle II already names these three aggregates by. This
is the backend half of M6; the Dashboard UI that surfaces these numbers (issue #17) is a separate,
later spec — same sequencing this project used for M5 (reminder rules/cron before email delivery).
Scope: for a single vehicle owned by the authenticated tenant, compute over its full history of
non-duplicate-flagged service and fuel records: costPerDistance (total cost divided by total
distance covered), costPerTime (total cost divided by elapsed calendar span), and
averageFuelEconomy (mean of existing per-fuel-record economy values). Every zero/undefined
denominator must yield null, never an error, Infinity, or NaN. Out of scope: Dashboard UI,
fleet-wide/cross-vehicle rollups, and time-windowed/trend aggregates — lifetime-to-date only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An owner sees what a vehicle costs to run (Priority: P1)

An owner with a vehicle history of service and fuel records checks how much that vehicle costs
them, expressed both per distance driven and per time owned — the two questions anyone comparing
"is this car worth keeping" actually asks.

**Why this priority**: This is the core value of the whole aggregates feature — everything else
(fuel economy, the later Dashboard UI) is secondary to answering "what does this vehicle cost me."

**Independent Test**: Log a mix of service and fuel records with different odometer readings and
dates for a vehicle, request its aggregates, and confirm costPerDistance and costPerTime reflect
the combined cost across both record types divided by the correct distance and time spans.

**Acceptance Scenarios**:

1. **Given** a vehicle with service and fuel records spanning a nonzero odometer range and date
   range, **When** the owner requests its aggregates, **Then** costPerDistance equals total cost
   (service + fuel, combined) divided by the odometer range, and costPerTime equals the same total
   cost divided by the day span between the earliest and latest record.
2. **Given** a vehicle with only one record, or every record at the identical odometer reading,
   **When** the owner requests its aggregates, **Then** costPerDistance is explicitly null, never
   a computed number, an error, or an infinite value.
3. **Given** a vehicle with every record logged on the same calendar day, **When** the owner
   requests its aggregates, **Then** costPerTime is explicitly null for the same reason.
4. **Given** a vehicle with zero service or fuel records at all, **When** the owner requests its
   aggregates, **Then** the request succeeds (the vehicle itself is valid) and every aggregate is
   null.
5. **Given** a vehicle with some records flagged as semantic duplicates (D-005), **When** the owner
   requests its aggregates, **Then** flagged records are excluded from every sum, minimum, and
   maximum used in the computation.

---

### User Story 2 - An owner sees a vehicle's overall fuel economy (Priority: P2)

An owner checks a vehicle's typical fuel economy as a single summary figure, rather than having to
read through every individual fuel record's own economy value.

**Why this priority**: Useful and directly requested by the constitution's own list of named
aggregates, but a vehicle can already be reviewed cost-first (User Story 1) without this — economy
is a secondary lens on the same underlying fuel data.

**Independent Test**: Log several fuel-ups for a vehicle with computable per-record economy values,
request the vehicle's aggregates, and confirm averageFuelEconomy is the mean of those per-record
values.

**Acceptance Scenarios**:

1. **Given** a vehicle with two or more fuel records that each already have a computable
   per-record fuel economy, **When** the owner requests its aggregates, **Then**
   averageFuelEconomy is the mean of those per-record values.
2. **Given** a vehicle whose fuel records have no computable per-record economy yet (e.g. only one
   fuel record, or every fuel record at the same odometer reading), **When** the owner requests
   its aggregates, **Then** averageFuelEconomy is explicitly null.
3. **Given** a vehicle with zero fuel records (service records only, or no records at all),
   **When** the owner requests its aggregates, **Then** averageFuelEconomy is null without
   affecting whether costPerDistance/costPerTime can still compute from the service records alone.

### Edge Cases

- A vehicle's aggregates are computed fresh on every request from its current records — there is
  no stored/cached aggregate to go stale after a record is added, edited, or deleted.
- The three aggregates are independent: one being null (e.g. averageFuelEconomy, because there are
  no fuel records yet) must never prevent the other two from computing normally when their own
  inputs are sufficient.
- A record with a null cost or null odometer reading (service records only — both fields are
  optional per spec 007) is excluded from the specific sum/span calculation that field would have
  fed, not treated as zero and not treated as disqualifying the whole aggregate.
- Requesting aggregates for a vehicle that doesn't exist, or belongs to a different tenant, is
  refused identically in both cases — never revealing which.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a way for an owner to retrieve a read-only aggregate summary
  — costPerDistance, costPerTime, and averageFuelEconomy — for one of their own vehicles.
- **FR-002**: costPerDistance MUST be computed as the combined total cost of that vehicle's
  non-duplicate-flagged service and fuel records, divided by the distance span between the lowest
  and highest odometer reading among those same records.
- **FR-003**: costPerTime MUST be computed as the same combined total cost, divided by the number
  of days between the earliest and latest record date among those same records.
- **FR-004**: averageFuelEconomy MUST be the mean of that vehicle's existing per-fuel-record fuel
  economy values (already computed elsewhere in the system), excluding any fuel record whose
  per-record economy is itself not computable.
- **FR-005**: Any aggregate whose denominator is zero, or whose inputs are otherwise insufficient
  to compute a meaningful value, MUST resolve to null for that aggregate specifically — never an
  error response, Infinity, or NaN — and MUST NOT prevent the other aggregates in the same response
  from computing independently.
- **FR-006**: A vehicle with no qualifying records MUST still return a successful response with
  every aggregate null, not an error or a 404 — the vehicle's own existence is sufficient.
- **FR-007**: Every aggregate computation MUST exclude records flagged as semantic duplicates
  (duplicateOfId set), consistent with how per-record fuel economy already excludes them.
- **FR-008**: The system MUST refuse to compute or return aggregates for a vehicle that doesn't
  exist or belongs to a different tenant than the requester, indistinguishably from either case.
- **FR-009**: Aggregates MUST be computed at request time from the current set of records, never
  stored or cached, so a record added, edited, or deleted is reflected on the very next request.

### Key Entities

- **Vehicle Aggregate Summary**: A read-only, derived view over one vehicle's service and fuel
  records — costPerDistance, costPerTime, and averageFuelEconomy, each independently nullable. Not
  a persisted entity: it exists only as the response to a request, recomputed every time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any vehicle with records spanning a nonzero distance, time span, and at least two
  fuel records with computable economy, all three aggregates return a computed value, with zero
  server errors across every tested combination of record types and counts.
- **SC-002**: A vehicle with zero records, one record, or records that share an odometer reading or
  a calendar date returns null for the affected aggregate(s) 100% of the time — never an error,
  Infinity, or NaN reaching the client.
- **SC-003**: A tenant can never retrieve another tenant's vehicle aggregates, verified across every
  request this feature exposes.
- **SC-004**: A record added or deleted is reflected in that vehicle's aggregates on the very next
  request, with no observable staleness window.

## Assumptions

- **Lifetime-to-date only**: this slice computes aggregates over a vehicle's full record history,
  not any time-windowed or rolling view (last 30/90 days, month-over-month trend, etc.) — a
  reasonable foundation the later Dashboard UI (issue #17) or a future feature can layer windowing
  onto without reworking this computation.
- **Vehicle-level only**: no fleet-wide or cross-vehicle rollup is in scope for this slice, matching
  the boundary the original fuel-record spec (009) already drew around milestone M6.
- **Units**: costPerDistance is expressed as cost per single unit of the vehicle's own odometer
  unit (per km or per mile, not per-100), and costPerTime as cost per day — chosen for consistent
  "per one unit" semantics across all three aggregates in the same response, distinct from
  fuel-economy's existing L/100km convention which is unrelated to this feature's own units.
- **Computation-only, no UI**: no Dashboard UI ships with this feature — issue #17 is its own later
  spec, per this project's established pattern of shipping a computation layer before the UI that
  consumes it (specs 011 → 012).
