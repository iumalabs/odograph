# API Contracts: Cloudflare OIDC Sign-In

Routes under `/api/v1/auth/oidc/cloudflare`. Mirrors
`specs/004-google-oidc-authentication/contracts/api.md` almost exactly — differences called out
explicitly below.

## `GET /api/v1/auth/oidc/cloudflare/start`

Begins the sign-in flow. Rate-limited via `rateLimitByIp` (no session exists yet, same as Google's
`/start`).

**Response** `302`: generates and stores a `state`/PKCE `code_verifier` pair (`createOidcState`,
unchanged/shared with Google), redirects to `https://<CLOUDFLARE_ACCESS_TEAM_DOMAIN>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<CLOUDFLARE_ACCESS_CLIENT_ID>/authorization`
with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`,
`code_challenge`, `code_challenge_method=S256` — identical parameter shape to Google's, different
target host.

## `GET /api/v1/auth/oidc/cloudflare/link`

Account linking — requires an already-authenticated session (FR-002/D-004), identical shape to
Google's `/link`. No unauthenticated variant.

## `GET /api/v1/auth/oidc/cloudflare/callback?code=...&state=...`

Completes sign-in. Reached only via Cloudflare Access's own redirect.

**Response** `302` (success): on a valid, unused, unexpired `state` and a successfully verified ID
token (issuer `https://<CLOUDFLARE_ACCESS_TEAM_DOMAIN>.cloudflareaccess.com`, audience
`CLOUDFLARE_ACCESS_CLIENT_ID`) — sets the session cookie and redirects to
`/app?oidc=ok&provider=cloudflare` (sign-in) or `/app?oidc=linked&provider=cloudflare` (linking).
The new `provider` param (research.md Decision 5) is what lets the client show "Signed in with
Cloudflare" rather than a hardcoded "Google" — Google's own callback gains
`&provider=google` too, as part of this same change.

**Response** `302` (failure): on an invalid/expired/already-used `state`, a Cloudflare error
response, a token-exchange failure, or an ID token that fails verification — redirects to
`/?oidc=error&provider=cloudflare`, no cookie set, no partial state persisted (FR-006, matching
Google's existing failure contract exactly).

## Cross-cutting

- `/start` and `/link` are rate-limited exactly as Google's are. `/callback` carries its own
  single-use secret (`state`) and is not separately rate-limited, same reasoning as Google's.
- Identity resolution is always `(provider, subject)` via `oidc_identities` — this route never
  queries `users.email` to resolve an identity (D-004), identical to Google.
- **Does not function on per-PR preview deploys** (research.md Decision 10) — the operator's
  Cloudflare Access application has a fixed redirect URI allowlist, not a dynamic per-PR one.
  Expected to work on local dev (via the dev-only fixture route,
  `GET /api/v1/_dev/oidc-cloudflare?email=...`) and production only.
- Unlike Google, three config values are required for this provider to function at all
  (`CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_CLIENT_ID`,
  `CLOUDFLARE_ACCESS_CLIENT_SECRET`), not two — the endpoint hostnames themselves are per-team,
  unlike Google's fixed global endpoints. Missing values degrade the same way Google's missing
  values already do (research.md Decision 7): a malformed request that Cloudflare's own endpoint
  rejects, not a crash in Odograph's own code.
