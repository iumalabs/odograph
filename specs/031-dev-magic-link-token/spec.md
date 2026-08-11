# Feature Specification: Dev-Only Magic-Link Token Retrieval Endpoint

**Feature Branch**: `031-dev-magic-link-token`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Dev-only magic-link token retrieval endpoint (GitHub issue #93).
Add a dev/test-only HTTP endpoint that retrieves a pending magic-link token by email, so the e2e
suite can complete a magic-link sign-in flow end-to-end without a real inbox. Purely wiring an
already-existing, already-tested repository function (findMagicLinkTokenByEmail) to a new HTTP
route — no new business logic, no schema change. The route must be completely inert outside
development, reusing the existing notFoundOutsideDev pattern. Read-only: never creates,
invalidates, or consumes a token."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An automated test completes a magic-link sign-in without a real inbox (Priority: P1)

An automated test (or a developer manually verifying the flow) requests a magic-link sign-in for a
known email address, then needs to retrieve the token that would normally have been emailed, so it
can complete the sign-in by "clicking" the link (calling the verify endpoint with that token) —
all without access to a real mailbox.

**Why this priority**: This is the feature's entire purpose. Without it, there is nothing to ship.

**Independent Test**: Can be fully tested by requesting a magic link for an email in a
non-production environment, retrieving the pending token for that email via the new endpoint, and
confirming it matches a token that successfully completes sign-in via the existing verify endpoint.

**Acceptance Scenarios**:

1. **Given** a magic-link sign-in has just been requested for an email address, **When** the token
   for that email is retrieved via the new endpoint, **Then** the response includes the token value
   and its expiry.
2. **Given** no magic-link sign-in has ever been requested for an email address (or any prior token
   for it has since been consumed or expired and not replaced), **When** the token is requested for
   that email, **Then** the response clearly indicates no pending token exists.
3. **Given** a token retrieved via this endpoint, **When** it's submitted to the existing
   verification flow, **Then** sign-in completes exactly as it would have if the owner had clicked
   the real emailed link.

---

### User Story 2 - The endpoint does not exist in production (Priority: P1)

An operator of a production deployment needs this test-only capability to have zero footprint on
production — no way to enumerate whether any address has a pending sign-in token, no additional
attack surface, no runtime cost.

**Why this priority**: Equal priority to User Story 1 — a test convenience that leaked into
production would let an attacker check for or hijack a pending sign-in token by email address
alone, a real security regression. This is not a "nice to have" hardening pass, it's the condition
that makes User Story 1 acceptable to ship at all.

**Independent Test**: Can be fully tested by confirming that, in a production-configured
environment, the endpoint responds identically to a URL that was never registered at all (a plain
"not found" response, no distinguishing behavior, no extra latency from a database lookup).

**Acceptance Scenarios**:

1. **Given** the application is running in its production configuration, **When** any request is
   made to this endpoint (with a valid email, an invalid email, or nothing at all), **Then** the
   response is indistinguishable from requesting a URL that does not exist, and no database lookup
   or other work occurs first.

---

### Edge Cases

- What happens if a magic-link token was already retrieved once via this endpoint but hasn't been
  consumed yet? It's still retrievable — retrieval does not invalidate or consume the token (only
  the existing verify flow consumes it). Retrieving the same pending token twice returns the same
  value both times.
- What happens if the email has pending tokens from more than one source (e.g. a sign-in request
  and a linking request)? Per the existing token-creation behavior, a new token request for an
  email replaces any prior outstanding token for that email — there is at most one pending token
  per email at any time, so retrieval is unambiguous.
- What happens if the email query value is missing or malformed? Treated the same as "no pending
  token for this email" — a clear not-found response, not a server error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an HTTP endpoint that, given an email address, returns the
  currently pending magic-link token and its expiry for that email, if one exists.
- **FR-002**: The endpoint MUST indicate clearly, without erroring, when no pending token exists for
  the given email (never requested, already consumed, or expired).
- **FR-003**: The endpoint MUST NOT create, invalidate, extend, or consume any token — it is
  strictly read-only; every existing token lifecycle operation continues to happen only through the
  existing request/link/verify routes.
- **FR-004**: In a production configuration, the endpoint MUST respond identically to a
  non-existent route — no distinguishing status code, no timing difference from a database lookup,
  no information disclosure of any kind.
- **FR-005**: The endpoint MUST NOT require any secret, API key, or toggle to be provisioned,
  remembered, or rotated to keep it disabled in production — its inertness must follow from the
  deployment's own environment configuration alone.
- **FR-006**: A token retrieved via this endpoint MUST be usable to complete sign-in through the
  existing verification flow, exactly as a token from a real email would be.

### Key Entities

No new entities. This feature reads the existing pending-magic-link-token record (already modeled
by the existing token-issuance feature) without adding, changing, or removing any of its fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An automated test can go from "request a magic-link sign-in" to "signed in" for a
  given email, entirely through HTTP calls, with no manual step and no real email delivery involved.
- **SC-002**: In a production configuration, this capability adds no observable behavior, latency,
  or information disclosure versus the endpoint not existing at all.
- **SC-003**: A request for an email with no pending token behaves identically (in status and
  clarity) whether the email is well-formed, malformed, or entirely absent from the request.

## Assumptions

- This endpoint is consumed by the project's own e2e test suite going forward, but wiring that
  consumption up is explicitly out of scope for this feature — this feature only adds the endpoint
  itself.
- The existing repository-layer function backing this feature is trusted as-is; this feature does
  not change its behavior or add new tests for it, only new tests for the HTTP route wrapping it.
- "Development configuration" and "production configuration" are determined the same way the
  existing dev-only session-issuing routes already determine it — no new environment/configuration
  concept is introduced.
