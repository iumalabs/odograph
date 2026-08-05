# Research: Google OIDC Authentication

## Library choice: hand-rolled Authorization Code + PKCE flow, `jose` for ID token verification

**Decision**: No OAuth client library. Implement the Authorization Code flow with PKCE by hand
(Web Crypto for the PKCE `code_verifier`/`code_challenge`, `fetch()` for the token endpoint), and
use `jose` v6.x — specifically `jwtVerify`, with `createRemoteJWKSet` in production and an
injectable `JWTVerifyGetKey` in tests — for ID token signature/issuer/audience/expiry verification.

**Rationale**: `arctic`, the library that would otherwise be the obvious choice, was deprecated by
its own author in July 2026 (`pilcrowonpaper.com/blog/18`) — he now recommends copying example code
rather than depending on the package, calling the abstraction layer itself a mistake for OAuth 2.0.
`openid-client` is built around Node-specific APIs and isn't a good fit for `workerd`. `jose`
explicitly supports Cloudflare Workers (Web Crypto-based, no Node polyfills) and remains the de
facto standard for edge JWT verification — using it for exactly the one thing it's for (verifying a
JWT against a JWKS) while hand-rolling the ~5-fetch-call OAuth exchange keeps the dependency surface
small and matches what current Workers-community examples do.

**Alternatives considered**:

- `arctic` — rejected: deprecated, no successor, author explicitly disowns the abstraction.
- `openid-client` — rejected: Node-API-oriented, poor fit for Principle X (Web Crypto only).
- A full OIDC discovery-document fetch (`.well-known/openid-configuration`) at request time —
  rejected in favor of hardcoding Google's known-stable endpoints (below); discovery adds a network
  round trip and a new failure mode for no real benefit when there's exactly one provider and its
  endpoints are long-stable public values, same reasoning WebAuthn's `research.md` gave for not
  over-engineering a single-provider case.

## Google-specific endpoints and requirements

- **Authorization endpoint**: `https://accounts.google.com/o/oauth2/v2/auth`
- **Token endpoint**: `https://oauth2.googleapis.com/token`
- **JWKS URI**: `https://www.googleapis.com/oauth2/v3/certs`
- **Issuer**: Google's ID tokens report `iss` as `https://accounts.google.com`; Google's own docs
  say to also accept the bare `accounts.google.com` form. `jwtVerify`'s `issuer` option accepts an
  array — both values are checked.
