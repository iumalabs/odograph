# Feature Specification: Google OIDC Authentication

**Feature Branch**: `004-google-oidc-authentication`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Google OIDC authentication (issue #7): add Google as a third sign-in
method alongside passkeys and magic-link, using the OAuth 2.0 / OpenID Connect authorization code
flow. One provider (Google) at launch, but the config/data shape must allow adding more OIDC
providers later without a schema change (D-003, locked decision). Same D-004 constraint as
magic-link: never auto-link an OIDC identity to an existing account by matching email — a Google
sign-in for an email already used by a passkey or magic-link account must create its own distinct
account unless the user explicitly links it (issue #8, separate future feature). Session issuance,
cookie shape, and tenant creation must match the existing passkey/magic-link pattern exactly."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A new visitor signs up with their Google account (Priority: P1)

As a new visitor with no Odograph account, I want to sign up using my existing Google account
instead of creating a passkey or waiting on an email, so I can start using the app with one click
using an identity provider I already trust and am signed into.

**Why this priority**: Google sign-in is the lowest-friction entry point for visitors who don't want
to set up a passkey and don't want to wait for an email — without it, those visitors have strictly
fewer options than the spec's locked-in decision (D-003) requires at launch.

**Independent Test**: Starting from no account and no cookies, complete the Google consent flow with
a Google account never seen by this system before, and confirm a session is issued that resolves to
a brand-new tenant.

**Acceptance Scenarios**:

1. **Given** a visitor with no existing account, **When** they choose to continue with Google and
   complete Google's consent screen, **Then** a new tenant, user, and Google identity record are
   created, and a session is issued that immediately grants access to that tenant's (empty) data.
2. **Given** a visitor who starts the Google consent flow, **When** they cancel or deny consent on
   Google's screen instead of approving it, **Then** no tenant, user, or identity record is created,
   and they land back in a state where they can retry or choose a different sign-in method.
3. **Given** a visitor who completes the Google consent flow, **When** the identity provider's
   response can't be verified as genuinely coming from Google for this app (a forged or replayed
   callback), **Then** the system rejects the attempt without issuing a session.

---

### User Story 2 - A returning user signs in with the same Google account (Priority: P1)

As a returning user who signed up with Google, I want to sign in again with the same Google account
so I get back to my own data, not a new empty account.

**Why this priority**: Equal priority to signup — a signup path with no matching, stable sign-in path
is not a usable feature.

**Independent Test**: Complete a Google signup, end that session, then start a fresh Google sign-in
with the same Google account and confirm it resolves to the same tenant as before, not a new one.

**Acceptance Scenarios**:

1. **Given** a user who previously signed up with a specific Google account, **When** they complete
   the Google consent flow again with that same account, **Then** a new session is issued that
   resolves to their existing tenant — never a newly created one.
2. **Given** two different people who each have their own Google account that happens to share the
   same email address as someone else's passkey or magic-link account (e.g. a Google Workspace alias
   or a coincidental match), **When** either signs in with Google, **Then** the system creates or
   resolves a Google-specific identity rather than ever signing them into the other, differently
   authenticated account (D-004).

---

### User Story 3 - Adding a second OIDC provider later requires no schema change (Priority: P3)

As the project maintainer, I want the data model and configuration for "an OIDC identity" to already
be provider-agnostic, so adding a second provider (e.g. a future non-Google option) later is a
configuration change, not a migration.

**Why this priority**: Real but deferred value — Google alone satisfies D-003 for launch; this only
matters once a second provider is actually requested, so it doesn't block or gate the other two
stories.

**Independent Test**: Inspect the identity record's shape and confirm it stores which provider
issued it alongside the provider-scoped subject identifier, rather than assuming "Google" anywhere
in the schema, route path, or unique-key design.

**Acceptance Scenarios**:

1. **Given** the OIDC identity data model as implemented for Google, **When** a reviewer reads its
   schema, **Then** nothing in the table or column names, constraints, or repository function
   signatures hard-codes "Google" as opposed to storing it as a data value.

### Edge Cases

- What happens if Google's consent flow is started but the callback never arrives (user closes the
  tab, network failure)? No session, tenant, user, or identity record must be created — same
  no-partial-state guarantee as passkey registration and magic-link's request step.
- What happens if the state/anti-CSRF value issued at the start of the flow doesn't match what comes
  back on the callback? The attempt must be rejected before any account lookup or creation happens.
- What happens if Google's ID token reports an unverified email (`email_verified: false`)? The
  system must not treat that email as a trustworthy identifier for anything — the identity is still
  keyed by Google's stable subject id, never by the email value alone.
- How does this interact with the existing rate limiter? The callback/token-exchange step is a write
  path and must be throttled per the existing mechanism, same as every other auth write endpoint.
