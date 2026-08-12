# Research: Dev-Only Google OIDC Fixture Sign-In Endpoint

## Decision: Move the fixture-signing module from `tests/` to `src/server/auth/oidc/`

**Rationale**: `tests/server/fixtures/oidc.ts`'s `fixtureJwks()`/`signFixtureIdToken()` already do
exactly what this feature needs — a locally-generated ECDSA P-256 keypair, a matching local JWKS via
`jose`'s `createLocalJWKSet`, and a function to sign a fixture ID token with caller-supplied claims
— already proven safe (zero real Google network calls) by `tests/server/oidc-auth.test.ts`. The
only reason it can't be reused as-is is location: `tests/` isn't part of what the running dev Worker
bundles. Moving it to `src/server/auth/oidc/fixture.ts` (a peer of `verify-id-token.ts`, the
production verification module it mirrors) makes it reachable by both the dev route and the
existing test suite; `tests/server/fixtures/oidc.ts` becomes a one-line re-export so no existing
`import` in `oidc-auth.test.ts` needs to change beyond the module it points at.

**Alternatives considered**: Duplicating the signing logic into a new `src/`-side copy instead of
moving it — rejected; this is exactly the "two copies of security-adjacent code that must both stay
correct" problem already avoided once this session (the `notFoundOutsideDev` export/reuse decision
for the magic-link feature) — moving, not copying, keeps one source of truth.

## Decision: Deterministic `sub` derived from the caller-supplied email

**Rationale**: Account resolution (`findOidcIdentityByProviderAndSubject`/`createOidcUser`) is keyed
by `(provider, subject)`, never by email (constitution D-004 — accounts are never
auto-linked by email). FR-002 requires that calling this endpoint twice with the same email
resolves to the same account, not a duplicate. If `sub` were randomized per call (as
`signFixtureIdToken`'s test-suite callers currently do, generating a fresh unique subject per test
case since each test wants its own isolated identity), two calls with the same email would produce
two different accounts — violating FR-002. The endpoint therefore derives `sub` deterministically
from the input email (e.g. a stable prefix + the email itself) rather than randomizing it, so
"same email in, same account resolved" holds — the caller only ever needs to supply an email, not
manage a separate subject identifier.

**Alternatives considered**: Requiring the caller to always supply their own `sub` explicitly —
rejected; spec.md's FR-001 only requires "at minimum an email address," and forcing every caller
(the future e2e suite) to invent and track a separate subject per test identity is unnecessary
ceremony when a deterministic derivation from email satisfies FR-002 with a simpler caller contract.

## Decision: Sign-in only, not account-linking

**Rationale**: `completeGoogleLink` (the account-linking counterpart to `completeGoogleSignIn`) is
not driven by this endpoint — spec.md FR-008 and the source decision in issue #96 both scope this
to the sign-in path only, since `check-coverage-threshold.ts` names only Google OIDC sign-in as a
coverage blocker, not the linking flow.

**Alternatives considered**: Building both paths now for completeness — rejected; scope creep
beyond what was actually asked for and beyond what the coverage gate needs, matching the source
issue's explicit framing.

## Decision: `GET`, mirroring the real `/callback` route's exact method and response shape

**Rationale**: Unlike the magic-link case — where the dev endpoint only had to supply one missing
*ingredient* (the token) and the real `/verify` route still did the actual completing, redirecting,
and cookie-setting — there is no equivalent hand-off point for OIDC. The real `/callback` route
only ever accepts an authorization `code` and immediately exchanges it over the network
(`exchangeCodeForTokens`) before JWKS verification even runs; there is no way to hand a
already-obtained ID token into that route the way `/verify` accepts an already-obtained magic-link
token. This dev endpoint therefore has to stand in for the *entire* callback route's effect in one
shot — sign the fixture token, verify it, resolve the account, issue the session, redirect — which
is exactly why FR-004 requires the outcome to be indistinguishable from the real flow's outcome.
Making it a `GET` that redirects to `/?oidc=ok` with a `Set-Cookie` header, in the same shape the
real callback produces, is what actually lets a browser-driven e2e test `page.goto()` straight to
it and land in the same signed-in-via-Google UI state a real user would — directly exercising the
client-side OIDC-completion code path this whole feature exists to unblock coverage of.

**Alternatives considered**: `POST` returning JSON (mirroring `dev-magic-link.ts`'s shape) —
rejected; that pattern fit magic-link because a *separate, still-real* route (`/verify`) existed to
consume its output and produce the actual redirect. No such second route exists for OIDC to hand
off to, so a JSON-returning endpoint here would leave e2e with a session but no way to drive the
actual client-side redirect-handling UI path via browser navigation — defeating the feature's
stated purpose (spec.md SC-001, "entirely through HTTP calls" reaching the *same UI state*, not
just an authenticated session state).
