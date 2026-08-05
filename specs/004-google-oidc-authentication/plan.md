# Implementation Plan: Google OIDC Authentication

**Branch**: `004-google-oidc-authentication` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-google-oidc-authentication/spec.md`

## Summary

Add Google as a third sign-in method via the OAuth 2.0 Authorization Code flow with PKCE. A
`/start` route redirects to Google's consent screen after storing a single-use `state`/PKCE
`code_verifier` pair in D1 (mirroring `webauthn_challenges`); a `/callback` route exchanges the
returned code for tokens, verifies the ID token (`jose`, signature/issuer/audience/expiry) against
Google's JWKS, resolves the account via a dedicated `oidc_identities` table keyed by
`(provider, subject)` — never by email (D-004) — and issues a session identical in shape to passkey
and magic-link. No OAuth client library (arctic is deprecated; openid-client is Node-oriented) —
hand-rolled flow plus `jose` for the one genuinely crypto-sensitive step.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: `jose` v6.x (new — ID token/JWKS verification, Web Crypto-based, no Node
polyfills); everything else (Hono, D1, KV) reused, not added to. No OAuth client library (see
research.md — arctic deprecated July 2026, openid-client is Node-API-oriented).

**Storage**: D1 — two new tables, `oidc_identities` (durable, tied to a user, keyed by
`(provider, subject)`) and `oidc_states` (ephemeral, single-use `state` + PKCE `code_verifier`
pair). No KV usage for this feature (research.md explains why not KV for state, for consistency with
`webauthn_challenges`/`magic_link_tokens`).

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup). ID token verification is
tested against a fixture token signed with a locally generated keypair and a local (not remote) JWKS
— `verifyGoogleIdToken` takes an injectable key resolver so tests never need Google's real JWKS
endpoint. The authorization-code-for-tokens exchange (`fetch()` to Google's token endpoint) has no
local fixture and is proven via a live smoke test against local dev once real Google OAuth
credentials exist (research.md), same shape as magic-link's T007 — not an automated test.

**Target Platform**: Cloudflare Workers (`workerd`); client UI runs in evergreen browsers (existing
SPA) — the OIDC flow itself is a full-page redirect, no client-side JavaScript library needed for
the ceremony itself (unlike passkey's `@simplewebauthn/browser`).

**Project Type**: Web application (existing single-Worker structure) — touches `src/server/` (new
auth routes + repository functions) and `src/client/` (one "Continue with Google" link/button).

**Performance Goals**: No new target — a sign-in ceremony is a few discrete round trips (redirect to
Google, callback, one token-endpoint fetch, one JWKS fetch/verify), not a hot per-request path, same
posture as passkey and magic-link.

**Constraints**: No Deno-runtime or Node-only APIs in Worker code (Principle X) — `jose` v6
confirmed Workers-compatible (research.md); repository layer remains the only D1 access point
(Principle I); new tables need a GDPR erasure decision before shipping (Principle VIII); Google's
`redirect_uri` allowlist means per-PR ephemeral preview URLs cannot complete a real Google sign-in
(research.md) — an accepted, documented limitation, not a defect to work around.

**Scale/Scope**: Two routes (`/start`, `/callback`), two new D1 tables, one client-side link, one
new dependency (`jose`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | New `oidc_identities`/`oidc_states` access goes through new `repository.ts` exports only; no handler queries D1 directly (enforced by the existing CI guard script) | PASS |
| II-V | N/A — no aggregates, offline writes, user-facing records, or R2 usage in this feature | N/A |
| VI. Hardened API tokens | N/A — `GOOGLE_CLIENT_SECRET` is a Workers secret (research.md), never logged or returned in any response | PASS |
| VII. Session/CSP/rate limiting | Sessions issued via the existing `issueSession` (already HttpOnly/Secure/SameSite=Lax); `/start` and `/callback` pass through `rateLimitByIp` (no session yet, same as passkey registration/login and magic-link request) | PASS |
| VIII. GDPR erasure by design | Both new tables get a documented delete-vs-anonymise decision in data-model.md before any row is written in production | PASS — see data-model.md |
| IX. i18n axes | The "Continue with Google" UI string routes through the existing i18n infrastructure, even though only English ships | PASS |
| X. Toolchain discipline | `jose` v6 confirmed Web Crypto-based, no `node:crypto` (research.md); `deno fmt`/`deno lint` apply | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline — Google OAuth client credentials are a one-time manually-provisioned Workers secret, not a CI-managed deploy input (research.md) | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/004-google-oidc-authentication/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts                 # ADD: findOidcIdentityByProviderAndSubject,
│                                       #      createOidcUser, createOidcState,
│                                       #      consumeOidcState — no changes to existing exports
├── auth/
│   ├── session.ts                    # unchanged, reused as-is
│   ├── rate-limit.ts                 # unchanged, reused as-is
│   └── oidc/
│       ├── google.ts                  # ADD: Google-specific endpoint constants, authorization
│       │                              #      URL building, code-for-tokens exchange (untested at
│       │                              #      the HTTP level — real network call, see research.md),
│       │                              #      and completeGoogleSignIn(db, claims) — the
│       │                              #      directly-testable resolve+issue-session step, split
│       │                              #      out so tests never need a real Google network call
│       │                              #      (analyze finding C1)
│       └── verify-id-token.ts         # ADD: verifyGoogleIdToken(idToken, {jwks, issuer,
│                                       #      audience}) — injectable key resolver (research.md)
└── routes/v1/
    └── auth/
        └── oidc/
            └── google.ts               # ADD: GET /start, GET /callback

migrations/
└── 0004_oidc.sql                      # ADD: oidc_identities, oidc_states tables

src/client/
├── App.tsx                            # MODIFY: "Continue with Google" link next to existing
│                                       #         passkey/magic-link controls
└── auth/
    └── oidc.ts                        # ADD: thin helper building the /start link (no ceremony
                                        #      logic needed client-side — plain navigation)

tests/server/
├── fixtures/
│   └── oidc.ts                        # ADD: locally-signed fixture ID tokens + matching local
│                                       #      JWKS (research.md's testing strategy)
└── oidc-auth.test.ts                  # ADD: state issuance/consumption, ID token verification
                                        #      against the fixture, D-004 cross-method isolation
```

**Structure Decision**: Follows the existing `src/server/{db,auth,routes}` layout exactly, same as
specs/002 and specs/003. `auth/oidc/` gets its own subdirectory (unlike passkey/magic-link's flat
files) because this feature has two genuinely separate concerns — Google-specific HTTP calls versus
provider-agnostic ID token verification (FR-008) — that are worth keeping in separate, independently
testable modules rather than one file.
