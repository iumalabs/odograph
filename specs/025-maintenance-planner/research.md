# Phase 0 Research: Maintenance Planner

## Decision: `PATCH` accepts any of the four stage values, server doesn't enforce single-step order

**Decision**: `PATCH /api/v1/plan-cards/:id` accepts a `stage` field set to any of `idea`/`buy`/
`doing`/`done`, validated only against that fixed set — not against "is this the next stage after
the card's current one."

**Rationale**: The design mockup's own interaction model (docs/odograph-design.zip's "Кокпит"
prototype) only ever advances a card one stage forward via a single click, but nothing in the
issue or spec.md requires the *server* to enforce that ordering — spec.md's own Assumptions
section settles this explicitly. Accepting any valid stage keeps the API surface identical to
every other PATCH-based partial-update route in this codebase (`updateDocument`, `updateVehicle`,
etc.) and doesn't preclude a future "move card backward" UI affordance without a backend change.
The client is still responsible for only ever presenting a forward-advance control — the backend's
looser validation doesn't imply looser client UX.

**Alternatives considered**:
- *A dedicated `POST /:id/advance` endpoint, sequence-enforced server-side*: Rejected — adds a
  second write shape for stage changes (on top of the general PATCH), more API surface for no
  requirement asking for the extra strictness, and would need its own offline-queue action type
  where the existing generic "update" one already suffices.

## Decision: Done-transition's service-record creation lives inside `updatePlanCard`, not a route

**Decision**: The check "did `stage` change to `"done"` from something else" and the resulting
call to the existing `createServiceRecord` both live inside the repository-layer `updatePlanCard`
function — the route handler for `PATCH /api/v1/plan-cards/:id` stays a thin, generic partial
update, identical in shape to every other entity's PATCH handler.

**Rationale**: Keeping this in the repository layer means the exact same logic applies whether the
PATCH arrives from the live-online path or is replayed later by the offline queue's sync — the
route handler never needs to know this side effect exists at all, and there's only one place
(`updatePlanCard`) where "did this write just complete a card" is decided, rather than duplicating
that check in both the route and (hypothetically) a queue-replay-specific code path. This mirrors
how `deleteServiceRecord` (specs/007) already decides its own R2-cleanup-key-collection logic
inside the repository layer rather than the route.

**Alternatives considered**:
- *Route-layer side effect (route handler calls `createServiceRecord` itself after a successful
  `updatePlanCard`)*: Rejected — splits "what does completing a card do" across two files for no
  benefit, and the route handler would need extra logic to detect the specific transition (old
  stage vs. new stage) that the repository layer already has to compute for the `UPDATE` itself.

## Decision: Card stage-write conflict resolution — last write wins, exactly like every other field

**Decision**: No special conflict handling for concurrent/offline-queued stage changes beyond what
`updatePlanCard`'s normal partial-update semantics already provide — the queue's existing
per-vehicle ordering guarantee (specs/020) is what keeps a rapid idea→buy→doing→done sequence
made offline applying in the right order once synced; there's no separate "state machine" enforced
at the sync layer.

**Rationale**: specs/020's ordering guarantee already solves the only correctness risk here (two
queued writes for the same card applying out of order) — a third, card-specific ordering mechanism
would be redundant. The done-transition check ("old stage ≠ done, new stage = done") is naturally
idempotent already: replaying the *same* transition twice (e.g. a retried sync) is guarded by
FR-008 (no second service record for an already-done card), and two different cards' transitions
are independent regardless of interleaving (spec.md's own Edge Cases section covers this).

**Alternatives considered**:
- *A separate `advance` idempotency mechanism beyond specs/020's existing `Idempotency-Key`
  header*: Rejected — the existing mechanism (already applied via the `idempotent` middleware,
  same as every other write route) already covers "this exact write was already applied, don't
  redo it."

## Decision: New offline-queue entity (`"planCard"`), not a queue-bypass like documents

**Decision**: Add `"planCard"` to `PendingActionEntity` (`src/client/offline/types.ts`) and a new
`mergePlanCards` function (`merge.ts`), following the exact `mergeServiceRecords` shape — rather
than following documents' (specs/023) choice to bypass the queue with plain `fetch()`.

**Rationale**: The issue's own text is explicit and unambiguous here — "Card-stage changes are a
write like any other and should route through the existing offline-queue pattern... for
consistency with the rest of the app's offline support" — unlike documents' spec.md, which
explicitly scoped offline sync *out*. This is the deciding factual difference between the two
features' otherwise-similar CRUD shape, not an inconsistency to reconcile.

**Alternatives considered**:
- *Bypass the queue like documents did*: Rejected — directly contradicts the issue's explicit
  requirement, and a planner meant for offline use in a garage (a classically poor-connectivity
  environment) benefits from offline support more than most entities in this app, not less.

## Decision: No plan-card attachments in v1

**Decision**: A plan card has no attachment upload route — matching specs/023's Assumptions
reasoning for a different entity, applied here for the same underlying reason.

**Rationale**: The design mockup shows no attachment affordance on a kanban card, and once a card
completes it converts into a real `service_records` row, which already supports attachments
(specs/007) — a user who wants to attach a receipt to the finished work can do so on the resulting
service record, without this feature needing to duplicate that upload pipeline for a
pre-completion planning artifact.

**Alternatives considered**:
- *Allow attaching a reference photo to a card (e.g. a photo of the part needed)*: Rejected as
  out of scope — not requested by the issue, not shown in the mockup, and easy to add later
  without a breaking change if a real need emerges.
