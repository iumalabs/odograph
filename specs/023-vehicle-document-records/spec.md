# Feature Specification: Vehicle Document Records — CRUD, Expiry Tracking, and Attachments

**Feature Branch**: `023-vehicle-document-records`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Vehicle document records — CRUD, expiry tracking, and scan/photo
attachments (GitHub issue #73, milestone M9). Labels: area:documents, needs-spec. Add a
tenant/vehicle-scoped documents entity so users can track registration, insurance, warranty, and
inspection paperwork alongside their service/fuel history. Fields: title, category
(registration/insurance/warranty/inspection/other), expiry date (nullable — some documents like a
title never expire), notes. Attachments (scan/photo of the document) must reuse the existing
validated-upload pattern from service/fuel record attachments (magic-byte check, size cap, EXIF
strip, private R2 storage, GDPR erasure via the same cascade) rather than building a second upload
pipeline. CRUD + list UI should mirror the shape of specs/007-service-record-crud. This spec is
standalone — do not design the expiry-reminder notification flow here, that is a separate
follow-up issue (#74) that will depend on this entity."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner records a document for their vehicle (Priority: P1)

As a vehicle owner, I want to record a piece of paperwork (registration, insurance policy,
warranty, inspection certificate, or something else) for a vehicle, so I have a single place that
tracks what paperwork exists and when it expires.

**Why this priority**: This is the core purpose of the feature — without the ability to record a
document, there's nothing for the rest of the feature (viewing, editing, attachments, future
reminders) to operate on.

**Independent Test**: Starting from a vehicle with no documents, submit a document with just a
title and category and confirm it appears in that vehicle's document list with exactly the
submitted values.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a vehicle they own, **When** they submit a title and
   category (the two required fields) for that vehicle, **Then** the document is created and
   appears in that vehicle's document list.
2. **Given** an authenticated user, **When** they also provide an expiry date and/or notes,
   **Then** all provided values are stored and returned exactly as submitted.
3. **Given** an authenticated user, **When** they omit the expiry date, **Then** the document is
   still created successfully with no expiry — the system never estimates or infers one
   (constitution Principle IV), since some documents (e.g. a vehicle title) never expire.
4. **Given** an authenticated user, **When** they attempt to create a document for a vehicle that
   doesn't exist or belongs to a different tenant, **Then** the system refuses identically to a
   nonexistent vehicle.
5. **Given** an authenticated user, **When** they submit a document without a title or without a
   category, **Then** the system rejects the submission and creates nothing.
6. **Given** an authenticated user, **When** they submit a category outside the defined set
   (registration, insurance, warranty, inspection, other), **Then** the system rejects the
   submission and creates nothing.

---

### User Story 2 - An owner reviews a vehicle's documents (Priority: P1)

As a vehicle owner, I want to see every document for a vehicle, and the full detail of any one of
them, so I can answer "do I have proof of insurance" or "when does my registration expire."

**Why this priority**: Equal priority to creation — a document list that can never be read back
isn't useful record-keeping.

**Independent Test**: Create several documents for a vehicle with a mix of expiry dates (past,
future, and none), list them, and confirm exactly those documents come back with their full
detail, and that a different tenant's vehicle's documents never appear.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they list documents for a vehicle they own, **Then**
   they see exactly that vehicle's documents — never another tenant's, even for a vehicle id that
   happens to exist elsewhere.
2. **Given** an authenticated user, **When** they fetch a single document they own by its
   identifier, **Then** they receive its full current detail, including any attachment metadata.
3. **Given** an authenticated user, **When** a document's expiry date is in the past, **Then** the
   document is still returned in full — the system flags it as expired rather than hiding it.
4. **Given** an authenticated user, **When** they attempt to list or fetch documents for a vehicle
   belonging to a different tenant, **Then** the system refuses identically to a nonexistent
   vehicle.

---

### User Story 3 - An owner corrects or removes a document (Priority: P2)

As a vehicle owner, I want to fix a typo, update an expiry date after renewal, or remove a
document I entered by mistake, so my records stay accurate.

**Why this priority**: Real value, but the feature is still usable (if slightly less tidy)
without it — lower priority than the two flows that make document tracking exist and be readable
at all.

**Independent Test**: Create a document, update one field (e.g. renew its expiry date), confirm
only that field changed; separately, delete a document and confirm it's gone from the list.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they update one or more fields on a document they
   own, **Then** only those fields change — every other field, including any attachments, keeps
   its previous state.
2. **Given** an authenticated user, **When** they delete a document they own, **Then** it (and any
   attachments it had) no longer appears in the vehicle's document list or is fetchable by its
   identifier.
3. **Given** an authenticated user, **When** they attempt to update or delete a document belonging
   to a different tenant, **Then** the system refuses identically to a nonexistent document.

---

### User Story 4 - An owner attaches a scan or photo to a document (Priority: P2)

As a vehicle owner, I want to attach a scanned copy or photo of the physical document (insurance
card, registration slip, inspection certificate), so I have the actual paperwork on hand without
digging through a filing cabinet.

**Why this priority**: Real, expected value, but the core record-keeping (Stories 1-3) delivers
value on its own without it — attachments are additive, not load-bearing, exactly as for service
record attachments (specs/007).

**Independent Test**: Upload a valid image to an existing document and confirm it's listed as an
attachment on that document and retrievable only by its owner; separately, confirm a spoofed,
oversized, or disallowed file is rejected before anything is stored, and that a photo's embedded
location data never survives into what's stored or is ever retrievable.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a document they own, **When** they upload a photo or scan
   in an allowed format under the size limit, **Then** it's stored and appears as an attachment on
   that document.
2. **Given** an authenticated user, **When** they attempt to upload a file that isn't actually one
   of the allowed formats — regardless of what the upload claims its type is — **Then** the system
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
   different tenant's document, **Then** the system refuses identically to a nonexistent
   attachment.

### Edge Cases

- What happens if a document's vehicle is later deleted (specs/006)? Its documents (and their
  attachments) are removed along with it — a document has no independent existence apart from the
  vehicle it documents, same as service records (specs/007).
