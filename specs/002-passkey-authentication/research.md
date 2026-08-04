# Phase 0 Research: Passkey Authentication

## WebAuthn library: `@simplewebauthn/server` + `@simplewebauthn/browser`

**Decision**: `@simplewebauthn/server` v13 for server-side ceremony generation/verification,
`@simplewebauthn/browser` v13 for the client-side `navigator.credentials` wrapper.

**Rationale**: Checked the actual published package (not just docs, which only list Node/Deno
support without mentioning edge runtimes explicitly):

- No `node:crypto` or `require("crypto")` imports anywhere in the published ESM build.
- Ships a dedicated `isoCrypto/getWebCrypto` helper — the library's own internal abstraction
  resolves to the standard Web Crypto API (`crypto.subtle`), which `workerd` implements natively.
  This is also _why_ it supports Deno (whose `node:crypto` compat is partial) — it doesn't depend on
  Node's crypto module at all.
- Upstream issue history (searched `MasterKale/SimpleWebAuthn`) has several _closed_ issues
  specifically about ESM/edge-runtime builds (#338 "Add an ESM build... to support non-Node
  runtimes", #471 "fails to build for edge deployment", #511 "Fix edge compute issues with cbor-x
  dynamic functions") — all resolved in versions well before the v13 this plan pins. Zero open
  issues mention `workerd` or Cloudflare Workers.
- It's the de facto standard WebAuthn library for TypeScript/Node ecosystems (used by major identity
  providers' example integrations), so this isn't a niche choice with a small support surface.

**Residual risk**: Neither package's own docs _explicitly_ claim Cloudflare Workers support (only
Node/Deno are named). Mitigation: the first implementation task should be a minimal smoke test —
import both packages in a Worker and run `generateRegistrationOptions()` — before building anything
on top, so a real incompatibility surfaces immediately rather than deep into the feature.

**Alternatives considered**:

- Hand-rolled WebAuthn verification (parsing CBOR attestation objects, COSE keys, and ASN.1
  signatures directly against Web Crypto): rejected — WebAuthn's verification surface is large and
  security-critical (attestation formats, extensions, credential ID uniqueness); reimplementing it
  is exactly the kind of thing a battle-tested library exists to avoid getting subtly wrong.
- `webauthn-p` / other smaller edge-focused WebAuthn libraries: rejected on due diligence grounds —
  much smaller maintenance/audit surface than SimpleWebAuthn, no clear edge-runtime track record
  either.

## Challenge storage: D1 vs. KV

**Decision**: D1, in a `webauthn_challenges` table — same reasoning specs/001 already applied to
sessions.

**Rationale**: A challenge must be usable exactly once (FR-007) and rejected if reused, even from a
different edge location than where it was issued. KV's eventual consistency (up to ~60s global
propagation) would create a real replay window: a challenge consumed at one Cloudflare PoP could
still read as "unused" from another PoP briefly afterward. D1 is strongly consistent for a single
deployment's data, which is exactly the property "usable exactly once" needs. The extra D1
round-trip latency (issue + consume = 2 reads/writes) is immaterial for an auth ceremony that
already involves a browser biometric prompt in the middle.

**Alternatives considered**:

- KV with a short TTL: rejected — the eventual-consistency replay window above is a real correctness
  gap, not a theoretical one, for the exact same reason specs/001 rejected KV as the sessions source
  of truth.
- Signing the challenge into a stateless token instead of storing it server-side (e.g. HMAC the
  challenge + expiry, verify the HMAC on submission): rejected — this removes single-use enforcement
  entirely (a valid signed token remains valid until expiry no matter how many times it's
  submitted), which directly fails FR-007. Single-use requires server-side state by definition;
  there's no way around storing _something_.

## Discoverable (resident-key) credentials vs. server-side username lookup

**Decision**: Request resident/discoverable credentials during registration
(`authenticatorSelection.residentKey: "required"`), and generate login options with no
`allowCredentials` list — the browser's own passkey UI shows the user which stored passkeys work for
this site.

