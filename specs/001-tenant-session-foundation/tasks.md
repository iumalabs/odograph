# Tasks: Tenant-Scoped Repository Layer & Session Foundation

**Input**: Design documents from `/specs/001-tenant-session-foundation/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — the spec's Independent Test per user story and the existing
`@cloudflare/vitest-pool-workers` setup make test tasks the natural verification mechanism for this
feature; contract validation is folded into each story's test task rather than split into separate
contract-test-first tasks, since `contracts/api.md` describes 3 small routes, not a public API
surface needing its own test layer.

## Phase 1: Setup

- [ ] T001 Create D1 migration `migrations/0001_tenants_users_sessions.sql` (tables `tenants`,
      `users`, `sessions` per data-model.md, including the `ON DELETE CASCADE` foreign keys and the
      `sessions.token_hash` unique constraint)
- [ ] T002 Add `[[d1_databases]]` and `[[kv_namespaces]]` bindings to `wrangler.toml` for the
      default (local/test), `env.preview`, and `env.production` sections, using the resource ids
      from research.md's "Cloudflare resources provisioned" table; add
      `migrations_dir =
      "migrations"` to each `d1_databases` entry
- [ ] T003 Add an `ENVIRONMENT` plain-text var to `wrangler.toml` (`"development"` at the top level,
      `"preview"` under `env.preview`, `"production"` under `env.production`)
- [ ] T004 Run `npm run cf-typegen` to regenerate `worker-configuration.d.ts` with the new bindings'
      types, and confirm `npm run typecheck` still passes with no bindings referenced yet

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T005 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
      (targets the Miniflare-simulated local D1, per quickstart.md step 1)
- [ ] T006 [P] Implement the repository layer in `src/server/db/repository.ts`: the only module that
      imports/queries the D1 binding. Export `createTenant`, `createUser`, `createSession`,
      `findSessionByTokenHash`, `invalidateSession`, `findUserById` — all reads/writes scoped by
      whatever `TenantContext`/ids are passed in, per the shape in data-model.md's "Repository layer
      contract" section. No function in this file accepts a raw D1 client from a caller.
- [ ] T007 [P] Implement the session module in `src/server/auth/session.ts`: generate an opaque
      token (`crypto.getRandomValues`, base64url-encoded), hash it (`crypto.subtle.digest` SHA-256,
      hex-encoded) for storage/lookup, serialize/parse the session cookie
      (HttpOnly/Secure/SameSite=Lax per FR-005), and implement `issueSession`, `resolveSession`
      (checks KV cache first, falls through to `repository.ts` on miss, populates KV with a 5-minute
      TTL on hit), and `invalidateSession` (deletes the D1 row via `repository.ts` **and** deletes
      the KV cache entry explicitly, per research.md)
- [ ] T008 Implement tenant-context middleware in `src/server/middleware/tenant-context.ts`: reads
      the session cookie, calls `session.ts`'s `resolveSession`, attaches
      `{ tenantId,
      userId }` to the Hono context on success, responds `401` on any failure (no
      cookie, invalid/expired/invalidated session, dangling user/tenant reference per FR-008)
- [ ] T009 [P] Implement the rate limiter in `src/server/auth/rate-limit.ts`: a Hono middleware that
      increments a KV fixed-window counter keyed by the resolved session's token hash, rejects with
      `429` + `Retry-After` when the configured limit is exceeded, and lets the request through
      unmodified otherwise (per contracts/api.md's "Cross-cutting: rate limiting" section)

**Checkpoint**: Repository, session, tenant-context middleware, and rate limiter all exist and
type-check. No route wires them together yet — that starts in Phase 3.

---

## Phase 3: User Story 1 - No user's data is ever visible to another tenant (P1) 🎯 MVP

**Goal**: Prove tenant isolation end-to-end: two sessions, two different resolved tenant ids, no
client-supplied value can steer which tenant a request resolves to.

**Independent Test**: Per spec.md — provision two tenants/sessions, confirm each session's requests
resolve only to its own tenant, and a request supplying a different tenant/owner id in its
body/query/headers is still scoped to the session's own tenant.

- [ ] T010 [US1] Implement the dev/test session-issuing routes in `src/server/auth/dev-session.ts`:
      `POST /api/v1/_dev/session` (creates a tenant + user via `repository.ts`, issues a session via
      `session.ts`, sets the cookie) and `POST
      /api/v1/_dev/session/invalidate` (invalidates
      the presented session). Register both only when `c.env.ENVIRONMENT !== "production"` — not
      registered at all otherwise (per research.md's dev-route decision and FR-009)
- [ ] T011 [US1] Implement the placeholder probe route in
      `src/server/routes/v1/_tenant-isolation-probe.ts`:
      `GET
      /api/v1/_tenant-isolation-probe`, requires the tenant-context middleware, returns
      `{
      tenantId }` from the resolved context — never from any client-supplied value, even if
      one is present in the request (per contracts/api.md)
- [ ] T012 [US1] Wire `tenant-context` middleware, `rate-limit` middleware (applied to the two write
      routes from T010), `dev-session` routes, and the probe route into `src/server/index.ts`
- [ ] T013 [P] [US1] Write `tests/server/tenant-isolation.test.ts` covering spec.md's User Story 1
      Acceptance Scenarios 1-3: cross-tenant resource access returns as though the resource doesn't
      exist, a client-supplied tenant/owner identifier is ignored in favor of the session's own
      tenant, and an anonymous request is rejected before touching tenant data

**Checkpoint**: User Story 1 is independently complete and testable — `npm test` passes for
`tenant-isolation.test.ts`, and the manual smoke test in quickstart.md steps 1-3 (through the
isolation checks) works against `wrangler dev`.

---

## Phase 4: User Story 2 - A session reliably identifies who's asking, safely (P2)

**Goal**: Prove the session cookie contract and invalidation behavior directly — the implementation
already exists from Phase 2/3 (T007, T010); this phase is about proving it, plus any small gaps the
tests surface.

**Independent Test**: Per spec.md — issue a session via the dev/test mechanism, inspect the cookie's
attributes, confirm resolution works and stops working after invalidation.

- [ ] T014 [P] [US2] Write `tests/server/session.test.ts` covering spec.md's User Story 2 Acceptance
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

- [ ] T015 [US3] Confirm the rate-limit middleware from T009 is applied to both
      `POST /api/v1/_dev/session` and `POST /api/v1/_dev/session/invalidate` in
      `src/server/index.ts` (should already be true from T012 — this task is the checkpoint that
      verifies it, adjusting the middleware order if a review shows rate-limiting is being bypassed
      for either route)
- [ ] T016 [P] [US3] Write `tests/server/rate-limit.test.ts` covering spec.md's User Story 3
      Acceptance Scenarios 1-3: requests under the limit succeed normally, requests over the limit
      are rejected with no underlying write performed, and a second session is unaffected by the
      first session's throttling

**Checkpoint**: `npm test` passes for `rate-limit.test.ts`.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T017 [P] Add `src/server/db/schema.sql` as a human-readable reference copy of the current
      schema shape (docs only — `migrations/` stays the actual source of truth, per plan.md's
      Project Structure)
- [ ] T018 Run `deno task check` (fmt --check, lint, typecheck, full test suite) and fix any
      failures across all files touched by this feature
- [ ] T019 Walk through quickstart.md end-to-end against `wrangler dev` exactly as written; update
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
  T010's write routes to exist to exercise the rate limiter meaningfully.
- **Phase 6 (Polish)**: after all story phases.

## Parallel execution examples

Within Phase 2, T006/T007/T009 touch different files and have no dependency on each other (T008
depends on both T006 and T007, so it isn't parallel with them):

```text
T006 [P] src/server/db/repository.ts
T007 [P] src/server/auth/session.ts
T009 [P] src/server/auth/rate-limit.ts
```

Within Phase 3, T013 (tests) can be written in parallel with T010-T012 (implementation) by a
different task/agent, then run once both land:

```text
T010 src/server/auth/dev-session.ts
T011 src/server/routes/v1/_tenant-isolation-probe.ts
T012 src/server/index.ts
T013 [P] tests/server/tenant-isolation.test.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That alone delivers and proves the
constitution's Principle I guarantee — the reason this feature exists — and unblocks every future
feature that needs tenant-scoped data. User Stories 2 and 3 (Phases 4-5) mostly verify behavior the
foundational phase already implements, so they're low-risk to complete right after, but Phase 3 is
the increment that actually matters if this had to ship in pieces.
