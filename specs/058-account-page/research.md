# Phase 0 Research: Account Page

## Decision 1: One new endpoint, `GET /api/v1/account`, computed fresh from existing tables

**Decision**: `getAccountProfile(db, ctx)` reads real data only, per this table:

| Field | Real source |
|---|---|
| `email` | `users.email` (NOT NULL — set at account creation via every real sign-up path: `createMagicLinkUser`, passkey registration's email input, Google's verified email claim) |
| `sessionExpiresAt` | `sessions.expires_at`, looked up by the current request's token hash (already resolved by `tenantContext`) |
| `passkeyCount` | `COUNT(*) FROM webauthn_credentials WHERE user_id = ?` |
| `hasGoogle` | `EXISTS(SELECT 1 FROM oidc_identities WHERE user_id = ? AND provider = 'google')` |
| `linkedEmails` | `SELECT email FROM magic_link_identities WHERE user_id = ?` |

**Rationale**: Every field is a real, already-stored fact, reachable via a tenant-scoped query — no
field is invented to fill out the design's richer profile card. This mirrors
`computeVehicleAggregates`'s existing "computed fresh, nothing new stored" precedent exactly.

**Alternatives considered**:
- Add a `role` field — rejected outright: this app has no roles/permissions system. Showing a role
  value (even a hardcoded "Owner") as if it were a data field would misrepresent the app as having
  a roles system it doesn't (spec.md's Edge Cases handles this with plain, honest copy instead).
- Store the profile bundle in a session-attached cache — rejected: the underlying queries are cheap
  indexed lookups on a screen a user visits rarely; caching would add invalidation complexity for
  no measurable benefit.

## Decision 2: New `POST /api/v1/account/sign-out`, reusing `invalidateSession` verbatim

**Decision**: `account.post("/sign-out", rateLimitBySession, async (c) => { ... })`, using the exact
same three calls the existing dev-only route already makes: `invalidateSession(db, kv, cookie)`,
then `serializeExpiredSessionCookie()` on the response.

**Rationale**: This app has never had a production sign-out route — confirmed by grep across
`src/server/routes/v1/auth/`. The logic already exists, tested, and working in
`dev-session.ts`'s `/invalidate` route; the only difference for a real route is dropping
`notFoundOutsideDev` and moving it to sit alongside `DELETE /api/v1/account` in `account.ts` (an
account-level action, not an auth-flow-bootstrap one, matching the file's existing scope: the file
already handles the other permanent/session-ending account action, deletion).

**Alternatives considered**:
- Put sign-out under `routes/v1/auth/` instead of `account.ts` — rejected: every file under `auth/`
  is about *starting* a session (passkey/magic-link/OIDC); `account.ts` is already the file for
  *ending* one (deletion already lives there) — sign-out fits that grouping, not the sign-in one.

## Decision 3: Content split — Credentials/API tokens/deletion move to Account; Settings keeps only preferences

**Decision**: `ApiTokens` and `AccountDeletion` (components, untouched) move from `SettingsView` to
the new `AccountView`; the Garage-screen's inline passkey/Google/email-linking row moves there too.
Settings keeps only currency and push-notification preferences.

**Rationale**: Directly answers the issue's own open question. The dividing line is "who you are
and how you sign in" (Account) vs. "how the app behaves for you" (Settings/preferences) — a
standard, recognizable split, and it's exactly what the design's separate `scr.acct` state implies
by existing as a distinct screen from settings-style preferences.

**Alternatives considered**:
- Leave `ApiTokens`/`AccountDeletion` on Settings, make Account purely additive (profile/session
  only) — rejected: leaves the exact scatter (Garage header + Settings + new Account page = three
  places) this feature exists to fix; SC-001 explicitly measures "one page for everything
  account-related."

## Decision 4: Account dropdown reuses the currency-dropdown's existing open/close pattern

**Decision**: `AppShell.tsx` gets a new `acctOpen` piece of state (`useState`), styled and behaving
identically to the existing `curOpen` currency dropdown already in the header — same
position/z-index/animation convention, not a new interaction pattern.

**Rationale**: `AppShell.tsx` already has exactly one dropdown (currency); reusing its established
shape keeps the header internally consistent rather than introducing a second, differently-behaved
popover pattern for no reason.

## Decision 5: "Role" is stated as a fact, not shown as a field from a system that doesn't exist

**Decision**: The Account page's profile section states "Sole owner of this garage — no team
members yet" as plain descriptive text, not a `role:` key-value row implying a picker or system.

**Rationale**: It's true today (every tenant has exactly one user, confirmed by the schema — no
membership/invite table exists), so stating it isn't fabrication; presenting it as a `role` field
the way the design does would misrepresent a single fixed fact as a value from a real roles system.
