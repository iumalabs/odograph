# Research: Cloudflare OIDC Sign-In

## Decision 1: Cloudflare Access "Generic OIDC" SaaS application is the real mechanism

**Decision**: The deploying operator configures a "Generic OIDC" SaaS application inside their own
Cloudflare Access (Zero Trust) setup. Cloudflare Access then exposes standard OIDC endpoints scoped
to that application:

```
Authorization: https://<team-name>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>/authorization
Token:         https://<team-name>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>/token
JWKS:          https://<team-name>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>/jwks
Discovery:     https://<team-name>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>/.well-known/openid-configuration
Issuer (iss):  https://<team-name>.cloudflareaccess.com
```

(Source: Cloudflare's own "Generic OIDC" SaaS application documentation, fetched and verified
2026-08-26.) Odograph does not need to sit behind Cloudflare Access itself — it's a fully
independent OIDC relying party doing a standard authorization-code flow, architecturally identical
to the existing Google integration.

**Rationale**: This is the one real, documented mechanism matching what the issue described
("Cloudflare Access as an OIDC provider for a Zero Trust-protected app... or something else").
Verified directly against Cloudflare's docs rather than assumed, per Constitution Principle IV's
spirit (no invented facts) extended to how this spec/plan is grounded.

## Decision 2: Endpoints are templated from two config values, no runtime discovery fetch

**Decision**: Construct the three endpoint URLs directly from `team-name` + `client-id` using the
fixed pattern above, the same way `GOOGLE_AUTHORIZATION_ENDPOINT`/`GOOGLE_TOKEN_ENDPOINT`/
`GOOGLE_JWKS_URI` are hardcoded constants today. No runtime fetch of the `.well-known` discovery
document.

**Rationale**: The pattern is simple, fully deterministic, and directly documented by Cloudflare —
a discovery fetch would add a network round-trip and a new failure mode (discovery endpoint
unreachable) for no benefit over string-templating two known-shape config values. Matches this
codebase's existing style (Google's endpoints aren't discovered either, they're constants).

**Alternatives considered**: Fetching the discovery document at runtime and caching it — more
"standard OIDC," but genuinely unnecessary complexity here since Cloudflare's endpoint URL shape is
fixed and documented, not something that needs to be discovered dynamically per deployment.

## Decision 3: Extract a shared, provider-parameterized OIDC core

