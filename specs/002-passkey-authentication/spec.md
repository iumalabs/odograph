# Feature Specification: Passkey Authentication (Primary Sign-In Method)

**Feature Branch**: `002-passkey-authentication`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Passkey authentication, primary sign-in method (GitHub issue #5,
milestone M1, decision D-003). Plugs into the existing session foundation (specs/001) — sessions,
tenant-scoped repository layer, and session-resolution middleware already exist and aren't
redesigned here. Adds registration (new tenant + user + passkey) and login (existing user, new
passkey-authenticated session) via WebAuthn, replacing the dev-only session route as the production
path. Users can register more than one passkey. Rate limiting on both endpoints using the existing
write-path limiter. Out of scope: magic link, Google OIDC, account linking rules, passkey-management
UI, password fallback."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A new visitor creates an account with a passkey (Priority: P1)

As a new visitor with no Odograph account, I want to create one using a passkey (fingerprint, face,
or security key) instead of a password, so I get a phishing-resistant account without having to
remember or manage a password.

**Why this priority**: This is the only way anyone gets onto the platform in production today —
without it, there is no real signup path (the dev-only session route is explicitly not a production
substitute).

**Independent Test**: Starting from no account, complete a passkey registration ceremony and confirm
a session is issued that resolves to a brand-new tenant, exactly like an existing dev-session-issued
session does from every other feature's point of view.

**Acceptance Scenarios**:

1. **Given** a visitor with no existing account, **When** they choose to sign up and complete their
   authenticator's passkey creation ceremony, **Then** a new tenant and user are created, a passkey
   credential is stored against that user, and a session is issued that immediately grants access to
   that tenant's (empty) data.
2. **Given** a visitor who abandons or cancels the passkey creation prompt partway through, **When**
   the ceremony doesn't complete, **Then** no tenant, user, or credential is created, and they can
   retry from a clean state.
3. **Given** a visitor who already completed registration once, **When** they attempt to register
   again with the exact same credential (e.g. retrying a request), **Then** the system does not
   create a second tenant/user for the same credential.

---

### User Story 2 - A returning user signs in with a passkey (Priority: P1)

As a returning user, I want to sign in with my passkey so I can get back to my data without typing a
password.

**Why this priority**: Equal priority to registration — a signup path with no matching sign-in path
is not a usable feature.

**Independent Test**: Register a passkey for a user, end that session, then start a fresh login
ceremony with the same passkey and confirm it resolves to the same user/tenant as before, not a new
one.

**Acceptance Scenarios**:

1. **Given** a user with a previously registered passkey, **When** they complete the authenticator's
   sign-in ceremony with that passkey, **Then** a new session is issued that resolves to their
   existing tenant — not a newly created one.
2. **Given** a user attempting to sign in, **When** the authenticator's response doesn't match any
   registered credential (wrong/foreign passkey, or a forged response), **Then** the system rejects
   the attempt without issuing a session and without revealing whether the underlying passkey exists
   for someone else.
3. **Given** a login ceremony that is started but not completed (cancelled, timed out), **When** no
   valid authenticator response ever arrives, **Then** no session is issued and the pending attempt
   eventually becomes unusable rather than remaining valid indefinitely.

---

### User Story 3 - A user with multiple devices registers a second passkey (Priority: P2)

As a user who already has an account, I want to register an additional passkey (a second device or
authenticator) so that losing or replacing one device doesn't lock me out of my account.

**Why this priority**: Real recovery/resilience value, but the account is still usable (via the
first passkey) without it — lower priority than the two flows that make the platform usable at all.

**Independent Test**: With an already-authenticated session, register a second passkey and confirm
signing in with either the first or the second passkey resolves to the same account.

**Acceptance Scenarios**:

1. **Given** an authenticated user with one registered passkey, **When** they complete a second
   passkey's registration ceremony, **Then** both passkeys are usable to sign in to the same account
   afterward.
2. **Given** an authenticated user, **When** they attempt to register a passkey that is already
   registered to a _different_ account, **Then** the system rejects the registration rather than
   moving the credential or creating any ambiguity about which account it belongs to.

### Edge Cases

- What happens if a registration or login challenge is replayed (the same server-issued challenge
  submitted twice)? The second attempt must be rejected — a challenge is usable exactly once.
