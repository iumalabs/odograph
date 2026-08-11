# Feature Specification: Maintenance History PDF Export

**Feature Branch**: `027-pdf-export`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Maintenance history PDF export (GitHub issue #77, milestone M11).
Let an owner download a PDF report of a vehicle's maintenance and fuel record history — useful for
resale or warranty claims, as referenced in the design mockup (a "PDF report" button/icon in a
"when selling the car" context — the mockup gives no field/layout spec beyond the button itself,
so field selection is this spec's own call). Server-generates the PDF on request from the exact
same service_records and fuel_records data already read by the existing aggregates/expense-
breakdown features (specs/013, specs/026) — no new stored data, no new database table. The report
should include: a header identifying the vehicle (name, make/model/year if known) and the
generation date; a chronological list of service records (date, description, odometer reading if
known, cost if known); a chronological list of fuel records (date, station if known, volume, cost,
odometer reading, computed fuel economy if available); and a summary of total maintenance cost,
total fuel cost, and combined total. Semantic duplicates (constitution D-005) are excluded from
the report, identical to how the existing aggregates already exclude them. A vehicle with no
records at all still produces a valid, downloadable PDF (with an appropriate empty-history note),
never an error."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner downloads a maintenance history report for a vehicle (Priority: P1)

As a vehicle owner preparing to sell the vehicle or file a warranty claim, I want to download a
single PDF document summarizing everything I've logged for that vehicle, so I can hand it to a
buyer, dealer, or warranty provider without them needing access to the app.

**Why this priority**: This is the entire feature — there's no lesser version of "produce a
downloadable report."

**Independent Test**: For a vehicle with both service and fuel records, request the report and
confirm the downloaded file is a valid PDF containing the vehicle's identifying details, every
qualifying service record, every qualifying fuel record, and a cost summary.

**Acceptance Scenarios**:

1. **Given** an authenticated owner viewing a vehicle they own, **When** they request its
   maintenance history report, **Then** they receive a downloadable PDF file.
2. **Given** the same vehicle has both service and fuel records, **When** the report is
   generated, **Then** it lists every qualifying record from both, each with its recorded date,
   and every other field that was actually provided for it (description/station, cost, odometer
   reading, computed fuel economy where applicable).
3. **Given** a record has a field that was never provided (e.g. no cost, no odometer reading),
   **When** the report is generated, **Then** that field is shown as not provided — never a
   fabricated or guessed value.
4. **Given** the vehicle's records include one flagged as a semantic duplicate of another
   (constitution D-005), **When** the report is generated, **Then** the flagged duplicate is
   excluded, identical to how the existing cost aggregates already exclude it.
5. **Given** an owner attempts to request a report for a vehicle that doesn't exist or belongs to
   a different tenant, **When** the request is made, **Then** it's refused identically to any
   other cross-tenant access.

---

### User Story 2 - An owner sees an accurate cost summary in the report (Priority: P2)

As a vehicle owner reviewing the generated report, I want it to show total maintenance spend,
total fuel spend, and their combined total, so a buyer or claims reviewer immediately sees the
vehicle's overall cost of ownership without adding up every line themselves.

**Why this priority**: Real, expected value for a resale/warranty document, but the report is
still useful without it (the itemized lists from User Story 1 already deliver the core value) —
the summary is a convenience on top, not the report's reason to exist.

**Independent Test**: For a vehicle with known service and fuel costs, confirm the report's
summary total-maintenance-cost and total-fuel-cost figures equal the hand-computed sums of the
qualifying records' own costs, and that their combined total is their sum.

**Acceptance Scenarios**:

1. **Given** a vehicle with service and fuel records that have costs, **When** the report is
   generated, **Then** its summary shows the correct total maintenance cost, total fuel cost, and
   their combined total.
2. **Given** a service record with no recorded cost, **When** the report's summary is computed,
   **Then** that record contributes nothing to the total — never a fabricated value.

---

### User Story 3 - An owner with no history still gets a valid report (Priority: P3)

As a vehicle owner who just added a vehicle with no service or fuel history yet, I want
requesting a report to still produce a valid, downloadable PDF (clearly noting there's no history
yet) rather than an error, so the report action always behaves predictably.

**Why this priority**: An edge case, not the primary use case (a report is mainly requested by an
owner who's had the vehicle a while) — but a real one, low-cost to guarantee correctly, and a poor
error experience here would undermine confidence in the feature.

**Independent Test**: Request a report for a freshly-created vehicle with zero records and confirm
a valid PDF is returned, noting the absence of history rather than erroring.

**Acceptance Scenarios**:

1. **Given** a vehicle with no service or fuel records at all, **When** an owner requests its
   report, **Then** they receive a valid, downloadable PDF that clearly states there's no
   recorded history yet, rather than an error.

### Edge Cases

- What happens if a vehicle has a very large number of records? The report still includes every
  qualifying record — no truncation or "only the most recent N" behavior; length is a
  presentation detail, not a scope limit.
- What happens to a fuel record whose fuel economy couldn't be computed (e.g. the very first
  fill-up with nothing to compare against)? It's shown without a fuel-economy figure, same
  "not provided" treatment as any other missing field — never guessed.
- What happens if the vehicle is deleted between listing it and requesting its report? The
  request is refused identically to a vehicle that never existed — nothing is generated.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user request a downloadable report for a vehicle
  they own, containing that vehicle's maintenance and fuel history.
- **FR-002**: System MUST refuse to generate a report for a vehicle that doesn't exist or belongs
  to a different tenant, identically to how it refuses any other cross-tenant access (constitution
  Principle I).
- **FR-003**: The report MUST identify the vehicle (its name, and make/model/year where known) and
  the date the report was generated.
- **FR-004**: The report MUST list every qualifying service record for the vehicle in
  chronological order, showing its date and every other field that was actually provided for it.
- **FR-005**: The report MUST list every qualifying fuel record for the vehicle in chronological
  order, showing its date and every other field that was actually provided or computable for it
  (including fuel economy where computable).
- **FR-006**: The report MUST exclude any record currently flagged as a semantic duplicate,
  identical to the existing cost aggregates' exclusion rule (constitution D-005).
- **FR-007**: A field with no recorded value MUST be shown as not provided in the report — never a
  fabricated or inferred value (constitution Principle IV).
- **FR-008**: The report MUST include a summary of total maintenance cost, total fuel cost, and
  their combined total, computed only from the report's own qualifying records, with a record
  missing a cost contributing zero to the relevant total rather than being fabricated or dropped
  from consideration.
- **FR-009**: A vehicle with no qualifying records MUST still produce a valid, downloadable report
  that clearly indicates the absence of history — never an error.

### Key Entities

- **Maintenance history report**: A generated, downloadable document for one vehicle — not a
  stored entity. Derived entirely from that vehicle's existing service and fuel records at the
  moment it's requested; nothing about the report itself is persisted.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can go from "viewing a vehicle" to "holding a complete, shareable history
  document" in a single request, with no manual data entry or compilation.
- **SC-002**: 100% of a report's listed records are exactly that vehicle's own qualifying records
  (own tenant, not flagged as a duplicate) — verified by a test that seeds records across
  different tenants/vehicles and confirms only the requested vehicle's own, non-duplicate records
  appear.
- **SC-003**: 100% of attempts to generate a report for a different tenant's vehicle are refused,
  verified the same way every other cross-tenant guarantee in this system already is.
- **SC-004**: The report's summary totals are verifiably the sum of its own listed records' costs
  (missing cost counted as zero) — verified by a test that seeds records with known costs and
  checks the summary against a hand-computed sum.
- **SC-005**: Requesting a report for a vehicle with zero records succeeds and returns a valid
  document, verified by a test that confirms no error and a well-formed response.

## Assumptions

- **PDF only, no other export format**: matches the issue's own scope and the mockup's single
  "PDF report" affordance — no CSV/Excel/print-optimized-HTML alternative in v1.
- **Report content is generated fresh on every request**, never cached or stored — consistent with
  how the existing cost aggregates (specs/013) and expense breakdown (specs/026) are both
  computed-on-read, and simplest given a report reflects whatever is true "right now."
- **No page-count or record-count limit**: the mockup's own "12 pages" figure is a design-tool
  placeholder, not a real spec — a real report's length is whatever the owner's actual history
  requires.
- **No per-report customization** (e.g. choosing a date range, excluding certain records) in v1 —
  the report always covers a vehicle's full history; a scoped/filtered report is a reasonable
  future enhancement, not required here.
- **A vehicle's existing tenant/ownership model** (specs/006) governs access to its report — no
  separate permission model, and no sharing/public-link mechanism (the file is downloaded by the
  authenticated owner directly, same trust boundary as every other authenticated read in this
  system).
