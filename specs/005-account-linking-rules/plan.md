# Implementation Plan: Account Linking Rules

**Branch**: `005-account-linking` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-account-linking-rules/spec.md`

## Summary

Extend magic-link's and Google OIDC's existing pending-attempt tables (`magic_link_tokens`,
`oidc_states`) with a nullable `linking_user_id` column, populated only by two new
`tenantContext`-gated routes (`POST /auth/magic-link/link`, `GET /auth/oidc/google/link`). The
existing `/verify` and `/callback` routes both gain a branch: if the consumed token/state carries a
`linking_user_id`, attach the identity to *that* user (insert-only, reject on conflict via the
existing `isUniqueConstraintError` pattern) instead of running the normal find-or-create sign-in
resolution. No new tenant/user is ever created on the linking path (FR-003). Passkey already has
this capability (specs/002 User Story 3) and needs no changes.

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new — reuses `jose` (already present), Hono, D1, KV as-is.

**Storage**: D1 — one new migration `ALTER TABLE`ing `magic_link_tokens` and `oidc_states` to add a
nullable `linking_user_id TEXT REFERENCES users(id) ON DELETE CASCADE` column each. No new tables —
linkage itself is recorded in the *existing* `magic_link_identities`/`oidc_identities` tables
(specs/003, specs/004), just inserted-into by a new code path instead of `createMagicLinkUser`/
`createOidcUser`.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing setup). Reuses
`tests/server/fixtures/oidc.ts` for Google-link fixtures; magic-link tests reuse the existing
`findMagicLinkTokenByEmail` test-only read path (specs/003) to retrieve a linking token the same way
its lifecycle tests already retrieve a sign-in token.

**Target Platform**: Cloudflare Workers (`workerd`); client UI runs in evergreen browsers (existing
SPA) — two new controls (an email input + "Link email" button, a "Link Google account" link) shown
only in the already-authenticated view.

**Project Type**: Web application (existing single-Worker structure) — touches `src/server/`
(repository additions, two new routes, two modified routes) and `src/client/App.tsx`.

**Performance Goals**: No new target — linking is a low-frequency, explicit user action, same
posture as every other auth ceremony in this codebase.

**Constraints**: Repository layer remains the only D1 access point (Principle I); the `ALTER TABLE
... ADD COLUMN` migration must not require backfilling existing rows (SQLite/D1 allow a nullable
column with no default added to a populated table — verified against the existing migration
pattern); linking routes MUST run behind `tenantContext` (FR-004/D-004) — there is no unauthenticated
variant, unlike every prior auth route in this codebase, which is exactly the point.

**Scale/Scope**: One migration (`ALTER TABLE` x2), 4 repository additions, 2 new routes, 2 modified
routes, one new Google-linking completion function, minimal client UI (2 controls, reusing existing
outcome-banner pattern extended with a third `linked` state).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | New/modified D1 access goes through new `repository.ts` exports only; no handler queries D1 directly (enforced by the existing CI guard script) | PASS |
| II-V | N/A — no aggregates, offline writes, user-facing records, or R2 usage in this feature | N/A |
| VI. Hardened API tokens | N/A — no new secret/token type introduced | N/A |
| VII. Session/CSP/rate limiting | The write-path linking-trigger routes (`/magic-link/link`, `/oidc/google/link`) run behind both `tenantContext` (auth required, FR-004) and `rateLimitBySession` (an authenticated write path, same category as `/passkey/add/options`); `/verify` and `/callback` keep their existing rate-limit posture unchanged | PASS |
| VIII. GDPR erasure by design | The new `linking_user_id` column lives on tables already documented as "delete, ephemeral" (specs/003, specs/004) — adding a column doesn't change that decision; cascades away via `ON DELETE CASCADE` regardless of path | PASS |
| IX. i18n axes | The two new UI strings route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency; all Web Crypto/D1 patterns already established | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/005-account-linking-rules/
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
│   └── repository.ts                     # MODIFY: invalidateAndCreateMagicLinkToken gains an
│                                           #   optional linkingUserId param (backward-compatible —
│                                           #   existing callers unaffected); consumeMagicLinkToken's
│                                           #   return type gains linkingUserId; same two changes,
│                                           #   mirrored, for createOidcState/consumeOidcState.
│                                           #   ADD: linkMagicLinkIdentity, linkOidcIdentity
│                                           #   (insert-only, throw on conflict — no tenant/user
│                                           #   creation, unlike createMagicLinkUser/createOidcUser)
├── auth/
│   └── oidc/
│       └── google.ts                     # ADD: completeGoogleLink(db, idToken, {jwks, audience,
│                                           #   linkingUserId}) — separate from completeGoogleSignIn
│                                           #   since the resolution logic genuinely differs
│                                           #   (insert-only-if-absent vs. find-or-create)
└── routes/v1/auth/
    ├── magic-link.ts                     # ADD: POST /link (tenantContext, rateLimitBySession).
    │                                       #   MODIFY: GET /verify branches on linkingUserId
    └── oidc/
        └── google.ts                     # ADD: GET /link (tenantContext, rateLimitBySession).
                                            #   MODIFY: GET /callback branches on linkingUserId,
                                            #   calling completeGoogleLink instead of
                                            #   completeGoogleSignIn when present

migrations/
└── 0005_account_linking.sql               # ADD: ALTER TABLE magic_link_tokens/oidc_states

src/client/
└── App.tsx                                # MODIFY: in the authenticated view, an email input +
                                            #   "Link email" button and a "Link Google account" link,
                                            #   next to the existing "Add another passkey" button;
                                            #   outcome banners extended with a `linked` state

tests/server/
├── magic-link-auth.test.ts                # EXTEND: link-then-sign-in lifecycle, reject-if-already-
│                                           #   linked (own or different account)
└── oidc-auth.test.ts                      # EXTEND: same two cases for Google
```

**Structure Decision**: Follows the existing `src/server/{db,auth,routes}` layout exactly. No new
top-level modules — this feature is additive branches on already-established files, reflecting that
it's extending two existing ceremonies' pending-attempt records rather than introducing a new one.
