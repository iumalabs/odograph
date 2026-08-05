# Research: Account Linking Rules

## Schema approach: `ALTER TABLE ADD COLUMN` on existing ephemeral tables, not new tables

**Decision**: Add a nullable `linking_user_id TEXT REFERENCES users(id) ON DELETE CASCADE` column to
both `magic_link_tokens` and `oidc_states` via a new migration, rather than introducing separate
`magic_link_linking_tokens`/`oidc_linking_states` tables.

**Rationale**: A linking attempt and a sign-in attempt are the *same kind of thing* — a short-lived,
single-use, anti-replay-protected pending action — differing only in what happens when it's
consumed successfully. Duplicating the whole table (and duplicating `invalidateAndCreateMagicLinkToken`/
`consumeMagicLinkToken`/`createOidcState`/`consumeOidcState` alongside it) would mean two codepaths
generating and consuming tokens/state with the identical entropy/TTL/single-use logic, doubling
surface area for a distinction that's really just "is there a target user attached." SQLite (and D1)
support adding a nullable column with no default to an already-populated table via a plain `ALTER
TABLE ... ADD COLUMN` — no backfill needed, existing rows just get `NULL` for the new column, which
is exactly "not a linking attempt," the correct default.

**Alternatives considered**:

- Separate tables per linking flow — rejected: doubles the token/state lifecycle logic for no
  behavioral gain, and two near-identical `consumeXState`-shaped functions per method is worse for
  maintainability than one function returning one extra nullable field.
- A generic cross-method "pending link" table keyed by an opaque id, referenced from both
  `magic_link_tokens` and `oidc_states` — rejected as premature abstraction; there are exactly two
  methods needing this today (passkey already has it natively), and D-004 doesn't ask for a
  provider-agnostic linking-state shape the way FR-008 did for `oidc_identities` — that requirement
  was specifically about *identity* records outliving many auth attempts, not these
  minutes-lived attempt records.

## Google linking: a separate `completeGoogleLink`, not a branch inside `completeGoogleSignIn`

**Decision**: `completeGoogleLink(db, idToken, { jwks, audience, linkingUserId })` is a new,
separate function from `completeGoogleSignIn`, even though both start with the same ID-token
verification step.

**Rationale**: The two functions' resolution logic is genuinely different, not a small variation —
sign-in does find-or-create (an existing identity resolves to its user; a new one creates a tenant,
user, and identity together), while linking is insert-only-if-absent-anywhere (never creates a
tenant/user, and must reject rather than fall back to anything if the identity already exists for
*any* user, including the linking user's own). Branching one function on a `linkingUserId ??
undefined` parameter would mean every reader has to hold both code paths in their head to understand
either one — two small, single-purpose functions are more legible than one function with a mode
flag, matching this codebase's general preference (seen already in `createOidcUser` vs. a
hypothetical "upsert" function) for functions that do one thing.

## Cross-device completion: the identity resolves by who *initiated* it, not the completing browser's session

**Decision**: Neither `/verify` nor `/callback` re-checks the *completing* browser's session cookie
when a `linking_user_id` is present on the consumed token/state — the target user is read entirely
from that stored value, and a fresh session for that user is issued on whichever browser completes
the flow (FR-006/FR-007).

**Rationale**: Magic-link's entire premise is that the browser opening the link doesn't need to be
the one that requested it (checking email on a different device is the normal case, not an edge
case) — requiring the *linking* variant to behave differently (same-browser-only) would be a
surprising, inconsistent exception a user has no way to anticipate. For Google's flow the
same-browser case is far more common in practice (a same-tab redirect round trip), but there's no
reason to special-case it — treating both methods identically keeps the mental model ("a link
attempt targets an account, not a browser") simple and matches how sessions already work in this
codebase (a session is bound to whoever holds the cookie, not to "the browser that logged in
originally").

## Rejecting an already-linked identity: reuse the existing unique-constraint-catch pattern

**Decision**: `linkMagicLinkIdentity`/`linkOidcIdentity` are plain `INSERT`s against
`magic_link_identities`/`oidc_identities` (both already primary-keyed on the identity itself —
`email`, `(provider, subject)`) with no existence pre-check; the route layer catches the resulting
constraint violation via the existing `isUniqueConstraintError` helper and responds with a rejection
— exactly the pattern `addCredentialToUser`/passkey's `/add/verify` route already established
(specs/002) for "reject a credential already registered to any account, same or different, via a
409-shaped outcome," extended here to the identity tables instead of `webauthn_credentials`. No new
error-handling pattern needed.
