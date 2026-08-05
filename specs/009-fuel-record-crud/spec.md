# Feature Specification: Fuel Record CRUD + Attachments

**Feature Branch**: `009-fuel-record-crud`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Fuel record CRUD + attachments (issue #11, milestone M4): let an
authenticated owner log fuel-up events for their vehicles — the third and final 'record' entity
after vehicles (M2) and service records (M3), following the exact same tenant-scoped CRUD +
R2-attachment shape those established. Core fields per fuel-up: date, odometer reading at
fill-up, volume, total cost, and an optional gas-station name and notes. Optionally attach a
receipt photo, reusing the exact same validated-upload pattern already built for service records.
New behavior beyond a plain CRUD clone: consumption, computed server-side from the odometer delta
since the vehicle's previous fuel-up, division-safe (no data / same-odometer edge cases show 'not
enough data', never a crash or invented number), never stored as its own writable field. Out of
scope: dashboard rollups (M6), reminders (M5), semantic-duplicate detection (issue #12). UI
follows the design system shipped in spec 008."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An owner logs a fuel-up (Priority: P1)

An owner fills their tank and immediately logs the fill-up against the vehicle: the date, the
odometer reading at the pump, how much fuel went in, and what it cost.

**Why this priority**: This is the core write path — without it, nothing else in this feature
(consumption, history, attachments) has any data to work with.

**Independent Test**: Select a vehicle, submit a fuel record with the required fields, and confirm
it appears in that vehicle's fuel history immediately.

**Acceptance Scenarios**:

1. **Given** a signed-in owner viewing one of their vehicles, **When** they submit a fuel record
   with date, odometer reading, volume, and cost, **Then** the record is created and appears in
   that vehicle's fuel history.
2. **Given** the same flow, **When** they also fill in the optional station name and notes,
   **Then** both are stored and returned exactly as submitted.
3. **Given** a fuel record submission missing a required field (date, odometer reading, volume, or
   cost), **When** submitted, **Then** it is rejected and nothing is created.
4. **Given** a fuel record submission for a vehicle belonging to a different tenant, or a
   nonexistent vehicle id, **When** submitted, **Then** it is refused identically in both cases
   (never revealing which case it was).

---

### User Story 2 - An owner reviews fuel history and consumption (Priority: P1)

An owner reviews a vehicle's fuel-up history and sees, for each fill-up after the first, the
computed fuel economy for that tank — how far the vehicle went on the fuel just used, per the
vehicle's own distance unit.

**Why this priority**: Consumption is this feature's whole reason for existing beyond a generic
CRUD form — an owner logging fuel-ups without ever seeing economy figures gets little value over a
paper notebook.

**Independent Test**: Log two fuel-ups for a vehicle with different odometer readings, fetch the
fuel history, and confirm the second record's economy figure reflects the distance and volume
between the two records; log a vehicle's very first fuel record and confirm it shows no economy
figure (not an error, not a zero).

**Acceptance Scenarios**:

1. **Given** a vehicle with two or more fuel records at increasing odometer readings, **When** the
   owner views the fuel history, **Then** every record after the first shows a fuel-economy figure
   computed from the odometer distance since the previous record and the volume added at this
   record.
2. **Given** a vehicle's very first fuel record (no prior record to compare against), **When** the
   owner views it, **Then** it shows a clear "not enough data" state, never a computed number, an
   error, or a blank crash.
3. **Given** two consecutive fuel records logged at the identical odometer reading (e.g. entered
   the same day, or a data-entry mistake), **When** the owner views the later one, **Then** it
   shows the same "not enough data" state rather than a divide-by-zero result or an infinite
   figure.
4. **Given** an owner edits an earlier fuel record's odometer reading after later records already
   exist, **When** they next view the fuel history, **Then** every affected record's economy
   figure is recomputed from the corrected odometer deltas, not left stale.
5. **Given** two tenants each with their own vehicle's fuel history, **When** either fetches fuel
   records, **Then** they only ever see their own vehicle's records.

---

### User Story 3 - An owner corrects or removes a fuel record (Priority: P2)

An owner fixes a typo in a previously logged fuel-up, or deletes one entirely (e.g. a duplicate
entry).

**Why this priority**: Data entry mistakes are inevitable; without correction the record stops
being trustworthy, but this is secondary to being able to log and review fuel-ups at all.

**Independent Test**: Update one field on an existing fuel record and confirm every other field is
unchanged; delete a fuel record and confirm it's gone from the history immediately.

**Acceptance Scenarios**:

1. **Given** an existing fuel record, **When** the owner updates one field, **Then** every other
   field keeps its previous value.
2. **Given** an existing fuel record, **When** the owner deletes it, **Then** it's immediately gone
   from the vehicle's fuel history, and any fuel-economy figures that depended on it as the
   "previous fill-up" are recomputed against the next-earliest remaining record.
3. **Given** a fuel record belonging to a different tenant, **When** an update or delete is
   attempted, **Then** it's refused identically to a made-up id, and the record is left untouched.

---

### User Story 4 - An owner attaches a receipt to a fuel-up (Priority: P2)

An owner photographs the pump receipt and attaches it to the fuel record they just logged, the
same way they can already attach a photo or receipt to a service record.

**Why this priority**: Attachments round out record-keeping value (expense proof, warranty/audit
trail) but the fuel-up data itself (User Stories 1-2) delivers value without it.

**Independent Test**: Upload a valid receipt image to a fuel record and confirm it's listed against
that record; attempt to upload a disallowed file type or an oversized file and confirm it's
rejected with nothing stored; download an uploaded attachment and confirm it comes back
EXIF-stripped where applicable.

**Acceptance Scenarios**:

1. **Given** a fuel record, **When** the owner uploads a valid receipt photo, **Then** it's stored
   and listed against that record.
2. **Given** a fuel record, **When** the owner uploads a file that isn't an allowed image/document
   type (regardless of what its filename or declared type claims), **Then** it's rejected and
   nothing is stored.
3. **Given** a fuel record, **When** the owner uploads a file over the size cap, **Then** it's
   rejected and nothing is stored.
4. **Given** an uploaded photo carrying GPS/location metadata, **When** it's later downloaded back,
   **Then** that metadata is not present in the stored bytes.
5. **Given** a fuel record belonging to a different tenant, **When** an attachment download is
   attempted, **Then** it's refused identically to a made-up attachment id.

### Edge Cases

- A vehicle's fuel records are not necessarily logged in odometer order (an owner might backfill
  an older fill-up after already logging newer ones) — the "previous fill-up" for any given record
  is always the record with the next-lowest odometer reading for that vehicle, not the
  most-recently-created record.
- Deleting a fuel record must clean up its R2 attachment objects the same way service-record and
  vehicle deletion already do — no orphaned R2 objects.
- Deleting a vehicle must also clean up every one of its fuel records' R2 attachments, extending
  the existing vehicle-deletion cleanup path.
- A fuel record's cost or volume of zero (e.g. a free top-up, or a data-entry placeholder) is
  accepted as entered — the system never second-guesses or rejects an owner's honestly-entered
  number, only rejects genuinely missing required fields.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Owners MUST be able to create a fuel record for one of their own vehicles with date,
  odometer reading, volume, and total cost required, and gas-station name and notes optional.
- **FR-002**: The system MUST reject a fuel-record creation missing any required field, creating
  nothing.
- **FR-003**: The system MUST refuse to create, list, fetch, update, or delete a fuel record
  against a vehicle or record that doesn't exist or belongs to a different tenant, indistinguishably
  from either case (never revealing which).
- **FR-004**: Owners MUST be able to list a vehicle's fuel records and fetch a single fuel record's
  full detail, scoped to their own tenant only.
- **FR-005**: Owners MUST be able to update any subset of an existing fuel record's fields, with
  every field not included in the update keeping its previous value.
- **FR-006**: Owners MUST be able to delete a fuel record, and the record MUST be immediately
  unreachable from list/fetch afterward — see FR-012 for the attachment-cleanup guarantee this
  triggers.
- **FR-007**: The system MUST compute each fuel record's fuel economy figure server-side from the
  odometer distance since that vehicle's next-earlier fuel record (by odometer reading, not by
  creation order) and the volume recorded at the later fill-up.
