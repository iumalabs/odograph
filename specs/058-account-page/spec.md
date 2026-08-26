# Feature Specification: Account Page

**Feature Branch**: `058-account-page`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "New: Account page (profile, credentials, session info). The updated design (Claude Design project dfecc39c-323d-4b89-a9ec-c126b3aa2deb, file 'Кокпит - прототип.dc.html', 'scr.acct' state) adds a dedicated Account page, plus a richer account dropdown in the header (avatar+handle → panel showing name/email, Provider/Role/Session-expires rows, then Credentials/Documentation/Sign out menu items). The Credentials card maps onto real, already-shipped backend (scoped/revocable API tokens). The Session and access card's copy should describe whichever of the three real auth methods (passkey/magic-link/Google OIDC) the account actually has — don't hardcode Cloudflare-Access-style copy. A 'Multi-account — groundwork only' panel is a visual placeholder only (disabled 'SOON' buttons) — do NOT build real multi-user accounts. Consider whether this absorbs some of the existing Settings page content. Tracked as GitHub issue #231 on iumalabs/odograph."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A user finds all their account controls in one place (Priority: P1)

A signed-in user who wants to add a second passkey, link another email, see when their session
expires, or delete their account currently has to know that passkey/Google/email-linking controls
live inline at the top of the Garage screen, while API tokens and account deletion live on a
separate Settings screen. This story consolidates all of it into one dedicated Account page,
reached from a new account avatar in the header — a real profile/credentials/session view, not the
design's fictional Cloudflare-Access-branded one.

**Why this priority**: This is the entire scope of issue #231 — the one place a user manages who
they are and how they sign in.

**Independent Test**: Sign in, open the account avatar in the header, click through to the Account
page, and confirm every existing account action (add passkey, link Google, link email, create/
revoke an API token, delete account) still works exactly as it does today, now from one screen.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they click the account avatar in the header, **Then** a
   dropdown shows their email, real session-expiry, a real description of their linked sign-in
   methods, and menu items for "Credentials" (the full Account page), "Documentation", and "Sign
   out".
2. **Given** the Account page, **When** the user views the credentials section, **Then** they see
   their linked sign-in methods (passkey count, whether Google is linked, linked email addresses)
   with working add-passkey / link-Google / link-email actions — the same actions the Garage
   screen's header row offers today, now here instead.
3. **Given** the Account page, **When** the user views the session section, **Then** it states the
   real expiry of their current session and which real auth methods their account has — never
   Cloudflare Access, a JWT header, or a team/AUD concept this app doesn't have.
4. **Given** the Account page, **When** the user clicks "Sign out", **Then** their session is
   actually invalidated server-side (not just a client-side redirect) and they land back on the
   landing page.
5. **Given** the Account page, **When** the user views API tokens or account deletion, **Then**
   they see the same, unmodified `ApiTokens`/`AccountDeletion` components Settings shows today,
   now relocated here.
6. **Given** the Account page, **When** the user sees the "multi-account" panel, **Then** it's
   visibly a disabled placeholder ("coming later") — clicking it does nothing, and no real
   invite/multi-user functionality is implied or built.

---

### User Story 2 - The app finally has a way to sign out (Priority: P1)

Today, the only way to end a session is to let it expire or clear cookies manually — there is no
sign-out route or button anywhere in the production app. This story adds a real one.

**Why this priority**: A genuine, pre-existing gap this feature is the natural place to close —
"Sign out" is explicitly part of the design's account dropdown, and every other real auth action
(sign in via 3 methods) already has a working counterpart; sign-out is the missing piece.

**Independent Test**: Sign in, call the new sign-out action, and confirm the session cookie no
longer resolves to a valid session (a subsequent authenticated request returns 401) —
independently of whether the Account page's other content is exercised.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they sign out, **Then** their session is invalidated in the
   database and its cache entry is cleared — a replayed copy of the old session cookie no longer
   authenticates.

---

### Edge Cases

- What happens to the "Role" row the design shows? This app has no roles/permissions system — every
  account is the sole, isolated owner of its own data, with no team members. The Account page
  states this plainly ("sole owner of this garage") rather than showing a fabricated role value or
  omitting the row silently.
- What happens if a user has linked zero additional methods (passkey-only, say)? The credentials
  section shows exactly what's linked — a passkey count of 1, no Google, no additional emails —
  never a placeholder or fabricated entry for methods not actually linked.
- What happens to the "multi-account" placeholder's "SOON" buttons if clicked? Nothing — they're
  rendered `disabled`, matching the design's own intent (a roadmap teaser, not a working feature).
