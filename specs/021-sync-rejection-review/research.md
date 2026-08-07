# Phase 0 Research: Sync Rejection Review Screen

No `[NEEDS CLARIFICATION]` markers remained in spec.md — the decisions below were already recorded
as Assumptions there or follow directly from them.

## Decision: Retry reuses the original action id/idempotency key, never a new one

**Decision**: `retryRejected(id)` transitions the existing `PendingAction` back to `"pending"` (and
clears `rejectReason`) without touching its `id`. The next drain attempt sends the same
`Idempotency-Key` header it always would have.

**Rationale**: The action's `id` is both its idempotency key and (for a create) the resource's own
id (spec 020 FR-007). Generating a fresh id on retry would break both properties: a create retried
with a new id could produce a second resource server-side if the original request had actually
reached the server before some other failure lost the response; and it would sever the "same
attempted write" identity the review screen and #20's ledger both rely on. Reusing the id costs
nothing and is strictly safer.

**Alternatives considered**:
- **Generate a new id per retry attempt**: rejected — reintroduces exactly the double-application
  risk idempotency keys exist to prevent, for no benefit.

## Decision: Two small pure-function helpers instead of formatting logic inline in the component

**Decision**: `offline/describe-action.ts` turns a `PendingAction` into a plain-language "what was
attempted" string (entity + action type + a recognizable field from its body, where one exists).
`offline/reject-reason.ts` turns the raw stored `rejectReason` (server response text — sometimes
JSON like `{"error":"invalid_request"}`, sometimes plain text like Hono's default `"404 Not Found"`)
into a friendlier string, falling back to the raw text when it doesn't recognize the shape.

**Rationale**: Every existing entity/action-type combination (vehicle create; service/fuel record
create/update/delete/dismiss-duplicate; reminder create/delete/mark-done) needs its own "what did
this even mean" phrasing — keeping that mapping in one small, focused, independently-reasoned-about
file is clearer than branching inline inside `SyncReviewScreen.tsx`'s JSX, and matches this
project's existing pattern of small single-purpose modules under `offline/` (`merge.ts`, `db.ts`,
`network-status.ts`).

**Alternatives considered**:
- **Store a human-readable summary on the `PendingAction` at enqueue time**: rejected — would
  require every one of the ~11 call sites that already call `enqueue()` (spec 020) to also compute
  and pass a summary string, whereas deriving it at display time from the same `entity`/`actionType`/
  `body` fields already stored needs no changes to `enqueue()` or any of its callers at all.
- **Show the raw JSON/text reason verbatim with no formatting**: rejected as the *only* treatment —
  `"404 Not Found"` or a bare `{"error":"invalid_request"}` is honest but not what FR-002 asks for
  ("why the server rejected it," in terms a user can act on); friendlier text is used when the shape
  is recognized, with the raw text as an honest fallback rather than inventing an explanation for an
  unrecognized shape.

## Decision: One global review screen, reached via a new nav-rail entry

**Decision**: A new `AppView` value (`"review"`) with its own nav-rail icon/button in `AppShell.tsx`,
consistent with how `"garage"`/`"dashboard"` already work — not a modal, not scoped under the
currently selected vehicle.

**Rationale**: FR-001 requires seeing rejections across every vehicle at once, which rules out
anything scoped to `selectedVehicleId`. FR-008 requires reachability "from anywhere... in at most a
couple of actions" — the nav rail is already the app's one persistent, always-visible navigation
surface (present on every signed-in screen via `AppShell`), so adding a third entry there is the
smallest change that satisfies both requirements at once, and requires no new routing/modal
machinery.

**Alternatives considered**:
- **A modal/popover triggered from `SyncStatusIndicator`**: rejected — `SyncStatusIndicator` is
  currently rendered inline in the top status bar (spec 020), a cramped context for a scrollable
  list with per-item actions; a full nav-rail screen reuses the same layout every other content
  screen already gets (scrollable `<main>`, consistent header) for free. `SyncStatusIndicator`'s
  rejected badge still becomes clickable, navigating to the "review" view rather than opening
  a popover in place.

## Decision: No new `deno task test` coverage

**Decision**: This feature adds no automated test coverage; correctness rests on #20's existing
`tests/server/idempotency.test.ts` (which already proves retry-safety generically, not specific to
this feature) plus live verification per quickstart.md.

**Rationale**: There is no new server behavior to test — `retryRejected()` and `discardRejected()`
are pure client-side state transitions over the same `PendingAction` store #20 already persists and
already replays through the same, already-tested `fetch`/idempotency path. Same precedent as every
other client-only piece of specs/018-020.
