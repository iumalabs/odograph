# Implementation Plan: Magic Link Authentication

**Branch**: `003-magic-link-authentication` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-magic-link-authentication/spec.md`

## Summary

Add email-based sign-in: request a link, follow it, get a session. Uses the Workers `send_email`
binding (Cloudflare Email Sending, now enabled on the `odograph.dev` zone) to deliver the link. A
dedicated `magic_link_identities` table (email → user, method-scoped) decides "new account" vs.
"existing account" — never a lookup against the shared `users.email` column, so this method can
never silently auto-link to an account created by a different method (D-004, FR-003a). Builds on the
merged session foundation (`specs/001`) and follows the same registration/login shape passkeys
(`specs/002`) established: no changes to `session.ts`, `repository.ts`'s existing exports, or
`tenant-context.ts`.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — the `send_email` binding's structured API
(`env.EMAIL.send({...})`) needs no npm package (unlike the older `cloudflare:email` + `mimetext`
approach, which this plan explicitly does not use)

**Storage**: D1 — two new tables, `magic_link_identities` (durable, email → user) and
`magic_link_tokens` (ephemeral, single-use, same shape as `webauthn_challenges`)

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup). The `send_email` binding
needs a test/local stand-in — Miniflare's default local binding behavior for `send_email` needs
confirming in research.md; tests assert against the token/link created in D1 rather than a real
delivered email either way, matching how specs/002 tested crypto verification without a real browser
ceremony.

**Target Platform**: Cloudflare Workers (`workerd`); the link is a plain URL, opened in whatever
browser the user's email client uses — no new client-side ceremony library needed (contrast with
passkeys' `@simplewebauthn/browser`)

**Project Type**: Web application (existing single-Worker structure) — mostly `src/server/`; a
minimal client-side "request a link" form joins the existing passkey buttons in `src/client/`

**Performance Goals**: No new target — a link request is a few round trips (DB writes + one outbound
email), not a hot path

**Constraints**: Repository layer remains the only D1 access point (Principle I); new tables need a
GDPR erasure decision before shipping (Principle VIII); link-request responses must not vary
observably by whether the email is registered (FR-006, Principle-adjacent security requirement from
the spec itself)

**Scale/Scope**: One request endpoint + one follow endpoint, two new D1 tables, one new `send_email`
binding, minimal "request a link" UI addition

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Check                                                                                                                                                                                                 | Status                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| I. Tenant isolation via repository layer | New `magic_link_identities`/`magic_link_tokens` access goes through new `repository.ts` exports only; enforced by the existing CI guard script                                                        | PASS                     |
| II-VI                                    | N/A — no aggregates, offline writes, user-facing records, R2 usage, or API tokens in this feature                                                                                                     | N/A                      |
| VII. Session/CSP/rate limiting           | Sessions issued via the existing `issueSession`; the request endpoint passes through `rateLimitByIp` (no session yet, same as passkey registration)                                                   | PASS                     |
| VIII. GDPR erasure by design             | Both new tables get a documented delete-vs-anonymise decision in data-model.md before any row is written in production                                                                                | PASS — see data-model.md |
| IX. i18n axes                            | The link-request UI's strings route through the existing `t()` i18n table (specs/002), extended with new keys — no string hardcoded at its usage site                                                 | PASS                     |
| X. Toolchain discipline                  | `send_email`'s structured API is a native binding call, not a Node-only library; no Deno-runtime APIs                                                                                                 | PASS                     |
| XI-XII                                   | English-only artifacts (including the email content itself — no i18n needed there yet, since v1 ships English UI only per the locked decision); deploys only via the existing GitHub Actions pipeline | PASS                     |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/003-magic-link-authentication/
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
│   └── repository.ts                    # ADD: createMagicLinkUser, findMagicLinkIdentityByEmail,
│                                          #      createMagicLinkToken, consumeMagicLinkToken,
│                                          #      invalidateMagicLinkTokensForEmail — no changes
│                                          #      to existing exports
├── auth/
│   └── magic-link.ts                      # ADD: token generation, email composition, the
│                                           #      "identical response regardless of registration
│                                           #      status" logic (FR-006)
└── routes/v1/auth/
    └── magic-link.ts                      # ADD: POST /request, GET /verify

migrations/
└── 0003_magic_link.sql                    # ADD: magic_link_identities, magic_link_tokens tables

wrangler.toml                              # ADD: [[send_email]] binding (default + both envs)

src/client/
├── App.tsx                                # MODIFY: "sign in with email" form alongside the
│                                           #         existing passkey buttons
└── auth/
    └── magic-link.ts                       # ADD: thin client wrapper for the request endpoint
                                             #      (verify is a plain link, no client JS needed
                                             #      to *start* it)

tests/server/
└── magic-link-auth.test.ts                # ADD: request/verify lifecycle, D-004 cross-method
                                            #      isolation, replay/expiry, response-parity (FR-006)
```

**Structure Decision**: Mirrors specs/001's and specs/002's `src/server/{db,auth,routes}` layout
exactly. No new top-level directories. The `send_email` binding is configured identically across
default/preview/production in `wrangler.toml`, same pattern as the D1/KV bindings from specs/001.
