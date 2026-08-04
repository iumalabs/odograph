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

## `GET /api/v1/_tenant-isolation-probe` (all environments, temporary)

Placeholder tenant-scoped route that exists purely to prove isolation end-to-end (spec's User Story
1 Independent Test) before any real tenant-scoped resource (vehicles, milestone M2) exists. Deleted
in the first PR that adds a real tenant-scoped resource route — it's a test fixture, not a feature.

**Auth**: requires a valid session (tenant context resolved via the session middleware).

**Response** `200`: `{ "tenantId": string }` — the tenant id the _server_ resolved for the request,
never anything the client supplied. Used by tests to assert that two different sessions resolve to
two different tenant ids, and that neither can be steered by request content.

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
