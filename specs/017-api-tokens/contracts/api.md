# Phase 1 Contracts: API Tokens

All routes below require a valid session cookie (`tenantContext`, cookie-only — research.md's
session-only boundary decision). None of them accept an `Authorization: Bearer` token, regardless of
that token's scope.

## `POST /api/v1/tokens`

Creates a new token.

**Request**: `{ "label": string, "scope": "read" | "write" }`

- `label`: non-empty string.
- `scope`: exactly `"read"` or `"write"`.

**Response `201`**:

```json
{
  "id": "...",
  "label": "...",
  "scope": "read",
  "createdAt": "...",
  "lastUsedAt": null,
  "revokedAt": null,
  "token": "odo_<plaintext, shown only in this response>"
}
```

**Response `400`** `{ "error": "invalid_request" }` if `label` is missing/empty or `scope` isn't one
of the two allowed values. Nothing is created.

## `GET /api/v1/tokens`

Lists every token (active and revoked) belonging to the caller.

**Response `200`**: `{ "tokens": ApiToken[] }` — each entry has `id`, `label`, `scope`, `createdAt`,
`lastUsedAt`, `revokedAt`. Never `token` or any hash.

## `DELETE /api/v1/tokens/:id`

Revokes a token immediately.

**Response `204`** on success (sets `revokedAt`, idempotent contract: revoking an already-revoked
token still returns `204`, since the end state — "this token doesn't work" — is already true).

**Response `404`** if `:id` doesn't exist or belongs to a different owner — identical response
either way, matching every other resource's not-found-or-not-yours contract in this app.

---

## Every existing resource route (`/api/v1/vehicles`, `/service-records`, `/fuel-records`,

`/reminder-rules`, and their attachments/aggregates sub-routes)

Unchanged request/response shapes. Now additionally accept `Authorization: Bearer <token>` as an
alternative to the session cookie (`tenantContextOrToken` — research.md). Behavior:

- A **read-write** token behaves identically to a session cookie for every method.
- A **read** token behaves identically to a session cookie for `GET`/`HEAD`; every other method
  returns `403` `{ "error": "read_only_token" }` before the route handler runs, with nothing
  changed.
- A missing, malformed, unknown, or revoked token — with no session cookie present either — returns
  `401` `{ "error": "unauthorized" }`, identical to today's cookie-only behavior for a missing
  session.

## `DELETE /api/v1/account` (existing, spec 016)

Unchanged: cookie-only (`tenantContext`, not `tenantContextOrToken`) — a token, including a
read-write one, cannot delete the account (FR-013).
