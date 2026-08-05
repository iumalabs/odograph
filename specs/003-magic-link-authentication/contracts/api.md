# API Contracts: Magic Link Authentication

Routes under `/api/v1/auth/magic-link`.

## `POST /api/v1/auth/magic-link/request`

Requests a sign-in link for an email address. Rate-limited via `rateLimitByIp` (no session exists
yet, same as passkey registration/login).

**Request**: `{ "email": string }`.

**Response** `200` (always, regardless of whether the email is registered — FR-006):
`{ "sent": true }`. Invalidates any prior unused token for the email (FR-005), issues a new one, and
sends an email containing a link to `GET /api/v1/auth/magic-link/verify?token=...`.

**Response** `400`: the email is missing or not syntactically valid — rejected before any token is
issued or email sent (spec.md User Story 2 Acceptance Scenario 2). This is the one case that _is_
allowed to differ from the 200 path, since "malformed input" isn't an account-existence signal.

**Response** `502`: `env.EMAIL.send()` itself failed (e.g. provider rate limit, FR-008). The token
row created just before the send attempt is left in place — nobody received it, so it's inert and
simply expires normally; no special rollback is needed. The response body does not indicate whether
the email was registered.

## `GET /api/v1/auth/magic-link/verify?token=...`

Completes sign-in. A plain link — no client-side JavaScript is required to reach this endpoint
(spec.md's Assumptions), since it's opened directly from an email client.

**Response** `302`: on a valid, unused, unexpired token — sets the session cookie (identical shape
to every other auth method's) and redirects to `/?magicLink=ok`.

**Response** `302` (still — a redirect either way, so the browser always lands somewhere sensible):
on an invalid/expired/already-used token — redirects to `/?magicLink=error`, no cookie set (FR-004).

## Cross-cutting

- The request endpoint is rate-limited (`rateLimitByIp`, FR-007). The verify endpoint is a `GET`
  carrying its own single-use secret in the token itself — not separately rate-limited, same
  reasoning `research.md`/spec.md's Assumptions gave for why passkey's equivalent read-heavy paths
  don't need it beyond the token's own entropy.
- No endpoint here ever creates a `tenants`/`users`/`magic_link_identities` row except inside
  `verify`'s successful path (FR-002) — `request` only ever touches `magic_link_tokens`.
