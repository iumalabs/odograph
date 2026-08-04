# Phase 1 Data Model: Passkey Authentication

## Entities

### `webauthn_credentials`

A registered passkey. Belongs to exactly one user; a user may have many (User Story 3).

| Column       | Type                                             | Notes                                                                                                                                         |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | TEXT PK                                          | The credential ID as returned by the authenticator (base64url) — globally unique by construction, not server-generated                        |
| `user_id`    | TEXT NOT NULL, FK → `users.id` ON DELETE CASCADE |                                                                                                                                               |
| `public_key` | BLOB NOT NULL                                    | COSE public key bytes, used to verify future authentication signatures                                                                        |
| `counter`    | INTEGER NOT NULL DEFAULT 0                       | Authenticator signature counter, for clone/replay detection (FR-004-adjacent hardening — see Validation rules)                                |
| `transports` | TEXT NULL                                        | JSON array of transport hints (`"usb"`, `"internal"`, etc.) reported at registration, used to hint the browser at login; optional/best-effort |
| `created_at` | TEXT NOT NULL                                    | ISO 8601                                                                                                                                      |

**GDPR erasure decision**: Delete (not anonymise) when the owning account is erased. Even though
`users` rows are anonymised rather than hard-deleted (specs/001's decision), credentials must be
hard-deleted on erasure so an erased account can never authenticate again — keeping a stale but
still-valid passkey around after "erasure" would be both a data-retention violation and a live
security hole. `ON DELETE CASCADE` on `user_id` only fires if the `users` row itself is deleted;
since erasure anonymises rather than deletes the user row, the erasure flow (milestone M8) must
explicitly delete this table's rows for an erased user as its own step — noted here so that flow
doesn't miss it.

### `webauthn_challenges`

A single-use, short-lived value issued at the start of a registration or login ceremony. Not tied to
a tenant or user — registration challenges are issued before any account exists, and login
challenges (discoverable-credential flow, see research.md) don't know who's logging in until the
response comes back.

| Column       | Type                                                       | Notes                                                                                                                                |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `challenge`  | TEXT PK                                                    | The base64url challenge value itself — used directly as the lookup key                                                               |
| `purpose`    | TEXT NOT NULL, CHECK IN ('registration', 'authentication') |                                                                                                                                      |
| `created_at` | TEXT NOT NULL                                              | ISO 8601                                                                                                                             |
| `expires_at` | TEXT NOT NULL                                              | ISO 8601 — short window (a couple of minutes), matching how long a user reasonably takes to complete a biometric/security-key prompt |

A challenge is valid iff it exists in this table and `expires_at > now()`. **Consuming** a challenge
means deleting its row as part of the same operation that checks validity (single
`DELETE ... WHERE challenge = ? AND expires_at > ? RETURNING challenge`-shaped query, or an
equivalent select-then-delete inside one repository function) — so a concurrently repeated
verification attempt with the same challenge can't both "succeed."

**GDPR erasure decision**: Delete. Purely transient anti-replay state with no retention value — same
category as sessions in specs/001. A scheduled cleanup of expired-but-unconsumed rows is a
nice-to-have, not required for correctness (an expired row simply fails the `expires_at > now()`
check even if never explicitly deleted), tracked as the same kind of follow-up specs/001 noted for
expired sessions.

## Relationships

```text
users (1) ───< (N) webauthn_credentials
```

`webauthn_challenges` has no foreign keys — it's deliberately not tenant/user-scoped (see above).

## Validation rules (from Functional Requirements)

- `webauthn_credentials.id` must be unique across the _entire table_, not just per-user — this is
  what makes FR-006 ("reject registering an already-registered credential, to the same or a
  different account") enforceable as a plain primary-key insert conflict, not application-level
  logic that could race.
- On every successful login verification, `webauthn_credentials.counter` must be updated to the new
  value the authenticator reported, and the verification must reject if the authenticator's reported
  counter is not strictly greater than the stored one — this is standard WebAuthn clone-detection: a
  counter that goes backward or stays the same indicates a cloned authenticator replaying an old
  signature. (This is a hardening detail implied by "verify the authenticator's cryptographic
  response" in FR-008, made explicit here since it's a real data-model constraint, not just ceremony
  logic.)
- `webauthn_challenges.challenge` values must be generated with enough entropy that guessing one is
  infeasible (32 bytes from `crypto.getRandomValues`, matching the session token generation approach
  in specs/001's `session.ts`) — a predictable challenge would let an attacker construct a
  valid-looking response without ever triggering a real ceremony.
- FR-010 ("no tenant/user/credential created for an incomplete registration ceremony") means the
  tenant, user, and credential rows are only ever written together, after verification succeeds —
  never as separate steps a client could abandon partway through. The repository function for
  registration takes all three pieces of data and writes them via a single `D1Database.batch()`
  call, not three independent inserts.

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`, alongside the existing exports from
specs/001 — no existing export's signature changes.

```text
// Bootstrap-shaped (like createTenant/createUser) — registration has no session yet.
function createCredentialedUser(
  db: D1Database,
  input: { email: string; credentialId: string; publicKey: Uint8Array; transports?: string[] }
): Promise<{ tenantId: string; userId: string }>
// Writes tenants + users + webauthn_credentials in one D1Database.batch() call (FR-010).

function findCredentialById(db: D1Database, credentialId: string): Promise<CredentialRow | null>
// CredentialRow includes userId, publicKey, counter — enough to verify + resolve who's logging in.

function addCredentialToUser(
  db: D1Database,
  input: { userId: string; credentialId: string; publicKey: Uint8Array; transports?: string[] }
): Promise<void>
// User Story 3 — adding a second passkey to an already-authenticated user. Relies on
// webauthn_credentials.id's primary-key uniqueness to reject a credential already registered
// elsewhere (FR-006), rather than checking-then-inserting (race-free by construction).

function updateCredentialCounter(db: D1Database, credentialId: string, counter: number): Promise<void>

function createChallenge(db: D1Database, purpose: "registration" | "authentication"): Promise<string>
// Generates + stores + returns the challenge value.

function consumeChallenge(db: D1Database, challenge: string, purpose: "registration" | "authentication"): Promise<boolean>
// Atomically checks validity and deletes; returns whether it was valid (false = reject the ceremony).
```
