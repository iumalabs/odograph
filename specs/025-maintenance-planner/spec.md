# Feature Specification: Maintenance Planner — Kanban Board

**Feature Branch**: `025-maintenance-planner`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Maintenance planner — kanban board (idea → buy → doing → done)
(GitHub issue #75, milestone M10). A lightweight per-vehicle kanban board for planning upcoming
maintenance work before it's actually done, matching the design prototype's exact 4 stages: idea,
buy, doing, done. A card has a title (required), and optionally a target date, an estimated cost,
and an urgent flag. Completing a card (transitioning it into the 'done' stage) creates a real
service record — the planner is a staging area for the log, not a separate record type: the
created service record's description is the card's title, its date is today, its odometer reading
is the vehicle's current known odometer if any (never fabricated), its cost is the card's
estimated cost if provided, and its notes indicate it was created from the planner. Re-entering
'done' on an already-done card must not create a duplicate service record. Card-stage changes are
a write like any other and MUST route through the existing offline-queue pattern
(specs/020-offline-write-queue) for consistency with the rest of the app's offline support. Cards
can also be deleted outright. No drag-and-drop — the client presents forward-only stage-advance
controls, but the API accepts any of the four valid stage values via a normal PATCH."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner captures a maintenance idea for later (Priority: P1)

As a vehicle owner, I want to jot down a maintenance idea (e.g. "new brake pads") before I'm ready
to act on it, so nothing gets forgotten between "I should do this" and actually doing it.

**Why this priority**: This is the entry point for everything else the planner does — without the
ability to capture an idea, there's no board to advance cards through.

**Independent Test**: Starting from a vehicle with an empty board, add a card with just a title
and confirm it appears in the "idea" column with exactly the submitted values.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a vehicle they own, **When** they add a card with only a
   title (the one required field), **Then** it's created in the "idea" stage and appears on that
   vehicle's board.
2. **Given** the same flow, **When** they also provide a target date, an estimated cost, and/or
   mark it urgent, **Then** all provided values are stored and returned exactly as submitted.
3. **Given** an authenticated user, **When** they submit a card without a title, **Then** the
   system rejects the submission and creates nothing.
4. **Given** an authenticated user, **When** they attempt to add a card to a vehicle that doesn't
   exist or belongs to a different tenant, **Then** the system refuses identically to a
   nonexistent vehicle.

---

### User Story 2 - An owner moves a card through the board's stages (Priority: P1)

As a vehicle owner, I want to move a card from "idea" to "buy" to "doing" as I make progress on
it, so the board reflects where each piece of planned work actually stands.

**Why this priority**: Equal priority to creation — a board where cards can never move is a static
list, not a planning tool.

**Independent Test**: Create a card, advance it through each of the three non-final stages in
turn, and confirm its stage updates correctly at each step and it appears in the matching column.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a card they own, **When** they move it to any of the four
   valid stages, **Then** the card's stage updates and it appears in the matching column.
2. **Given** an authenticated user, **When** they attempt to set a card's stage to something other
   than the four valid stages, **Then** the system rejects the change and the card's stage stays
   unchanged.
3. **Given** an authenticated user, **When** they attempt to move a card belonging to a different
   tenant, **Then** the system refuses identically to a nonexistent card.

---

### User Story 3 - Completing a card logs a real maintenance record (Priority: P1)

As a vehicle owner, when I finish the maintenance work a card represents, I want moving it to
"done" to actually add it to my vehicle's maintenance history — so I never have to separately
re-enter the same work into the service log.

**Why this priority**: This is the entire point of the planner over a plain to-do list — it closes
the loop into the vehicle's real maintenance record without double entry.

**Independent Test**: Create a card with a title and an estimated cost, move it to "done," and
confirm a new service record appears in the vehicle's service history with that title as its
description, today's date, and that cost — then move the same already-done card to "done" again
and confirm no second service record is created.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a card in any non-"done" stage, **When** they move it to
   "done," **Then** a new service record is created for that vehicle with the card's title as its
   description, today's date, and the card's estimated cost if one was provided.
2. **Given** the same flow, **When** the vehicle's current odometer reading is known from its
   existing fuel/service history, **Then** the created service record includes that reading; when
   it isn't known, the record's odometer reading is left unset, never guessed.
3. **Given** a card already in the "done" stage, **When** it's moved to "done" again, **Then** no
   additional service record is created.
4. **Given** an authenticated user, **When** a card moves to "done," **Then** the card itself
   remains visible on the board in the "done" column — completing it doesn't remove it.

---

### User Story 4 - An owner removes a card that's no longer relevant (Priority: P2)

As a vehicle owner, I want to delete a card outright — an idea I decided against, or a duplicate —
so my board only shows work I actually intend to track.

**Why this priority**: Real value, but the board is still usable without it (an abandoned idea can
just sit in its column) — lower priority than the flows that make the board exist and actually
close the loop into the service log.

**Independent Test**: Create a card and delete it; confirm it no longer appears on the board and
that deleting it never creates or touches any service record.

**Acceptance Scenarios**:

1. **Given** an authenticated user with a card they own, **When** they delete it, **Then** it no
   longer appears on the vehicle's board.
2. **Given** an authenticated user, **When** they attempt to delete a card belonging to a
   different tenant, **Then** the system refuses identically to a nonexistent card.

### Edge Cases

- What happens if a card's vehicle is later deleted (specs/006)? Its cards are removed along with
  it — a card has no independent existence apart from the vehicle it's planning work for, same as
  every other vehicle-scoped entity in this system.
- What happens while offline? Card creation, stage moves, and deletion all queue through the
  existing offline write queue (specs/020) exactly like service/fuel record and reminder-rule
  writes — including the same ordering guarantee (a vehicle's queued card writes apply in the
  order they were made) and the same rejection-review flow if a queued write is later refused.
- What happens if a card is deleted while queued offline before it ever reached the server? Same
  as every other entity's offline-queue edge case (specs/020) — it never appears at all once both
  actions sync.
- What happens if two different cards for the same vehicle are both moved to "done" while offline,
  in a specific order, before either syncs? Each applies in the order it was queued (specs/020's
  ordering guarantee), so two separate service records are created, each reflecting its own card's
  title/cost — no cross-contamination between them.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user create a card for a vehicle they own,
  requiring at minimum a title, and MUST place a newly created card in the "idea" stage.
- **FR-002**: System MUST let a target date, an estimated cost, and an urgent flag be provided at
  creation or left unset — none of the three is required, and none is ever inferred if omitted
  (constitution Principle IV).
- **FR-003**: System MUST refuse to create a card for a vehicle that doesn't exist or belongs to a
  different tenant, identically to how it refuses any other cross-tenant access (constitution
  Principle I).
- **FR-004**: System MUST let an authenticated user list every card for a vehicle they own, and
  MUST NOT include another tenant's cards.
- **FR-005**: System MUST let an authenticated user change a card's stage to any of the four valid
  values (idea, buy, doing, done) and MUST reject any other value, leaving the card's current
  stage unchanged.
- **FR-006**: System MUST let an authenticated user update a card's title, target date, estimated
  cost, and urgent flag, changing only the fields included in the update.
- **FR-007**: System MUST, when a card's stage changes to "done" from a different stage, create a
  new service record for that card's vehicle: description set to the card's title, service date
  set to today, odometer reading set to the vehicle's current known odometer reading if any (never
  fabricated if unknown, constitution Principle IV), and cost set to the card's estimated cost if
  provided.
