# Feature Specification: Cloudflare OIDC Sign-In

**Feature Branch**: `237-cloudflare-oidc-sign-in`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Add Cloudflare OIDC as a fourth sign-in method. Context: the Claude
Design mockups fictionally described Cloudflare Access (JWT header trust, cloudflared tunnel,
CF_ACCESS_* env vars) as the app's auth mechanism — that's not real and shouldn't be copied. The
underlying idea is worth building for real: add Cloudflare as an actual OIDC login provider,
alongside the existing methods. Target state: 4 sign-in methods — 2x OIDC (Google existing +
Cloudflare new), 1x Passkey (existing), 1x Magic-link email (existing). Explicitly out of scope:
Docker-based self-hosting. Tracked as GitHub issue #237 on iumalabs/odograph. Sequencing
prerequisite (the iumalabs domain migration, issues #199-#202) is now complete."

## Research Finding (grounds this spec — see Assumptions)

Cloudflare has no general-purpose "Sign in with Cloudflare" consumer OAuth flow the way Google
does. What Cloudflare actually offers, and what this feature is built against: **Cloudflare
Access**, configured by whoever deploys/operates an Odograph instance as a "Generic OIDC"
application — Access then acts as a standard OIDC identity provider (discovery document,
authorization endpoint, token endpoint) that Odograph consumes as an OIDC relying party, the same
architectural shape as the existing Google integration. Odograph does **not** need to sit behind
Cloudflare Access itself; it stays a fully independent app doing a standard OAuth2/OIDC
authorization-code flow against Cloudflare as an external identity provider — the design mockup's
"whole app behind a Cloudflare Access gateway, trusting JWT headers" idea (explicitly called out
in the issue as fictional) is not what this builds. See Assumptions for the resulting product-level
implications.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign up or sign in with an authorized Cloudflare identity (Priority: P1)

A visitor whose identity is recognized by the Odograph operator's own Cloudflare Access
configuration clicks "Continue with Cloudflare" on the landing page. If this is their first time,
a new, fully isolated account is created immediately (same open-signup behavior as the existing
"Continue with Google" method); if they've signed in with this Cloudflare identity before, they're
returned to their existing account.

**Why this priority**: This is the entire point of issue #237 — a fourth working sign-in method,
functionally on par with the three that already exist.

**Independent Test**: From the landing page, click "Continue with Cloudflare," complete
authentication against a configured Cloudflare Access application, and land signed in — as a new
account on first use, as the same existing account on a repeat visit.

**Acceptance Scenarios**:

1. **Given** a visitor with no existing Odograph account, **When** they click "Continue with
   Cloudflare" and successfully authenticate, **Then** a new account is created and they land
   signed in, the same way a first-time "Continue with Google" click does today.
2. **Given** a returning visitor who previously signed in via Cloudflare, **When** they click
   "Continue with Cloudflare" again and authenticate with the same identity, **Then** they land
   back in the same account, not a new one.
3. **Given** an Odograph deployment whose operator has not configured Cloudflare Access at all,
   **When** a visitor views the landing page, **Then** every other sign-in method (Passkey, Magic
   link, Google, if configured) continues to work exactly as it does today — this deployment
   simply doesn't offer the Cloudflare option (FR-004).

---

### User Story 2 - Link a Cloudflare identity to an existing account (Priority: P2)

An already-signed-in user (via Passkey, Magic link, or Google) adds Cloudflare as an additional
way to reach the same account, the same way they can already link a Google account today.

**Why this priority**: Parity with the existing Google-linking capability, not the primary reason
#237 exists, but a small, natural extension of User Story 1's same underlying mechanism.

**Independent Test**: While signed in, trigger "Link Cloudflare account," complete authentication,
and confirm the same account now shows a linked Cloudflare identity — signing in with that
identity afterward reaches this same account.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they link a Cloudflare identity that isn't already linked
   to any account, **Then** it's added to their current account.
2. **Given** a signed-in user, **When** they attempt to link a Cloudflare identity already linked
   to a *different* account, **Then** the attempt is rejected with a clear error — no silent
   takeover or merge (matches the existing Google-linking behavior for this exact conflict).

---

### Edge Cases

- **The operator's Cloudflare Access policy denies the visitor**: Cloudflare Access itself blocks
  them before they ever reach Odograph's callback — Odograph never even sees an attempted sign-in,
  the same way a visitor whose Google account fails Google's own consent step never reaches
  Odograph's Google callback either. Not a new failure mode Odograph needs to handle specially.
- **A Cloudflare identity's email matches an existing account created via a different method**
  (Passkey, Magic link, or Google, with the same email address): unchanged from the existing rule
  — accounts are never auto-linked by matching email (D-004); this is exactly the same collision
  Google sign-in can already produce today, handled by the same existing mechanism, extended to a
  second provider rather than given new behavior.
- **The operator hasn't configured a Cloudflare Access application at all**: the app functions
  fully without it — see User Story 1's Acceptance Scenario 3 and FR-004.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to create a new account or sign in to an existing one via
  "Continue with Cloudflare," with the same open-signup-on-first-success semantics the existing
  Google sign-in method already has (D-003).
- **FR-002**: An already-authenticated user MUST be able to link a Cloudflare identity to their
  current account, matching the existing Google-account-linking capability, including D-004's rule
  that accounts are never auto-linked purely by matching email address.
- **FR-003**: The landing page's sign-in UI MUST present "Continue with Cloudflare" as a fourth
  option, alongside Passkey, Magic link, and Continue with Google — not a secondary or hidden
  option.
- **FR-004**: Cloudflare sign-in MUST be an optional, independently-deployable provider. A
  deployment (including a self-hosted instance) that has not configured Cloudflare Access MUST NOT
  have any other sign-in method degrade or break — mirrors how "Continue with Google" is already
  documented as optional for self-hosters.
- **FR-005**: The system MUST treat a successfully completed Cloudflare authentication exactly like
  a successfully completed Google authentication from a trust perspective — no additional identity
  verification of its own beyond what it already does for OIDC providers today. Deciding which
  real-world identities can ever reach that successful callback is the deploying operator's own
  Cloudflare Access configuration, not something Odograph re-implements or second-guesses.
- **FR-006**: Every existing per-provider security property applied to Google sign-in today (CSRF/
  state protection, session issuance, and rate limiting on the authentication endpoints) MUST apply
  identically to the Cloudflare provider — no reduced security posture for the new method.
- **FR-007**: Every new piece of user-facing copy this feature introduces (the "Continue with
  Cloudflare" button and any related linking/error copy) MUST route through the existing i18n
  system (Principle IX), with both currently-shipped interface languages (English, Russian)
  covered, not just English.

### Key Entities

No new data entities. This reuses the existing multi-provider identity-linking model that already
supports Passkey, Magic-link, and Google on one account, extended to a second OIDC provider.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor with an authorized Cloudflare identity can complete first-time sign-up in
  about the same number of clicks and elapsed time as the existing "Continue with Google" flow —
  no extra steps specific to Cloudflare.
- **SC-002**: Every automated security check that already exists for the Google OIDC flow (state/
  CSRF validation, session issuance correctness, rate-limit enforcement) has an equivalent, passing
  check for the Cloudflare flow.
- **SC-003**: An Odograph deployment with no Cloudflare Access configuration shows zero regression
  for Passkey, Magic-link, or Google sign-in — verified by the existing test suite for those methods
  continuing to pass unchanged.
- **SC-004**: 100% of the new user-facing strings this feature introduces have both an English and
  a Russian translation — none silently left in only one language.

## Assumptions

- **What "Cloudflare OIDC" concretely means here** (see Research Finding above): the deploying
  operator configures a "Generic OIDC" SaaS application inside their own Cloudflare Access (Zero
  Trust) setup; Odograph consumes the resulting standard OIDC discovery/authorization/token
  endpoints as a relying party, architecturally identical to the existing Google integration aside
  from which issuer/client credentials it points at.
- **Audience is operator-controlled, not open-to-any-Cloudflare-user**: Cloudflare Access is
  deny-by-default — only identities that satisfy the operator's own configured Access policy ever
  successfully complete the flow. This means, for a given deployment, "Continue with Cloudflare"
  authenticates whoever that deployment's operator has allowed (which could be as open or as
  restricted as they choose to configure it), not literally any person with a Cloudflare.com
  account — a meaningful difference from Google's open-to-anyone consent screen, but one Odograph's
  own code doesn't need to special-case: a successful callback is a successful callback, regardless
  of provider.
- **Available identity claims include email** — Cloudflare Access's OIDC token can include an
  `email` claim (among `openid`/`profile`/`groups`), matching the shape Odograph's existing
  per-provider identity model already consumes for Google.
- **Docker-based self-hosting stays explicitly out of scope** (per the issue) — the self-hosting
  path remains `wrangler`-based (docs/self-hosting.md), unrelated to this feature.
- **More providers addable later via configuration** (D-003) — this feature is the second
  application of that existing decision, not a new architectural pattern.
