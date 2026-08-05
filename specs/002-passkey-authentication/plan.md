# Implementation Plan: Passkey Authentication (Primary Sign-In Method)

**Branch**: `002-passkey-authentication` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-passkey-authentication/spec.md`

## Summary

Add WebAuthn-based registration and login, replacing the dev-only session route as the production
path onto the platform. Registration creates a tenant + user + credential and issues a session only
once the ceremony's cryptographic response verifies; login verifies against a previously stored
credential and issues a session for the existing tenant. Uses discoverable (resident-key)
credentials so login doesn't require asking "who are you" first — the browser shows the user's
available passkeys for the site directly. Builds entirely on top of the merged session foundation
(`specs/001`): no changes to `session.ts`, `repository.ts`'s existing exports, or
`tenant-context.ts`.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: `@simplewebauthn/server` (server-side WebAuthn ceremony verification),
`@simplewebauthn/browser` (client-side `navigator.credentials` wrapper) — both new; everything else
(Hono, D1, KV) is reused, not added to

**Storage**: D1 — two new tables, `webauthn_credentials` (durable, tied to a user) and
`webauthn_challenges` (ephemeral, single-use). No KV usage for this feature.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup) for server-side ceremony
verification against precomputed fixture request/response pairs; true browser-driven ceremony
testing (via Playwright's WebAuthn virtual authenticator support) is noted as a follow-up, not built
in this feature (see research.md)

**Target Platform**: Cloudflare Workers (`workerd`); client UI runs in evergreen browsers with
WebAuthn support (existing SPA)

**Project Type**: Web application (existing single-Worker structure) — this feature touches both
`src/server/` (new auth routes + repository functions) and `src/client/` (minimal registration/
login UI, no design polish yet)

**Performance Goals**: No new target beyond "a ceremony is a few discrete round trips, not a hot
per-request path" — same posture as specs/001's session resolution

**Constraints**: No Deno-runtime or Node-only APIs in Worker code (Principle X) — verified
`@simplewebauthn/server` uses Web Crypto (`crypto.subtle`), not `node:crypto` (see research.md);
repository layer remains the only D1 access point (Principle I); new tables need a GDPR erasure
decision before shipping (Principle VIII)

**Scale/Scope**: Three endpoint pairs (registration options/verify, login options/verify, and User
Story 3's add-a-passkey options/verify for an already-authenticated user), two new D1 tables,
minimal client UI (two buttons, no styling system)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Check                                                                                                                                                                                                                                                                                                                         | Status                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| I. Tenant isolation via repository layer | New `webauthn_credentials`/`webauthn_challenges` access goes through new `repository.ts` exports only; no handler queries D1 directly (enforced by the existing CI guard script)                                                                                                                                              | PASS                     |
| II-V                                     | N/A — no aggregates, offline writes, user-facing records, or R2 usage in this feature                                                                                                                                                                                                                                         | N/A                      |
| VI. Hardened API tokens                  | N/A — passkey credentials aren't API tokens; a credential's public key isn't secret (WebAuthn's whole design assumes it can be stored plainly)                                                                                                                                                                                | N/A                      |
| VII. Session/CSP/rate limiting           | Sessions issued via the existing `issueSession` (already HttpOnly/Secure/SameSite=Lax); registration/login pass through `rateLimitByIp` (no session yet); the add-a-passkey pair passes through `rateLimitBySession` instead (an existing session is required to reach it — same pattern as the tenant-isolation-probe route) | PASS                     |
| VIII. GDPR erasure by design             | Both new tables get a documented delete-vs-anonymise decision in data-model.md before any row is written in production                                                                                                                                                                                                        | PASS — see data-model.md |
| IX. i18n axes                            | The minimal registration/login UI's user-facing strings route through the same i18n infrastructure as any other screen, even though only English ships                                                                                                                                                                        | PASS                     |
| X. Toolchain discipline                  | `@simplewebauthn/server` verified to use Web Crypto, not `node:crypto` (research.md); `deno fmt`/`deno lint` apply                                                                                                                                                                                                            | PASS                     |
| XI-XII                                   | English-only artifacts; deploys only via the existing GitHub Actions pipeline (no new deploy path)                                                                                                                                                                                                                            | PASS                     |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/002-passkey-authentication/
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
│   └── repository.ts                 # ADD: createCredential, findCredentialById,
│                                       #      updateCredentialCounter, createChallenge,
│                                       #      consumeChallenge — no changes to existing exports
├── auth/
│   ├── session.ts                    # unchanged, reused as-is
│   ├── rate-limit.ts                 # unchanged, reused as-is
│   └── passkey.ts                     # ADD: ceremony option-generation + verification,
│                                       #      wraps @simplewebauthn/server calls
└── routes/v1/
    └── auth/
        └── passkey.ts                 # ADD: the 4 routes (register/options, register/verify,
                                        #      login/options, login/verify)

migrations/
└── 0002_webauthn_credentials.sql      # ADD: webauthn_credentials, webauthn_challenges tables

src/client/
├── App.tsx                            # MODIFY: minimal register/login buttons wired to the
│                                       #         new endpoints via @simplewebauthn/browser
└── auth/
    └── passkey.ts                      # ADD: thin client wrapper calling the 4 endpoints

tests/server/
└── passkey-auth.test.ts               # ADD: registration + login against fixture WebAuthn
                                        #      responses, challenge replay/expiry, duplicate
                                        #      credential rejection
```

**Structure Decision**: Follows the existing `src/server/{db,auth,routes}` layout from specs/001
exactly — `passkey.ts` in `auth/` for ceremony logic (mirrors `session.ts`), routes mounted under
`routes/v1/auth/`. Client gets a small `auth/` subdirectory since this is the first client-side
feature code beyond the bare shell.
