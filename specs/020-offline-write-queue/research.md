# Phase 0 Research: Offline Write Queue

No `[NEEDS CLARIFICATION]` markers remained in spec.md — the decisions below were already recorded
as Assumptions there or follow directly from them. This file works out the mechanism each one
implies and the alternatives considered.

## Decision: One global FIFO queue, single-flight drain — not per-vehicle queues or a reordering server

**Decision**: The client maintains one IndexedDB-backed queue across all vehicles/entities, and
drains it with exactly one request in flight at a time, in insertion order.

**Rationale**: Constitution Principle III requires per-vehicle creation order. A single, strictly
ordered total queue trivially satisfies that — any subsequence of a correctly-ordered total order is
itself correctly ordered, so there's no need to key, group, or reorder by vehicle at all. The
alternative (per-vehicle sub-queues drained in parallel) would need its own cross-vehicle
coordination for shared resources (e.g. a reminder tied to a vehicle that's also being edited) for
no benefit, since Cloudflare Queues (the natural place to push that complexity) are explicitly
forbidden by the constitution's technology-stack section. Single-flight also sidesteps a distributed-
ordering problem entirely: ordering is a byproduct of "only one thing happens at a time," not
something the server has to reconstruct from timestamps or sequence numbers it can't fully trust.

**Alternatives considered**:
- **Per-vehicle queues, parallel drain**: rejected — more moving parts, no requirement asks for
  cross-vehicle parallelism, and it reintroduces exactly the kind of ordering coordination the
  constitution steers away from (no Queues) for zero user-visible benefit.
- **Server-side sequence numbers + reordering buffer**: rejected — would require the server to hold
  and reorder out-of-order arrivals, which is real distributed-systems complexity this project has no
  other need for; single-flight drain gets the same guarantee for free.

## Decision: The queued action's UUID doubles as the idempotency key and, for creates, the resource id

**Decision**: One client-generated UUID per queued action. For a create action, that UUID becomes
the new record's `id` (sent in the request body, honored by the server instead of server-generating
one). For edit/delete/dismiss-duplicate/mark-done, the same UUID is sent as the `Idempotency-Key`
header only — there's no new resource id to assign, the action targets an existing one.

**Rationale**: This directly satisfies both FR-006 (idempotency key) and FR-007 (a record created
offline needs a stable identity before it ever syncs, so a subsequent offline edit/delete of that
same not-yet-synced record can still be queued correctly) with a single generated value instead of
two. Today's create endpoints generate `crypto.randomUUID()` server-side and silently ignore any
client-supplied `id` (`repository.ts:277,952,1327,1870` — confirmed via the codebase inventory this
plan is based on); this feature changes that to *honor* a client-supplied `id` when present, falling
back to server-generation when absent — fully backward compatible with any caller (including
existing API-token integrations) that doesn't send one.

**Alternatives considered**:
- **Separate idempotency key and resource id**: rejected — two generated values instead of one, no
  benefit; the resource id already uniquely identifies the create, so it can serve as its own
  idempotency key without ambiguity.
- **Let the server keep generating ids, have the client wait for the create to sync before allowing
  further edits to it**: rejected — this is exactly the edge case spec.md documents under "edits a
  record moments after creating it offline"; blocking further offline edits on an unsynced create
  would be a visible, confusing restriction the constitution's ordering guarantee (FR-005) already
  makes unnecessary (a same-vehicle edit queued after its create always applies after it).

## Decision: Server-side idempotency via a shared `write_operations` ledger table + opt-in middleware

**Decision**: One new table, `write_operations` (`tenant_id`, `idempotency_key`, `method`, `path`,
`status_code`, `response_body`, `created_at`), primary-keyed on `(tenant_id, idempotency_key)`. A
Hono middleware checks for an `Idempotency-Key` request header: if a matching row already exists for
this tenant, it short-circuits and returns the *stored* response verbatim, without re-running the
route handler at all; otherwise it lets the handler run, then persists the handler's actual response
before returning it.

**Rationale**: Short-circuiting *before* the handler runs (rather than deduping at the D1 `INSERT`
level) is required because some of these handlers have side effects beyond a single row insert —
specs/010's duplicate-detection classification, for one, runs inside the same atomic
`db.batch([INSERT, UPDATE ... RETURNING])` a create performs (`repository.ts:892-937` for service
records, `:1263-1318` for fuel records). Re-running that logic on a replay could theoretically
produce a different classification than the original attempt if other records changed in between,
which would make a "replay" observably different from the original — precisely what an idempotency
key exists to prevent. Storing and replaying the exact original response sidesteps that entirely: a
replay is byte-identical to what the client already would have received, no matter what else
happened to the tenant's data since.

**Alternatives considered**:
- **A dedup column on every mutable table**: rejected — would need one on `vehicles`,
  `service_records`, `fuel_records`, `reminder_rules`, and wouldn't help at all for delete
  (there's no row left to hold it) or dismiss-duplicate (mutates a row that already exists for other
  reasons); a single shared ledger table handles every action type uniformly.
- **Re-run the handler and rely on natural idempotency of each operation** (e.g. a delete of an
  already-deleted row just 404s again): rejected — a delete replaying onto an already-deleted row
  would return the *same* 404 both times, which happens to look fine, but a replayed create is not
  naturally idempotent (would either violate a uniqueness constraint or, worse, silently create a
  second record) — the ledger approach handles every action type with one mechanism instead of
  reasoning about each one's accidental idempotency separately.
