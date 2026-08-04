# Tasks: Tenant-Scoped Repository Layer & Session Foundation

**Input**: Design documents from `/specs/001-tenant-session-foundation/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — the spec's Independent Test per user story and the existing
`@cloudflare/vitest-pool-workers` setup make test tasks the natural verification mechanism for this
feature; contract validation is folded into each story's test task rather than split into separate
contract-test-first tasks, since `contracts/api.md` describes a handful of small routes, not a
public API surface needing its own test layer.

> Updated after `/speckit-analyze`: added the `probe_resources` fixture (findings C1/SC-001 — the
> probe route previously couldn't actually exercise cross-tenant resource denial), an automated
> prod-gating test (finding H1/FR-009), and a repository-layer CI guard (finding M2/SC-002).

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0001_tenants_users_sessions.sql` (tables `tenants`,
      `users`, `sessions`, and `probe_resources` per data-model.md, including the
      `ON DELETE
      CASCADE` foreign keys and the `sessions.token_hash` unique constraint)
- [X] T002 Add `[[d1_databases]]` and `[[kv_namespaces]]` bindings to `wrangler.toml` for the
      default (local/test), `env.preview`, and `env.production` sections, using the resource ids
      from research.md's "Cloudflare resources provisioned" table; add
      `migrations_dir =
      "migrations"` to each `d1_databases` entry
- [X] T003 Add an `ENVIRONMENT` plain-text var to `wrangler.toml` (`"development"` at the top level,
      `"preview"` under `env.preview`, `"production"` under `env.production`)
- [X] T004 Run `npm run cf-typegen` to regenerate `worker-configuration.d.ts` with the new bindings'
      types, and confirm `npm run typecheck` still passes with no bindings referenced yet

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T005 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
      (targets the Miniflare-simulated local D1, per quickstart.md step 1)
- [X] T006 [P] Implement the repository layer in `src/server/db/repository.ts`: the only module that
      imports/queries the D1 binding. Export `createTenant`, `createUser`, `createSession`,
      `findSessionByTokenHash`, `invalidateSession`, `findUserById`, `createProbeResource`,
      `findProbeResourceById` — all reads/writes scoped by whatever `TenantContext`/ids are passed
      in, per the shape in data-model.md's "Repository layer contract" section.
      `findProbeResourceById` must return `null` both when no row has that id and when the row
      exists but belongs to a different tenant — the two cases are indistinguishable by design. No
      function in this file accepts a raw D1 client from a caller.
- [X] T007 [P] Implement the session module in `src/server/auth/session.ts`: generate an opaque
      token (`crypto.getRandomValues`, base64url-encoded), hash it (`crypto.subtle.digest` SHA-256,
      hex-encoded) for storage/lookup, serialize/parse the session cookie
      (HttpOnly/Secure/SameSite=Lax per FR-005), and implement `issueSession`, `resolveSession`
      (checks KV cache first, falls through to `repository.ts` on miss, populates KV with a 5-minute
      TTL on hit), and `invalidateSession` (deletes the D1 row via `repository.ts` **and** deletes
      the KV cache entry explicitly, per research.md)
- [X] T008 Implement tenant-context middleware in `src/server/middleware/tenant-context.ts`: reads
      the session cookie, calls `session.ts`'s `resolveSession`, attaches
      `{ tenantId,
      userId }` to the Hono context on success, responds `401` on any failure (no
      cookie, invalid/expired/invalidated session, dangling user/tenant reference per FR-008)
