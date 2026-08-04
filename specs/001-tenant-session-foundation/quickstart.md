# Quickstart: Tenant-Scoped Repository Layer & Session Foundation

Validates the feature end-to-end once implemented. Assumes `npm install` has already been run (see
repo root README).

## 1. Apply migrations locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

(`--local` targets the Miniflare-simulated local D1, not the real remote `odograph-preview` database
— safe to run repeatedly.)

## 2. Run the automated test suite

```sh
npm test
```

Expect `tests/server/tenant-isolation.test.ts`, `tests/server/session.test.ts`, and
`tests/server/rate-limit.test.ts` to pass — these directly exercise the spec's Acceptance Scenarios
(see [contracts/api.md](contracts/api.md) for the routes they call).

## 3. Manual smoke test against `wrangler dev`

```sh
npm run dev
```

In another terminal:

```sh
# Issue a session for tenant A, save its cookie
curl -sc /tmp/tenant-a.cookies -X POST http://localhost:8787/api/v1/_dev/session

# Issue a session for tenant B
curl -sc /tmp/tenant-b.cookies -X POST http://localhost:8787/api/v1/_dev/session

# Tenant A's probe resolves tenant A's own id
curl -sb /tmp/tenant-a.cookies http://localhost:8787/api/v1/_tenant-isolation-probe

# Tenant B's probe resolves a DIFFERENT tenant id — confirms isolation (User Story 1)
curl -sb /tmp/tenant-b.cookies http://localhost:8787/api/v1/_tenant-isolation-probe

# No cookie at all -> 401 (FR-004)
curl -si http://localhost:8787/api/v1/_tenant-isolation-probe | head -1

# Invalidate tenant A's session, confirm the next request is rejected (FR-006)
curl -sb /tmp/tenant-a.cookies -X POST http://localhost:8787/api/v1/_dev/session/invalidate
curl -si -b /tmp/tenant-a.cookies http://localhost:8787/api/v1/_tenant-isolation-probe | head -1
```

Expected: the two probe calls return different `tenantId` values, the no-cookie call returns `401`,
and the post-invalidation call also returns `401`.

## 4. Confirm the dev route is unreachable when `ENVIRONMENT=production`

```sh
ENVIRONMENT=production npm run dev
curl -si -X POST http://localhost:8787/api/v1/_dev/session | head -1
```

Expected: `404` (the route isn't registered at all, per FR-009 and the research.md decision).