- What happens if an upload is interrupted partway through? No partial or corrupted attachment
  record should be left referencing an object that was never fully, validly stored.
- What happens to an existing attachment when a document is deleted? It's deleted too — see User
  Story 3, Scenario 2.
- What happens if the same file is uploaded twice to the same document? Allowed — each upload
  creates its own distinct attachment; this feature does not attempt to detect or prevent
  duplicate attachment content.
- What happens when a document's expiry date is exactly today? Treated as expired, consistent with
  "not currently valid" being the safer default for paperwork tracking.
- What happens when a document has no expiry date and the user later wants to add one (e.g. a
  provisional registration that later gets a hard expiry)? Supported via the normal update flow
  (User Story 3) — expiry is always editable, in either direction.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user create a document for a vehicle they own,
  requiring at minimum a title and a category.
- **FR-002**: System MUST restrict category to a fixed set of values: registration, insurance,
  warranty, inspection, or other.
- **FR-003**: System MUST let an expiry date and notes be provided at creation or left unset —
  neither is required, and expiry is never estimated or inferred if omitted (constitution
  Principle IV), since some documents never expire.
- **FR-004**: System MUST refuse to create a document for a vehicle that doesn't exist or belongs
  to a different tenant, identically to how it refuses any other cross-tenant access (constitution
  Principle I).
- **FR-005**: System MUST let an authenticated user list every document for a vehicle they own,
  and MUST NOT include another tenant's documents.
- **FR-006**: System MUST let an authenticated user fetch a single document they own by its
  identifier, including its attachments' metadata.
- **FR-007**: System MUST indicate, for each document with a non-null expiry date, whether that
  date is in the past (expired) as of the current date — computed server-side, never left for the
  client to infer from a raw date alone.
- **FR-008**: System MUST let an authenticated user update any editable field on a document they
  own, changing only the fields included in the update, including changing or clearing the expiry
  date.
- **FR-009**: System MUST let an authenticated user delete a document they own, removing its
  attachments (both the stored objects and their metadata) along with it.
- **FR-010**: System MUST refuse to reveal, fetch, update, or delete a document or attachment
  belonging to a different tenant — the refusal MUST be indistinguishable from that resource
  simply not existing.
