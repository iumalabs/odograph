# Feature Specification: Tenant-Scoped Repository Layer & Session Foundation

**Feature Branch**: `001-tenant-session-foundation`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Tenant-scoped repository layer & session foundation (GitHub issue #4,
milestone M1: Auth & Tenancy foundation). Foundational feature every other v1 feature depends on: D1
schema for tenants/users/sessions, a repository layer that injects tenant_id from the session so
handlers can never reach D1 directly, session cookie handling, and general write-path rate limiting.
Explicitly excludes passkeys/magic-link/OIDC/login UI/account linking, which are separate specs."

## User Scenarios & Testing _(mandatory)_

<!--
  This feature has no end-user-facing screen of its own — it is the isolation and session
  guarantee that every future user-facing feature (vehicles, service records, fuel records...)
  is built on top of. The "user" here is the eventual end user of those future features,
  described through the guarantee this feature gives them, plus the operator who deploys the
  system. There is no login UI yet (that's issues #5-#7); this spec proves the guarantees using
  a minimal, non-production session-issuing mechanism.
-->

### User Story 1 - No user's data is ever visible to another tenant (Priority: P1)

As an end user of an Odograph deployment, when I'm signed in, I only ever see my own vehicles,
service records, and every other piece of data I've created — never another tenant's data — no
matter what a client sends in a request.

**Why this priority**: This is the core promise a multi-tenant SaaS makes to every user. Every other
v1 feature (vehicles, service records, fuel records, reminders) is data that must be tenant-isolated
the moment it's built; if this guarantee isn't structurally enforced first, every feature built
afterward inherits the risk of a cross-tenant data leak.

**Independent Test**: Provision two tenants with a session each. Have tenant A's session issue a
read for a resource id that belongs to tenant B (a resource id it could plausibly guess or reuse
from its own session, e.g. a small sequential id). Confirm the response behaves as if the resource
doesn't exist for tenant A, in every route that touches persisted data — this is testable today via
a placeholder resource created purely to prove isolation, ahead of any real feature routes existing.

**Acceptance Scenarios**:

1. **Given** two tenants A and B each with an active session, **When** tenant A requests a resource
   that exists but belongs to tenant B, **Then** the system responds as though the resource does not
   exist (no data, no confirmation the id is valid for another tenant).
2. **Given** an active session for tenant A, **When** a request includes a tenant or owner
   identifier in its body, query string, or headers that differs from tenant A's own session,
   **Then** the system ignores the client-supplied identifier entirely and scopes the request to
   tenant A — the client-supplied value has no effect on which tenant's data is read or written.
3. **Given** no session (anonymous request), **When** a request is made to any endpoint that reads
   or writes tenant data, **Then** the system rejects the request before any tenant data is touched.

---

### User Story 2 - A session reliably identifies who's asking, safely (Priority: P2)

As an end user, once I'm signed in (by whatever method — a later feature), my session keeps working
across requests without exposing my credentials to scripts on the page or to other sites, and stops
working once it's no longer valid.

**Why this priority**: Session handling is the mechanism every login method (passkey, magic link,
OIDC — all separate specs) plugs into. Getting the cookie contract right once, here, means every
login method spec can assume it instead of re-deciding it.

**Independent Test**: Issue a session via the minimal dev/test session-issuing mechanism this spec
provides (not a real login), inspect the resulting cookie's attributes directly, and confirm
requests using that cookie resolve to the correct tenant while requests after the session is
invalidated do not.

**Acceptance Scenarios**:

1. **Given** a newly issued session, **When** the resulting cookie is inspected, **Then** it is
   marked HttpOnly, Secure, and SameSite=Lax.
2. **Given** a valid session cookie, **When** a request is made to a tenant-scoped endpoint,
   **Then** the request resolves to the correct tenant without any other credential being supplied.
3. **Given** a session that has been invalidated (logged out or expired), **When** a request is made
   using that session's cookie, **Then** the system treats the request as anonymous and rejects it
   the same way User Story 1's Scenario 3 does.

---

### User Story 3 - Write endpoints resist abusive request volume (Priority: P3)

As the operator of an Odograph deployment, I want write requests throttled per session/client so
that a single compromised session, buggy client, or scripted abuse attempt can't hammer the database
or exhaust resources shared by every tenant.

**Why this priority**: Lower priority than isolation and session correctness because it's a
resilience property, not a correctness-or-data-leak property — but it needs to exist before any
feature adds its own write endpoints, or every feature spec ends up re-solving it individually.

**Independent Test**: Send write requests against a placeholder write endpoint faster than the
configured limit using a single session, and confirm requests beyond the limit are rejected without
touching the database, while requests from a different session are unaffected.

**Acceptance Scenarios**:

1. **Given** a session issuing write requests at a normal pace, **When** requests stay under the
   configured limit, **Then** every request is processed normally.
2. **Given** a session issuing write requests faster than the configured limit, **When** the limit
   is exceeded, **Then** further requests from that session are rejected with a response that
   identifies the request was throttled, and no database write occurs for the rejected requests.
3. **Given** one session is being throttled, **When** a different, unrelated session issues write
   requests, **Then** that session is unaffected by the first session's throttling.

### Edge Cases

- What happens when a session's referenced tenant or user row no longer exists (e.g. deleted between
  session issuance and use)? The system must treat the session as invalid rather than erroring or
  resolving to a null tenant.
