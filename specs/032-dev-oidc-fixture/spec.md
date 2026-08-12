# Feature Specification: Dev-Only Google OIDC Fixture Sign-In Endpoint

**Feature Branch**: `032-dev-oidc-fixture`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Dev-only Google OIDC fixture sign-in endpoint (GitHub issue #96) —
unblocks e2e OIDC coverage. Joint QA/dev decision. The real Google callback route is irreducibly
coupled to a live network call to Google, so e2e cannot drive it. Decided approach: a dev-only
endpoint that completes a Google sign-in using a locally-signed fixture ID token instead of a real
one, exercising the exact same account-resolution logic the real callback route uses, differing
only in which JWKS source is trusted. Existing, already-tested local-signing machinery moves from
tests/ into src/ so the running dev server can reach it. On success, sets the session cookie and
redirects exactly like the real callback does, so the outcome is indistinguishable from the
browser's side — unblocking e2e client-side coverage of the OIDC-completion UI path. Gated
production-inert via the existing dev-only-route pattern. Sign-in path only, not account linking."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An automated test completes a Google sign-in without a real Google account (Priority: P1)

An automated test (or a developer manually verifying the flow) needs to reach the
"signed in via Google" state — the same state a real user reaches after a real Google consent
screen — without any real Google account, credentials, or network interaction, so it can verify
what the app does once that state is reached.

**Why this priority**: This is the feature's entire purpose. Without it, there is nothing to ship.

**Independent Test**: Can be fully tested by calling the new endpoint with a chosen identity (an
email address) in a non-production environment and confirming the result is a signed-in session —
a session cookie is issued and the caller lands on the same success state the real Google callback
route produces.

**Acceptance Scenarios**:

1. **Given** a non-production environment, **When** the new endpoint is called with an email
   address that has never signed in before, **Then** a new account is created for that identity and
   a working session is issued, exactly as if that person had just completed a real first-time
   Google sign-in.
2. **Given** a non-production environment, **When** the new endpoint is called again with the same
   email address, **Then** the same existing account is resolved (not a duplicate) and a working
   session is issued, exactly as a real returning Google sign-in would.
3. **Given** a session issued by this endpoint, **When** the caller makes an authenticated request
   using it, **Then** the request succeeds exactly as it would with a session from any real sign-in
   method.

---

### User Story 2 - The endpoint does not exist in production (Priority: P1)

An operator of a production deployment needs this test-only capability to have zero production
footprint — no way to sign in as an arbitrary identity by bypassing real Google authentication.

**Why this priority**: Equal priority to User Story 1. This endpoint is, by construction, a way to
mint a valid session for any email without proving control of it — if this existed in production it
would be a complete authentication bypass. This is not a hardening pass on top of an otherwise
useful production feature; it is the condition that makes building this feature at all acceptable.

**Independent Test**: Can be fully tested by confirming that, in a production-configured
environment, the endpoint responds identically to a URL that was never registered — no
distinguishing status, no session issued, no work performed first.

**Acceptance Scenarios**:

1. **Given** the application is running in its production configuration, **When** any request is
   made to this endpoint with any input, **Then** the response is indistinguishable from requesting
   a URL that does not exist, and no account resolution or session issuance occurs.

---

### Edge Cases

- What happens if the caller supplies no identity at all? The request is rejected before any
  account resolution happens — no session is issued for an unspecified identity.
- What happens if the same identity is used concurrently by two callers (e.g. two test runs racing)?
  Both resolve to the same account and each gets a valid, independent session — the same behavior
  the real sign-in path already has for this case.
- What happens if this endpoint is called for an identity that already signed in through the real
  Google flow in the past? The same account is resolved — there is exactly one account per identity
  regardless of which path (real or fixture) most recently signed in to it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: In a non-production environment, the system MUST provide an endpoint that, given an
  identity (at minimum an email address), completes a sign-in and issues a working session for that
  identity — without any real external identity-provider interaction.
- **FR-002**: A sign-in completed through this endpoint MUST resolve to the same account on repeat
  use with the same identity, never creating a duplicate account.
- **FR-003**: A session issued by this endpoint MUST be usable for authenticated requests exactly
  as a session from any other sign-in method is.
- **FR-004**: The outcome of a successful call — from the caller's perspective — MUST be
  indistinguishable from the outcome of a real, successful sign-in through the equivalent real flow.
- **FR-005**: In a production configuration, the endpoint MUST respond identically to a
  non-existent route — no distinguishing status code, no account resolution, no session issuance,
  regardless of the input supplied.
- **FR-006**: The endpoint MUST NOT require any secret, API key, or toggle to be provisioned,
  remembered, or rotated to keep it disabled in production — its inertness must follow from the
  deployment's own environment configuration alone.
- **FR-007**: A request with no identity supplied MUST be rejected without issuing a session.
- **FR-008**: This feature covers only the sign-in path (reaching the "signed in via Google" state);
  it does not need to cover the separate account-linking flow.

### Key Entities

No new entities. This feature reaches the same account/session state the real sign-in flow already
produces, using the same underlying resolution logic — it adds no new data shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An automated test can reach a fully signed-in state for a chosen identity, entirely
  through HTTP calls, with no manual step and no real external identity-provider interaction
  involved.
- **SC-002**: In a production configuration, this capability adds no observable behavior, latency,
  or authentication-bypass risk versus the endpoint not existing at all.
- **SC-003**: Signing in twice with the same identity through this endpoint never produces two
  accounts for that identity.

## Assumptions

- This endpoint is consumed by the project's own e2e test suite going forward, but wiring that
  consumption up is explicitly out of scope for this feature — this feature only adds the endpoint
  itself (same division of labor as the prior magic-link dev endpoint).
- The underlying account-resolution logic this endpoint drives is trusted as-is and unchanged by
  this feature; this feature's own new tests cover the new endpoint and its production-inertness,
  not a re-verification of already-tested resolution logic.
- "Development configuration" and "production configuration" are determined the same way the
  existing dev-only routes already determine it — no new environment/configuration concept is
  introduced.
- Only the sign-in path is in scope; the account-linking path (attaching this identity type to an
  already-signed-in account) is out of scope, per the source decision.
