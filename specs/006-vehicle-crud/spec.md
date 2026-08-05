# Feature Specification: Vehicle CRUD

**Feature Branch**: `006-vehicle-crud`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Vehicle CRUD (issue #9, milestone M2): let an authenticated user
create, view, update, and delete vehicles scoped to their own tenant — this is the first
data-bearing feature built on top of the now-complete auth foundation (specs/001-005). Core profile
fields: a user-chosen name/nickname (since make/model can repeat across a user's own vehicles),
make, model, year, VIN, and an odometer unit (km or mi) that governs how future odometer readings
for this vehicle are interpreted. A tenant can own multiple vehicles. Out of scope: service
records, fuel records, attachments, aggregates/dashboard, reminders, offline sync — those are later
milestones (M3-M8) that will reference vehicles created here, but this feature only covers the
vehicle record itself."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner adds their first vehicle (Priority: P1)

As a newly signed-in user, I want to add a vehicle to my account so I have somewhere to eventually
record its maintenance and fuel history.

**Why this priority**: Every later milestone (service records, fuel records, dashboard, reminders)
depends on at least one vehicle existing — without this, the product has nothing to attach any
other data to.

**Independent Test**: Starting from an authenticated account with no vehicles, submit a new
vehicle's details and confirm it appears when listing that account's vehicles, with exactly the
submitted values.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no vehicles, **When** they submit a name and an odometer
   unit (the two required fields) for a new vehicle, **Then** the vehicle is created and appears in
   their vehicle list.
2. **Given** an authenticated user, **When** they also provide make, model, year, and/or VIN,
   **Then** all provided values are stored and returned exactly as submitted.
3. **Given** an authenticated user, **When** they submit a vehicle without a name or without an
   odometer unit, **Then** the system rejects the submission and creates nothing.
4. **Given** an authenticated user, **When** they add a second vehicle with the same make and model
   as their first, **Then** both vehicles are created as distinct records, distinguishable by name.

---

### User Story 2 - An owner views and updates a vehicle's details (Priority: P1)

As a returning user, I want to see my vehicles' details and correct or update them (e.g. after
buying a new vehicle, learning its VIN, or fixing a typo).

**Why this priority**: Equal priority to creation — a record that can never be corrected or
reviewed after creation isn't usable for the record-keeping this product exists for.

**Independent Test**: Create a vehicle, fetch it back and confirm its details, update one field,
and confirm the fetched record reflects only that change.

**Acceptance Scenarios**:

1. **Given** an authenticated user with existing vehicles, **When** they list their vehicles,
   **Then** they see exactly the vehicles belonging to their own account — never another account's.
2. **Given** an authenticated user, **When** they fetch a single vehicle they own by its identifier,
   **Then** they receive its full current details.
3. **Given** an authenticated user, **When** they update one or more fields on a vehicle they own,
   **Then** only those fields change — every other field keeps its previous value.
4. **Given** an authenticated user, **When** they attempt to view, update, or delete a vehicle that
   belongs to a *different* account, **Then** the system refuses the same way it would for a
   nonexistent vehicle — never revealing that a vehicle with that identifier exists elsewhere.

---

### User Story 3 - An owner removes a vehicle they no longer have (Priority: P2)

As a user who sold or scrapped a vehicle, I want to remove it from my account so my vehicle list
stays accurate.

**Why this priority**: Real but lower-urgency value than creating/viewing/updating — the product is
still usable with a slightly stale vehicle list, but not usable at all without the ability to add
or read vehicles.

**Independent Test**: Create a vehicle, delete it, and confirm it no longer appears in the owner's
vehicle list or is fetchable by its identifier.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a vehicle they own, **When** they delete it, **Then** it no
   longer appears in their vehicle list and can no longer be fetched by its identifier.
2. **Given** an authenticated user, **When** they attempt to delete a vehicle belonging to a
   different account, **Then** the system refuses the same way as User Story 2's Scenario 4.

### Edge Cases

- What happens if a user submits a year far outside any plausible vehicle year (e.g. 1800 or
  3000)? The system should reject an obviously implausible value rather than silently accepting it
  — see Assumptions for the specific bound chosen.
- What happens if two of a user's own vehicles are given the exact same name? Allowed — names are a
  convenience label, not an identifier, and this system does not need to disambiguate vehicles by
  name (the underlying identifier already does that).
- What happens to a vehicle's data if the owning account is later erased (a future GDPR-erasure
  milestone, M8)? Out of scope for this feature to implement, but its data-model decision records
  the intended behavior so M8 doesn't have to re-derive it.
