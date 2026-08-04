# API Contracts: Tenant-Scoped Repository Layer & Session Foundation

All routes are under `/api/v1`. No route in this feature is reachable without a valid session except
the dev/test session-issuing route itself and `/api/v1/health` (existing).

## `POST /api/v1/_dev/session` (non-production only)

Creates a tenant, a user under it, and a session, for local development and automated tests. **Not
registered at all when `c.env.ENVIRONMENT === "production"`** — a request to this path in production
gets Hono's normal 404, indistinguishable from any other undefined route.

**Request**: no body required. Optional `{ "email": string }` to control the created user's email;
defaults to a generated placeholder if omitted.

**Response** `200`:

- Sets a `Set-Cookie` header for the session (HttpOnly, Secure, SameSite=Lax, matching FR-005).
- Body: `{ "userId": string, "tenantId": string }` (for test assertions — not sensitive, this route
  only exists outside production).

## `POST /api/v1/_dev/session/invalidate` (non-production only)

Invalidates the session presented via cookie. Used by tests to exercise FR-006 without needing a
real logout flow (which belongs to the login-method specs).

**Response** `200`: `{ "invalidated": true }`. `401` if no valid session was presented.

## `POST /api/v1/_tenant-isolation-probe` (all environments, temporary)

Creates one `probe_resources` row owned by the caller's resolved tenant. Placeholder tenant-scoped
write route that exists purely to prove isolation end-to-end (spec's User Story 1 Independent Test)
before any real tenant-scoped resource (vehicles, milestone M2) exists. Deleted, along with the GET
route below, in the first PR that adds a real tenant-scoped resource route — it's a test fixture,
not a feature.

**Auth**: requires a valid session (tenant context resolved via the session middleware). Passes
through the rate limiter like any other write route.

**Response** `200`: `{ "id": string, "tenantId": string }` — the created resource's id and the
tenant id the _server_ resolved for the request, never anything the client supplied.

**Response** `401`: no valid session (FR-004).

## `GET /api/v1/_tenant-isolation-probe/:id` (all environments, temporary)

Tenant-scoped lookup of a `probe_resources` row by id, through the repository layer. This is what
actually exercises FR-003/SC-001: a resource id that exists but belongs to a _different_ tenant must
come back identical to an id that doesn't exist at all.

**Auth**: requires a valid session.

**Response** `200`: `{ "id": string, "tenantId": string }` — only when the resource exists **and**
belongs to the caller's resolved tenant.

**Response** `404`: the id doesn't exist, or exists but belongs to a different tenant — these two
cases are indistinguishable in the response, by design (spec.md Acceptance Scenario 1: "no
confirmation the id is valid for another tenant").

**Response** `401`: no valid session (FR-004).

## Cross-cutting: rate limiting

Every route that performs a write (in this feature: none yet — the probe route and dev-session
routes are reads/setup, not tenant-data writes) passes through the rate limiter
(`src/server/auth/rate-limit.ts`) before reaching its handler. This feature establishes the
middleware; the first feature with a real write route (vehicles, M2) is what actually exercises it
in production traffic. The rate limiter itself is tested directly in
`tests/server/rate-limit.test.ts` against a synthetic write-shaped route, per the spec's User Story
3 Independent Test.

**Response `429`** (when throttled): `{ "error": "rate_limited" }`, `Retry-After` header set to the
remaining window in seconds.