- What happens if a registration or login ceremony's response arrives well after the challenge was
  issued? Stale challenges must be rejected, not accepted indefinitely.
- What happens when the same authenticator/passkey is presented for both "register" and "sign in" in
  confusing succession (e.g. a user hits register when they meant to sign in)? Registering an
  already-registered credential must fail clearly rather than silently doing something unexpected
  (see User Story 1, Scenario 3 and User Story 3, Scenario 2).
- How does this interact with the rate limiter from the session foundation? Registration and login
  are both write paths and must be throttled per the existing mechanism — an attacker attempting
  many registration or login ceremonies in a short window is slowed down the same way any other
  write endpoint is.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let a visitor with no account register using a passkey, creating exactly
  one new tenant and one new user for that registration.
- **FR-002**: System MUST issue a session (using the existing session mechanism) immediately upon
  successful registration, scoped to the newly created tenant.
- **FR-003**: System MUST let a user with at least one registered passkey sign in, issuing a session
  scoped to their existing tenant — never creating a new tenant for a returning user.
- **FR-004**: System MUST reject a login attempt whose authenticator response does not verify
  against a registered credential, without issuing a session and without indicating whether the
  problem was "no such credential" versus "invalid response."
- **FR-005**: System MUST allow a user to register more than one passkey against the same account.
- **FR-006**: System MUST reject an attempt to register a credential that is already registered (to
  the same or a different account) rather than creating a duplicate or reassigning it.
- **FR-007**: System MUST generate a fresh, single-use, time-bounded challenge for every
  registration and login ceremony, and MUST reject any attempt that reuses a challenge or whose
  challenge has expired.
- **FR-008**: System MUST verify the authenticator's cryptographic response against the
  server-issued challenge itself — a client-supplied claim of success is never sufficient on its
  own.
- **FR-009**: System MUST apply the existing write-path rate limiter to both the registration and
  login endpoints.
- **FR-010**: System MUST NOT create any tenant, user, or credential record for a registration
  ceremony that does not complete successfully.

### Key Entities

- **Passkey credential**: A WebAuthn credential registered by a user — an opaque public-key
  credential identifier plus the public key material needed to verify future login attempts. Belongs
  to exactly one user; a user may have more than one.
- **Ceremony challenge**: A short-lived, single-use value issued by the server at the start of a
  registration or login attempt, required to complete that attempt. Not a durable record — exists
  only for the lifetime of one in-progress ceremony.

_(Tenant, User, Session are the entities already defined in specs/001-tenant-session-foundation and
are not redefined here — this feature adds rows to them via the existing repository layer, plus the
new passkey-credential entity above.)_

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new visitor can complete registration and land in an authenticated, working session
  in a single passkey ceremony (one biometric/security-key prompt), with no password step.
- **SC-002**: A returning user can complete login and land back in their own tenant's data in a
  single passkey ceremony.
- **SC-003**: 100% of login attempts using a credential not registered to any account are rejected,
  and the rejection response is indistinguishable (from the client's perspective) between "no such
  credential" and "credential exists but response didn't verify."
- **SC-004**: 100% of attempts to reuse a previously-consumed or expired ceremony challenge are
  rejected.
- **SC-005**: A user who registers a second passkey can sign in successfully with either passkey
  afterward, in a test that never uses the first passkey again after the second is registered.

## Assumptions

- Passkey/WebAuthn is a client capability assumption: the feature targets browsers and platforms
  with functioning WebAuthn support (all evergreen desktop and mobile browsers as of v1's launch
  window). No fallback for browsers without WebAuthn support is in scope here — that's what magic
  link (#6) and Google OIDC (#7) are for, as alternative primary methods a user can choose instead.
- "Register" in this spec always means "create a brand-new tenant" (User Story 1) or "add a passkey
  to my own already-authenticated account" (User Story 3) — registering a passkey against a
  _different existing_ account while unauthenticated (i.e. account recovery/takeover) is not a flow
  this feature provides; that class of problem belongs to account-linking (#8) or a future
  account-recovery spec.
- Ceremony challenges are short-lived server-side state, not part of the durable schema this
  feature's data-model needs to justify a GDPR erasure decision for (they expire and disappear
  regardless of any user action) — unlike sessions/tenants/users from specs/001, which already have
  that decision recorded.
