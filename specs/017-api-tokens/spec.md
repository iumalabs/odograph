# Feature Specification: API Tokens

**Feature Branch**: `017-api-tokens`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "API tokens (issue #23, milestone M8): let an authenticated owner
create scoped, revocable API tokens for programmatic access to their own account's data, per
constitution Principle VI (API tokens MUST be hashed at rest, scoped to specific capabilities,
revocable by the owner, and MUST record a last-used timestamp). A token is either read-only or
read-write (not a granular per-resource capability list). Token management itself (creating,
listing, revoking) must require the original session-cookie-based login, never an API token — a
token must not be able to mint itself more tokens or extend its own access. An owner sees a new
token's plaintext value exactly once at creation time, lists existing tokens by
label/scope/created-at/last-used-at (never the plaintext or hash), and can revoke any token
immediately. Out of scope: admin/cross-tenant tokens, auto-expiry beyond explicit revocation,
OAuth-style third-party delegated authorization."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner creates a token and uses it for programmatic access (Priority: P1)

A signed-in owner wants to script against their own vehicle-maintenance data (e.g. pull records into
a spreadsheet, or push a new fuel record from an external form) without keeping a browser session
open. They create a token, choosing whether it can only read or can also write, copy its value once,
and use it from then on in place of a browser session.

**Why this priority**: This is the entire point of the feature — without it, there is no
programmatic access at all.

**Independent Test**: As a signed-in owner, create a read-write token, then use it (not a session
cookie) to create a vehicle and read it back — both succeed exactly as they would in the browser.

**Acceptance Scenarios**:

1. **Given** a signed-in owner, **When** they create a token labeled for their own use, **Then**
   they see its plaintext value once, and it is never shown again afterward, including in the token
   list.