- **Making the `Idempotency-Key` header mandatory on these routes**: rejected — would break the
  existing API-token integration path (specs/017) for callers that don't know about this project's
  offline queue at all; kept optional so only this project's own web client (which always sends it)
  opts into the new behavior. Constitution Principle VI (hardened API tokens) is unaffected either
  way, since idempotency is additive, not a new requirement on token holders.

## Decision: Drain-loop response handling — three failure classes, not one

**Decision**: The drain loop treats a queued action's HTTP outcome as one of four cases:
1. **2xx** → mark synced, remove from the queue, advance to the next action.
2. **401** → pause the entire queue (don't advance, don't mark this or any later action rejected);
   surface a "sign in again to sync" state (FR-011); resume automatically once re-authenticated.
3. **429 or a network-level failure (fetch throws, no connectivity)** → don't advance; wait (for 429,
   the response's `Retry-After` header value; for network failure, wait for the browser's `online`
   event) and retry the *same* action. Never surfaced to the user as a rejection (FR-010).
4. **Any other 4xx** (400 validation failure, 404 — e.g. the target record was deleted from another
   device in the meantime) → mark *that* action rejected with the response body as the reason,
   remove it from the active drain position, and continue draining the *next* action. The rest of
   the backlog is not blocked by one rejection (SC-003's "even when some are rejected").

**Rationale**: Constitution Principle III and spec.md's FR-009/FR-010 explicitly require
distinguishing "needs the user's attention" from "will resolve on its own" — collapsing all
non-2xx responses into one bucket would either spam the user with false alarms (for 429/network
blips that are about to resolve) or hide genuine rejections inside a wall of transient noise. 401 is
its own case because retrying it changes nothing (the session is dead until the user re-authenticates)
and because continuing to hammer the queue against a dead session risks looking like repeated silent
failures rather than the one, clear "sign back in" state FR-011 asks for.

**Alternatives considered**:
- **Treat every non-2xx as "rejected"**: rejected — directly violates FR-010 (would surface rate
  limiting and transient network blips as if they were real rejections needing user action).
  Research finding: this app's own rate limit (`rate-limit.ts`, 30 requests/60s per session) is
  genuinely plausible to hit when draining a backlog built up over a long offline stretch, so this
  isn't a hypothetical edge case.
- **Retry every non-2xx a fixed number of times before giving up**: rejected for 400/404 specifically
  — a validation failure or a 404 on a deleted resource will never succeed no matter how many times
  it's retried unchanged; retrying those wastes the user's time before they even find out something
  needs their attention. Retry-with-backoff is reserved for the failure classes that can plausibly
  self-resolve (429, network).

## Decision: `navigator.onLine`/`online`/`offline` events, with a retry backstop — not a pure event-driven design

**Decision**: The queue listens for `online`/`offline` window events to know when to attempt a
drain, but does not treat `navigator.onLine === true` as proof a request will actually succeed — a
failed fetch (network-level, not a 4xx/5xx) still pauses and retries with backoff rather than
assuming the browser's event was wrong and giving up.

**Rationale**: `navigator.onLine` is well known to report `true` in situations with no real internet
access (e.g. connected to a Wi-Fi network with no upstream) — treating it as authoritative would
leave the queue permanently stuck attempting sync against a connection that looks "online" but
isn't actually reaching the Worker. Using it only as a *trigger* to attempt a drain (not as a gate
that blocks attempting one) means a spurious "online" event just results in one failed fetch that
falls back to the same backoff-and-retry path as any other transient failure.

**Alternatives considered**:
- **Background Sync API** (`ServiceWorkerRegistration.sync`): rejected for v1 — meaningfully narrower
  browser support (notably absent in Safari/iOS, a primary target platform per specs/018/019) and
  would require wiring a message channel between the page and `sw.ts`, which specs/018 deliberately
  kept minimal (precache-only, no messaging). The page-level drain loop (only runs while a tab is
  open) is a smaller mechanism that satisfies every requirement in spec.md, none of which asks for
  syncing while the app is fully closed.

## Decision: `idb` as the one new dependency, not raw IndexedDB or a heavier alternative

**Decision**: Add `idb` (Jake Archibald, MIT, zero sub-dependencies, ~1.2KB gzipped) as a `deno.json`
`npm:` specifier for the IndexedDB access layer in `src/client/offline/db.ts`.

**Rationale**: Raw IndexedDB's API is callback/event-based with easy-to-misuse transaction lifetimes
(a transaction can auto-commit if you `await` something unrelated inside its callback, silently
losing writes) — a correctness footgun this feature, whose entire purpose is "never lose the user's
offline entry" (SC-002), can't afford. `idb` is a thin Promise wrapper with no behavior changes, from
the same PWA-tooling lineage as `workbox-*` (already a dependency via specs/018), actively
maintained, and small enough that the "prefer zero new dependencies" default is outweighed by the
correctness stakes here.

**Alternatives considered**:
- **Raw IndexedDB API**: rejected — the transaction-lifetime footgun above, for a feature where a
  silently-dropped write is exactly the failure mode being designed against.
- **`localStorage`**: rejected — synchronous (blocks the main thread on every read/write), a ~5MB
  quota shared with everything else on the origin, and no structured querying — workable for a toy
  queue, not durable enough to build "the user's log entries are never lost" on.