- What happens when two requests using the same session arrive concurrently? Both must resolve to
  the same tenant; neither may observe or affect the other tenant's data.
- What happens when a request supplies a well-formed but entirely fabricated session cookie value
  (not derived from any real session)? The system must reject it as anonymous, not throw an
  unhandled error.
- How does the system behave for a deployment with exactly one tenant (self-host, D-001)?
  Identically to a multi-tenant deployment — there is no separate single-tenant code path, so these
  same scenarios apply unchanged.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST resolve every request's tenant scope from the session only — never from a
  client-supplied value (body, query string, header, or path parameter).
- **FR-002**: System MUST make it structurally impossible for a request handler to query persisted
  data without going through the tenant-scoping mechanism (i.e., there is no supported path from a
  handler to the database that bypasses tenant scoping).
- **FR-003**: System MUST respond to requests for another tenant's resource as though that resource
  does not exist, without revealing whether the id is valid for a different tenant.
- **FR-004**: System MUST reject any request to a tenant-scoped endpoint that has no valid session,
  before any tenant data is read or written.
- **FR-005**: System MUST issue session cookies marked HttpOnly, Secure, and SameSite=Lax.
- **FR-006**: System MUST be able to invalidate a session (logout and expiry) such that subsequent
  requests using that session's cookie are treated as anonymous.
- **FR-007**: System MUST throttle write requests per session against a configurable limit,
  rejecting requests over the limit without performing the underlying write.
- **FR-008**: System MUST treat a session referencing a since-deleted user or tenant as invalid
  rather than resolving to a null or default tenant.
- **FR-009**: System MUST provide a non-production mechanism for issuing a session for local
  development and automated testing, clearly distinguished from — and impossible to reach in — a
  production deployment, since no real login method exists yet in this feature.
- **FR-010**: System MUST apply the same tenant-scoping and session behavior identically whether the
  deployment has one tenant (self-host) or many (D-001) — no separate code path per deployment
  shape.

### Key Entities

- **Tenant**: The isolation boundary. Every piece of persisted data in the system belongs to exactly
  one tenant. A self-hosted deployment has exactly one tenant; a hosted deployment has many.
- **User**: A person who can sign in. Belongs to exactly one tenant. (Login-method-specific
  credentials — passkey, magic-link, OIDC — are added by later specs; this feature only needs a user
  to exist and belong to a tenant.)
- **Session**: Represents "this request is being made by this user." Referenced by an opaque cookie
  value on the client side; resolves server-side to a user, and through the user, to a tenant. Has a
  validity window and can be explicitly invalidated.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a two-tenant test, 100% of cross-tenant read/write attempts against another
  tenant's data are denied, regardless of what identifier the client supplies.
- **SC-002**: 100% of persisted-data-touching requests in the codebase go through the tenant-scoping
  mechanism — verifiable by inspection (no route handler imports a database client directly).
- **SC-003**: A request with no session, an expired session, or a fabricated session cookie is
  rejected in under the same response time budget as a valid request (no timing side-channel that
  distinguishes "invalid session" from "valid session, empty result").
- **SC-004**: A session issued through the minimal dev/test mechanism behaves identically, from
  every downstream feature's point of view, to a session that will later be issued by a real login
  method — no future auth-method spec needs to change this feature's session or tenant-scoping
  contract to plug in.

## Assumptions

- No real login method (passkey, magic link, OIDC) exists yet; those are separate specs (issues #5,
  #6, #7) that will each issue sessions through the mechanism this feature defines. This feature's
  own session-issuing mechanism is a development/testing stand-in only, not exposed in production.
- "Rate limiting on write paths" in this feature means a general, reusable throttling mechanism
  keyed by session — auth-endpoint-specific rate limiting (login attempts, magic-link requests) is
  the responsibility of each login-method spec, which will apply this same mechanism to its own
  endpoints.
- Account linking, roles/permissions beyond "belongs to a tenant," and any UI are out of scope —
  this feature is server-side plumbing plus the minimal dev/test session-issuing mechanism needed to
  prove it.