- **FR-011**: System MUST let an authenticated user upload a photo or scan attachment to a
  document they own.
- **FR-012**: System MUST validate an uploaded file's actual type by inspecting its content (magic
  bytes), not merely trusting the declared content type, and MUST reject any file outside the same
  allowlist of formats used for service/fuel record attachments before storing it.
- **FR-013**: System MUST reject an uploaded file larger than the same size cap used for
  service/fuel record attachments before storing it.
- **FR-014**: System MUST strip EXIF metadata (including any embedded GPS/location data) from an
  uploaded photo before it's stored, using the same stripping behavior as service/fuel record
  attachments — the stripped data MUST NOT be present in, or recoverable from, the stored object.
- **FR-015**: System MUST serve attachment content only through an authenticated,
  ownership-checked route — an attachment's underlying storage location MUST NOT be directly,
  publicly reachable.
- **FR-016**: System MUST NOT create any document or attachment metadata for an upload that fails
  validation (FR-012/FR-013) or storage.
- **FR-017**: System MUST erase a document's attachments (stored objects and metadata) when the
  owning user's account is erased, via the same erasure cascade used for other tenant-owned
  attachments (constitution Principle VIII).

### Key Entities

- **Document**: A single piece of paperwork tracked for one vehicle. Fields: title and category
  (required; category is one of registration, insurance, warranty, inspection, other), expiry date
  (optional, nullable — never inferred if absent), notes (optional). Belongs to exactly one
  vehicle, and transitively to that vehicle's tenant.
- **Attachment**: A photo or scan file associated with exactly one document, stored privately
  (never publicly reachable), with its content-type and size recorded as metadata. A document may
  have zero or more attachments. Structurally the same kind of object as a service/fuel record
  attachment, just associated with a document instead.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can go from "no documents" to "one document visible in their vehicle's
  document list" by submitting only the two required fields.
- **SC-002**: 100% of attempts to view, update, or delete a document or attachment belonging to a
  different tenant are refused, verified by a test that seeds a document/attachment under one
  account and attempts each operation from a different authenticated account.
- **SC-003**: 100% of upload attempts using a disallowed or spoofed file type are rejected before
  anything is stored, verified by a test that mislabels a disallowed file's declared type as an
  allowed one.
- **SC-004**: 100% of oversized upload attempts are rejected before anything is stored.
- **SC-005**: A photo containing embedded GPS/EXIF metadata, once uploaded, has no recoverable
  trace of that metadata in the stored object, verified by inspecting the stored bytes directly.
- **SC-006**: A field left out of an update request never changes, verified the same way
  specs/007's document-equivalent field-preservation guarantee was for service records.
- **SC-007**: A document with a past expiry date is always distinguishable from one with a future
  or absent expiry date without the client having to compare dates itself, verified by a test that
  seeds documents in all three states and inspects the returned expired flag.

## Assumptions

- **Allowed attachment formats and size cap**: Identical to specs/007's service record
  attachments — JPEG, PNG, WebP, and PDF, capped at 10 MB per attachment — reusing the existing
  validated-upload infrastructure rather than defining a second policy.
- **EXIF stripping scope**: Identical to specs/007 — guaranteed for JPEG, not claimed for
  PNG/WebP, consistent with the existing documented boundary.
- **No dedicated "remove one attachment" operation**, matching specs/007's same scope boundary —
  an attachment's lifecycle is tied to its parent document.
- **Expiry reminders are explicitly out of scope** for this feature — GitHub issue #74 (milestone
  M9) is the dedicated follow-up that adds expiry-based email/push reminders on top of this
  entity. This feature only computes and exposes the expired/not-expired flag (FR-007); it sends
  no notifications.
- **No document-type-specific fields** (e.g. policy number, insurer name) in v1 — title, category,
  expiry, notes, and attachments are sufficient to identify and locate the actual paperwork; a
  free-text notes field covers anything more specific a user wants to record for now.
- A vehicle's existing tenant/ownership model (specs/006) governs document ownership — a document
  has no owner of its own distinct from its vehicle's.
