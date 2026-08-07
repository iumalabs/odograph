# Phase 0 Research: API Tokens

No `NEEDS CLARIFICATION` markers remain in the Technical Context. The decisions below cover token
generation/hashing (reusing an existing pattern), the dual-auth middleware design that lets every
existing resource route accept a token without per-route changes, read-scope write-blocking, the
session-only boundary around token management and account deletion, and rate-limiting reuse.

## Token generation and hashing: reuse session.ts's exact pattern, with a recognizable prefix

**Decision**: A token is 32 random bytes, base64url-encoded (identical to `session.ts`'s
`generateToken()`), prefixed with `odo_` (e.g. `odo_xLK3...`), and stored as a SHA-256 hex digest
(identical to `session.ts`'s `sha256Hex()`). The prefix is not part of the random material — it's a
constant string prepended before hashing, so `sha256Hex("odo_" + random)` is what's stored.

**Rationale**: Reuses proven code rather than inventing a second token scheme in the same codebase —
`session.ts` already has exactly this shape (random bytes → base64url → SHA-256 hex for storage).
The `odo_` prefix mirrors a well-established real-world convention (GitHub's `ghp_`, Stripe's
`sk_live_`) that makes a leaked token recognizable at a glance in logs, git history, or automated
secret scanners — a small, low-cost addition well within this project's scale, not overengineering.

**Alternatives considered**:

- **JWT-style self-describing tokens**: rejected — this app has no need for a token to carry claims
  the server can decode without a database lookup; every other credential in this app (session,
  magic-link) is an opaque random value checked against D1, and a token should follow the same
  established pattern for consistency and auditability (a JWT can't be individually revoked without
  a denylist, which just reintroduces the database lookup this alternative was trying to avoid).
- **No prefix**: rejected — costs nothing to add and meaningfully helps an owner (or a secret
  scanner) recognize a leaked token at a glance.

## Dual-auth middleware: one new middleware, swapped in at the file level, not per-route

**Decision**: A new `tenantContextOrToken` middleware (in `src/server/middleware/tenant-context.ts`,
alongside the existing `tenantContext`) resolves either a session cookie (delegating to the existing
`resolveSession`) or an `Authorization: Bearer <token>` header (via a new `findValidApiTokenByHash`
repository function), setting the same `c.set("tenant", ...)` shape either way. `vehicles.ts`,
`service-records.ts`, `fuel-records.ts`, and `reminder-rules.ts` each swap their single
`.use("*", tenantContext)` line to `.use("*", tenantContextOrToken)` — a one-line change per file,
not a change to any individual route handler. The original `tenantContext` (cookie-only, unchanged)
stays in use by `whoami.ts`, the new token-management routes, and `account.ts` (GDPR erasure) — see
the session-only boundary decision below for why those three stay cookie-only.

**Rationale**: FR-004 requires a token to reach "the same account data a session cookie can reach"
without per-route rework. Swapping the file-level middleware once per resource-route file is the
smallest change that achieves this — every existing route handler (list/get/create/update/delete) is
completely unaware of which auth mechanism resolved its `TenantContext`, exactly like today.

**Alternatives considered**:

- **A second middleware applied route-by-route only where token access is wanted**: rejected — this
  is the same number of route files to touch but with an extra failure mode (forgetting to add it to
  a new route later), where the file-level swap fails safe (a new route file that copies an existing
  one's `.use("*", tenantContextOrToken)` line automatically gets both auth mechanisms).
- **Baking token resolution into `resolveSession` itself**: rejected — `resolveSession` has a
  specific, well-understood contract (cookie → KV cache → D1 session lookup) used by `whoami` and
  the token-management/account-deletion routes specifically _because_ it never accepts a token;
  merging the two would remove the one clean place those three routes rely on to stay cookie-only.

## Read-scope enforcement: centralized in the middleware, keyed on HTTP method

**Decision**: `tenantContextOrToken` also records which scope authenticated the request (`session`,
`read`, or `write`) via a new `c.set("authScope", ...)`. Immediately after resolving, if
`authScope === "read"` and the request method is not `GET`/`HEAD`, the middleware itself returns
`403` before any route handler runs — not a check duplicated into every mutating route handler.

**Rationale**: Every mutating action in this app (vehicles, records, attachments, reminders) is a
non-`GET` request; there's no case in this app's routing where a `GET` mutates data or a non-`GET`
only reads. Centralizing the check in the middleware that already gates every request through these
four route files means FR-005 holds automatically for every future route added to them, with no risk
of a new write route forgetting the check (the same fail-safe reasoning as the middleware-swap
decision above).

**Alternatives considered**:

- **A `requireWriteScope` middleware added individually to every POST/PATCH/DELETE route handler**:
  rejected — this is exactly the per-route churn (and per-route forgettability) the file-level
  `tenantContextOrToken` swap was chosen specifically to avoid.

## Session-only boundary: token management and account deletion never accept a token

**Decision**: `whoami.ts`, the new token-management routes (create/list/revoke), and the existing
`account.ts` (GDPR erasure, spec 016) all keep using the original, unmodified `tenantContext`
(cookie-only) — none of them are switched to `tenantContextOrToken`.

**Rationale**: FR-006 requires this for token management explicitly (a leaked token, even
read-write, must not be able to mint itself replacement access or see what other tokens exist).
FR-013 (added during this planning pass) extends the same reasoning to account deletion: an API
token is meant for ordinary CRUD access to vehicle/record data, not for triggering an irreversible,
unrecoverable action that the token-revocation safety story can't undo after the fact — by the time
an owner would notice and revoke a leaked token, a token-triggered account deletion would already be
permanent. Both are the same category of action (governs the owner's own account/credentials rather
than the data inside it), so both get the same treatment: cookie-only, no exception for a
read-write-scoped token. `whoami.ts` is left cookie-only too, since it exists specifically to let a
_browser_ discover an existing session on page load (see its own code comment) — not part of the
programmatic resource API a token is for, and out of this feature's scope to extend.

**Alternatives considered**:

- **Allowing a read-write token to manage tokens/delete the account**: rejected outright — directly
  contradicts FR-006/FR-013, and defeats the entire point of scoping and revocability if the most
  destructive actions in the app are reachable by the exact credential a leaked-token threat model
  is trying to contain.

## Rate limiting: reuse `rateLimitBySession` unmodified by writing to the same context variable

**Decision**: `tenantContextOrToken` sets `c.set("sessionTokenHash", ...)` to either the resolved
session's token hash or the resolved API token's hash — the same `AppEnv` variable name
`rateLimitBySession` (`src/server/auth/rate-limit.ts`) already reads via
`c.get("sessionTokenHash")`. `rate-limit.ts` itself needs zero changes; the existing
`rateLimitBySession` middleware, already wired into every mutating route in these four files,
correctly throttles both session- and token-authenticated callers by whichever credential's hash
identifies them. The new token-management routes (`POST`/`DELETE /api/v1/tokens...`) use
`rateLimitBySession` the same way every other authenticated write route in this app already does.

**Rationale**: `createRateLimiter`'s `getClientKey` is already pluggable per the doc comment in
`rate-limit.ts`, but the simplest correct reuse here isn't a _new_ limiter instance — it's making
sure the one variable the existing limiter already reads is populated correctly regardless of which
auth mechanism resolved the request. This avoids a second, parallel rate-limiting code path
entirely.

**Alternatives considered**:

- **A dedicated `rateLimitByApiToken` limiter instance**: rejected — unnecessary duplication once
  the existing `sessionTokenHash` variable is populated for both auth mechanisms; two limiter
  instances keyed by conceptually the same thing (a resolved credential's hash) would only add a
  second KV key namespace to reason about for no behavioral difference.

## Revocation model: soft-revoke via a nullable `revoked_at`, mirroring `sessions.invalidated_at`

**Decision**: Revoking a token sets `revoked_at` to the current timestamp rather than deleting the
row. `findValidApiTokenByHash` only returns a match where `revoked_at IS NULL` (and the row's
`token_hash` matches) — identical shape to how `findValidSessionByTokenHash` already excludes
`invalidated_at IS NOT NULL` sessions.

**Rationale**: `sessions` already established this exact soft-revoke pattern in this codebase
(`0001_tenants_users_sessions.sql`'s `invalidated_at` column). Reusing it for `api_tokens` keeps the
two "revocable bearer credential" tables consistent, and satisfies spec.md's User Story 2 acceptance
scenario 3 ("clearly marked as revoked" — the listing endpoint can show `revokedAt` directly)
without losing the historical fact that a token existed, which a hard-delete would.

**Alternatives considered**:

- **Hard-delete on revoke**: rejected — spec.md explicitly allows either "no longer appears" or
  "clearly marked as revoked," and the soft-revoke option is both more informative to the owner and
  consistent with the `sessions` table's own established precedent, at no extra cost.

## Table ownership: keyed by `user_id`, alongside the other credential tables

**Decision**: The new `api_tokens` table has
`user_id TEXT NOT NULL REFERENCES users (id) ON DELETE
CASCADE` — not a direct `tenant_id` column —
resolving to a `TenantContext` via the same `JOIN users` pattern `findValidSessionByTokenHash`
already uses.

**Rationale**: Every migration was checked (spec 016's research.md already did this exercise for the
whole schema): tables fall into two families — business data keyed directly by `tenant_id`
(vehicles, service_records, fuel_records, reminder_rules, their attachments) and "how you sign in"
credential tables keyed by `user_id` (`sessions`, `webauthn_credentials`, `magic_link_identities`,
`oidc_identities`). An API token is a credential, not business data, so it belongs in the second
family — consistent with every other authentication artifact this app already has, and its
`ON DELETE CASCADE` still satisfies FR-011 (account deletion removes every token) exactly like it
already does for sessions and every other credential table.

**Alternatives considered**:

- **Direct `tenant_id` column**: rejected only for consistency — every other "how you sign in" table
  in this schema is `user_id`-keyed, and there's no reason for tokens to be the one exception.
