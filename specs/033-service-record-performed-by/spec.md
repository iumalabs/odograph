# Feature Specification: Service Record Performed-By Field

**Feature Branch**: `033-service-record-performed-by`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Service records: add a \"performed by\" field (GitHub issue #105). Add a nullable field to service records distinguishing who performed the work: self (САМ) vs. shop (СЕРВИС), matching docs/odograph-design.zip's \"Кокпит - прототип\" mockup (form toggle at lines 519, 625-634, plus per-row display in the service history list)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record who performed a service (Priority: P1)

When logging a service record, a vehicle owner wants to note whether they did the work themselves
or a shop did it, so their maintenance history reflects reality and they can tell at a glance which
past entries were DIY versus professional work.

**Why this priority**: This is the entire feature — without the ability to set the value, there is
nothing to display and no gap is closed.

**Independent Test**: Can be fully tested by creating a new service record, choosing "self" or
"shop" on the form, saving, and confirming the choice is persisted and shown back on that record.

**Acceptance Scenarios**:

1. **Given** the service record creation form, **When** the user selects "Self" and submits with
   otherwise-valid required fields, **Then** the new record is saved with performed-by set to
   "self".
2. **Given** the service record creation form, **When** the user selects "Shop" and submits,
   **Then** the new record is saved with performed-by set to "shop".
3. **Given** the service record creation form, **When** the user submits without selecting either
   option, **Then** the record is still saved successfully with performed-by left unset (not
   required).

---

### User Story 2 - See who performed past services at a glance (Priority: P1)

When reviewing a vehicle's service history, an owner wants to see at a glance which entries were
self-performed and which were done by a shop, without opening each record individually.

**Why this priority**: Equal priority to User Story 1 — capturing the value has no user-facing
value until it's visible somewhere; both together are the minimum viable slice.

**Independent Test**: Can be fully tested by viewing a vehicle's service history list containing
records with "self", "shop", and unset performed-by values, and confirming each row's indicator
matches its record.

**Acceptance Scenarios**:

1. **Given** a service history list containing a record with performed-by "self", **Then** that
   row visibly indicates "self".
2. **Given** a service history list containing a record with performed-by "shop", **Then** that row
   visibly indicates "shop".
3. **Given** a service history list containing a record with performed-by unset, **Then** that row
   shows no performed-by indicator (not a placeholder implying a value exists).

---

### User Story 3 - Change who performed a service after the fact (Priority: P2)

An owner who logged a record with the wrong performed-by value (or left it unset and now wants to
fill it in) wants to correct it via the existing edit flow.

**Why this priority**: A natural extension of edit capability the record type already has, but
lower priority than create/display since it's a correction path, not the primary flow.

**Independent Test**: Can be fully tested by editing an existing service record's performed-by
value (including clearing it back to unset) and confirming the change persists.

**Acceptance Scenarios**:

1. **Given** an existing service record with performed-by "self", **When** the user edits it to
   "shop" and saves, **Then** the record now shows "shop".
2. **Given** an existing service record with performed-by set, **When** the user edits it to clear
   the value and saves, **Then** the record now shows no performed-by indicator.

---

### Edge Cases

- What happens to service records created before this feature existed? They keep no performed-by
  value (unset) rather than being backfilled with a guess; the display and form both treat "unset"
  as a normal, expected state, not an error.
- What happens if a record is created or edited entirely offline? Performed-by follows the same
  offline-queue create/edit behavior already in place for every other field on this entity — no
  special-casing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service record creation form MUST let the user optionally indicate whether the
  service was performed by themselves ("self") or by a shop ("shop").
- **FR-002**: The service record edit form MUST let the user change an existing record's
  performed-by value, including clearing it back to unset.
- **FR-003**: Submitting a service record create or edit without choosing a performed-by value MUST
  succeed — the field is optional, never required.
- **FR-004**: The service history list MUST display each record's performed-by value ("self" or
  "shop") when set.
- **FR-005**: The service history list MUST NOT display any performed-by indicator for a record
  where the value is unset.
- **FR-006**: Existing service records created before this feature shipped MUST be treated as
  having an unset performed-by value, not an error or a default guess.
- **FR-007**: The performed-by value MUST persist across offline creation/editing the same way
  every other field on a service record already does, with no separate sync path.

### Key Entities

- **Service record** (existing entity, extended): gains one new optional attribute, performed-by,
  with three possible states: "self", "shop", or unset. No new entity is introduced; this is an
  additive attribute on the entity already defined in `specs/007-service-record-crud`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can record whether a service was self-performed or shop-performed as part of
  the same create flow they already use, with no additional required steps for users who don't care
  to set it.
- **SC-002**: Viewing a vehicle's service history, a user can identify which past services were
  self-performed versus shop-performed without opening any individual record.
- **SC-003**: 100% of service records that existed before this feature shipped continue to display
  and edit correctly, with performed-by simply shown as unset.

## Assumptions

- **Only two named values plus unset**: "self" and "shop" are the only two performed-by values,
  matching the mockup's two-way toggle exactly — no third category (e.g., "family member",
  "dealership" vs. "independent shop") is in scope for this feature.
- **Descriptive only, no downstream logic**: performed-by does not influence reminders,
  notifications, cost aggregates, or any other computed behavior — it is a label the user sets and
  sees, nothing more, consistent with the feature description's explicit scope.
- **No backfill**: pre-existing records are not retroactively assigned a value; "unset" is a
  first-class, permanent possibility for any record, not just a transient migration state.
- **Scoped to service records only**: fuel records and (future) documents are explicitly out of
  scope, since the mockup only shows this toggle on the service record form.