- **FR-008**: The system MUST NOT store the computed fuel-economy figure as a writable field — it
  is derived at read time, so edits or backfills that change what the "previous fill-up" is are
  always reflected without requiring a separate recomputation step.
- **FR-009**: When a fuel record has no earlier record to compare against, or the odometer
  distance since the earlier record is zero, the system MUST return an explicit "not enough data"
  state for that record's fuel economy, never a computed value, an error, or a crash.
- **FR-010**: Owners MUST be able to attach a photo or document to a fuel record, validated the
  same way service-record attachments already are: sniffed file-type allowlist (never trusting a
  declared content type or filename), a size cap, and EXIF/GPS metadata stripped from image
  uploads before storage.
- **FR-011**: Owners MUST be able to download a previously uploaded fuel-record attachment, scoped
  to their own tenant, served directly rather than via a public URL.
- **FR-012**: Deleting a fuel record or the vehicle it belongs to MUST remove every associated
  attachment's stored object — no attachment may outlive the record or vehicle that owned it.
- **FR-013**: Every new or changed piece of user-facing text this feature introduces MUST be
  routed through the existing i18n string infrastructure (constitution Principle IX).
- **FR-014**: This feature's UI MUST use the design system already shipped (spec 008) — the same
  tokens, shell, and component patterns already applied to the sign-in, garage, and service-record
  screens — not the earlier unstyled approach.

