# Feature Specification: Account Linking Rules

**Feature Branch**: `005-account-linking`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Account linking rules (issue #8): let an already-authenticated user
link a second sign-in method to their existing account — magic-link (an email) or Google OIDC (a
Google account) — reusing the existing passkey 'add a second passkey' pattern but extended
cross-method. Locked decision D-004: accounts are never auto-linked by matching email; linking
requires an already-authenticated session performing an explicit, deliberate action (never an
unauthenticated flow silently merging accounts). Must reject linking an identity (email or Google
subject) already attached to a DIFFERENT account, without silently reassigning or merging it. Out
of scope: listing/viewing linked methods, unlinking/removing a method, and any UI beyond a minimal
'link' trigger per method — this feature is about the linking mechanism and its safety rules, not
account-management UI."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A signed-in user links their email as a second sign-in method (Priority: P1)

As a user who signed up with a passkey (or Google), I want to link an email address to my existing
account so I can also sign in via a magic link later — e.g. from a device where I don't have my
passkey available, or as a fallback if I lose access to my authenticator.

**Why this priority**: Without this, a user who created an account with only one method has no
recovery/fallback path if that method becomes unavailable — the exact resilience gap User Story 3
of specs/002 (adding a second passkey) already solves within one method, extended across methods.

**Independent Test**: With an already-authenticated session, trigger the "link an email" flow,
complete it, then — as a separate, unauthenticated attempt — sign in via magic link using that same
email and confirm it resolves to the original account, not a new one.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no email linked yet, **When** they submit an email through
   the link flow and complete it (following the resulting magic link), **Then** that email becomes
   usable to sign in to their existing account — no new tenant or user is created.
2. **Given** an authenticated user attempts to link an email, **When** they never complete the
   flow (don't follow the link, or follow it after it has expired), **Then** the email remains
   unlinked and their account is unaffected.
3. **Given** an authenticated user, **When** they attempt to link an email that is already linked
   to a *different* account (via any method that account used to establish that email), **Then**
   the system rejects the attempt rather than silently moving the email to the new account or
   merging the two accounts.
4. **Given** an authenticated user, **When** they attempt to link an email already linked to their
   *own* account, **Then** the system rejects the attempt the same way as Scenario 3 (no special
   "already yours" case) — consistent, unsurprising behavior regardless of whose account it was.

---

### User Story 2 - A signed-in user links their Google account as a second sign-in method (Priority: P1)

As a user who signed up with a passkey (or a magic-link email), I want to link my Google account to
my existing account so I can also sign in with Google afterward.

**Why this priority**: Equal priority to User Story 1 — the same resilience/convenience value,
just for the other non-passkey method.

**Independent Test**: With an already-authenticated session, trigger the "link Google" flow,
complete Google's consent screen, then — as a separate, unauthenticated attempt — sign in with
Google using that same account and confirm it resolves to the original account, not a new one.

**Acceptance Scenarios**:

1. **Given** an authenticated user with no Google account linked yet, **When** they complete the
   Google consent flow through the link trigger, **Then** that Google account becomes usable to
   sign in to their existing account — no new tenant or user is created.
2. **Given** an authenticated user, **When** they attempt to link a Google account already linked
   to a *different* account, **Then** the system rejects the attempt rather than silently moving it
   or merging the two accounts.
3. **Given** an unauthenticated visitor (no session at all), **When** they attempt to reach the
   linking trigger for either method, **Then** the system refuses — linking is never reachable
   without an already-authenticated session (D-004).

### Edge Cases

- What happens if the browser that clicks a "link my email" magic link is a *different* browser
  than the one that started the link request (e.g. requested on a laptop, opened on a phone)? The
  link must still succeed and attach to the original account — linking, like magic-link's original
  sign-in flow, is not tied to the initiating browser's continued session.
- What happens if a user's session expires or is signed out between starting a Google-link flow and
  completing Google's consent screen? The completing browser ends up authenticated as the linked
  account once the flow succeeds, regardless of what session state existed when the flow started —
  same reasoning as the cross-device magic-link case above.
- What happens if a user attempts to link the same email or Google account twice in a row (first
  attempt succeeds, second attempt targets the now-linked identity)? Rejected the same way linking
  an identity already used by any other account is (Scenario 4 above) — no special-casing "it's
  already mine."
- How does this interact with passkeys? Passkey already supports adding a second (or further)
  credential to an authenticated account (specs/002 User Story 3) — this feature doesn't change
  that; it brings magic-link and Google up to the same "an authenticated session can add another way
  in" capability passkey already had.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user link an email address to their account,
  becoming usable afterward to sign in via magic link to that same account.
- **FR-002**: System MUST let an authenticated user link a Google account to their account, becoming
  usable afterward to sign in via Google to that same account.
- **FR-003**: System MUST NOT create a new tenant or user as part of a successful link — a link
  attaches an identity to the *existing*, already-authenticated account only.
- **FR-004**: System MUST refuse to reach either linking flow without an already-authenticated
  session (D-004) — there is no unauthenticated variant of either flow.
- **FR-005**: System MUST reject linking an email or Google identity that is already attached to
  any account (the initiating user's own account or a different one) rather than reassigning,
  merging, or silently no-op'ing — the same identity can be tied to at most one account at a time.
- **FR-006**: System MUST NOT require the browser that completes a link (follows the magic link, or
  finishes Google's consent screen) to still hold the session that started it — the link succeeds
  based on which account initiated it, not which browser finishes it.
- **FR-007**: System MUST issue a working session for the linked account on successful completion
  of a link, on whichever browser completes it (consistent behavior for both same-device and
  cross-device completion, per FR-006).
- **FR-008**: System MUST NOT create any linkage record for an attempt that does not complete
  successfully (consent denied, link never followed, expired, or rejected per FR-005).

### Key Entities

- **Link attempt**: A short-lived, single-use, method-specific record binding a pending "link this
  identity to my account" action to the specific account that initiated it. Not a durable record —
  same category as a magic-link token or an OIDC `state` value, just additionally carrying which
  account the eventual identity should attach to.

_(Tenant, User, Session, the magic-link identity table, and the OIDC identity table are the
entities already defined in specs/001, specs/003, and specs/004 respectively — this feature extends
how those existing sign-in flows' pending-attempt records can optionally carry a target account, not
their durable shape.)_

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An authenticated user can link an email and subsequently sign in with it, landing
  back in the same account, in a test that never reuses the linking browser's session for the
  second sign-in.
- **SC-002**: An authenticated user can link a Google account and subsequently sign in with it,
  landing back in the same account.
- **SC-003**: 100% of attempts to link an identity already attached to any account (same or
  different) are rejected, verified by a test that seeds the identity first via each of the other
  two methods in turn.
- **SC-004**: 100% of attempts to reach either linking flow without an authenticated session are
  refused, before any identity lookup or record creation.

## Assumptions

- Passkey's existing "add a second passkey" capability (specs/002 User Story 3) already satisfies
  this feature's guarantee for that one method — no changes to passkey are in scope here.
- Listing which methods are currently linked, and removing/unlinking a previously-linked method, are
  explicitly out of scope (feature description) — this feature is the linking mechanism and its
  safety rule (FR-005/D-004), not account-management UI. A future feature can add visibility/removal
  on top of the data this one writes.
- "Reject" (FR-005) means the linking attempt fails cleanly and visibly to the user attempting it —
  it does not mean silently discarding the attempt while reporting success, since that would hide a
  real, actionable problem (e.g. the user typo'd an email that happens to belong to someone else,
  or is trying to link a Google account they don't realize is already tied to an old account of
  theirs).
- This feature depends on both magic-link authentication (specs/003) and Google OIDC authentication
  (specs/004) already existing on `main` — it extends their pending-attempt records (magic-link
  tokens, OIDC state) to optionally carry a linking target, which isn't meaningful to design against
  code that doesn't exist yet on the base branch. Implementation work (as opposed to this
  specification) is blocked on both of those features merging first.