**Decision**: `src/server/auth/oidc/google.ts` today is already ~90% provider-agnostic — every
function (`buildXAuthorizationUrl`, `exchangeCodeForTokens`, `completeXSignIn`, `completeXLink`)
takes provider-specific values only as parameters or a handful of module-level constants (endpoint
URLs, `PROVIDER` string). Extract the shared logic into a new `src/server/auth/oidc/client.ts`
(generic core, parameterized by an `OidcProviderConfig`: authorization/token/jwks endpoints,
issuers, provider slug), with `google.ts` and a new `cloudflare.ts` becoming thin
config-declaration + re-export modules that call into the shared core. Similarly generalize
`verify-id-token.ts`'s `verifyGoogleIdToken` into a provider-agnostic `verifyOidcIdToken(idToken,
{jwks, audience, issuers})`.

**Rationale**: This is the second concrete instantiation of an already near-generic pattern — the
textbook moment to extract a shared implementation, not a premature one (premature would be
generalizing before a second real case existed). Duplicating ~150 lines of near-identical
multi-function logic for Cloudflare would be a much worse outcome than the modest, already-implied
generalization the existing code all but asks for (every function is already parameterized by
everything except the provider's fixed constants).

**Alternatives considered**: Copy `google.ts` wholesale into `cloudflare.ts` with different
constants (matches the "three similar lines beats premature abstraction" instinct, but this isn't
three similar lines — it's ~150 lines of logic identical in structure and behavior; duplicating it
verbatim would make every future bugfix/security change a two-file update with real risk of drift).

## Decision 4: Route file follows the same shared-core pattern, not full route deduplication

**Decision**: `src/server/routes/v1/auth/oidc/cloudflare.ts` (new) mirrors
`routes/v1/auth/oidc/google.ts`'s three routes (`/start`, `/link`, `/callback`) almost verbatim,
but each handler calls into the now-shared `client.ts` functions from Decision 3 instead of
Google-specific ones. Not extracted into a single route-factory function shared by both provider
route files.

**Rationale**: The *business logic* (state creation, token exchange, verification, session
issuance) is what's actually risky to duplicate and drift — that's fully shared via Decision 3. The
Hono route-wiring boilerplate around it (rate-limiting middleware placement, redirect URL
construction, error-redirect shape) is thin, and keeping it as two explicit, readable route files
(matching every other provider's own route file in this codebase — magic-link, passkey each have
their own too) is more legible than a route-factory abstraction whose only payoff is avoiding ~40
lines of straightforward Hono wiring per provider.

## Decision 5: Outcome banners must name which provider succeeded — new `provider` query param

**Decision**: Today, `oidcOkBanner`/`oidcErrorBanner`/`oidcLinkedBanner` hardcode "Google" in their
English text (`"Signed in with Google."`, etc.), even though the redirect they're driven by
(`?oidc=ok/error/linked`) is already provider-agnostic. With two OIDC providers, this would show a
Google-specific banner after a successful Cloudflare sign-in. Add a `provider` query param to the
callback redirect (`?oidc=ok&provider=google` / `?oidc=ok&provider=cloudflare`), and change the
three banner strings to interpolate it via the existing `{param}` templating convention already
used throughout `strings.ts` (e.g. `oidcOkBanner: "Signed in with {provider}."`).

**Rationale**: The existing `t(key, params)` mechanism already supports exactly this shape (used
extensively elsewhere, e.g. `signedInAs: "Signed in — tenant {tenantId}"`); this is the smallest
change that keeps the banner copy accurate for both providers rather than either duplicating three
more banner keys per provider or leaving Cloudflare users looking at a banner that says "Google."

**Alternatives considered**: Separate `cloudflareOidcOkBanner`/etc. keys mirroring the magic-link/
OIDC split — rejected as more keys and more client-side branching for no behavioral difference; the
banners' only actual difference is which provider name to show.

## Decision 6: New secrets, following `GoogleOidcSecrets`'s existing typing pattern

**Decision**: Add a `CloudflareOidcSecrets` type in `src/server/types.ts` (mirroring
`GoogleOidcSecrets`): `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_CLIENT_ID`,
`CLOUDFLARE_ACCESS_CLIENT_SECRET` — three values, one more than Google needs, since Cloudflare's
endpoint URLs are per-team rather than global constants. Set via `wrangler secret put`, same as
Google's, never in `wrangler.toml`.

**Rationale**: Directly mirrors the existing, working pattern — no new mechanism.

## Decision 7: Optional-by-default, no server-side guard needed (matches Google's existing behavior)

**Decision**: No explicit "is Cloudflare configured?" check anywhere in the new code. If
`CLOUDFLARE_ACCESS_CLIENT_ID`/etc. are unset, `/start` builds an authorization URL with `undefined`
baked into it; the browser is redirected to Cloudflare's own endpoint, which rejects the malformed
request — the same failure shape `docs/self-hosting.md` already documents for an unconfigured
Google: *"clicking it will fail against Google's own authorization endpoint rather than break the
rest of the app."*

**Rationale**: Reuses an already-correct, already-documented degradation pattern instead of
inventing a new one (FR-004/SC-003). `GoogleOidcSecrets` itself is typed as required-looking
`string` fields (not `string | undefined`) despite being genuinely optional at deploy time — the
existing codebase already accepts this small type/reality mismatch in exchange for not needing a
runtime guard anywhere; `CloudflareOidcSecrets` follows the identical convention for consistency.

## Decision 8: Dev-only fixture route mirrors `dev-oidc.ts` exactly

**Decision**: New `src/server/auth/dev-cloudflare-oidc.ts`, mounted at
`/api/v1/_dev/oidc-cloudflare`, structurally identical to the existing `dev-oidc.ts` — signs a
fixture ID token via the same, already-provider-agnostic `oidc/fixture.ts` (its `issuer`/`audience`
parameters are already optional overrides, so no changes needed there) and drives the new
`completeCloudflareSignIn` with a local fixture JWKS, exactly mirroring how `dev-oidc.ts` drives
`completeGoogleSignIn` today.

**Rationale**: `oidc/fixture.ts`'s own header comment already frames it as reusable
("mirrors tests/server/fixtures/webauthn.ts's role for passkey") and its `signFixtureIdToken`
already accepts `issuer`/`audience` overrides — it was already built provider-agnostic, just never
had a second caller yet.

## Decision 9: No data model change

**Decision**: `oidc_identities` (migration `0004_oidc.sql`) is reused as-is — `provider = 'cloudflare'`
is just a new value in an existing `TEXT NOT NULL` column, no migration needed.

**Rationale**: This was explicitly designed for exactly this moment —
`specs/004-google-oidc-authentication/data-model.md`'s own words: *"A second provider added later
reuses this same table with a different `provider` value... no migration needed."* Confirmed by
reading the actual migration file, not just the design doc's claim.

## Decision 10: Preview deploys don't get a working Cloudflare sign-in either — same as Google

**Decision**: Document (in contracts/api.md, mirroring specs/004's own precedent) that this flow
doesn't function on per-PR preview deploys, for the same reason Google's doesn't: the redirect URI
allowlist configured in the operator's Cloudflare Access application is fixed, not something that
can include every PR's dynamic preview hostname. Works on local dev (via the dev-only fixture
route) and production only.

**Rationale**: Identical structural constraint to the existing, already-accepted Google limitation
— no new decision needed, just carrying the same one forward.
