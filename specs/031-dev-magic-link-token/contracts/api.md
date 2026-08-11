# API Contracts: Dev-Only Magic-Link Token Retrieval Endpoint

## `GET /api/v1/_dev/magic-link-token?email=<email>`

**Production behavior**: Identical to a route that does not exist — `404`, no body, no distinct
headers, no database work performed first (`notFoundOutsideDev` runs before anything else). This
is true regardless of whether `email` is present, well-formed, or missing.

**Non-production behavior**:

- **Response** `200` (token pending): `{ "token": string, "expiresAt": string }` — mirrors
  `findMagicLinkTokenByEmail`'s own return shape exactly.
- **Response** `200` (no token pending): `{ "token": null, "expiresAt": null }` — a normal, valid
  outcome (email never requested a link, already consumed it, or it expired), not an error status.
- **Response** `200` (missing/malformed `email`): same as "no token pending" — treated identically,
  never a `4xx` client error, per spec.md's edge case.

No `POST`/`DELETE`/mutation of any kind — this route has exactly one method, and it never creates,
consumes, or invalidates a token. Every existing token-lifecycle route
(`POST /api/v1/auth/magic-link/request`, `/link`, `GET /verify`) is unchanged by this feature.

## Cross-cutting

- Not tenant-scoped — same posture as the real `/request`/`/verify` routes, which also operate
  before any session/tenant context exists for a not-yet-signed-in caller.
- No rate limiting on this route (research.md, plan.md Constitution Check) — its exposure is
  entirely bounded by `notFoundOutsideDev`, not a request-volume control.
