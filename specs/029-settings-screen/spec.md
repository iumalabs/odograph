# Feature Specification: Dedicated Settings Screen

**Feature Branch**: `029-settings-screen`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Dedicated settings screen (GitHub issue #79, milestone M11). Consolidate three existing account/session controls — account deletion, API token management, and push-notification opt-in — into one dedicated top-level 'Settings' screen, reachable via a new nav-rail destination, matching the design icon sheet's bare settings glyph. These three controls currently live inline in the garage view's body, mixed in with unrelated session controls (signed-in-as text, sync status, add-passkey, link-Google-account, magic-link linking), which stay where they are — out of scope. No backend changes: purely a client-side UI relocation/consolidation preserving every existing behavior of the three components exactly."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find account-level controls in one place (Priority: P1)

An owner who wants to manage their API tokens, push notification subscription, or delete their
account currently has to scroll through the garage screen's account-controls row, which mixes
these settings in with unrelated sign-in/session controls (signed-in-as text, sync status,
add-passkey, link-Google-account). They want a single, obviously-labeled destination for these
account-level settings, separate from the garage's vehicle-focused content.

**Why this priority**: This is the entire point of the feature — without it, there is nothing to
ship. Every other requirement exists to support this single outcome.

**Independent Test**: Can be fully tested by opening the app, selecting the new "Settings"
nav-rail destination, and confirming API token management, push-notification opt-in, and account
deletion are all present and functional on that one screen, with none of them still appearing on
the garage screen.

**Acceptance Scenarios**:

1. **Given** a signed-in owner on any top-level screen (Garage, Dashboard, or Review), **When**
   they select the "Settings" destination in the nav rail, **Then** a dedicated Settings screen
   opens showing API token management, push-notification opt-in, and account deletion.
2. **Given** the owner is on the garage screen, **When** they look at the garage screen's content,
   **Then** API token management, push-notification opt-in, and account deletion are no longer
   present there (only the unrelated session controls — signed-in-as, sync status, add-passkey,
   link-Google-account, magic-link linking — remain).
3. **Given** the owner is on the Settings screen, **When** they select a different nav-rail
   destination (e.g. Garage), **Then** they navigate away from Settings and the previously-selected
   vehicle (if any) is still selected as before.

---

### User Story 2 - Manage API tokens from Settings exactly as before (Priority: P2)

An owner managing personal-access tokens (creating a scoped token, copying its one-time secret,
reviewing existing tokens' labels/scope/last-used dates, revoking a token) needs the Settings
screen's token management to behave identically to how it worked on the garage screen — nothing
about the underlying flow should change, only its location.

**Why this priority**: API tokens are a security-sensitive feature (constitution Principle VI —
hardened, scoped, revocable, tracked). Relocating the UI must not alter or regress this behavior.

**Independent Test**: Can be fully tested by creating a token on the Settings screen, confirming
the one-time secret reveal and copy flow works, confirming the token then appears in the token
list with correct label/scope/last-used display, and revoking it — all without touching any other
screen.

**Acceptance Scenarios**:

1. **Given** the owner is on the Settings screen, **When** they create a new API token with a
   label and scope, **Then** the token's one-time secret is revealed exactly once for copying, and
   the token subsequently appears in the token list with its label, scope, creation date, and
   last-used date (or "never used" state).
2. **Given** an existing API token is listed on the Settings screen, **When** the owner revokes it,
   **Then** it is marked as revoked in the list and can no longer authenticate API requests.

---

### User Story 3 - Manage push notifications and delete account from Settings exactly as before (Priority: P2)

An owner enabling/disabling push notifications, or initiating account deletion, needs both flows to
work identically to their current garage-screen behavior after the move: the same
supported/enabled/disabled/permission-denied states for push, and the same exact-phrase
confirmation flow for account deletion.

**Why this priority**: Account deletion is an irreversible, GDPR-relevant action (constitution
Principle VIII); push notifications have several distinct states that must not be silently
collapsed or altered during the move. Equal priority to User Story 2 — both are "preserve exact
existing behavior" stories for the two remaining relocated features.

**Independent Test**: Can be fully tested by toggling push notifications on/off from the Settings
screen and confirming the correct state is reflected, and by starting the account deletion flow,
confirming the type-to-confirm phrase gate blocks the delete button until the exact phrase is
entered, and confirming Cancel aborts without deleting anything.

**Acceptance Scenarios**:

1. **Given** push notifications are supported by the browser, **When** the owner toggles the
   push-notification control on the Settings screen, **Then** the subscription state changes and
   the displayed status (enabled/disabled) updates accordingly.
2. **Given** the browser does not support push notifications, **When** the owner views the Settings
   screen, **Then** an "unsupported" message is shown instead of a toggle, matching current
   behavior.
3. **Given** the owner starts the account deletion flow on the Settings screen, **When** they type
   anything other than the exact required confirmation phrase, **Then** the delete button remains
   disabled.
4. **Given** the owner has typed the exact required confirmation phrase, **When** they confirm
   deletion, **Then** the account deletion request is sent exactly as it was from the garage
   screen.

---

### Edge Cases

- What happens if the owner navigates to Settings while a vehicle is selected on the garage screen?
  The vehicle selection is preserved in the background; returning to Garage shows the same selected
  vehicle as before (Settings does not clear or interact with vehicle-selection state).
- What happens if the owner is on the Settings screen and their session expires or is signed out
  from another tab? Existing app-wide session-expiry handling applies unchanged; Settings has no
  special-case behavior beyond what every other screen already does.
- What happens if the API token list or push-subscription status fails to load on the Settings
  screen? Existing error-handling behavior (already present in each component) is preserved as-is;
  this feature does not change error UX, only where the components are mounted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a new top-level "Settings" destination in the app's
  persistent navigation, alongside the existing Garage, Dashboard, and Review destinations.
- **FR-002**: Selecting the Settings destination MUST display a dedicated screen containing API
  token management, push-notification opt-in, and account deletion, and no other controls.
- **FR-003**: The garage screen MUST no longer display API token management, push-notification
  opt-in, or account deletion after this change.
- **FR-004**: The garage screen MUST continue to display its other existing session controls
  (signed-in-as text, sync status indicator, add-passkey, link-Google-account, magic-link linking)
  unchanged — these are explicitly out of scope for relocation.
- **FR-005**: API token creation, one-time secret reveal, listing (label/scope/created
  date/last-used date), and revocation MUST behave identically on the Settings screen to their
  current garage-screen behavior, with no functional change.
- **FR-006**: Push-notification opt-in MUST preserve its existing supported/unsupported and
  enabled/disabled/permission-denied states and behavior on the Settings screen, with no functional
  change.
- **FR-007**: Account deletion MUST preserve its existing exact-phrase confirmation gate and
  cancel/confirm flow on the Settings screen, with no functional change.
- **FR-008**: The system MUST NOT introduce any new backend behavior, API endpoint, or data model
  change to support this feature — all three relocated features continue to use their existing
  backend integrations unchanged.
- **FR-009**: Selecting a different nav destination while on the Settings screen MUST NOT alter any
  other screen's independent state (e.g. the garage's currently-selected vehicle).
- **FR-010**: All new user-facing text introduced by this feature (the nav destination's label and
  the Settings screen's heading) MUST be routed through the app's existing i18n string
  infrastructure, consistent with every other user-facing string in the app.

### Key Entities

This feature introduces no new data entities. It relocates existing UI for three already-modeled
concepts (API tokens, push subscriptions, account/tenant deletion) without changing their
underlying data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can locate and open API token management, push-notification opt-in, and
  account deletion from a single, consistently-labeled destination, without any of them appearing
  on the garage screen.
- **SC-002**: 100% of existing API token, push-notification, and account-deletion behaviors
  (creation, reveal, list, revoke, enable/disable/unsupported/denied states, confirm-phrase gate)
  continue to work identically after relocation, with zero functional regressions.
- **SC-003**: Navigating to Settings and back to Garage never alters the garage screen's selected
  vehicle or any other independent screen state.

## Assumptions

- The three relocated components (API token management, push-notification opt-in, account
  deletion) are moved as-is into a new screen composition; their internal logic, API calls, and
  visual design are not redesigned as part of this feature — only their screen location and entry
  point change.
- The unrelated session controls currently sharing the garage screen's account-controls row
  (signed-in-as text, sync status, add-passkey, link-Google-account, magic-link linking) are
  intentionally excluded from Settings and remain on the garage screen, per the feature description
  and issue framing (these are session/auth controls, not "settings" in the account/token/push
  sense the issue and mockup icon refer to).
- The design mockup's settings icon has no wired-up screen, nav placement, or layout beyond a bare
  icon+label in the icon reference sheet — this spec's own judgment governs the new screen's
  content and layout, consistent with how the PDF export and search features handled similarly
  bare mockup references.
- No new permission or role model is introduced — Settings is visible to the same signed-in owner
  who already has access to these three features today.