2. **Given** a valid read-write token, **When** it is used to make a request that a session cookie
   could also make (read or write, within the owner's own account), **Then** the request succeeds
   identically to how it would with a session cookie.
3. **Given** a valid read-only token, **When** it is used to attempt a write request (create,
   update, or delete anything), **Then** the request is refused and nothing changes.
4. **Given** a valid read-only token, **When** it is used to attempt creating or revoking a token,
   **Then** the request is refused — token management always requires the original session login,
   never a token, regardless of scope.

---

### User Story 2 - An owner revokes a token they no longer trust (Priority: P2)

An owner suspects a token has leaked, or simply no longer needs it, and revokes it. Everything that
token could do stops working immediately.

**Why this priority**: Revocation is what makes creating tokens at all a safe thing to do — without
it, a leaked token is a permanent compromise.

**Independent Test**: Create a token, use it successfully once, revoke it, then attempt to use it
again — the second attempt is refused identically to a request with a token that was never issued.

**Acceptance Scenarios**:

1. **Given** an owner with an active token, **When** they revoke it, **Then** every subsequent
   request using that token's value is refused the same way a fabricated or unknown token would be.
2. **Given** an owner with several tokens, **When** they revoke one, **Then** the others continue to
   work normally.
3. **Given** a revoked token, **When** an owner looks at their token list, **Then** it either no
   longer appears or is clearly marked as revoked — never indistinguishable from an active one.

---

### User Story 3 - An owner reviews their tokens for unexpected use (Priority: P3)

An owner periodically checks which tokens exist and when each was last used, so an unfamiliar recent
use is a signal something may have leaked.

**Why this priority**: This is the detection half of Principle VI's threat model — creation and
revocation alone don't help an owner notice a leak has happened; the last-used signal does.

**Independent Test**: Create a token, use it, then view the token list and confirm the last-used
timestamp reflects that use and updates again after a second use.

**Acceptance Scenarios**:

1. **Given** a newly created, never-used token, **When** an owner views their token list, **Then**
   it shows no last-used time yet.
2. **Given** a token that has just been used successfully, **When** an owner views their token list,
   **Then** its last-used time reflects that use.
3. **Given** an owner's token list, **When** they view it, **Then** they see each token's label,
   scope, creation time, and last-used time — never the token's plaintext value or its stored hash.

### Edge Cases

- A token that is well-formed but does not match any issued (or matches a revoked) token is refused
  identically in both cases — the owner gets no signal distinguishing "never existed" from
  "revoked."
- A request presenting both a valid session cookie and a token authenticates via one consistent,
  well-defined mechanism, not an ambiguous mix of both — an owner using a browser with a token
  pasted into a request should get predictable behavior either way, not an inconsistent one.
- Deleting the owner's entire account (existing GDPR erasure feature) must also remove every one of
  their tokens — no token may outlive the account it grants access to.
- A token can never be used to see or affect another owner's data, exactly like a session cookie
  today.
- Permanently deleting the account itself is a token-management-adjacent action, not ordinary
  resource access — a token, including a read-write one, MUST NOT be usable to delete the account,
  for the same reason FR-006 excludes token management: a leaked token must never be able to cause
  unrecoverable, irreversible damage the owner can't contain simply by revoking it.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: A signed-in owner MUST be able to create a new API token, choosing a read-only or
  read-write scope and a label for their own reference.
- **FR-002**: A newly created token's plaintext value MUST be shown to the owner exactly once, at
  creation time, and MUST NOT be retrievable again afterward through any means.
- **FR-003**: Tokens MUST be stored hashed, never in plaintext, so that access to stored data alone
  cannot be used to authenticate as the owner.
- **FR-004**: A valid token MUST be usable to authenticate requests to the same account data a
  session cookie can reach, scoped to the token owner's own account only.
- **FR-005**: A read-only token MUST NOT be able to perform any request that creates, modifies, or
  deletes data.
- **FR-006**: Creating, listing, and revoking tokens MUST require the owner's original
  session-cookie-based login — an API token, including a read-write one, MUST NOT be usable to
  perform any of these token-management actions.
- **FR-007**: A signed-in owner MUST be able to list their own tokens, seeing each one's label,
  scope, creation time, and last-used time, without ever exposing the plaintext value or the stored
  hash of any token.
- **FR-008**: A signed-in owner MUST be able to revoke any of their own tokens at any time, taking
  effect immediately.
- **FR-009**: A revoked (or otherwise invalid) token MUST be refused identically to a token that was
  never issued — no observable difference between "revoked" and "never existed."
- **FR-010**: Every successful request authenticated by a token MUST update that token's last-used
  timestamp.
- **FR-011**: Deleting an owner's account MUST remove every token associated with it, alongside
  everything else account erasure already removes.
- **FR-012**: A token MUST only ever authenticate as its own owner's account — never another
  tenant's, and never an administrative or cross-tenant capability.
- **FR-013**: Permanently deleting the account MUST require the owner's original session-cookie
  login, exactly like token management — a token, including a read-write one, MUST NOT be usable to
  delete the account.

### Key Entities

- **API Token**: Represents one issued credential for programmatic access to a single owner's
  account. Attributes: an owner-chosen label, a scope (read-only or read-write), a creation time, a
  last-used time (absent until first use), and a revoked state. Belongs to exactly one tenant/owner.
  Its plaintext value exists only transiently, at creation; only a hash of it is ever persisted.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can go from "signed in" to "successfully making an authenticated programmatic
  request with a new token" in a single sitting, with no more than creating the token and copying
  its value.
- **SC-002**: 100% of write requests made with a read-only token are refused, with zero data changes
  resulting.
- **SC-003**: 100% of token-management requests (create/list/revoke) and account-deletion requests
  made using a token instead of a session are refused, regardless of that token's scope.
- **SC-004**: A revoked token is refused on its very next use, with no delay or grace period.
- **SC-005**: An owner can always determine, from the token list alone, whether and when each of
  their tokens was last used, without needing to inspect logs or contact support.
- **SC-006**: After an account is deleted, zero of its tokens remain valid or visible anywhere in
  the system.

## Assumptions

- **Two-tier scope, not per-resource capabilities**: given this project's scale (an individual or
  small-fleet tool, no admin role, no multi-user tenants), a read-only/read-write split is
  sufficient; a granular per-resource permission model (e.g. "vehicles:write but
  reminders:read-only") would be unused complexity for what this app actually has.
- **No auto-expiry**: tokens remain valid until the owner explicitly revokes them. This project has
  no existing precedent for auto-expiring credentials elsewhere (sessions are a fixed 30-day TTL,
  not sliding; magic-link/session invalidation is always an explicit action), and expiry can be
  layered on later without breaking this feature's contract if ever needed.
- **No token-based token management**: creating, listing, and revoking tokens always requires the
  original session login. This is a deliberate defense-in-depth boundary (a leaked read-write token
  still cannot mint itself replacement access or see what other tokens exist), not an oversight.
- **No third-party delegated authorization**: this is a personal-access-token model for the
  account's own owner, not an OAuth-style consent flow for granting access to a separate party.
- **No admin or cross-tenant capability**: this project has no administrative role today, and this
  feature does not introduce one.
