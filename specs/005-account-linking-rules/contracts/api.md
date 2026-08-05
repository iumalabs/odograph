# API Contracts: Account Linking Rules

## `POST /api/v1/auth/magic-link/link`

Starts linking an email to the caller's account. Requires an authenticated session
(`tenantContext`) — 401 without one (FR-004). Rate-limited via `rateLimitBySession` (an
authenticated write path, same category as `/passkey/add/options`).

**Request**: `{ "email": string }`.

**Response** `200`: `{ "sent": true }` — same shape as `/auth/magic-link/request`'s success
response. Creates a `magic_link_tokens` row with `linking_user_id` set to the caller's user id
(`invalidateAndCreateMagicLinkToken`'s new optional param) and sends the link email.

**Response** `400`: the email is missing or not syntactically valid — same validation as
`/request`.

**Response** `401`: no authenticated session.

**Response** `502`: `env.EMAIL.send()` failed — same as `/request`.

## `GET /api/v1/auth/magic-link/verify?token=...` (extended)

Unchanged for a token with no `linking_user_id` (specs/003's existing contract). When the consumed
token *does* carry a `linking_user_id`:

**Response** `302` (success): inserts a `magic_link_identities` row for `(email, linking_user_id)`
(`linkMagicLinkIdentity`) — sets the session cookie for `linking_user_id` and redirects to
`/?magicLink=linked` (a distinct outcome from a normal sign-in's `/?magicLink=ok`, so the client can
tell "you signed in" from "you linked a method" apart).

**Response** `302` (failure): if the email is already linked to any account (same or different —
`isUniqueConstraintError`), redirects to `/?magicLink=error`, no cookie set, no change to the
existing linkage.

## `GET /api/v1/auth/oidc/google/link`

Starts linking a Google account to the caller's account. Requires an authenticated session
(`tenantContext`) — 401 without one (FR-004). Rate-limited via `rateLimitBySession`.

**Response** `302`: creates an `oidc_states` row with `linking_user_id` set to the caller's user id
(`createOidcState`'s new optional param) and redirects to Google's consent screen — otherwise
identical to `/start`.

**Response** `401`: no authenticated session.

## `GET /api/v1/auth/oidc/google/callback` (extended)

Unchanged for a state with no `linking_user_id` (specs/004's existing contract). When the consumed
state *does* carry a `linking_user_id`:

**Response** `302` (success): verifies the ID token, then inserts an `oidc_identities` row for
`(provider, subject, linking_user_id)` (`linkOidcIdentity`) — sets the session cookie for
`linking_user_id` and redirects to `/?oidc=linked`.

**Response** `302` (failure): ID token verification failure, or the identity already linked to any
account (`isUniqueConstraintError`) — redirects to `/?oidc=error`, no cookie set.

## Cross-cutting

- Both `/link` triggers are the only auth-flow-starting routes in this codebase that require an
  existing session — every other sign-in/sign-up route is deliberately reachable while
  unauthenticated (D-004 makes this the one place that's the opposite).
- The `/verify` and `/callback` completion routes are unchanged in shape — they still return a 302
  either way, still set a cookie only on success — linking just adds one more possible cookie-holder
  identity (the linking target) and one more possible redirect outcome value (`linked`).
