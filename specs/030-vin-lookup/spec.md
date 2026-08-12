# Feature Specification: VIN Lookup on Vehicle Add

**Feature Branch**: `030-vin-lookup`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "VIN lookup on vehicle add (GitHub issue #88, milestone M12). When
adding a vehicle, let the owner optionally enter a VIN and have the system attempt to auto-fill
make/model/year from a third-party VIN-decode API, instead of typing them manually. The add-vehicle
form today only collects name + odometer unit at creation time; this feature adds make/model/year/
VIN fields to the form AND the auto-fill behavior on top. Owner types a VIN, triggers a lookup via
an explicit action, and on success the make/model/year fields are pre-filled but remain editable.
Two failure modes (network failure, and a successful-but-undecodable response for an
out-of-database or non-US-market VIN) must both degrade to plain manual entry, never block vehicle
creation. Never show a guessed/partial value for a field the lookup didn't actually return. VIN
lookup is not part of the vehicle-creation write itself and must not go through the offline write
queue — it's a skippable pre-submit assist step, and the add-vehicle form must remain fully usable
offline exactly as it is today if skipped."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Auto-fill vehicle details from a VIN (Priority: P1)

An owner adding a new vehicle knows its VIN (e.g. from the registration or windshield) and would
rather not manually look up and type the make, model, and year. They enter the VIN into the
add-vehicle form and trigger a lookup; on success, the make/model/year fields are filled in for
them, which they can review, correct, or leave as-is before saving the vehicle.

**Why this priority**: This is the feature's entire value proposition. Without it working, there is
nothing to ship.

**Independent Test**: Can be fully tested by entering a VIN known to decode successfully, triggering
the lookup, and confirming the make/model/year fields populate with the correct values while
remaining editable, then saving the vehicle and confirming those values persist.

**Acceptance Scenarios**:

1. **Given** the owner is on the add-vehicle form, **When** they enter a valid, decodable VIN and
   trigger a lookup, **Then** the make, model, and year fields are pre-filled with the decoded
   values.
2. **Given** the make/model/year fields have been pre-filled from a successful lookup, **When** the
   owner edits any of those fields before saving, **Then** their edited value is what gets saved,
   not the originally-decoded value.
3. **Given** a successful lookup has pre-filled some fields, **When** the owner saves the vehicle
   without further edits, **Then** the vehicle is created with the decoded make/model/year/VIN.

---

### User Story 2 - Lookup fails gracefully and never blocks vehicle creation (Priority: P1)

An owner enters a VIN that cannot be looked up — either because of a network/service problem, or
because the VIN is genuinely outside the lookup service's coverage (e.g. an older, non-US-market,
or otherwise undecodable vehicle). They must still be able to fill in the vehicle's details manually
and save it without any obstruction, exactly as they could before this feature existed.

**Why this priority**: Equal priority to User Story 1 — a lookup feature that can block or degrade
the existing "just type in your vehicle's details" flow would make the product worse, not better,
for exactly the international/non-US owners this product is explicitly designed to support.

**Independent Test**: Can be fully tested by triggering a lookup with a VIN that the service cannot
decode (or by simulating a lookup failure), confirming a clear, non-blocking message appears, and
confirming the owner can still fill in and save the vehicle manually.

**Acceptance Scenarios**:

1. **Given** the owner triggers a lookup and the lookup service is unreachable or errors, **Then**
   a message indicates the lookup could not be completed and invites manual entry, and the
   make/model/year fields remain empty and editable.
2. **Given** the owner triggers a lookup for a VIN the service cannot find details for, **Then** a
   message indicates no details were found for that VIN and invites manual entry, and the
   make/model/year fields remain empty and editable.
3. **Given** a lookup has failed in either way, **When** the owner fills in make/model/year manually
   and saves, **Then** the vehicle is created successfully with the manually-entered values.
4. **Given** the lookup service returns a value for only some fields (e.g. make but not model),
   **When** the lookup completes, **Then** only the fields the service actually returned a value for
   are pre-filled — fields it did not return remain empty for the owner to fill in, never guessed or
   inferred.

---

### User Story 3 - VIN lookup is entirely optional and works offline exactly as before (Priority: P2)

An owner who doesn't have or doesn't want to use a VIN, or who is currently offline, can add a
vehicle exactly as they could before this feature existed — by name and odometer unit alone — with
no new required step or field standing in the way.

**Why this priority**: Preserves existing, already-shipped, offline-capable behavior. Lower priority
than User Stories 1 and 2 only because it's a "don't break what already works" story rather than new
value, but it is a hard requirement, not a nice-to-have.

**Independent Test**: Can be fully tested by adding a vehicle with only a name and odometer unit
(no VIN entered, no lookup triggered) while offline, and confirming it saves via the existing
offline queue exactly as it did before this feature.

**Acceptance Scenarios**:

