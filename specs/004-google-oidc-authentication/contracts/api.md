# API Contracts: Google OIDC Authentication

Routes under `/api/v1/auth/oidc/google`.

## `GET /api/v1/auth/oidc/google/start`

Begins the sign-in flow. Rate-limited via `rateLimitByIp` (no session exists yet, same as passkey
registration/login and magic-link's request step).

**Response** `302`: generates and stores a `state`/PKCE `code_verifier` pair (`createOidcState`),
redirects to Google's authorization endpoint with `client_id`, `redirect_uri`, `response_type=code`,
`scope=openid email profile`, `state`, `code_challenge`, `code_challenge_method=S256`.

## `GET /api/v1/auth/oidc/google/callback?code=...&state=...`

Completes sign-in. Reached only via Google's own redirect — no client-side JavaScript involved
(same "plain link, opened by a browser navigation" shape as magic-link's verify endpoint).

**Response** `302` (success): on a valid, unused, unexpired `state` (`consumeOidcState`) and a
successfully verified ID token — sets the session cookie (identical shape to every other auth
method's) and redirects to `/?oidc=ok`.

**Response** `302` (failure — a redirect either way, so the browser always lands somewhere sensible):
on an invalid/expired/already-used `state`, a Google error response (`?error=...` on the callback,
e.g. the user denied consent), a token-exchange failure, or an ID token that fails verification
(signature/issuer/audience/expiry) — redirects to `/?oidc=error`, no cookie set, no partial state
persisted (FR-006).

## Cross-cutting

- `/start` is rate-limited (`rateLimitByIp`, FR-007). `/callback` carries its own single-use secret
  (`state`) and is not separately rate-limited, same reasoning passkey/magic-link's equivalent
  read-heavy paths gave.
- No endpoint here ever creates a `tenants`/`users`/`oidc_identities` row except inside `callback`'s
  successful path (FR-006) — `start` only ever touches `oidc_states`.
- Neither endpoint ever queries `users.email` to resolve an identity (D-004/FR-003a) — resolution is
  always `(provider, subject)` via `oidc_identities`.
- This flow does not function on per-PR preview deploys (research.md — Google's `redirect_uri`
  allowlist can't include a dynamic preview hostname); it's expected to work on local dev and
  production only.
