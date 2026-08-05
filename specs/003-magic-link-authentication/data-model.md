# Phase 1 Data Model: Magic Link Authentication

## Entities

### `magic_link_identities`

Records that an email address has an account reachable via magic link, and which user it maps to.
Method-scoped (research.md) — never queried by joining against `users.email`.

| Column       | Type                                             | Notes                                   |
| ------------ | ------------------------------------------------ | --------------------------------------- |
| `email`      | TEXT PRIMARY KEY                                 | The identity key for _this method only_ |
| `user_id`    | TEXT NOT NULL, FK → `users.id` ON DELETE CASCADE |                                         |
| `created_at` | TEXT NOT NULL                                    | ISO 8601                                |

**GDPR erasure decision**: Delete (not anonymise) when the owning account is erased — same reasoning
as `webauthn_credentials` (specs/002): an erased account must not remain reachable via any sign-in
method, including this one. `users` itself is still anonymised, not deleted (specs/001's decision);
this table's row is deleted explicitly as part of the erasure flow (milestone M8), same note as
specs/002 left for `webauthn_credentials`.

### `magic_link_tokens`

A single-use, short-lived value tied to one pending request for one email address.

| Column       | Type             | Notes                                                                                                                                       |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`      | TEXT PRIMARY KEY | The token value itself — used directly as the lookup key, same shape as `webauthn_challenges.challenge`                                     |
| `email`      | TEXT NOT NULL    | The email this token authenticates, lowercased/normalized at write time                                                                     |
| `created_at` | TEXT NOT NULL    | ISO 8601                                                                                                                                    |
| `expires_at` | TEXT NOT NULL    | ISO 8601 — a longer window than WebAuthn's challenge (a couple of minutes wouldn't survive realistic email delivery/read delay); 15 minutes |

A token is valid iff it exists in this table and `expires_at > now()`. **Consuming** a token deletes
its row as part of the same operation that checks validity, same single-use pattern as
`webauthn_challenges`.

**GDPR erasure decision**: Delete. Purely transient anti-replay state, same category as sessions and
WebAuthn challenges — no retention value once consumed or expired.

## Relationships

```text
users (1) ───< (N) magic_link_identities   -- in practice 0 or 1 per user, since one email maps
                                             -- to one identity row, but modeled as 1:N like
                                             -- webauthn_credentials for consistency; nothing
                                             -- prevents a future multi-email-per-account design
                                             -- from reusing this shape without a schema change
```

`magic_link_tokens` has no foreign keys — like `webauthn_challenges`, it exists before any account
is guaranteed to exist yet (a brand-new email's first request).

## Validation rules (from Functional Requirements)

- `magic_link_identities.email` must be unique (it's the primary key) — this is what makes
  FR-002/FR-003's "new vs. existing" check a single indexed lookup, not a scan.
- Requesting a new token for an email MUST invalidate (delete) any existing unconsumed, unexpired
  token row for that same email first (FR-005) — enforced as a `DELETE ... WHERE email
  = ?`
  immediately before the new token's `INSERT`, inside the same repository function so no caller can
  do one without the other.
- Email addresses are normalized (lowercased, trimmed) before being used as a lookup/storage key
  anywhere in this feature — an unnormalized comparison would let `User@Example.com` and
  `user@example.com` behave as different identities, silently defeating FR-002/FR-003's
  new-vs-existing check for what a user would reasonably consider the same address.
- FR-002 ("nothing created until the link is followed") means `magic_link_identities` and the
  `tenant`/`user` rows are only ever written together, on successful token consumption — never at
  request time. Same `D1Database.batch()` pattern `createCredentialedUser` used in specs/002.

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`, alongside existing exports — no existing
export's signature changes.

```text
function findMagicLinkIdentityByEmail(db: D1Database, email: string): Promise<{ userId: string } | null>

// Bootstrap-shaped (like createCredentialedUser) — a brand-new email has no user yet.
function createMagicLinkUser(db: D1Database, email: string): Promise<{ tenantId: string; userId: string }>
// Writes tenants + users + magic_link_identities in one D1Database.batch() call (FR-002).

function invalidateAndCreateMagicLinkToken(db: D1Database, email: string): Promise<string>
// Deletes any existing unconsumed token for `email`, inserts a new one, returns its value
// (FR-005) — one function so no caller can invalidate without also issuing a fresh token,
// or vice versa.

function consumeMagicLinkToken(db: D1Database, token: string): Promise<{ email: string } | null>
// Atomically checks validity and deletes; returns the associated email if it was valid.
```
