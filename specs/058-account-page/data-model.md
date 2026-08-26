# Phase 1 Data Model: Account Page

No new tables or columns. One new derived (computed-on-request) shape, and two new HTTP endpoints.

## `AccountProfile` (server-computed, never persisted)

| Field | Type | Source |
|---|---|---|
| `email` | `string` | `users.email` |
| `sessionExpiresAt` | `string` (ISO 8601) | `sessions.expires_at` for the current session |
| `passkeyCount` | `number` | `COUNT(*)` over `webauthn_credentials` for this user |
| `hasGoogle` | `boolean` | existence check over `oidc_identities` (`provider = 'google'`) for this user |
| `linkedEmails` | `string[]` | `magic_link_identities.email` for this user (may include the same address as `email` if that's how the account signed up) |

## Endpoints

### `GET /api/v1/account`

- Auth: `tenantContext` (cookie-only — never `tenantContextOrToken`; an API token must not be able
  to read account profile data, per plan.md's Constitution Check).
- Response: `200 AccountProfile` (shape above).
- No request body.

### `POST /api/v1/account/sign-out`

- Auth: `tenantContext` + `rateLimitBySession` (same guards the existing `DELETE /api/v1/account`
  route already uses).
- Behavior: `invalidateSession(db, kv, cookieHeader)` (existing function, unchanged) — invalidates
  the session row and clears its KV cache entry; response sets `Set-Cookie` to the existing
  `serializeExpiredSessionCookie()` value.
- Response: `200 { signedOut: true }` on success, `401 { error: "unauthorized" }` if the session
  cookie doesn't resolve to a valid session (mirrors the dev route's existing contract).
- No request body.

### `DELETE /api/v1/account` (existing, unchanged)

Documented here only for completeness — this feature adds two siblings to it in the same file, it
doesn't modify it.

## Validation rules

- Both new endpoints only ever read/act on the tenant/user resolved from the caller's own session
  — no id is ever accepted from the request body or query string (Constitution Principle I).
- `AccountProfile` never includes a field this app can't back with a real query — no `role`, no
  `provider` (singular — an account can have multiple linked methods at once, so a single
  "provider" field would misrepresent that), no fabricated display name.