- [X] T009 [P] Implement the rate limiter in `src/server/auth/rate-limit.ts`: a Hono middleware that
      increments a KV fixed-window counter keyed by the resolved session's token hash, rejects with
      `429` + `Retry-After` when the configured limit is exceeded, and lets the request through
      unmodified otherwise (per contracts/api.md's "Cross-cutting: rate limiting" section)

**Checkpoint**: Repository, session, tenant-context middleware, and rate limiter all exist and
type-check. No route wires them together yet — that starts in Phase 3.

---

## Phase 3: User Story 1 - No user's data is ever visible to another tenant (P1) 🎯 MVP

**Goal**: Prove tenant isolation end-to-end: two sessions, two different resolved tenant ids, no
client-supplied value can steer which tenant a request resolves to, and a resource id belonging to
another tenant is denied identically to a nonexistent one.

**Independent Test**: Per spec.md — provision two tenants/sessions, create a probe resource under
tenant A, confirm tenant B's session gets an identical "not found" response whether requesting
tenant A's resource id or a completely made-up one, and confirm a client-supplied tenant/owner id
never overrides the session's own tenant.

- [X] T010 [US1] Implement the dev/test session-issuing routes in `src/server/auth/dev-session.ts`:
      `POST /api/v1/_dev/session` (creates a tenant + user via `repository.ts`, issues a session via
      `session.ts`, sets the cookie) and `POST /api/v1/_dev/session/invalidate` (invalidates the
      presented session). Register both only when `c.env.ENVIRONMENT !== "production"` — not
      registered at all otherwise (per research.md's dev-route decision and FR-009)
- [X] T011 [US1] Implement the placeholder probe routes in
      `src/server/routes/v1/_tenant-isolation-probe.ts`: `POST /api/v1/_tenant-isolation-probe`
      (creates a `probe_resources` row for the caller's tenant, returns `{ id, tenantId }`) and
      `GET /api/v1/_tenant-isolation-probe/:id` (tenant-scoped lookup via `findProbeResourceById`;
      `200` with `{ id, tenantId }` only if it belongs to the caller's tenant, `404` otherwise) —
      both require the tenant-context middleware, per contracts/api.md
- [X] T012 [US1] Wire `tenant-context` middleware, `rate-limit` middleware (applied to the write
      routes from T010 and the `POST` probe route from T011), `dev-session` routes, and the probe
      routes into `src/server/index.ts`
- [X] T013 [P] [US1] Write `tests/server/tenant-isolation.test.ts` covering spec.md's User Story 1
      Acceptance Scenarios 1-3: (a) tenant B requesting tenant A's probe-resource id gets the same
      `404` as a nonexistent id, with no signal distinguishing the two cases, (b) a client-supplied
      tenant/owner identifier in body/query/headers is ignored in favor of the session's own tenant,
      (c) an anonymous request is rejected before touching tenant data. Also assert the FR-008 edge
      case: delete a user directly via `repository.ts`, confirm their session no longer resolves
      (proves the `ON DELETE CASCADE` behaves as data-model.md documents, not just that it's
      declared).
- [X] T014 [P] [US1] Write `tests/server/dev-routes-production-gating.test.ts` asserting
      `POST /api/v1/_dev/session` and `POST /api/v1/_dev/session/invalidate` both return `404` when
      the Worker is run with `c.env.ENVIRONMENT === "production"` (FR-009) — construct the Hono app
      with an `{ ENVIRONMENT: "production" }` env override and confirm the routes are absent, rather
      than only checking response status against the default test env.

**Checkpoint**: User Story 1 is independently complete and testable — `npm test` passes for
`tenant-isolation.test.ts` and `dev-routes-production-gating.test.ts`, and the manual smoke test in
quickstart.md steps 1-3 (through the isolation checks) works against `wrangler dev`.

---

## Phase 4: User Story 2 - A session reliably identifies who's asking, safely (P2)

**Goal**: Prove the session cookie contract and invalidation behavior directly — the implementation
already exists from Phase 2/3 (T007, T010); this phase is about proving it, plus any small gaps the
tests surface.

**Independent Test**: Per spec.md — issue a session via the dev/test mechanism, inspect the cookie's
attributes, confirm resolution works and stops working after invalidation.

- [X] T015 [P] [US2] Write `tests/server/session.test.ts` covering spec.md's User Story 2 Acceptance
      Scenarios 1-3: issued cookie is HttpOnly/Secure/SameSite=Lax, a valid session cookie resolves
      to the correct tenant with no other credential needed, and a request using an invalidated
      session's cookie is treated as anonymous (same rejection as Scenario 3 in User Story 1)

**Checkpoint**: `npm test` passes for `session.test.ts`; quickstart.md step 3's invalidation check
and step 4 (dev route unreachable when `ENVIRONMENT=production`) both work.

---

## Phase 5: User Story 3 - Write endpoints resist abusive request volume (P3)

**Goal**: Prove the rate limiter built in Phase 2 (T009) actually throttles a real write route under
load, without affecting other sessions.

**Independent Test**: Per spec.md — send writes faster than the configured limit on one session and
confirm rejection without a database write, while a different session is unaffected.

- [X] T016 [US3] Confirm the rate-limit middleware from T009 is applied to
      `POST /api/v1/_dev/session`, `POST /api/v1/_dev/session/invalidate`, and
      `POST /api/v1/_tenant-isolation-probe` in `src/server/index.ts` (should already be true from
      T012 — this task is the checkpoint that verifies it, adjusting the middleware order if a
      review shows rate-limiting is being bypassed for any of them)
- [X] T017 [P] [US3] Write `tests/server/rate-limit.test.ts` covering spec.md's User Story 3
      Acceptance Scenarios 1-3: requests under the limit succeed normally, requests over the limit
      are rejected with no underlying write performed, and a second session is unaffected by the
      first session's throttling

**Checkpoint**: `npm test` passes for `rate-limit.test.ts`.

---

## Phase 6: Polish & Cross-Cutting

- [X] T018 [P] Add `src/server/db/schema.sql` as a human-readable reference copy of the current
      schema shape (docs only — `migrations/` stays the actual source of truth, per plan.md's
      Project Structure)
- [X] T019 Add a repository-layer guard: a small script or `deno lint` check (wired into
      `deno.json`'s `check` task) that fails if any file other than `src/server/db/repository.ts`
      references the D1 binding name — upgrades FR-002/SC-002 from convention-only to CI-enforced
      (finding M2)
- [X] T020 Run `deno task check` (fmt --check, lint, typecheck, full test suite) and fix any
      failures across all files touched by this feature
- [X] T021 Walk through quickstart.md end-to-end against `wrangler dev` exactly as written; update
      quickstart.md if any command or expected output drifted during implementation

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict — bindings must exist before any code
  that uses them type-checks.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository, session, middleware,
  and rate limiter are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4 only adds tests against
  functionality Phase 3 already wired up (the dev-session routes). Phase 4 cannot start before Phase
  3's T010 exists, but could in principle be reordered before T011/T012 if desired; kept after for a
  cleaner MVP checkpoint.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: soft, same reasoning — Phase 5 needs
  T010/T011's write routes to exist to exercise the rate limiter meaningfully.
- **T019 (Phase 6)** → informally depends on all `src/server/**` files from prior phases existing,
  so the guard has something real to check against.
- **Phase 6 (Polish)**: after all story phases.

## Parallel execution examples

Within Phase 2, T006/T007/T009 touch different files and have no dependency on each other (T008
depends on both T006 and T007, so it isn't parallel with them):

```text
T006 [P] src/server/db/repository.ts
T007 [P] src/server/auth/session.ts
T009 [P] src/server/auth/rate-limit.ts
```

Within Phase 3, T013/T014 (tests) can be written in parallel with T010-T012 (implementation) by a
different task/agent, then run once both land:

```text
T010 src/server/auth/dev-session.ts
T011 src/server/routes/v1/_tenant-isolation-probe.ts
T012 src/server/index.ts
T013 [P] tests/server/tenant-isolation.test.ts
T014 [P] tests/server/dev-routes-production-gating.test.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That alone delivers and proves the
constitution's Principle I guarantee — the reason this feature exists — and unblocks every future
feature that needs tenant-scoped data. User Stories 2 and 3 (Phases 4-5) mostly verify behavior the
foundational phase already implements, so they're low-risk to complete right after, but Phase 3 is
the increment that actually matters if this had to ship in pieces.
