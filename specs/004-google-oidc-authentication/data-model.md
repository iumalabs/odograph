# Phase 1 Data Model: Google OIDC Authentication

## Entities

### `oidc_identities`

Records that an identity-provider account has an Odograph account, and which user it maps to.
Provider-agnostic in shape (FR-008) — keyed by `(provider, subject)`, never `users.email`.

| Column       | Type                                              | Notes                                                                                 |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `provider`   | TEXT NOT NULL                                      | `'google'` at launch; a value, not a hard-coded assumption elsewhere (FR-008)          |
| `subject`    | TEXT NOT NULL                                      | The provider's stable, opaque subject id (Google's ID token `sub` claim) — never email |
| `user_id`    | TEXT NOT NULL, FK → `users.id` ON DELETE CASCADE   |                                                                                          |
| `created_at` | TEXT NOT NULL                                      | ISO 8601                                                                                |

**Primary key**: `(provider, subject)` — composite, mirroring how `magic_link_identities.email` is
the identity key for that method only. A second provider added later reuses this same table with a
different `provider` value, per FR-008/User Story 3 — no migration needed.

**GDPR erasure decision**: Delete (not anonymise) when the owning account is erased — same reasoning
as `webauthn_credentials` (specs/002) and `magic_link_identities` (specs/003): an erased account must
not remain reachable via any sign-in method, including this one.

### `oidc_states`

A single-use, short-lived value binding one in-progress "redirect to Google and back" attempt to its
PKCE verifier — the OIDC-flow equivalent of `webauthn_challenges` (specs/002).

| Column          | Type             | Notes                                                                                     |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `state`         | TEXT PRIMARY KEY | The random anti-CSRF value sent to Google and returned on the callback; used as the lookup key |
| `code_verifier` | TEXT NOT NULL    | The PKCE verifier generated alongside `state`, needed at the token-exchange step               |
| `created_at`    | TEXT NOT NULL    | ISO 8601                                                                                     |
| `expires_at`    | TEXT NOT NULL    | ISO 8601 — 10 minutes (research.md): longer than WebAuthn's 5-minute challenge window to survive Google's own consent-screen interaction time, shorter than magic-link's 15 minutes since there's no email-delivery delay to absorb |

A `state` value is valid iff it exists in this table and `expires_at > now()`. **Consuming** it
deletes the row as part of the same operation that checks validity — same single-use pattern as
`webauthn_challenges` and `magic_link_tokens` (research.md's rationale for not adding a second,
cookie-based protection layer on top).

**GDPR erasure decision**: Delete. Purely transient anti-replay state, same category as sessions,
WebAuthn challenges, and magic-link tokens — no retention value once consumed or expired, and no
foreign key to a user (a pending attempt exists before any account lookup happens).

## Relationships

```text
users (1) ───< (N) oidc_identities   -- in practice 0 or 1 per (user, provider) pair today (one
                                       -- provider live), but modeled as 1:N like
                                       -- webauthn_credentials/magic_link_identities for
                                       -- consistency — nothing prevents a user having both a
                                       -- Google identity and a future second provider's identity
                                       -- without a schema change (FR-008/User Story 3)
```

`oidc_states` has no foreign keys — like `webauthn_challenges` and `magic_link_tokens`, it exists
before any account lookup happens (the callback might resolve to a brand-new user, an existing one,
or fail entirely).

## Validation rules (from Functional Requirements)

- `oidc_identities`' primary key is the `(provider, subject)` pair — this is what makes FR-003a's
  "does this identity already have an account" check a single indexed lookup keyed by the provider's
  own stable id, never by `users.email` (D-004).
- FR-006 ("nothing created until the callback verifies successfully") means `oidc_identities` and
  the `tenant`/`user` rows are only ever written together, on successful ID token verification and
  new-identity resolution — never at `/start` time. Same `D1Database.batch()` pattern
  `createCredentialedUser` (specs/002) and `createMagicLinkUser` (specs/003) used.
- `state` values are generated with the same entropy/randomness approach as WebAuthn challenges and
  magic-link tokens (`crypto.getRandomValues`, base64url-encoded) — a guessable state would defeat
  its entire purpose as this feature's sole anti-CSRF/anti-replay mechanism (research.md).
- The callback MUST consume (delete) the `oidc_states` row atomically with validating it, before any
  token-exchange call to Google — a `state` value can be used to complete the flow at most once.

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`, alongside existing exports — no existing
export's signature changes.

```text
function findOidcIdentityByProviderAndSubject(
  db: D1Database,
  provider: string,
  subject: string,
): Promise<{ userId: string } | null>

// Bootstrap-shaped (like createCredentialedUser/createMagicLinkUser) — a brand-new identity has
// no user yet.
function createOidcUser(
  db: D1Database,
  input: { provider: string; subject: string; email: string },
): Promise<{ tenantId: string; userId: string }>
// Writes tenants + users + oidc_identities in one D1Database.batch() call (FR-006).

function createOidcState(db: D1Database): Promise<{ state: string; codeVerifier: string }>
// Generates both values, writes the row, returns them for the /start handler to use when
// building the authorization URL and the anti-CSRF cookie/redirect.

function consumeOidcState(db: D1Database, state: string): Promise<{ codeVerifier: string } | null>
// Atomically checks validity and deletes; returns the associated PKCE verifier if it was valid.
```