- What happens if a request tries to change which tenant/account owns a vehicle? Not a supported
  operation — ownership is fixed at creation and this feature provides no way to transfer it.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user create a vehicle owned by their own account,
  requiring at minimum a name and an odometer unit.
- **FR-002**: System MUST let a vehicle's make, model, year, and VIN be provided at creation or left
  unset — none of the four is required.
- **FR-003**: System MUST let an authenticated user list all vehicles owned by their own account,
  and MUST NOT include any other account's vehicles in that list.
- **FR-004**: System MUST let an authenticated user fetch a single vehicle they own by its
  identifier, returning its full current details.
- **FR-005**: System MUST let an authenticated user update any of a vehicle's editable fields (name,
  make, model, year, VIN, odometer unit) on a vehicle they own, changing only the fields included in
  the update.
- **FR-006**: System MUST let an authenticated user delete a vehicle they own, after which it MUST
  NOT appear in that account's vehicle list or be fetchable by its identifier.
- **FR-007**: System MUST refuse to reveal, fetch, update, or delete a vehicle belonging to a
  different account — the refusal MUST be indistinguishable (from the caller's perspective) from
  that vehicle identifier simply not existing (tenant isolation, constitution Principle I).
- **FR-008**: System MUST reject a vehicle year outside a plausible bound (Assumptions) rather than
  storing an implausible value.
- **FR-009**: System MUST reject an odometer unit value that isn't one of the two supported units
  (kilometers, miles).
- **FR-010**: System MUST NOT require make, model, or VIN to be unique, either across a tenant's own
  vehicles or globally — two vehicles may legitimately share any of these values.

### Key Entities

- **Vehicle**: A single vehicle record owned by exactly one tenant. Fields: a user-chosen name
  (required), make, model, year, and VIN (all optional, free text/number), and an odometer unit
  (required — kilometers or miles) that later milestones (fuel/service records, dashboard) will use
  to interpret that vehicle's odometer readings consistently.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can go from "authenticated, no vehicles" to "one vehicle visible in their
  list" by submitting a single form with only the two required fields.
- **SC-002**: 100% of attempts to view, update, or delete a vehicle owned by a different account are
  refused, verified by a test that seeds a vehicle under one account and attempts each operation
  from a second, different authenticated account.
- **SC-003**: A field left out of an update request never changes — verified by a test that updates
  one field and confirms every other field's value is byte-for-byte identical to before the update.
- **SC-004**: A deleted vehicle is unreachable by every read path (list, fetch-by-id) immediately
  after deletion, with no propagation delay.

## Assumptions

- Plausible year bound (FR-008): a whole number between 1900 and 10 years past the current year —
  wide enough to cover any real vehicle (including vintage/classic vehicles) and any realistic
  near-future model year, while still catching obvious data-entry mistakes (e.g. a four-digit typo).
- No file/photo attachments for a vehicle in this feature — that's bundled with service/fuel record
  attachments in later milestones (M3/M4), not the vehicle record itself.
- No vehicle-level "current odometer reading" field is introduced here — odometer *readings* are
  something service/fuel records will carry (M3/M4); this feature only fixes the *unit* those future
  readings will be interpreted in, per the feature description.
- GDPR erasure decision for the `vehicles` table (constitution Principle VIII) is recorded during
  this feature's planning phase (data-model.md), even though implementing the erasure flow itself is
  M8's job — consistent with how every prior feature's data-model.md handled its own new tables.
- Ownership transfer (moving a vehicle from one account to another) is not a supported operation in
  this or any currently-scoped milestone — out of scope entirely, not deferred.