1. **Given** the owner is offline, **When** they add a vehicle with only a name and odometer unit
   and no VIN, **Then** the vehicle is queued and saved exactly as it was before this feature
   existed.
2. **Given** the owner is on the add-vehicle form, **When** they never enter a VIN or trigger a
   lookup, **Then** the form behaves exactly as before — no lookup is attempted, no additional
   required field blocks submission.

---

### Edge Cases

- What happens if the owner triggers a lookup, then changes the VIN field before the lookup
  response arrives? The most recently triggered lookup's result is the one applied when it arrives;
  an owner who changes the VIN after triggering a lookup should trigger a new lookup for the new
  VIN rather than relying on the in-flight one.
- What happens if the owner triggers a lookup, gets a successful pre-fill, then changes the VIN and
  triggers another lookup? The newly-decoded values overwrite the previous pre-fill (but not any
  field the owner has since hand-edited independently of the VIN field — see Assumptions).
- What happens if the owner enters an obviously malformed VIN (e.g. far too short)? The system may
  reject triggering a lookup for it locally (avoiding a pointless round-trip) with the same
  non-blocking "enter manually" guidance, without needing to contact the lookup service at all.
- What happens if the owner triggers multiple lookups in quick succession (e.g. double-clicking the
  lookup action)? Only the latest triggered lookup's result should be applied; duplicate in-flight
  requests must not cause duplicate or conflicting pre-fills.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The add-vehicle form MUST allow the owner to optionally enter a VIN, make, model, and
  year — none of which are required to create a vehicle.
- **FR-002**: The system MUST provide an explicit action (not an automatic per-keystroke trigger) for
  the owner to request a VIN lookup.
- **FR-003**: On a successful lookup, the system MUST pre-fill only the make/model/year fields for
  which the lookup service actually returned a value, leaving any other field untouched.
- **FR-004**: Pre-filled make/model/year fields MUST remain fully editable after a successful
  lookup — the owner can override any pre-filled value before saving.
- **FR-005**: The system MUST NOT show a guessed, inferred, or partial-match value for any field the
  lookup service did not explicitly return.
- **FR-006**: On a lookup failure caused by a network or service problem, the system MUST show a
  clear message inviting manual entry and MUST NOT block the owner from saving the vehicle manually.
- **FR-007**: On a lookup that completes but finds no usable details for the given VIN, the system
  MUST show a clear message inviting manual entry and MUST NOT block the owner from saving the
  vehicle manually.
- **FR-008**: Vehicle creation MUST NOT depend on, wait for, or require a VIN lookup to have been
  attempted or to have succeeded.
- **FR-009**: The VIN lookup MUST be a step that happens before the vehicle-creation save action
  completes — it MUST NOT become part of the data written when the vehicle is saved, and MUST NOT
  be queued as an offline write.
- **FR-010**: The add-vehicle form MUST remain fully usable while offline, using only locally
  available information (no VIN lookup possible offline), exactly as it was before this feature.
- **FR-011**: Only the most recently triggered lookup's result MUST be applied if the owner triggers
  more than one lookup for the same form session; stale or duplicate in-flight lookups MUST NOT
  overwrite a newer one's result or the fields it left untouched.

### Key Entities

- **Vehicle**: Already exists; this feature adds owner-facing entry for its existing (already
  nullable) make, model, year, and VIN attributes at creation time, rather than only at edit time.
- **VIN lookup result**: A transient, per-form-session value (not persisted on its own) — a set of
  zero or more decoded field values (make, model, year) plus a status (found / not found / lookup
  failed) used only to pre-fill the add-vehicle form.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner with a decodable VIN can add a fully-detailed vehicle (name, make, model,
  year, VIN) without manually typing the make, model, or year.
- **SC-002**: 100% of lookup failures (network/service failure or undecodable VIN) still allow the
  owner to complete vehicle creation via manual entry, with no dead end and no error that blocks
  saving.
- **SC-003**: Adding a vehicle without ever touching VIN lookup — including while offline — works
  identically to how it worked before this feature, with zero regression.
- **SC-004**: No vehicle is ever created with a fabricated or guessed make/model/year value that the
  lookup service did not actually supply.

## Assumptions

- The lookup service used is US/Canada-market-focused; a materially incomplete or empty result for
  non-US-market or older vehicles is an expected, normal outcome to design for, not an exceptional
  bug.
- If the owner hand-edits a pre-filled field and then triggers a new lookup for a changed VIN, the
  new lookup's result for that same field is applied and overwrites the hand-edit — the system does
  not attempt to track which fields were "manually touched" versus "pre-filled" to selectively
  protect them from a subsequent lookup the owner explicitly re-triggered.
- A lookup is scoped to a single form session; there is no caching of previous lookup results across
  different add-vehicle attempts.
- This feature does not change vehicle editing (the existing update path) — it only adds VIN-driven
  pre-fill to the creation form.
- No new permission or role model is introduced — VIN lookup is available to the same signed-in
  owner who can already add vehicles today.
