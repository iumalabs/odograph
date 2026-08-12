# Tasks: Dev-Only Google OIDC Fixture Sign-In Endpoint

**Input**: Design documents from `/specs/032-dev-oidc-fixture/` **Prerequisites**: plan.md,
spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included — this endpoint is a full authentication bypass by construction, so its
production-inertness is not optional to verify, and the project already has an established test
pattern for exactly this shape of proof (`tests/server/dev-routes-production-gating.test.ts`).

## Phase 1: Setup

None — no new dependency, no new migration.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] OG-001 Create `src/server/auth/oidc/fixture.ts`: move `FIXTURE_AUDIENCE`, `getFixtureKeyPair`,
      `fixtureJwks()`, and `signFixtureIdToken()` here verbatim from
      `tests/server/fixtures/oidc.ts` (research.md — one source of truth, not a duplicate)
- [X] OG-002 Replace `tests/server/fixtures/oidc.ts`'s contents with a thin re-export: `export {
      FIXTURE_AUDIENCE, fixtureJwks, signFixtureIdToken } from
      "../../../src/server/auth/oidc/fixture";` — confirm `tests/server/oidc-auth.test.ts`'s
      existing imports still resolve unchanged

**Checkpoint**: `deno task test` still passes for `oidc-auth.test.ts` with zero behavior change;
the fixture-signing logic now lives in `src/` and is importable by a route.

---

## Phase 3: User Story 1 - An automated test completes a Google sign-in without a real Google account (Priority: P1) 🎯 MVP

**Goal**: The new endpoint exists, signs a fixture token for a given email, completes sign-in via
the real `completeGoogleSignIn`, and produces the same success response shape the real callback
does.

- [X] OG-003 [US1] Create `src/server/auth/dev-oidc.ts`: `export const devOidc = new Hono<AppEnv>()`;
      `GET /` behind the imported `notFoundOutsideDev` (from `./dev-session`); reads
      `c.req.query("email")`, `400`s with no side effect if absent (FR-007); derives a deterministic
      `sub` from the email (research.md — e.g. a stable prefix + email, so repeat calls resolve the
      same account); signs a fixture ID token via `signFixtureIdToken({ sub, email })`
      (`./oidc/fixture`); calls `completeGoogleSignIn(c.env.DB, idToken, { jwks: await
      fixtureJwks(), audience: FIXTURE_AUDIENCE })`; on `{ ok: true, cookie }`, sets the cookie and
      redirects to `/?oidc=ok` exactly like the real `/callback` route's success path
      (`src/server/routes/v1/auth/oidc/google.ts` lines ~88-97 — match the response shape)
- [X] OG-004 [US1] Wire `devOidc` into `src/server/index.ts` under `/api/v1/_dev/oidc-google` (import
      alongside the existing `devSession`/`devMagicLink` imports, `app.route("/api/v1/_dev/oidc-google",
      devOidc)` near the other `_dev` mounts)
- [X] OG-005 [P] [US1] Create `tests/server/dev-oidc.test.ts`: 1. `GET
      /api/v1/_dev/oidc-google?email=...` returns `302` to `/?oidc=ok` with a `Set-Cookie` header
      (contracts/api.md). 2. The issued cookie authenticates a real request (e.g.
      `GET /api/v1/vehicles` succeeds) — proves FR-003, mirroring `oidc-auth.test.ts`'s existing
      `probeTenantId`-style pattern. 3. Calling the endpoint twice with the same email resolves the
      same tenant/account both times, not two different ones — proves FR-002. 4. Calling with no
      `email` query param returns `400` and issues no cookie — proves FR-007

**Checkpoint**: `deno task dev` — `curl`ing the new endpoint with `redirect: manual` returns a
`302` to `/?oidc=ok` with a working session cookie; using it against a real authenticated route
succeeds.

---

## Phase 4: User Story 2 - The endpoint does not exist in production (Priority: P1)

**Goal**: Confirm zero production footprint, mirroring the existing test pattern exactly.

- [X] OG-006 [US2] Extend `tests/server/dev-routes-production-gating.test.ts`'s existing `describe`
      block with a fourth case: `GET /api/v1/_dev/oidc-google` (with or without an `email` query
      param) returns `404` when `ENVIRONMENT` is overridden to `"production"` in the env object
      passed to `app.fetch` — same pattern as the file's existing three cases

**Checkpoint**: `deno task test` passes; the new route is proven inert in production by the same
mechanism already trusted for the three existing dev-only routes.

---

## Phase 5: Polish & Cross-Cutting

- [X] OG-007 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard) and
      fix any failures across all files touched by this feature
- [X] OG-008 Walk through quickstart.md's four validation scenarios end-to-end against
      `deno task dev` (scenario 4 is satisfied by OG-006's test, not a manual step, matching the
      established pattern from specs/031)

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the moved fixture module must
  exist before the route can import it, and the existing test suite must keep passing before any
  new code is layered on.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4 needs the route to exist
  to test its production behavior, but tests genuinely independent concerns.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That delivers the actual fixture sign-in capability —
this feature's entire point. User Story 2 (Phase 4) is the equally-mandatory safety proof that this
authentication-bypass-by-construction endpoint cannot exist in production, using the
already-established, already-trusted test pattern from the two prior dev-only routes.
