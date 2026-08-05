# Feature Specification: Service Record CRUD + Attachments

**Feature Branch**: `007-service-record-crud`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Service record CRUD + attachments (issue #10, milestone M3): let an
authenticated user create, view, update, and delete service records for a vehicle they own, with
optional photo/receipt attachments stored in R2. Attachments are private objects (constitution
Principle V) — every read goes through an ownership-checked route, never a public URL; every upload
is validated by magic bytes (not just the declared content type), capped by size, restricted to an
allowlist of file types, and has EXIF/GPS metadata stripped before storage. A service record records
what was done, when, and optionally at what odometer reading — the reading is never guessed or
backfilled if omitted (Principle IV)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner logs a service event for their vehicle (Priority: P1)

As a vehicle owner, I want to record that a service was performed (an oil change, brake pads, etc.)
so I have a maintenance history for that vehicle.

**Why this priority**: This is the core purpose of the product — without the ability to record a
service event, there's no maintenance history to build anything else (dashboard, reminders) on top
of.

**Independent Test**: Starting from a vehicle with no service history, submit a service record with
just a date and description and confirm it appears in that vehicle's service history with exactly
the submitted values.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a vehicle they own, **When** they submit a service date and
   description (the two required fields) for that vehicle, **Then** the record is created and
   appears in that vehicle's service history.
2. **Given** an authenticated user, **When** they also provide an odometer reading, cost, and/or
   notes, **Then** all provided values are stored and returned exactly as submitted.
3. **Given** an authenticated user, **When** they omit the odometer reading, **Then** the record is
   still created successfully with no reading — the system never estimates or backfills one
   (Principle IV).
4. **Given** an authenticated user, **When** they attempt to create a service record for a vehicle
   that doesn't exist or belongs to a different tenant, **Then** the system refuses identically to a
   nonexistent vehicle id.
5. **Given** an authenticated user, **When** they submit a record without a date or without a
   description, **Then** the system rejects the submission and creates nothing.

---

### User Story 2 - An owner reviews a vehicle's service history (Priority: P1)

As a vehicle owner, I want to see every service record for a vehicle, and the full detail of any
one of them, so I can answer "when did I last do X" or show a buyer/mechanic the maintenance
history.

**Why this priority**: Equal priority to creation — a history that can never be read back isn't
useful record-keeping.

**Independent Test**: Create several service records for a vehicle, list them, and confirm exactly
those records come back with their full detail, and that a different tenant's vehicle's records
never appear.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they list service records for a vehicle they own,
   **Then** they see exactly that vehicle's records — never another tenant's, even for a vehicle id
   that happens to exist elsewhere.
2. **Given** an authenticated user, **When** they fetch a single service record they own by its
   identifier, **Then** they receive its full current detail, including any attachments' metadata.
3. **Given** an authenticated user, **When** they attempt to list or fetch records for a vehicle
   belonging to a different tenant, **Then** the system refuses identically to a nonexistent vehicle.

---

### User Story 3 - An owner corrects or removes a service record (Priority: P2)

As a vehicle owner, I want to fix a typo or remove a service record I entered by mistake, so my
history stays accurate.

**Why this priority**: Real value, but the product is still usable (if slightly less tidy) without
it — lower priority than the two flows that make a maintenance history exist and be readable at
all.

**Independent Test**: Create a service record, update one field, confirm only that field changed;
separately, delete a record and confirm it's gone from the history.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they update one or more fields on a service record they
   own, **Then** only those fields change — every other field, including any attachments, keeps its
   previous state.
2. **Given** an authenticated user, **When** they delete a service record they own, **Then** it (and
   any attachments it had) no longer appears in the vehicle's history or is fetchable by its
   identifier.
3. **Given** an authenticated user, **When** they attempt to update or delete a service record
   belonging to a different tenant, **Then** the system refuses identically to a nonexistent record.

---

### User Story 4 - An owner attaches a photo or receipt to a service record (Priority: P2)

As a vehicle owner, I want to attach a photo of the completed work or a scanned receipt to a service
record, so the record has supporting evidence I can refer back to.

**Why this priority**: Real, expected value for a maintenance tracker, but the core record-keeping
(Stories 1-3) delivers value on its own without it — attachments are additive, not load-bearing.

**Independent Test**: Upload a valid image to an existing service record and confirm it's listed as
an attachment on that record and retrievable only by its owner; separately, confirm a spoofed,
oversized, or disallowed file is rejected before anything is stored, and that a photo's embedded
location data never survives into what's stored or ever retrievable.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a service record they own, **When** they upload a photo or
   receipt in an allowed format under the size limit, **Then** it's stored and appears as an
   attachment on that record.
2. **Given** an authenticated user, **When** they attempt to upload a file that isn't actually one of
   the allowed formats — regardless of what the upload claims its type is — **Then** the system
   rejects it before storing anything.
3. **Given** an authenticated user, **When** they attempt to upload a file larger than the size
   limit, **Then** the system rejects it before storing anything.
4. **Given** an authenticated user, **When** they upload a photo that has embedded location
   (GPS/EXIF) metadata, **Then** that metadata is not present in, or recoverable from, what's
   actually stored.
5. **Given** an authenticated user, **When** they retrieve an attachment they own, **Then** they
   receive its content directly from the application — never a link to a publicly-reachable
   storage URL.
6. **Given** an authenticated user, **When** they attempt to retrieve an attachment belonging to a
   different tenant's service record, **Then** the system refuses identically to a nonexistent
   attachment.

### Edge Cases

- What happens if a service record's vehicle is later deleted (specs/006)? Its service records (and
  their attachments) are removed along with it — a service record has no independent existence
  apart from the vehicle it documents.
