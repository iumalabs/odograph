# Phase 1 Data Model: Tenant-Scoped Repository Layer & Session Foundation

## Entities

### `tenants`

The isolation boundary. Every other tenant-scoped table's rows belong to exactly one tenant.

| Column       | Type    | Notes                       |
| ------------ | ------- | --------------------------- |
| `id`         | TEXT PK | UUID, generated server-side |
| `created_at` | TEXT    | ISO 8601, set on insert     |

**GDPR erasure decision**: Delete. A tenant with no remaining users has no reason to persist —
deleting the row (cascading to `users`/`sessions` via foreign keys) is correct. Deletion of a
tenant's _other_ data (vehicles, records, attachments) is each of those future features'
responsibility as they're built (tracked under milestone M8).

### `users`

A person who can sign in. Belongs to exactly one tenant. This feature only needs identity + tenant
membership — auth-method-specific credentials (passkey public keys, OIDC subject ids, etc.) are
added by their respective specs as new columns/tables, not by this one.

| Column       | Type                                               | Notes                                                                                                                |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`         | TEXT PK                                            | UUID                                                                                                                 |
| `tenant_id`  | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE |                                                                                                                      |
| `email`      | TEXT NOT NULL                                      | Not unique across tenants by design — email is not a cross-tenant identity key (see D-004: no auto-linking by email) |
| `created_at` | TEXT                                               | ISO 8601                                                                                                             |

**GDPR erasure decision**: Anonymise, don't hard-delete. Once a user has created any records (future
features), hard-deleting the `users` row would either cascade-delete records the tenant may still
need (e.g. service history tied to a vehicle the tenant keeps) or leave orphaned foreign keys. The
erasure flow (milestone M8) will overwrite `email` and any future PII columns with a tombstone value
and mark the row erased, preserving referential integrity. Recorded here so the decision exists
before any later feature adds a column to this table.

### `sessions`

Represents "this request is being made by this user." Source of truth for validity (see research.md
— KV is a cache in front of this, not a replacement for it).

| Column           | Type                                             | Notes                                                          |
| ---------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `id`             | TEXT PK                                          | UUID                                                           |
| `user_id`        | TEXT NOT NULL, FK → `users.id` ON DELETE CASCADE |                                                                |
| `token_hash`     | TEXT NOT NULL, UNIQUE                            | SHA-256 (hex) of the raw session token; raw token never stored |
| `created_at`     | TEXT NOT NULL                                    | ISO 8601                                                       |
| `expires_at`     | TEXT NOT NULL                                    | ISO 8601; session is invalid once past                         |
| `invalidated_at` | TEXT NULL                                        | ISO 8601; set on logout, NULL while active                     |

A session is valid iff `invalidated_at IS NULL AND expires_at > now()`.

**GDPR erasure decision**: Delete. Sessions are inherently transient and carry no independent
retention value once expired or invalidated; a scheduled cleanup (out of scope for this feature,
tracked as a follow-up) can delete rows past `expires_at` by some margin.

## Relationships

```text
tenants (1) ───< (N) users (1) ───< (N) sessions
```

- A tenant has many users; a user belongs to exactly one tenant.
- A user has many sessions (multiple devices/browsers); a session belongs to exactly one user.
- Tenant scope for any request is resolved by following `session → user → tenant`, never taken from
  anything the client sends directly (Principle I, FR-001).

## Validation rules (from Functional Requirements)

- `sessions.token_hash` must be unique — collision would let one token resolve to two sessions.
- A session referencing a `user_id` (or transitively a `tenant_id`) that no longer exists must be
  treated as invalid, not as an error and not as "no tenant" (FR-008) — enforced structurally by the
  `ON DELETE CASCADE` foreign keys: deleting a user deletes their sessions outright, so a dangling
  reference can't exist to begin with.
- No column in any of these three tables is ever populated from a client-supplied tenant/user id;
  `tenant_id`/`user_id` values only ever come from a resolved session or from server-side logic
  (e.g. the dev/test session-issuing route creating its own rows) (FR-001, FR-002).

## Repository layer contract (shape, not full implementation)

The repository layer (`src/server/db/repository.ts`) is the only module that imports the D1 binding.
Its exported functions never take a `tenantId` parameter from a caller — instead, every function
takes a resolved `TenantContext` (produced only by the session middleware) as its first argument,
and reads `tenant_id` from that context internally. This makes "forgot to filter by tenant" a
compile-time-shaped mistake, not just a code-review one: there is no function signature in the
repository layer that accepts a bare tenant id from arbitrary calling code.

```text
type TenantContext = { tenantId: string; userId: string }

// Example shape future features' repository functions will follow — this feature itself
// only needs the probe route, not a real resource table.
function findById(ctx: TenantContext, id: string): Promise<Row | null>
function list(ctx: TenantContext): Promise<Row[]>
function create(ctx: TenantContext, input: NewRow): Promise<Row>
```
