# API Contracts: GDPR Account Erasure

Requires an authenticated session (`tenantContext`) — `401` without one, same as every other route.

## `DELETE /api/v1/account`

**Request**: `{ "confirm": string }` — required. Must be the exact literal phrase
`"DELETE MY ACCOUNT"`.

**Response** `204`: the account and everything belonging to it is gone. The response also clears the
session cookie (an expired `Set-Cookie`, same shape `POST /_dev/session/invalidate` already sends) —
the caller is signed out as of this response, regardless of whether they inspect the body.

**Response** `400`: `{ "error": "invalid_request" }` — `confirm` is missing or doesn't match the
required phrase exactly. Nothing is deleted; the account and session are untouched and the caller
remains signed in exactly as before the request.

**Response** `401`: no valid session — same as every other route.

Rate-limited via `rateLimitBySession`, same as every other write route.

## Cross-cutting

- Nothing here accepts or trusts a client-supplied tenant/user id — the account deleted is always
  the one resolved from the caller's own session, never a value named in the request.
- There is no `GET`/list form of this route and no way to delete another tenant's account through it
  — the only identity this route ever acts on is the caller's own (FR-009).
- This is the only route in the project so far requiring a request body field whose exact value
  gates whether anything happens — every other write route validates shape/type, not a literal
  string match, reflecting that this is the one action in the app that can never be undone.
