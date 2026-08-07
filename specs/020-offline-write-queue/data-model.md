# Phase 1 Data Model: Offline Write Queue

## New D1 table: `write_operations` (migration `0013_idempotency_keys.sql`)

The idempotency ledger. One row per queued action that has actually been attempted against the
server (never populated for actions still sitting in the client's local queue, only once they're
sent).

| Column | Type | Notes |
|---|---|---|
| `tenant_id` | `TEXT NOT NULL` | `REFERENCES tenants (id) ON DELETE CASCADE` — GDPR erasure: deleted with the tenant, holds no independently meaningful data (research.md, plan.md Constitution Check §VIII). |
| `idempotency_key` | `TEXT NOT NULL` | The client-generated UUID from the queued action. |
| `method` | `TEXT NOT NULL` | HTTP method of the original request (`POST`/`PATCH`/`DELETE`) — a defensive check: the same key replayed against a *different* method/path is a client bug, not a legitimate replay, and should not blindly return a mismatched stored response. |
| `path` | `TEXT NOT NULL` | Request path of the original request, same defensive purpose as `method`. |
| `status_code` | `INTEGER NOT NULL` | The original response's HTTP status. |
| `response_body` | `TEXT NOT NULL` | The original response body, stored as JSON text, replayed byte-for-byte on a repeat. |
| `created_at` | `TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` | |

**Primary key**: `(tenant_id, idempotency_key)` — composite, no separate surrogate id needed. A
`UNIQUE` constraint isn't a separate concern here since the primary key already enforces it.

**Not indexed for querying beyond the primary key lookup** — this table is never read except by
exact `(tenant_id, idempotency_key)` lookup inside the idempotency middleware; it has no UI-facing
list/browse use.

## Existing tables: no schema change, one behavioral change

`vehicles`, `service_records`, `fuel_records`, `reminder_rules` are unchanged in shape. The
behavioral change is in the *create* repository functions (`createVehicle`, `createServiceRecord`,
`createFuelRecord`, `createReminderRule` in `src/server/db/repository.ts`): each now accepts an
optional `id` parameter. When present (and a syntactically valid UUID), it's used as the new row's
`id` instead of a server-generated `crypto.randomUUID()`. When absent, behavior is byte-identical to
today. This is what lets a client assign a record's identity offline, before the create ever reaches
the server (spec.md FR-007).

## Client-side: one IndexedDB database, one object store

Database `odograph-offline-queue`, object store `pendingActions`, keyed by the action's own `id`
(the same UUID used as the idempotency key / resource id above).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (UUID) | Primary key; the idempotency key sent to the server, and — for `create` actions — the resource's own id. |
| `sequence` | `number` | Monotonically increasing, assigned at `enqueue()` time — the total order the drain loop replays in (IndexedDB's own insertion order is not relied on for this; an explicit field makes the ordering guarantee independent of any particular database's iteration semantics). |
| `entity` | `"vehicle" \| "serviceRecord" \| "fuelRecord" \| "reminderRule"` | Which client module's list this action affects, for the merge step (`merge.ts`) to know where to overlay it. |
| `actionType` | `"create" \| "update" \| "delete" \| "dismissDuplicate" \| "markDone"` | |
| `vehicleId` | `string \| null` | The vehicle this action belongs to, where applicable — carried for display grouping only; not used for ordering (research.md: ordering is global, per-vehicle order falls out of it for free). |
| `method` | `"POST" \| "PATCH" \| "DELETE"` | |
| `path` | `string` | The request path to replay against. |
| `body` | `unknown` | The JSON request body (for creates, includes the client-assigned `id`). |
| `status` | `"pending" \| "syncing" \| "rejected"` | No `"synced"` state — a successfully synced action is removed from the store entirely (FR nothing requires keeping a permanent local history of successes; the server is the record of truth for those). |
| `rejectReason` | `string \| null` | The server's response body for a rejected action, kept so the user's original input and the reason it failed both remain visible (FR-013). |
| `createdAt` | `string` (ISO) | When the user performed the action, for display ("queued 3 minutes ago"). |

No separate "session expired" record type: that's a transient in-memory drain-loop state (not
persisted per-action), since it applies to the whole queue, not to any one action (research.md's
drain-loop decision).
