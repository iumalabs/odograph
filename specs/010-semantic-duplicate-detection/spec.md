# Feature Specification: Semantic Duplicate Detection & Resolution

**Feature Branch**: `010-semantic-duplicate-detection`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Semantic duplicate detection & resolution UI (issue #12, milestone
M4): detect when the same real-world fuel-up or service event has been logged twice as separate
records (service or fuel records), per constitution D-005 — soft-flag it, store both records,
exclude the flagged entry from computed figures (the fuel-economy calculation, currently the only
computed figure in the product) until the owner resolves it, and never silently merge or drop
either record. Provide a resolution UI: the owner can dismiss the flag (confirming both records
are real, distinct events) or delete one of the two (using the existing delete operation)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An owner is warned when they log what looks like the same event twice (Priority: P1)

An owner accidentally submits the same fuel-up or service visit twice — e.g. a page reload during
a flaky connection resubmits the form, or they genuinely re-enter it a few minutes later thinking
the first attempt failed. Instead of silently ending up with two entries that both look legitimate
forever, the newer entry is visibly marked as a likely duplicate of the earlier one.

**Why this priority**: This is the detection itself — without it, nothing else in this feature
(exclusion from figures, resolution) has anything to act on.

**Independent Test**: Log a fuel-up, then log a second fuel-up for the same vehicle with a
matching date and a near-identical odometer reading; confirm the second record is flagged as a
possible duplicate of the first, and that logging a third, clearly different fuel-up is not
flagged.

**Acceptance Scenarios**:

1. **Given** a vehicle with an existing fuel record, **When** the owner logs a new fuel record for
   the same vehicle with the same date and an odometer reading within the matching tolerance,
   **Then** the new record is flagged as a possible duplicate of the existing one, and both
   records remain fully present and independently viewable.
2. **Given** a vehicle with an existing service record, **When** the owner logs a new service
   record for the same vehicle with the same date and the same description, **Then** the new
   record is flagged as a possible duplicate of the existing one.
3. **Given** a vehicle with an existing record, **When** the owner logs a new record for the same
   vehicle that differs meaningfully in date, odometer reading (fuel), or description (service),
   **Then** it is created normally, not flagged.
4. **Given** two different tenants who each independently log matching-looking records for their
   own, unrelated vehicles, **When** either logs their record, **Then** detection never compares
   across tenants — only a tenant's own vehicle's own prior records are ever considered.

---

### User Story 2 - A flagged record doesn't corrupt fuel-economy figures (Priority: P1)

An owner has a flagged, still-unresolved duplicate fuel record in their history. The fuel-economy
figures shown for their *other*, legitimate fuel-ups aren't thrown off by the duplicate sitting
between them in the odometer sequence.

**Why this priority**: Without this, a single duplicate silently corrupts the one computed figure
the product already has (spec 009's fuel economy) — the exact harm D-005 exists to prevent, so
this is as load-bearing as detection itself.

**Independent Test**: Log three fuel-ups where the second is a near-duplicate of the first;
confirm the third record's fuel-economy figure is computed from the *first* record's odometer
reading, not the flagged second one, and that the flagged record itself shows a "flagged, not
computed" state rather than a number.

**Acceptance Scenarios**:

1. **Given** a vehicle with fuel records A, B (a flagged duplicate of A), and C at increasing
   odometer readings, **When** the owner views C, **Then** C's fuel-economy figure is computed
   from A's odometer reading (skipping the flagged B), not from B's.
2. **Given** a flagged fuel record, **When** the owner views it, **Then** it shows a distinct
   "flagged as a possible duplicate" state for its own fuel-economy figure — visibly different
   from the existing "not enough data" state (spec 009), since these are different situations (one
   is a data quality warning, the other is a normal absence of a prior record).

---

### User Story 3 - An owner resolves a flagged duplicate (Priority: P1)

An owner reviews a flagged record and decides what actually happened: either it genuinely is a
duplicate (they delete the redundant one), or it's a coincidence — two real, distinct events that
happen to look similar (they dismiss the flag and keep both).

**Why this priority**: Detection without resolution leaves permanent warning clutter and never
restores the record to normal (included-in-figures) status — this is what makes the feature
actually useful rather than just a one-way alarm.

**Independent Test**: Flag a duplicate, dismiss it, and confirm the record is now treated as
normal (included in fuel-economy calculations, no longer shown as flagged); separately, flag
another duplicate and delete one of the two records, confirming the remaining one is unflagged and
normal.

**Acceptance Scenarios**:

1. **Given** a flagged record, **When** the owner dismisses the flag, **Then** the record is no
   longer shown as flagged, and (for fuel records) is included in fuel-economy calculations from
   that point on, exactly like any other record.
2. **Given** a flagged record and the earlier record it was flagged against, **When** the owner
   deletes either one of the two, **Then** the remaining record is no longer flagged (there's
   nothing left to be a duplicate of) and behaves normally.
3. **Given** a flagged record belonging to a different tenant, **When** a dismiss or delete is
   attempted, **Then** it's refused identically to the existing not-found-or-not-yours contract
   every other write operation in this product already has.

### Edge Cases

- A record can be flagged as a duplicate of at most one other record — if a third near-identical
  record is logged after two already exist (one flagged, one not), it's compared only against
  unflagged records, so it's flagged against the original, not the already-flagged one (avoiding
  chains of duplicates-of-duplicates).
