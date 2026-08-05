# Phase 1 Data Model: Account Linking Rules

## Schema changes (`ALTER TABLE`, not new tables — see research.md)

### `magic_link_tokens` (specs/003) — add one column

| Column             | Type                                              | Notes                                                                                             |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `linking_user_id`  | TEXT, NULL, FK → `users.id` ON DELETE CASCADE      | `NULL` for a normal sign-in request (unchanged behavior); set to the initiating user's id for a link |

### `oidc_states` (specs/004) — add one column

| Column             | Type                                              | Notes                                                                                             |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `linking_user_id`  | TEXT, NULL, FK → `users.id` ON DELETE CASCADE      | Same role as above, for the OIDC flow's pending-attempt record                                       |

No changes to `magic_link_identities` or `oidc_identities` (specs/003, specs/004) — linking writes
into these existing tables via a new insert-only path (below), not a new shape.

## Validation rules (from Functional Requirements)

- `linking_user_id` is only ever set by the two new authenticated-only trigger routes
  (`POST /auth/magic-link/link`, `GET /auth/oidc/google/link`) — never settable by an unauthenticated
  caller, and never present on rows created by the existing `/request`/`/start` routes (FR-004).
- Consuming a token/state with `linking_user_id` set MUST NOT create a new tenant or user (FR-003) —
  it inserts directly into `magic_link_identities`/`oidc_identities` for the *existing* target user,
  or fails.
- Inserting an identity row that already exists (same primary key — `email`, or `(provider,
  subject)`) — regardless of which user it currently belongs to — MUST fail and MUST NOT modify the
  existing row (FR-005). The insert-only functions below rely entirely on the primary key
  constraint for this; no existence pre-check is performed (research.md — same pattern as passkey's
  duplicate-credential rejection).
- A session issued on successful link completion is for the *target* user (the one who initiated the
  link), regardless of what session (if any) the completing browser held (FR-006/FR-007).

## Repository layer additions/changes (shape, not full implementation)

All changes live in `src/server/db/repository.ts`.

```text
// MODIFIED — optional trailing param, existing callers unaffected.
function invalidateAndCreateMagicLinkToken(
  db: D1Database,
  email: string,
  linkingUserId?: string,
): Promise<string>

// MODIFIED — return type gains one nullable field.
function consumeMagicLinkToken(
  db: D1Database,
  token: string,
): Promise<{ email: string; linkingUserId: string | null } | null>

// NEW — insert-only; throws (isUniqueConstraintError) if the email is already linked to any user.
function linkMagicLinkIdentity(db: D1Database, email: string, userId: string): Promise<void>

// MODIFIED — optional trailing param, existing callers unaffected.
function createOidcState(
  db: D1Database,
  linkingUserId?: string,
): Promise<{ state: string; codeVerifier: string }>

// MODIFIED — return type gains one nullable field.
function consumeOidcState(
  db: D1Database,
  state: string,
): Promise<{ codeVerifier: string; linkingUserId: string | null } | null>

// NEW — insert-only; throws (isUniqueConstraintError) if (provider, subject) is already linked.
function linkOidcIdentity(
  db: D1Database,
  provider: string,
  subject: string,
  userId: string,
): Promise<void>
```
