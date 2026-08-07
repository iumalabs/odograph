# Phase 1 Data Model: API Tokens

## New table: `api_tokens` (migration `0012`)

```sql
CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_tokens_user_id ON api_tokens (user_id);
CREATE INDEX idx_api_tokens_token_hash ON api_tokens (token_hash);
```

`user_id ... ON DELETE CASCADE` (research.md: "Table ownership") satisfies FR-011 — deleting the
owner's account (cascading from `tenants` → `users` → `api_tokens`, the same chain `sessions`
already relies on) removes every one of their tokens with no separate cleanup step, exactly like the
GDPR erasure feature's existing reliance on cascade chains elsewhere in this schema.

`revoked_at` (nullable, research.md: "Revocation model") mirrors `sessions.invalidated_at` — `NULL`
means active, a timestamp means revoked. `last_used_at` (nullable) is `NULL` until first use
(spec.md User Story 3, acceptance scenario 1), then updated on every successful authenticated
request (FR-010).

## Repository layer additions (`src/server/db/repository.ts`)

- `createApiToken(db, ctx, input: { label: string; scope: "read" | "write"; tokenHash: string }):
  Promise<ApiToken>`
  — inserts a row for `ctx.userId`, returns it (never the plaintext, which the route layer holds
  only transiently before hashing).
- `listApiTokens(db, ctx): Promise<ApiToken[]>` — every token (active and revoked) for `ctx.userId`,
  ordered by `created_at`. Never selects `token_hash`.
- `findValidApiTokenByHash(db, tokenHash): Promise<(ResolvedSession & { apiTokenId: string; scope:
  "read" | "write" }) | null>`
  — `JOIN users` to resolve `{userId, tenantId}`, exactly like `findValidSessionByTokenHash`,
  filtered to `revoked_at IS NULL`. Takes a bare hash, not a `TenantContext` (nothing is scoped yet
  — this _is_ the resolution step, same shape as `findValidSessionByTokenHash`).
- `touchApiTokenLastUsed(db, apiTokenId): Promise<void>` — sets `last_used_at` to now. Called once
  per successfully authenticated token request (FR-010).
- `revokeApiToken(db, ctx, id): Promise<boolean>` — sets `revoked_at` if the row belongs to
  `ctx.userId` and isn't already revoked; returns whether a row was actually changed (same
  not-found-or-not-yours/already-done contract as `deleteVehicle`).

## Type

```ts
export type ApiToken = {
  id: string;
  userId: string;
  label: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
```

Never includes `tokenHash` — it is written once at creation and never read back through this type;
callers that need to check a hash go through `findValidApiTokenByHash` instead, which returns a
resolved identity, not the token row itself.