- What happens if the same Google account is used to sign in from two different browsers at once
  during initial signup (a race)? Exactly one tenant must be created for that Google subject id, not
  two — the same single-creation guarantee passkey's registration and magic-link's verify already
  provide for their respective identities.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let a visitor with no account sign up by completing Google's OAuth
  2.0/OpenID Connect consent flow, creating exactly one new tenant and one new user for that Google
  account's first sign-in.
- **FR-002**: System MUST issue a session (using the existing session mechanism, identical cookie
  shape to passkey and magic-link) immediately upon a successful new signup, scoped to the newly
  created tenant.
- **FR-003**: System MUST let a user who previously signed up with a given Google account sign in
  again with that same account, issuing a session scoped to their existing tenant — never creating a
  new tenant for a returning Google identity.
- **FR-003a**: System MUST resolve "does this Google identity already have an account" by looking up
  a dedicated Google-identity record keyed by Google's stable subject identifier, never by matching
  `users.email` — an email match against an account created by a different sign-in method (passkey,
  magic-link) MUST NOT cause the system to sign into that other account (D-004). A Google sign-in for
  an email already in use by a different method's account creates its own distinct account.
- **FR-004**: System MUST verify the OAuth 2.0 state parameter (or equivalent anti-CSRF mechanism)
  issued at the start of the flow against what the callback returns, and MUST reject the callback if
  they don't match, without issuing a session or creating any record.
- **FR-005**: System MUST validate the identity provider's token response (signature, issuer,
  audience, expiry) before treating any claim in it as authoritative, rather than trusting an
  unverified claim from the callback request.
- **FR-006**: System MUST NOT create any tenant, user, or identity record for a sign-in attempt that
  does not complete successfully (consent denied, callback never arrives, verification fails).
- **FR-007**: System MUST apply the existing write-path rate limiter to the callback/token-exchange
  endpoint.
- **FR-008**: System's data model for an OIDC identity MUST record which provider issued it (not
  assume a single hard-coded provider), so a second provider can be added later via configuration and
  data, not a schema migration.
- **FR-009**: System MUST NOT treat an identity provider's reported email as a trusted, sufficient
  identifier on its own for account resolution — the stable provider-scoped subject id is the
  resolution key (FR-003a); the email is stored only as account contact info, same role it plays for
  passkey and magic-link accounts.

### Key Entities

- **OIDC identity**: A link between one user and one identity-provider account, keyed by the
  provider's stable subject identifier (never the email). Provider-agnostic in shape (FR-008) even
  though only Google is configured at launch. Belongs to exactly one user.
- **Authorization request state**: A short-lived, single-use anti-CSRF value issued when a visitor
  starts the Google consent flow, required to accept the matching callback. Not a durable record —
  exists only for the lifetime of one in-progress sign-in attempt, the same role
  `webauthn_challenges` plays for passkey ceremonies.

_(Tenant, User, Session are the entities already defined in specs/001-tenant-session-foundation and
are not redefined here.)_

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new visitor can go from "no account" to "authenticated in their own tenant" using
  only Google's consent screen — no additional form fields collected by this app.
- **SC-002**: A returning user signing in with the same Google account always lands in the same
  tenant they signed up with, in a test that repeats the flow at least twice.
- **SC-003**: 100% of callback attempts with a missing or mismatched anti-CSRF state value are
  rejected before any account lookup or creation occurs.
- **SC-004**: 100% of Google sign-ins for an email already registered via passkey or magic-link
  result in a distinct tenant from that other account — verified by a test that seeds a
  differently-authenticated account first.
- **SC-005**: The OIDC identity schema requires zero migration to add a second provider — verified by
  a reviewer confirming provider is a stored value, not implied by table/column naming.

## Assumptions

- Only Google is configured in v1 (D-003); the "provider-agnostic shape" requirement (FR-008, User
  Story 3) is about not closing the door on more providers, not about shipping a second one now.
- The OAuth 2.0 Authorization Code flow (not the implicit flow, which Google itself deprecates) is
  the mechanism — this is an industry-standard default for a server-rendered/SPA-with-backend app
  like this one, not something the feature description left ambiguous enough to need a clarification
  question.
- Linking a Google identity to an already-authenticated user's *existing* account (so one person can
  use either their passkey and Google interchangeably) is out of scope here — that's issue #8,
  account-linking rules, a separate future feature, same boundary passkey's spec drew around its own
  User Story 3 versus account-linking.
- Google's OAuth client credentials (client id/secret) are configuration/secrets, not something this
  spec defines the value of — provisioning a real Google Cloud OAuth consent screen/client is an
  external, one-time setup action outside this repository, analogous to Cloudflare Email Sending
  being an external dependency for magic-link.
- Authorization request state is short-lived server-side state, not part of the durable schema that
  needs its own GDPR erasure decision — same reasoning as WebAuthn's ceremony challenges and
  magic-link's tokens.
