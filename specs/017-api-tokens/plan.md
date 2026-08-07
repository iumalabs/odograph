# Implementation Plan: API Tokens

**Branch**: `017-api-tokens` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-api-tokens/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the
execution workflow.

## Summary

Adds scoped, revocable API tokens (constitution Principle VI) for programmatic access to an owner's
own account data. A new `api_tokens` table (migration `0012`) stores a SHA-256 hash of each token,
keyed by `user_id` alongside this app's other credential tables. A new `tenantContextOrToken`
middleware resolves either a session cookie or an `Authorization: Bearer` token to the same
`TenantContext` shape, and is swapped in (one line per file) for the four existing resource-route
files (`vehicles`, `service-records`, `fuel-records`, `reminder-rules`) so every existing route
works unchanged for a token-authenticated caller. Read-scoped tokens are blocked from any
non-`GET`/`HEAD` request centrally, in that same middleware. Token management
(`POST`/`GET`/`DELETE /api/v1/tokens...`) and account deletion stay on the original, unmodified
cookie-only `tenantContext` — a token, including a read-write one, can never manage tokens or delete
the account (FR-006, FR-013).

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers; React 19/Vite client) — same as
the existing server/client split.

**Primary Dependencies**: None new.

**Storage**: D1 (new `api_tokens` table, migration `0012`) — no R2/KV involvement beyond the
existing `SESSION_CACHE` KV namespace already used for rate limiting, reused unmodified.

**Testing**: `deno task test` (vitest) — token creation/list/revoke, dual-auth resolution on an
existing route, read-scope write-blocking, the session-only boundary on token management and account
deletion, revocation taking effect immediately, last-used timestamp updates, and cascade removal on
account deletion. Live browser verification for the token-management UI (no automated client tests
yet — established pattern from specs 014/016).

**Target Platform**: Cloudflare Workers (`workerd`) API + Vite-built React SPA — no new
architectural surface; extends the existing route/repository/client-wrapper/middleware shape.

**Performance Goals**: One extra D1 lookup (`findValidApiTokenByHash`) only on the cookie-miss path
of `tenantContextOrToken`; zero added cost to the existing cookie-authenticated path, which is
unaffected. One extra D1 write (`touchApiTokenLastUsed`) per token-authenticated request, mirroring
the cost profile of session resolution's own KV cache repopulation.

**Constraints**: Token management and account deletion MUST NOT accept a bearer token under any
scope (FR-006, FR-013) — enforced structurally by simply never wiring `tenantContextOrToken` into
those three route files, not by a runtime check that could be bypassed by a future oversight.
Read-scoped tokens MUST be blocked from every mutating method before any route handler runs (FR-005)
— enforced centrally in `tenantContextOrToken`, not per-route.

**Scale/Scope**: 1 new migration/table, 5 new repository functions + 1 new type, 1 new middleware
function (alongside the existing one, not replacing it), 1 new route file (`tokens.ts`), 4 existing
route files get a one-line middleware swap, 1 new client wrapper, 1 new client UI (token
create/list/revoke), 0 changes to `rate-limit.ts`.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Tenant Isolation via Repository Layer** — every new repository function takes either a
  `TenantContext` (`createApiToken`, `listApiTokens`, `revokeApiToken` — scoped to `ctx.userId`) or
  is itself the resolution step that produces one (`findValidApiTokenByHash`, mirroring
  `findValidSessionByTokenHash`'s existing shape exactly); no query takes a bare id from the client.
- **II. Server-Computed, Division-Safe Aggregates** — N/A, no computation.
- **III. Idempotent, Ordered Offline Sync** — N/A, not a sync-queue write.
- **IV. No Interpolated Data** — N/A, no derived/computed data presented as fact.
- **V. Private Object Storage with Validated Uploads** — N/A, no object storage involved.
- **VI. Hardened API Tokens** — this feature _is_ Principle VI's implementation: hashed at rest
  (research.md's SHA-256 reuse), scoped (`read`/`write`, enforced centrally), revocable (soft-revoke
  via `revoked_at`, FR-008/FR-009), last-used timestamp (`touchApiTokenLastUsed`, FR-010).
- **VII. Locked-Down Session and Transport Security** — PASS: rate limiting on every token-auth'd
  write path is inherited for free (research.md's `sessionTokenHash` reuse decision) rather than
  bypassed; token management routes use `rateLimitBySession` like every other authenticated write
  route in this app.
- **VIII. GDPR Erasure by Design** — `api_tokens.user_id ... ON DELETE CASCADE` extends the existing
  cascade chain account deletion (spec 016) already relies on — no change needed to `account.ts`
  itself, satisfying FR-011 automatically, consistent with data-model.md's "every table gets a
  documented delete decision" precedent.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: the new token-management
  UI's copy routes through `src/client/i18n/strings.ts`, same as every other screen.
- **X. Toolchain Discipline** — PASS: no new dependency.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-api-tokens/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/api.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
migrations/
└── 0012_api_tokens.sql       # new: api_tokens table (data-model.md)

src/server/
├── db/repository.ts          # extended: createApiToken, listApiTokens,
│                               #  findValidApiTokenByHash, touchApiTokenLastUsed, revokeApiToken
├── middleware/tenant-context.ts  # extended: new tenantContextOrToken export,
│                               #  alongside the existing cookie-only tenantContext (unchanged)
└── routes/v1/
    ├── tokens.ts              # new: POST/GET /api/v1/tokens, DELETE /api/v1/tokens/:id —
    │                           #  cookie-only (tenantContext), rateLimitBySession on writes
    ├── vehicles.ts             # 1-line change: tenantContext -> tenantContextOrToken
    ├── service-records.ts      # 1-line change: tenantContext -> tenantContextOrToken
    ├── fuel-records.ts         # 1-line change: tenantContext -> tenantContextOrToken
    └── reminder-rules.ts       # 1-line change: tenantContext -> tenantContextOrToken

src/client/
├── api-tokens.ts              # new: thin client wrapper — createApiToken, listApiTokens,
│                               #  revokeApiToken (mirrors vehicles.ts's shape)
└── components/
    └── ApiTokens.tsx           # new: token create form (label + scope) + list + revoke,
                                 #  shows a newly created token's plaintext once, styled per spec 008

tests/server/
└── api-tokens.test.ts          # new: create/list/revoke, dual-auth on an existing route,
                                  #  read-scope write-blocking, token-management/account-deletion
                                  #  session-only boundary, revocation takes immediate effect,
                                  #  last-used updates, cascade removal on account deletion
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories.
One new table/migration, one new route file, one new middleware export alongside the existing one
(not a replacement), and a one-line swap in four existing route files. This is the first feature to
introduce a second authentication mechanism into this app, but the dual-auth resolution is contained
entirely in `tenant-context.ts` — no route handler anywhere needs to know or care which mechanism
authenticated its caller.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