**Rationale**: This is what "passkey" means as distinct from legacy WebAuthn used as a 2FA second
factor — the whole UX benefit of passkeys is that the user doesn't type anything to identify
themselves first. It also directly delivers spec.md's login flow (Acceptance Scenario 1: "complete
the authenticator's sign-in ceremony" — no separate "who are you" step described) and avoids a
server-side username-enumeration endpoint that a non-discoverable flow would otherwise need.

**Alternatives considered**:

- Non-discoverable credentials + a "enter your email first" step to look up `allowCredentials`:
  rejected — worse UX (defeats the point of passkeys), and that lookup endpoint would itself be a
  user-enumeration oracle unless carefully designed to respond identically for known/unknown
  accounts, extra complexity for a strictly worse result.

## Relying Party ID and origin: derived per-request, not statically configured

**Decision**: Compute `rpID` and `expectedOrigin` from the incoming request's URL
(`new URL(c.req.url)`) on every call, rather than a static `WEBAUTHN_RP_ID` environment variable.

**Rationale**: `@simplewebauthn/server`'s option-generation and verification functions take
`rpID`/`origin` as call parameters, not global config — there's no need to hardcode them. Deriving
from the request handles all three environments correctly without per-environment vars:

- Production: `https://odograph.dev` → rpID `odograph.dev`.
- Preview: `https://odograph-pr-<N>.kgz.workers.dev` → rpID is the _exact_ preview hostname. This
  means a passkey registered on one PR's preview won't authenticate on a different PR's preview —
  expected and fine, since `workers.dev` is itself a public-suffix boundary (Cloudflare's own
  subdomains can't share a broader WebAuthn/cookie scope across different customers' Workers), so a
  shared `kgz.workers.dev` rpID isn't even a valid WebAuthn configuration to begin with.
- Local dev: `http://localhost:<port>` → rpID `localhost`, which the WebAuthn spec special-cases to
  work without HTTPS.

**Alternatives considered**:

- A static `WEBAUTHN_RP_ID` var per environment (mirroring the `ENVIRONMENT` var pattern from
  specs/001): rejected — doesn't work for preview at all (each PR gets a distinct hostname), and the
  per-request derivation is simpler code with no config to keep in sync with `wrangler.toml`.

## Testing WebAuthn ceremonies without real authenticator hardware

**Decision**: Unit-test `src/server/auth/passkey.ts`'s verification logic directly against
precomputed fixture request/response pairs (a valid registration response and a valid authentication
response, captured once and checked into `tests/server/fixtures/webauthn/`), plus tests for the
surrounding logic that don't need real WebAuthn crypto at all (challenge expiry/replay rejection,
duplicate-credential rejection, session issuance on success). True browser-driven ceremony testing —
actually calling `navigator.credentials.create/get` against a virtual authenticator — is **out of
scope for this feature** and tracked as a follow-up using Playwright's
[WebAuthn virtual authenticator support](https://playwright.dev/docs/api/class-browsercontext#browser-context-add-init-script)
(via the Chrome DevTools Protocol `WebAuthn` domain), which is a natural fit for the already-planned
Playwright E2E suite (constitution stack) rather than something this D1/Vitest-focused feature
should build its own harness for.

**Rationale**: Generating a fixture pair requires actually running the ceremony once against a
software/virtual authenticator (there's no way to hand-write a valid CBOR attestation object and a
valid ECDSA/EdDSA signature by hand) — that's most naturally done via a real or virtual
authenticator, one time, with the resulting JSON captured as a fixture, rather than built as a
recurring part of every test run. `@simplewebauthn`'s own test suite follows this exact pattern
(committed fixture JSON), which this feature's fixtures are modeled on.

**Alternatives considered**:

- Mocking `@simplewebauthn/server`'s verify functions entirely: rejected — that would test our
  routing/repository glue but never actually exercise real cryptographic verification, which is the
  part most likely to have a subtle, security-relevant bug.
- Building Playwright + virtual authenticator support now: rejected as this feature's job — no
  Playwright config exists in the repo yet at all; standing that up is a separate, reusable piece of
  infrastructure that shouldn't be bootstrapped as a side effect of one feature.