- **PKCE**: implemented (`S256`) even though this is a confidential (server-side) client, not
  because Google requires it for this client type but because it's a real, cheap defense-in-depth
  layer against authorization-code interception — and Google still requires `client_secret`
  alongside it (PKCE doesn't replace the secret for this client type, unlike a pure public client).
- **Scopes**: `openid email profile` — non-sensitive scopes, which as of 2026 don't trigger Google's
  app-verification review (2-6 weeks); the app can publish and use its OAuth client immediately.

## State/PKCE storage: a new short-lived D1 table, not KV or a signed cookie

**Decision**: Store `state` and `code_verifier` together in a new `oidc_states` table — a random,
high-entropy `state` value as the primary key, single-use (deleted on consume), short TTL — the same
shape as `webauthn_challenges` and `magic_link_tokens`.

**Rationale**: General OAuth guidance for stateless edge backends favors a hybrid of server-side
storage plus a signed cookie binding the callback to the same browser. This project already has an
established, working answer to "how do we protect a single-use ceremony step" that predates OIDC:
`webauthn_challenges` and `magic_link_tokens` both treat "a random, unguessable, single-use,
short-TTL value checked via an atomic D1 check-and-delete" as sufficient anti-replay protection on
its own, with no additional cookie layer. `state` here plays exactly that role — an attacker would
need to already know the exact `state` value (as unguessable as a WebAuthn challenge or a magic-link
token) to exploit it, and it can only be consumed once. Adding a second, redundant protection layer
would diverge from the project's own established threat model for identically-shaped problems
without a concrete new risk to justify it. Using D1 (not KV) also keeps this feature consistent with
how the other two auth methods store their ephemeral ceremony state, rather than introducing a new
storage pattern for no functional reason.

**Alternatives considered**:

- KV-only, keyed by `state` — workable, but introduces a second storage pattern for the same kind of
  data this project already puts in D1 twice; rejected for consistency, not a security objection.
- Signed HttpOnly cookie carrying `state`/`code_verifier` directly (no server-side storage) —
  rejected: larger cookie, harder to make genuinely single-use/revocable (a cookie can be replayed by
  re-sending it; the D1 row's deletion-on-consume is what makes single-use actually enforced).
- Cookie *and* D1 (the literature's hybrid recommendation) — rejected as redundant given this
  project's existing precedent (above); noted here so the divergence from general guidance is a
  documented decision, not an oversight.

## Ephemeral per-PR preview URLs can't complete Google's redirect flow — and that's an accepted limitation

**Finding**: Unlike WebAuthn (`rpID`/`origin` derived per-request from the incoming URL — see
specs/002's research.md) or magic-link (verify link built from the request's own origin), Google
OAuth requires the exact `redirect_uri` to be pre-registered in the Google Cloud Console's OAuth
client. Per-PR preview deploys use a dynamic hostname (`odograph-pr-<N>.kgz.workers.dev`) that isn't
known until the PR exists and can't be pre-registered — Google will reject the callback
(`redirect_uri_mismatch`) for any preview URL not explicitly on the client's allowlist.

**Decision**: Register exactly two redirect URIs on one Google OAuth client — the production URL
(`https://odograph.dev/api/v1/auth/oidc/google/callback`) and a local-dev URL
(`http://localhost:5173/api/v1/auth/oidc/google/callback`). Google sign-in is expected to work on
production and local `deno task dev`, and is expected to **not** functionally complete on per-PR
preview deploys (the button/flow is present and doesn't error until the actual Google redirect,
which is an acceptable, documented gap — not something this feature works around). This feature's
live smoke test (mirroring magic-link's T007) therefore targets local dev and, after merge,
production — not the PR preview environment, unlike magic-link's smoke test which did target the PR
preview. Automated tests don't depend on this at all (below).

**Rationale**: There's no general mechanism to register a wildcard or dynamically-provisioned
redirect URI with Google, and automating per-PR Google Cloud Console API calls to add/remove
redirect URIs for a throwaway preview Worker is disproportionate complexity for a review-only
environment. This mirrors the spirit of magic-link's T007 finding: a real external-provider
constraint, not a code defect, documented and worked around at the process level rather than papered
over.

## Testing strategy: fixture ID tokens, no live Google network calls in the automated suite

**Decision**: `verifyGoogleIdToken` takes an injectable key-resolution function
(`jose`'s `JWTVerifyGetKey` type) rather than always constructing `createRemoteJWKSet` internally.
Production code passes `createRemoteJWKSet(new URL(GOOGLE_JWKS_URI))`; tests sign a fixture ID token
with a locally generated EC keypair (Web Crypto `crypto.subtle.generateKey`/`sign`) and pass a
matching static JWKS via `jose`'s `createLocalJWKSet`. This proves the verification logic (issuer,
audience, expiry, signature) end-to-end without a real Google server, the same "control the input,
verify the real crypto path" approach `tests/server/fixtures/webauthn.ts` already uses for
passkey's registration/login responses.

The one step this can't cover — the actual `fetch()` to Google's token endpoint exchanging an
authorization code for tokens — has no local fixture equivalent (no mock-server infrastructure
exists in this project, and building one is out of proportion to a single external call). Per the
Google Cloud OAuth client not yet existing at the time of writing this research, and per
[[feedback_qa_agent_division_of_labor]]'s scope boundary (this agent implements, it doesn't own e2e
infra), this step is proven via a live smoke test task against local dev once real Google OAuth
credentials exist — the same residual-risk-acceptance shape as magic-link's T007, not a gap left
unaddressed.

## Google OAuth client credentials: Workers secrets, not `wrangler.toml` vars

**Decision**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both Workers secrets (set via
`wrangler secret put <NAME> --env <env>`, once, manually, by the project owner — not committed to
`wrangler.toml`, not set by CI). `GOOGLE_CLIENT_SECRET` must be a secret; `GOOGLE_CLIENT_ID` isn't
strictly sensitive but is kept alongside it rather than hardcoded in the committed config, since its
value belongs to a Google Cloud project this repository doesn't own or control the identity of.

**Rationale**: Setting a Workers secret is a one-time configuration action, not a deploy — it
doesn't touch the GitHub-Actions-only deploy pipeline (Principle XII governs deploying the Worker
itself, not provisioning the bindings/secrets it reads, the same category as the D1/KV resources
already created once outside CI during bootstrap). This mirrors `CLOUDFLARE_API_TOKEN` being a
manually-provisioned, environment-scoped secret rather than something CI generates.