- **FR-008**: System MUST NOT create an additional service record when a card that is already in
  the "done" stage is set to "done" again.
- **FR-009**: System MUST let an authenticated user delete a card they own, and MUST NOT create,
  modify, or delete any service record as a side effect of that deletion.
- **FR-010**: System MUST refuse to reveal, update, or delete a card belonging to a different
  tenant — the refusal MUST be indistinguishable from that resource simply not existing.
- **FR-011**: Every card write (create, stage/field update, delete) MUST route through the same
  offline write queue every other queued entity in this system uses, including the same
  client-generated idempotency key and per-vehicle ordering guarantees (constitution Principle
  III).

### Key Entities

- **Maintenance plan card**: A single planned piece of maintenance work for one vehicle, staged
  through idea → buy → doing → done. Fields: title (required), stage (one of the four values,
  defaults to "idea" on creation), target date, estimated cost, and an urgent flag (all optional,
  never inferred if absent). Belongs to exactly one vehicle, and transitively to that vehicle's
  tenant. Has no independent existence apart from the vehicle it plans work for.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can go from "no plan" to "one idea captured on the board" by submitting
  only a title.
- **SC-002**: 100% of attempts to view, update, or delete a card belonging to a different tenant
  are refused, verified by a test that seeds a card under one account and attempts each operation
  from a different authenticated account.
- **SC-003**: Moving a card to "done" produces exactly one new service record reflecting that
  card's title, date, cost, and known odometer reading — verified end to end for both a card with
  a known vehicle odometer and one without.
- **SC-004**: Moving an already-"done" card to "done" again never produces a second service
  record, verified by repeating the transition and counting service records before and after.
- **SC-005**: A card write made while offline is never lost and applies in the same order it was
  made once connectivity returns, verified the same way specs/020's existing ordering guarantee
  was for service/fuel records.

## Assumptions

- **No drag-and-drop, and no enforced single-step transitions server-side**: the design mockup
  shows a click-to-advance-one-stage interaction, which this feature's client presents, but the
  API itself accepts any of the four valid stage values on an update — simpler API surface, and it
  doesn't preclude a future "move card backward" affordance without a backend change. Documented
  here since the mockup's own interaction model is narrower than what the API allows.
- **No card-level attachments**: unlike service/fuel records and documents, a plan card has no
  photo/receipt attachment in v1 — the mockup doesn't show one, and a card converts into a real
  service record (which already supports attachments) once the work is actually done.
- **No duplicate-detection (D-005) for cards**: a card is a planning intent, not a record of a
  real-world event that could legitimately arrive twice — the same reasoning specs/023 already
  documented for excluding documents from D-005.
- **A vehicle's existing tenant/ownership model** (specs/006) governs card ownership — a card has
  no owner of its own distinct from its vehicle's.