- What happens on a narrow (mobile) viewport? The Account page's multi-column cards (credentials +
  session) stack to one column, following the app's existing responsive breakpoint convention.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST add an account avatar/handle to `AppShell`'s header, opening a dropdown
  with the user's email, real session-expiry, a real linked-methods summary, and three menu items:
  open the full Account page, open Documentation (the existing Help viewer), and sign out.
- **FR-002**: The app MUST add a dedicated Account page (reached from the dropdown's "Credentials"
  item) consolidating: profile (email, "sole owner of this garage"), credentials (linked sign-in
  methods with working add/link actions, moved from the Garage screen's header row), the existing
  `ApiTokens` and `AccountDeletion` components (moved from Settings), and session info.
- **FR-003**: Every fact shown (email, session expiry, which auth methods are linked) MUST come
  from real, already-stored data — no Cloudflare Access, JWT/AUD, team-domain, or role-system
  concepts this app doesn't have (Constitution Principle IV, same correction already applied in
  specs 056/057).
- **FR-004**: The app MUST add a real sign-out action (new server endpoint) that invalidates the
  current session server-side (database + cache), matching the existing dev-only
  `/api/v1/_dev/session/invalidate` route's behavior — this app currently has no production
  sign-out path at all.
- **FR-005**: The Account page MUST include a visually distinct, non-functional "multi-account"
  placeholder panel (disabled buttons, "coming later" copy) — Constitution Principle IV forbids
  implying working multi-user functionality that doesn't exist; the design's own framing already
  marks this as a roadmap teaser, not a request to build real multi-user access control.
- **FR-006**: The existing Garage-screen header row (add passkey / link Google / link email) MUST
  be removed once its actions live on the Account page — not duplicated in two places.
- **FR-007**: Settings MUST keep only app-level preferences (currency, push notifications) after
  `ApiTokens`/`AccountDeletion` relocate to the Account page.
- **FR-008**: The Account page and account dropdown MUST remain usable at narrow (mobile) viewport
  widths, following the app's existing responsive breakpoint convention.
- **FR-009**: All new UI-chrome strings MUST route through the existing i18n `t()` system
  (Constitution Principle IX), matching every other screen.

### Key Entities

- **Account profile** (server-computed, not persisted): email (from `users.email`), current session
  expiry (from `sessions.expires_at`), and a linked-methods summary (passkey count from
  `webauthn_credentials`, Google-linked flag from `oidc_identities`, linked emails from
  `magic_link_identities`) — assembled fresh on every request from existing tables, nothing new
  stored (mirrors `computeVehicleAggregates`'s "computed fresh on every call" precedent).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can view and manage every account-related action (linking a sign-in method,
  API tokens, account deletion, signing out) from one Account page, without needing to know some of
  it used to live on the Garage screen or Settings.
- **SC-002**: 100% of the facts the Account page states about the user's session and sign-in
  methods are real — zero references to Cloudflare Access, roles, or any mechanism this app doesn't
  have.
- **SC-003**: A user can actually sign out and have their session end server-side — not just a
  client-side state reset that leaves the cookie valid.

## Assumptions

- **Content split, decided**: `ApiTokens` and `AccountDeletion` move from Settings to the new
  Account page (both are identity/credential-adjacent, not app preferences); Settings keeps
  currency and push-notification preferences only. This directly answers the issue's open "needs a
  spec decision" question.
- **"Role" is described honestly, not fabricated.** This app has no roles/permissions system — every
  account is the sole owner of its own isolated tenant, always. The Account page states this as a
  plain fact, not a role picked from a system that doesn't exist.
- **Session-expiry and linked-methods are new, small, well-scoped backend additions** — not
  fabricated client-side, and not scope creep: they read from tables (`sessions`,
  `webauthn_credentials`, `oidc_identities`, `magic_link_identities`) that already exist for other
  reasons, exposed via one new endpoint the way `computeVehicleAggregates` already exposes derived,
  non-persisted data.
- **Sign-out is a real, new production capability**, not a UI-only affordance — the app has never
  had one; this feature adds the smallest correct version (mirrors the existing dev-only
  `/invalidate` route's logic, without the dev-only guard).
- **No multi-user/team accounts.** The "multi-account" panel is a disabled visual placeholder only,
  per the issue's explicit instruction — no invite flow, no roles, no shared-garage access is built.
- **English-only content**, matching the app's locked v1-English-only scope (Constitution Principle
  IX/XI).
