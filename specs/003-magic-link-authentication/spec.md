# Feature Specification: Magic Link Authentication

**Feature Branch**: `003-magic-link-authentication`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Magic link authentication (GitHub issue #6, milestone M1, decision
D-003). Second sign-in method alongside passkeys (#5, merged) — email-based, no password. Plugs into
the existing session foundation (specs/001) and follows the same registration/login split passkeys
established (specs/002): a new visitor with no account can register via magic link, an existing user
can log in via magic link, both ending in the same session mechanism. Uses Cloudflare Email Sending
(Workers send_email binding) to deliver the link. Out of scope: Google OIDC (#7), account linking
rules (#8)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A visitor signs up or signs in with just their email (Priority: P1)

As a visitor, I want to enter my email and receive a link that signs me in — no password, no
passkey-capable device required — so I have a sign-in option that works from any device with access
to my email.

**Why this priority**: Magic link is the fallback for anyone who can't or doesn't want to use a
passkey (D-003 names it as the second method); without it, users without WebAuthn support have no
way onto the platform.

**Independent Test**: Submit an email address, retrieve the resulting link's token (via a test-only
hook, not a real inbox), follow it, and confirm a session is issued — for a new email, a new tenant
is created; for an email already associated with an account, the existing tenant is used.

**Acceptance Scenarios**:

1. **Given** a visitor submits an email address that has never signed up via magic link before,
   **When** they follow the link they receive, **Then** a new tenant and user are created for that
   email and a session is issued for it.
2. **Given** a visitor submits an email address that has previously signed up via magic link,
   **When** they follow the link they receive, **Then** a session is issued for that _same_ tenant —
   no second tenant is created for a repeat magic-link sign-in with the same email.
3. **Given** a visitor submits an email address, **When** they follow the link a second time after
   already using it once, **Then** the second attempt is rejected — a link is usable exactly once.
4. **Given** a visitor submits an email address, **When** they never follow the link, **Then** no
   session is ever issued from that request, and the link stops working after a bounded amount of
   time.
5. **Given** an email address that already has an account created through a _different_ sign-in
   method (e.g. passkey, specs/002), **When** that same email is used to request a magic link,
   **Then** the system does not sign the visitor into that other account — accounts are never
   auto-linked by matching email (D-004). This produces a second, separate account for the same
   email until the visitor explicitly links the methods while authenticated (a future feature, issue
   #8) — surprising in isolation, but the deliberate, spec'd behavior, not an oversight.

---

### User Story 2 - A malicious or mistaken request doesn't leak account existence (Priority: P2)

As the operator of an Odograph deployment, I want submitting an email address to behave identically
whether or not that email is already registered, so the sign-in flow doesn't become a tool for
discovering who has an account.

**Why this priority**: A real security property, but the platform is still usable without it being
airtight on day one (lower priority than the core flow working) — still important enough to spec
explicitly rather than leave as an accident of implementation.

**Independent Test**: Submit a never-used email and a known-registered email through the request
endpoint; confirm both produce the same response shape and timing profile, with the difference only
observable by whoever receives the resulting email (a new-account link vs. a login link).

**Acceptance Scenarios**:

1. **Given** any syntactically valid email address, **When** a magic-link request is submitted,
   **Then** the response is identical regardless of whether that email is already registered.
2. **Given** an email request is submitted, **When** the address happens to be malformed or empty,
   **Then** the system rejects it before attempting to send anything, with a response that doesn't
   depend on whether some _other_ valid-looking variant of that address exists as an account.

### Edge Cases

- What happens if the same email address requests a new link before an earlier one expires? The
  earlier link must stop working once a new one is issued — at most one usable link per email at a
  time, so an attacker who intercepts an old email can't use it after the user requests a fresh one.
- What happens if the link is followed from a different browser/device than it was requested from?
  Must still work — magic links are inherently cross-device (that's the point of emailing them) — no
  session/cookie state is assumed to carry over from the request step.
- What happens under rapid repeated requests for the same or different email addresses? Must be
  rate-limited the same way every other write path in this project is (constitution Principle VII;
  established pattern from specs/001/002).
- What happens if Cloudflare Email Sending itself fails or is rate-limited by the provider? The
  request must fail visibly (not silently claim success while no email goes out) in a way that still
  doesn't leak whether the address was registered (User Story 2).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let a visitor request a sign-in link for a given email address.
- **FR-002**: System MUST, when a submitted email has never signed up via magic link before, create
  exactly one new tenant and one new user for it — but only once the link is actually followed, not
  at request time (mirrors passkey registration's FR-010-equivalent: nothing is created for an
  abandoned request). This check is scoped to magic link's own prior use of the email, not to
  whether that email exists anywhere else in the system (FR-003a).
- **FR-003**: System MUST, when a submitted email has previously signed up via magic link, issue a
  session for that same tenant when the link is followed — never create a second tenant for a repeat
  magic-link sign-in with the same email.
- **FR-003a**: System MUST NOT treat an email's use by a _different_ sign-in method (e.g. an
  existing passkey account's email) as a match for FR-002/FR-003's "already used" check — accounts
  are never auto-linked by matching email (D-004). A magic-link request for an email already used by
  another method creates its own, separate account.
- **FR-004**: System MUST generate a single-use, time-bounded link token per request, and MUST
  reject any attempt to follow a link whose token has already been used or has expired.
- **FR-005**: System MUST invalidate a previously issued, still-unused link for an email address
  when a new link is requested for that same address — at most one usable link per email.
- **FR-006**: System MUST respond identically to a magic-link request regardless of whether the
  submitted email is already registered (User Story 2).
- **FR-007**: System MUST apply the existing write-path rate limiter to the link-request endpoint.
- **FR-008**: System MUST send the link via Cloudflare Email Sending, and MUST surface a failure to
  send (e.g. provider rate limit) as a visible error to the requester — without revealing whether
  the failure was related to the address being registered or not.
- **FR-009**: System MUST issue a session (via the existing session mechanism) immediately upon
  successfully following a valid, unused, unexpired link.

### Key Entities

- **Magic-link identity**: Records that a given email address has an account reachable via magic
  link, and which user it maps to. Scoped to this sign-in method only (FR-003a) — the same shape of
  thing `webauthn_credentials` is for passkeys (specs/002): a per-method identity record, not a
  global email index. A magic-link request checks _this_ record, not the shared `users` table's
  email column, to decide "new" vs. "existing."
- **Magic link token**: A single-use, time-bounded value tied to one pending request for one email
  address, sent as part of a URL in the delivered email. Not itself an account — following it either
  creates a new magic-link identity (+ tenant + user) or authenticates an existing one, per User
  Story 1.

_(Tenant, User, Session are unchanged from specs/001.)_

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new visitor can go from submitting their email to an authenticated session in two
  steps (submit email, follow link) with no other input required.
- **SC-002**: A returning user's magic link always resolves to their existing tenant, verified
  across repeated requests for the same email.
- **SC-003**: 100% of attempts to reuse a consumed or expired link token are rejected.
- **SC-004**: 100% of link-request responses are indistinguishable between a registered and an
  unregistered email address, including response timing within normal variance.
- **SC-005**: Requesting a new link for an email invalidates that email's previous unused link in
  100% of cases tested.

## Assumptions

- "Follow the link" means an HTTP GET to a URL containing the token, consistent with how email links
  normally work (no JavaScript/fetch step required from the email client itself) — the actual
  session issuance can still happen via a redirect to a client-side completion step if needed for
  cookie-setting reasons, but the entry point is a plain link.
- Rate limiting here follows the same per-IP pattern passkey registration/login used
  (`rateLimitByIp`) for the request endpoint, since — like passkey registration — there is no
  session yet at that point. The link-follow endpoint's own abuse surface (token guessing) is
  bounded primarily by token entropy (FR-004), not by rate limiting a GET request that carries its
  own single-use secret.
- No email verification step beyond "can this address receive and act on this link" — this feature
  doesn't add a separate "confirm your email" flow distinct from the sign-in flow itself, matching
  how passkey registration (specs/002) didn't add a separate email-confirmation step either.
- Account linking (using magic link to add a second sign-in method to an already-authenticated
  passkey account) is explicitly out of scope — that's D-004/issue #8's job. This feature's
  "existing email → existing tenant" behavior (FR-003) is about the magic-link method recognizing
  its _own_ prior use of that email, not about linking to accounts created via a different method.