- Editing a record's fields after creation does not retroactively trigger duplicate detection —
  detection runs once, at creation ("arrives" per D-005), not on every subsequent edit; an edit
  that happens to make two existing records look alike is not flagged after the fact.
- Dismissing a flag is honest, not destructive: the system doesn't need to be *certain* two
  records are duplicates before flagging, only reasonably confident — an owner dismissing a flag
  because it's a false positive is an expected, normal outcome, not an error condition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a new fuel record is created, the system MUST compare it against that
  vehicle's existing, unflagged fuel records and flag it as a possible duplicate of the closest
  match if the date matches and the odometer reading falls within the matching tolerance
  (research.md).
- **FR-002**: When a new service record is created, the system MUST compare it against that
  vehicle's existing, unflagged service records and flag it as a possible duplicate of the closest
  match if the date and description both match exactly (case-insensitive).
- **FR-003**: Duplicate detection MUST only compare records belonging to the same vehicle within
  the same tenant — never across vehicles or across tenants.
- **FR-004**: The system MUST NOT merge or silently drop either record when a duplicate is
  detected — both records remain fully stored and independently retrievable (D-005).
- **FR-005**: A flagged fuel record MUST be excluded from the fuel-economy calculation (spec
  009) — it MUST NOT be used as another record's "previous fill-up" reference point, and it MUST
  NOT itself receive a computed economy figure while flagged.
- **FR-006**: Owners MUST be able to dismiss a flag on their own record, after which the record is
  treated as normal (included in fuel-economy calculations, no longer shown as flagged).
- **FR-007**: Deleting either record in a flagged pair MUST clear the flag on the remaining record
  (there is nothing left for it to be a duplicate of).
- **FR-008**: The system MUST refuse to dismiss a flag on a record that doesn't exist or belongs
  to a different tenant, identically to the existing not-found-or-not-yours contract other write
  operations already have.
- **FR-009**: A record's flagged state MUST be visible wherever that record is shown in the UI,
  distinguishable from both the normal and "not enough data" states.
- **FR-010**: Every new or changed piece of user-facing text this feature introduces MUST be
  routed through the existing i18n string infrastructure (constitution Principle IX).

### Key Entities

- **Duplicate flag**: A relationship from a fuel or service record to the earlier record it was
  flagged against at creation time — not a new top-level entity, but an added attribute on the
  existing `FuelRecord`/`ServiceRecord` entities (spec 007/009): which earlier record (if any) it
  was flagged as a possible duplicate of, and whether that flag has since been dismissed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Logging a near-identical fuel-up or service record for the same vehicle results in a
  visible duplicate flag 100% of the time the matching criteria are met, and 0% of the time a
  meaningfully different record is logged.
- **SC-002**: A vehicle's fuel-economy figures for its unflagged records are unaffected by the
  presence of a flagged duplicate anywhere in its history — verified by comparing the same
  vehicle's figures with and without a flagged record present.
- **SC-003**: An owner can resolve a flagged duplicate (dismiss or delete) in one action, after
  which the record's flagged state is gone with zero lingering effect on other records' figures.
- **SC-004**: Duplicate detection and resolution never cross tenant boundaries, verified across
  every operation this feature exposes.

## Assumptions

- **Detection runs at creation time only**, not on every edit — matching D-005's "arrives"
  framing and avoiding the complexity of re-scanning a vehicle's whole history on every unrelated
  field edit. An edit that happens to make two records look alike after the fact is not
  retroactively flagged; this is a reasonable v1 narrowing, not a loophole an owner is likely to
  exploit against themselves.
- **Resolution has exactly two actions — dismiss or delete** — no merge operation. D-005
  explicitly forbids auto-merging; a manual "combine these two records' data" feature is
  meaningfully more complex (which fields win?) and not requested by the issue or the milestone
  description, so it's out of scope. An owner who wants "one correct record" achieves it by
  deleting the wrong one and, if needed, editing the one they keep.
- **Matching tolerance for fuel records** (exact date match, odometer reading within a small
  tolerance) is a heuristic, not a certainty — the feature is explicitly designed around
  soft-flagging exactly because false positives are expected and cheap to dismiss (Edge Cases).
  Exact tolerance values are a research.md decision, not a product requirement needing sign-off.
- **No aggregate/dashboard exclusion beyond fuel economy** — spec.md's "excludes flagged entries
  from aggregates" (D-005) currently has exactly one computed figure to apply to (fuel economy,
  spec 009); no dashboard or fleet-wide aggregate exists yet (M6), so there's nothing else to
  exclude flagged records from today. This feature's design (a flag attribute readable by any
  future aggregate) doesn't block M6 from applying the same exclusion rule later.
- **Offline/client-UUID-based idempotency is a separate concern**, out of scope here — constitution
  Principle III's client-generated-UUID idempotency key (for the offline write queue, M7) dedupes
  *exact resubmissions of the same write*; this feature detects *two distinct writes that describe
  the same real-world event*, a different problem that exists independently of whether offline
  sync ships. Building this now doesn't block M7, and M7's idempotency layer doesn't make this
  feature redundant.
