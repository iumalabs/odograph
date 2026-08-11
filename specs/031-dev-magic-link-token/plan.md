# Implementation Plan: Dev-Only Magic-Link Token Retrieval Endpoint

**Branch**: `031-dev-magic-link-token` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/031-dev-magic-link-token/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add `GET /api/v1/_dev/magic-link-token?email=...`, a read-only route wrapping the already-existing,
already-tested `findMagicLinkTokenByEmail(db, email)` repository function. Gated production-inert
via the exact same `notFoundOutsideDev` middleware pattern `dev-session.ts` already established
(checked first, before any other middleware, `c.notFound()` when `c.env.ENVIRONMENT ===
"production"`) — exported from `dev-session.ts` and reused rather than duplicated. No schema
change, no new business logic, no interaction with token creation/consumption.

## Technical Context

**Language/Version**: TypeScript; Hono on Cloudflare Workers

**Primary Dependencies**: None new — reuses `findMagicLinkTokenByEmail` (already in
`src/server/db/repository.ts`) and the existing `notFoundOutsideDev` middleware pattern.

**Storage**: N/A — no schema change. Reads the existing `magic_link_tokens` table via the existing
repository function; adds no new table, column, or query shape.

**Testing**: `vitest` via `deno task test`. New route tested for: happy path (pending token exists
→ returned), not-found path (no pending token → clear not-found response), and production-inertness
(extends the existing `tests/server/dev-routes-production-gating.test.ts`, which already tests
`dev-session.ts`'s two routes the identical way — `app.fetch` with `ENVIRONMENT: "production"`
overridden in the env object, asserting `404`).

**Target Platform**: Cloudflare Workers

**Project Type**: Web application (Cloudflare Worker backend) — this feature is server-only, no
client change (the consumer is the e2e suite, explicitly out of scope per spec.md Assumptions)

**Performance Goals**: N/A — a single indexed D1 lookup (`idx_magic_link_tokens_email` already
exists per migration 0003), same cost class as every other read route in this codebase.

**Constraints**: Zero production footprint (spec.md FR-004/FR-005) — no secret/toggle to manage,
purely environment-config-driven, verified by test rather than by convention.

**Scale/Scope**: One new route (~15 lines), one middleware export change (no new middleware logic),
two new test cases extending an existing test file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Tenant Isolation via Repository Layer)**: The route calls the repository layer
  (`findMagicLinkTokenByEmail`) rather than querying D1 directly, consistent with every other
  route. This lookup is keyed by email, not tenant — matching the existing `consumeMagicLinkToken`/
  `invalidateAndCreateMagicLinkToken` functions' own scoping (a magic-link token is issued before a
  session/tenant context exists, so there is no tenant to isolate by at this stage — same as the
  real `/request` and `/verify` routes today). PASS.
- **Principle IV (No Interpolated Data)**: N/A — this route returns exactly what the repository
  function returns, or a clear not-found; no aggregation, no derived/guessed value involved. PASS.
- **Principle VII (Locked-Down Session and Transport Security)**: Directly relevant — this is
  exactly the class of endpoint this principle exists to keep out of production (an unauthenticated
  read that could disclose a live sign-in token by email alone). Mitigated identically to
  `dev-session.ts`'s existing routes: `notFoundOutsideDev` runs first, before any rate-limit or DB
  work, so production behavior is unchanged from the route not existing. No rate limiting is added
  for the dev/test-only path itself (matching `POST /_dev/session`'s own posture, which uses
  `rateLimitByIp` only as a resilience backstop against local misuse, not a security boundary —
  this GET route is lower-risk than a session-issuing POST, so the same "dev-only, not
  production-exposed" gate is the operative control, not rate limiting). PASS.
- **Principle X (Toolchain Discipline)**: No new dependency. PASS.
- **Principle XI (English-Only Project Artifacts)**: Spec, plan, code, and tests in English. PASS.
- No other principle (II, III, V, VI, VIII, IX, XII) is implicated — no aggregate, no offline queue
  interaction, no upload, no API token, no GDPR-erasure-relevant new data, no new UI string, no
  deployment-path change.

No violations. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/031-dev-magic-link-token/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command) — N/A, no new entities
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/auth/
├── dev-session.ts            # MODIFY: export notFoundOutsideDev (currently module-private)
│                              #         so the new route can reuse it instead of duplicating it
└── dev-magic-link.ts          # NEW: GET / handler wrapping findMagicLinkTokenByEmail, behind
                                #      the imported notFoundOutsideDev

src/server/index.ts             # MODIFY: mount the new route at /api/v1/_dev/magic-link-token

tests/server/
└── dev-routes-production-gating.test.ts   # MODIFY: extend with the new route's 404-in-production
                                            #         case, matching its existing two cases
```

**Structure Decision**: Server-only change within the existing single-package structure. One new,
small route file colocated with `dev-session.ts` under `src/server/auth/` (both are dev/test-only
auth-adjacent routes), reusing rather than duplicating `notFoundOutsideDev`. Route-specific
happy-path/not-found tests live in a new `tests/server/dev-magic-link.test.ts`; the
production-inertness case is added to the existing shared gating test file rather than a third
copy of that same assertion pattern.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