- What happens if an upload is interrupted partway through? No partial or corrupted attachment
  record should be left referencing an object that was never fully, validly stored.
- What happens to an existing attachment when a service record is deleted? It's deleted too — see
  User Story 3, Scenario 2.
- What happens if the same file is uploaded twice to the same record? Allowed — each upload creates
  its own distinct attachment; this feature does not attempt to detect or prevent duplicate
  attachment content.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user create a service record for a vehicle they own,
  requiring at minimum a service date and a description.
- **FR-002**: System MUST let an odometer reading, cost, and notes be provided at creation or left
  unset — none of the three is required, and none is ever estimated or backfilled if omitted
  (Principle IV).
- **FR-003**: System MUST refuse to create a service record for a vehicle that doesn't exist or
  belongs to a different tenant, identically to how it refuses any other cross-tenant access
  (constitution Principle I).
- **FR-004**: System MUST let an authenticated user list every service record for a vehicle they
  own, and MUST NOT include another tenant's records.
- **FR-005**: System MUST let an authenticated user fetch a single service record they own by its
  identifier, including its attachments' metadata.
- **FR-006**: System MUST let an authenticated user update any editable field on a service record
  they own, changing only the fields included in the update.
- **FR-007**: System MUST let an authenticated user delete a service record they own, removing its
  attachments (both the stored objects and their metadata) along with it.
- **FR-008**: System MUST refuse to reveal, fetch, update, or delete a service record or attachment
  belonging to a different tenant — the refusal MUST be indistinguishable from that resource simply
  not existing.
- **FR-009**: System MUST let an authenticated user upload a photo or receipt attachment to a
  service record they own.
- **FR-010**: System MUST validate an uploaded file's actual type by inspecting its content (magic
  bytes), not merely trusting the declared content type, and MUST reject any file outside a defined
  allowlist of formats before storing it.
- **FR-011**: System MUST reject an uploaded file larger than a defined size cap before storing it.
- **FR-012**: System MUST strip EXIF metadata (including any embedded GPS/location data) from an
  uploaded photo before it's stored — the stripped data MUST NOT be present in, or recoverable from,
  the stored object.
- **FR-013**: System MUST serve attachment content only through an authenticated, ownership-checked
  route — an attachment's underlying storage location MUST NOT be directly, publicly reachable.
- **FR-014**: System MUST NOT create any service record or attachment metadata for an upload that
  fails validation (FR-010/FR-011) or storage.

### Key Entities

- **Service record**: A single documented service event for one vehicle. Fields: service date and
  description (required), odometer reading, cost, and notes (all optional, never inferred if
  absent). Belongs to exactly one vehicle, and transitively to that vehicle's tenant.
- **Attachment**: A photo or receipt file associated with exactly one service record, stored
  privately (never publicly reachable), with its content-type and size recorded as metadata. A
  service record may have zero or more attachments.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can go from "no service history" to "one record visible in their vehicle's
  history" by submitting only the two required fields.
- **SC-002**: 100% of attempts to view, update, or delete a service record or attachment belonging
  to a different tenant are refused, verified by a test that seeds a record/attachment under one
  account and attempts each operation from a different authenticated account.
- **SC-003**: 100% of upload attempts using a disallowed or spoofed file type are rejected before
  anything is stored, verified by a test that mislabels a disallowed file's declared type as an
  allowed one.
- **SC-004**: 100% of oversized upload attempts are rejected before anything is stored.
- **SC-005**: A photo containing embedded GPS/EXIF metadata, once uploaded, has no recoverable trace
  of that metadata in the stored object, verified by inspecting the stored bytes directly.
- **SC-006**: A field left out of an update request never changes, verified the same way
  specs/006's vehicle update guarantee was.

## Assumptions

- **Allowed attachment formats**: JPEG, PNG, WebP (photos), and PDF (scanned receipts) — the four
  formats a maintenance-tracker attachment realistically needs; anything else is out of scope for
  v1 rather than a gap to fill later.
- **Size cap**: 10 MB per attachment — generous enough for a modern phone photo or a scanned receipt
  PDF, small enough to keep upload/storage costs and validation time bounded. A specific, documented
  default rather than an open-ended limit.
- **EXIF stripping scope**: JPEG is the format that commonly carries GPS/EXIF metadata (the privacy
  concern Principle V's rationale names explicitly) and is what this feature guarantees stripping
  for. PNG/WebP are far less commonly used by cameras to embed location data; this feature does not
  claim to strip metadata from those formats, only JPEG, and that boundary is intentional, not an
  oversight — recorded in research.md.
- **Semantic duplicate detection (D-005)** is explicitly **out of scope** for this feature, despite
  the M3 milestone description mentioning it — issue #10's own text scopes this feature to "CRUD +
  attachments" only, and a dedicated duplicate-detection/resolution UI is already tracked separately
  for fuel records (issue #12, milestone M4). Service records' equivalent can reuse that
  infrastructure once it exists, rather than this feature building a first, possibly-inconsistent
  version of it. Flagged here so the scope boundary is a documented decision, not a silent gap.
- **No dedicated "remove one attachment" operation** in this feature — an attachment's lifecycle is
  tied to its service record (created with/after it, deleted with it). Removing a single attachment
  without deleting the whole record is a reasonable future enhancement, not required for v1.
- A vehicle's `odometerUnit` (specs/006) is what an odometer reading on its service records is
  interpreted in — this feature doesn't re-ask for or store a per-record unit.