### Key Entities

- **Fuel Record**: One fill-up event for one vehicle — date, odometer reading, volume, total cost,
  optional station name, optional notes, timestamps. Belongs to exactly one vehicle and (via the
  vehicle) one tenant. Fuel economy is not a stored attribute of this entity — see FR-007/FR-008.
- **Fuel Record Attachment**: A validated, stored file (photo or document) associated with one
  fuel record — same shape as the existing Service Record Attachment entity (spec 007): id,
  stored-object key, content type, size, created timestamp. The raw storage key is an internal
  detail never returned to the client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can log a complete fuel-up (all required fields) and see it reflected in
  the vehicle's fuel history without a page reload.
- **SC-002**: For any vehicle with two or more fuel records, the computed fuel-economy figure is
  present for every record except the earliest by odometer reading, with zero server errors across
  100% of the tested edge cases (first record, same-odometer records, out-of-order backfilled
  records).
- **SC-003**: Uploading a disallowed or oversized attachment is rejected 100% of the time
  regardless of what content type or filename the client claims, with nothing stored.
- **SC-004**: Deleting a fuel record or a vehicle leaves zero orphaned attachment objects in
  storage, verified directly against the storage layer, not just the user-facing API response.
- **SC-005**: A tenant can never view, modify, or delete another tenant's fuel records or
  attachments, verified across every read and write operation this feature exposes.

## Assumptions

- **Fuel volume unit** is derived from the vehicle's existing odometer unit rather than asked as a
  separate, independently-selectable field: vehicles using kilometers record fuel in liters,
  vehicles using miles record fuel in (US) gallons — the common real-world pairing, and consistent
  with how the vehicle's odometer unit already governs interpretation of distance figures (spec
  006). This can be revisited as its own decision later without a breaking change, since it's
  derived from data already on the vehicle record, not a new field owners must fill in.
- Fuel economy is expressed as the unit pairing implies: L/100km for kilometer-based vehicles,
  MPG for mile-based vehicles — not a user-selectable display format in this feature.
- No fleet-wide or cross-vehicle fuel aggregates (total spend, average economy across vehicles,
  etc.) are in scope — that's milestone M6 (dashboard & aggregates), which this feature's
  server-computed per-record economy figures are designed to feed into later without rework.
- Attachment validation (allowed types, size cap, EXIF stripping) reuses the exact same rules
  already established for service records (spec 007) — no new format support, no different size
  limit, for consistency and to avoid re-litigating an already-settled decision.
- Semantic-duplicate detection (flagging two fuel records that look like the same real-world event
  logged twice) is explicitly out of scope for this feature — it's issue #12's own feature slice,
  per the constitution's D-005 decision and this milestone's own issue split.
