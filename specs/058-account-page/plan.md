# Implementation Plan: Account Page

**Branch**: `058-account-page` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/058-account-page/spec.md`

## Summary

Add an account avatar/dropdown to `AppShell`'s header and a new Account page consolidating
identity/credential management that's currently scattered: passkey/Google/email-linking (today
inline on the Garage screen) and API tokens/account deletion (today on Settings). Two small,
well-scoped server additions back this: a new `GET /api/v1/account` endpoint returning real,
computed-fresh profile data (email, session expiry, linked-methods summary) from existing tables,
and a new `POST /api/v1/account/sign-out` endpoint — this app's first production sign-out route.

## Technical Context

**Language/Version**: TypeScript — Hono API routes (server) + React/Vite (client), existing stack.

**Primary Dependencies**: None new.

**Storage**: No new tables/columns. The new `GET /api/v1/account` endpoint reads existing tables
(`users`, `sessions`, `webauthn_credentials`, `oidc_identities`, `magic_link_identities`) and
computes the response fresh on every call — same "computed fresh, nothing new stored" precedent as
`computeVehicleAggregates`.

**Testing**: New server-side Vitest tests for the two new routes (`tests/server/account-profile.test.ts`,
extending `tests/server/account-erasure.test.ts`'s existing file or a new one for sign-out) —
unlike specs 055–057, this feature has real server-side logic to test, so it follows the project's
normal `SELF.fetch` route-testing convention (see e.g. `tests/server/api-tokens.test.ts`). No
client-component test suite exists (same as prior specs), so client-side verification stays manual.

**Target Platform**: Cloudflare Workers (API) + Vite SPA (client), same as every other change.

**Project Type**: Existing single-project web app. No new project/package.

**Performance Goals**: N/A — the new endpoint does a handful of indexed lookups per call, same
shape as `computeVehicleAggregates`; not a performance-sensitive path.

**Constraints**:
- Constitution Principle IV: every fact shown must be real — no Cloudflare Access/JWT/AUD/role
  concepts (FR-003).
- Constitution Principle I (tenant isolation): the new endpoint reads only the calling session's
  own `tenantId`/`userId` — no cross-tenant query, matching every existing route's trust contract.
- Constitution Principle IX (i18n): new UI-chrome strings go through `t()`.
- Sign-out must actually invalidate server-side state (FR-004/SC-003), not just clear client state.
- No real multi-user/team functionality (FR-005) — the "multi-account" panel is inert.

**Scale/Scope**: Two new server routes (`account.ts` additions), one new repository query
(`getAccountProfile`), one new `AccountView.tsx` client component, an account-dropdown addition to
`AppShell.tsx`, removal of the Garage-screen linking row (moved into `AccountView`), removal of
`ApiTokens`/`AccountDeletion` from `SettingsView` (moved into `AccountView`), new i18n keys.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation** — Directly applies. `GET /api/v1/account` and `POST
  /api/v1/account/sign-out` both sit behind the existing `tenantContext` middleware (cookie-only,
  matching account deletion's existing boundary — never `tenantContextOrToken`, since an API token
  must never be usable for account-level operations, same reasoning `tenant-context.ts`'s own
  comment already documents for the deletion route). Every query filters by the resolved
  `tenantId`/`userId`, same trust contract as every other repository function. **PASS**.
- **II. Server-Computed Aggregates** — The profile bundle (linked-methods summary, session expiry)
  is computed fresh per request from real tables, never cached/stored — same precedent as vehicle
  aggregates. **PASS**.
- **III. Offline Sync** — N/A, this isn't part of the offline write queue.
- **IV. No Interpolated Data** — Directly applies; see spec.md FR-003/SC-002 and research.md's
  per-field source table. **PASS**.
- **V. Object Storage** — N/A.
- **VI. Hardened API Tokens** — Directly relevant by exclusion: confirmed the new routes use
  `tenantContext`, not `tenantContextOrToken` — an API token (even a write-scoped one) must not be
  able to view account profile data or sign out the session that isn't its own concept. **PASS**.
- **VII. Session/Transport Security** — The new sign-out route reuses `invalidateSession` and
  `serializeExpiredSessionCookie` verbatim (already-hardened, already-tested functions) rather than
  reimplementing cookie/cache invalidation. **PASS**.
- **VIII. GDPR Erasure** — N/A, this feature doesn't touch erasure; it sits alongside the existing
  `DELETE /api/v1/account` route in the same file.
- **IX. i18n** — New UI-chrome strings go through `t()`. **PASS**.
- **X. Toolchain Discipline** — No new dependency.
- **XI. English-Only Artifacts** — All new copy is English.
- **XII. Deployment** — N/A, no deploy-path change.

No violations. Complexity Tracking table not needed.

**Post-Phase-1 re-check**: data-model.md's `AccountProfile` shape is entirely derived from existing
tables via one new read-only query; no new persisted entity, no new dependency. Conclusion
unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/058-account-page/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory in the usual sense, but this feature does add two new HTTP endpoints —
documented directly in data-model.md/tasks.md rather than a separate OpenAPI-style file, matching
how existing routes in this codebase are documented (inline route comments, not a contracts dir).

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts              # MODIFIED — new getAccountProfile() query
└── routes/v1/
    └── account.ts                  # MODIFIED — new GET "/" and POST "/sign-out" routes,
                                       alongside the existing DELETE "/"

tests/server/
└── account-profile.test.ts        # NEW — route tests for both new endpoints

src/client/
├── components/
│   ├── AppShell.tsx                # MODIFIED — account avatar/dropdown in the header
│   ├── AccountView.tsx              # NEW — the Account page (profile/credentials/session/
│   │                                  multi-account-placeholder), reusing ApiTokens/AccountDeletion
│   ├── SettingsView.tsx             # MODIFIED — ApiTokens/AccountDeletion removed (now app-prefs
│   │                                  only: currency, push notifications)
│   └── App.tsx                      # MODIFIED — new `view === "account"` branch; Garage-screen
│                                       linking row removed (moved into AccountView); sign-out wired
├── account.ts                       # MODIFIED — already exists (deleteAccount); adds
│                                       getAccountProfile()/signOut() fetch wrappers alongside it
└── i18n/
    └── strings.ts                   # MODIFIED — new UI-chrome keys
```

**Structure Decision**: `ApiTokens.tsx`/`AccountDeletion.tsx` themselves are untouched (pure
relocation of where they're rendered, per spec.md's decided content split) — only their render
site moves from `SettingsView` to `AccountView`.
