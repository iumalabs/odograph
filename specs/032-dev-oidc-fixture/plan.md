# Implementation Plan: Dev-Only Google OIDC Fixture Sign-In Endpoint

**Branch**: `032-dev-oidc-fixture` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/032-dev-oidc-fixture/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add `GET /api/v1/_dev/oidc-google?email=...`, gated production-inert via the existing
`notFoundOutsideDev` middleware (shared with `dev-session.ts`/`dev-magic-link.ts`). It signs a
locally-generated fixture Google ID token for the given email, then calls the exact same
`completeGoogleSignIn(db, idToken, { jwks, audience })` the real callback route uses — supplying
the local fixture JWKS instead of the real remote Google JWKS as the only difference — and on
success sets the session cookie and redirects to `/?oidc=ok`, the same response shape the real
`/callback` route produces, since (unlike the magic-link case) there is no separate real route this
one can hand a pre-obtained token to. The local-signing machinery moves from
`tests/server/fixtures/oidc.ts` into a new `src/` module so both the dev route and the existing
vitest suite can share one implementation; the test file becomes a thin re-export to avoid breaking
existing imports.

## Technical Context

**Language/Version**: TypeScript; Hono on Cloudflare Workers

**Primary Dependencies**: `jose` (already a project dependency, already used by
`verify-id-token.ts` and the existing test fixture) — no new dependency.

**Storage**: N/A — no schema change. Reuses the existing OIDC identity/user resolution
(`findOidcIdentityByProviderAndSubject`/`createOidcUser`) unchanged.

**Testing**: `vitest` via `deno task test`. New tests for: the endpoint completing sign-in and
resolving to a stable account across repeat calls with the same email (FR-002), a session it issues
being usable for an authenticated request (FR-003), rejecting a missing email (FR-007), and
production-inertness (extends `tests/server/dev-routes-production-gating.test.ts` again). The
existing `tests/server/oidc-auth.test.ts` is updated only to import the moved fixture helpers from
their new `src/` location — its own test cases are unchanged.

**Target Platform**: Cloudflare Workers

**Project Type**: Web application (Cloudflare Worker backend) — server-only, no client change (the
consumer is the e2e suite, explicitly out of scope per spec.md Assumptions)

**Performance Goals**: N/A — one key-pair generation (cached per isolate, same pattern as the real
`googleJwks()` singleton) plus one JWT sign and one JWT verify; same cost class as the real callback
route's own verification step.

**Constraints**: Zero production footprint (FR-005/FR-006) — the central constraint, since this
endpoint is a full authentication bypass by construction and must not exist outside development.

**Scale/Scope**: One moved module (~50 lines, from `tests/` to `src/`), one new route file (~30
lines), a handful of new/extended tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Tenant Isolation via Repository Layer)**: The route calls `completeGoogleSignIn`,
  which itself goes through the repository layer (`findOidcIdentityByProviderAndSubject`/
  `createOidcUser`) — no direct D1 access added. PASS.
- **Principle IV (No Interpolated Data)**: N/A — no aggregate or derived value involved. PASS.
- **Principle VII (Locked-Down Session and Transport Security)**: The central concern for this
  entire feature — this endpoint is, by construction, a complete authentication bypass (mints a
  valid session for any claimed identity with no proof of control). Mitigated identically to the
  two already-shipped dev-only routes: `notFoundOutsideDev` gates it completely out of production,
  the same mechanism already trusted and tested for `/_dev/session` and `/_dev/magic-link-token`.
  This is explicitly framed in spec.md User Story 2 as equal-priority to the feature working at
  all, not an afterthought. PASS (by design, verified by dedicated tests, not by convention).
- **Principle X (Toolchain Discipline)**: No new dependency (`jose` already present). PASS.
- **Principle XI (English-Only Project Artifacts)**: Spec, plan, code, and tests in English. PASS.
- No other principle (II, III, V, VI, VIII, IX, XII) is implicated.

No violations. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/032-dev-oidc-fixture/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command) — N/A, no new entities
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/auth/oidc/
└── fixture.ts                 # NEW: moved from tests/server/fixtures/oidc.ts — fixtureJwks(),
                                #      signFixtureIdToken(), FIXTURE_AUDIENCE

src/server/auth/
└── dev-oidc.ts                 # NEW: POST / handler wrapping completeGoogleSignIn with the
                                 #      fixture JWKS, behind the imported notFoundOutsideDev

src/server/index.ts              # MODIFY: mount the new route at /api/v1/_dev/oidc-google

tests/server/fixtures/oidc.ts    # MODIFY: becomes a thin re-export of
                                  #         src/server/auth/oidc/fixture.ts (no duplicated logic)

tests/server/
├── oidc-auth.test.ts             # MODIFY: import path only — cases unchanged
└── dev-oidc.test.ts               # NEW: happy path, repeat-call account stability, missing-email
                                    #      rejection, session usability

tests/server/dev-routes-production-gating.test.ts   # MODIFY: extend with this route's
                                                      #         404-in-production case
```

**Structure Decision**: Server-only change. The fixture-signing module moves from `tests/` into
`src/server/auth/oidc/` (a peer of `verify-id-token.ts`, the production verification module it
mirrors) since it must now be reachable by the running dev server, not only by the test runner —
`tests/server/fixtures/oidc.ts` becomes a re-export so no existing test import breaks. The new
route lives in its own file (`dev-oidc.ts`), same convention as `dev-magic-link.ts`, structurally
separate from the real OIDC routes.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
