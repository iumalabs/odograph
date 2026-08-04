# Phase 0 Research: Tenant-Scoped Repository Layer & Session Foundation

## Session token: opaque server-side token vs. signed stateless token (JWT-style)

**Decision**: Opaque random token (32 bytes from `crypto.getRandomValues`, base64url-encoded),
stored server-side in D1 (`sessions.token_hash`, SHA-256 of the raw token via `crypto.subtle`). The
cookie holds only the raw token; nothing about the user or tenant is decodable from it client-side.

**Rationale**: FR-006 requires that invalidating a session (logout/expiry) takes effect on the
_next_ request. A signed stateless token (HMAC/JWT) is self-verifying and therefore not revocable
before its natural expiry without an additional revocation list — which just reintroduces
server-side state anyway, with more moving parts than storing the session directly. An opaque token
with a server-side row sidesteps that entirely: delete the row (or mark it invalid), and the very
next lookup fails. Storing a hash rather than the raw token means a D1 read (backup, replica,
accidental log) never yields a usable session token, matching the spirit of Principle VI even though
that principle's text is scoped to API tokens specifically.

**Alternatives considered**:

- Signed JWT cookie: rejected — revocation requires a denylist, which is the same server-side state
  this approach already needs, plus JWT parsing/verification complexity for no benefit here.
- Storing the raw token (not hashed) in D1: rejected — cheap to hash, and hashing costs nothing at
  this scale; no reason to accept the weaker posture.

## Session storage: D1 vs. KV as source of truth

**Decision**: D1 `sessions` table is the source of truth. KV holds a cache entry
(`session:{tokenHash}` → `{userId, tenantId, expiresAt}`) with a short TTL (5 minutes), populated on
cache miss and **explicitly deleted** (not just left to expire) whenever a session is invalidated.

**Rationale**: The constitution's stack decision assigns KV to "sessions/settings cache" — this is a
cache-aside pattern, not KV-as-primary-store. KV is eventually consistent (global propagation can
take up to ~60s), which would let a just-invalidated session keep working from edge locations that
haven't seen the delete yet — directly violating FR-006. D1 is strongly consistent for a single
deployment's data. Using KV purely as a cache in front of D1, with explicit delete-on-invalidate
rather than relying on TTL alone, gets the latency benefit of KV on the hot path (cache hit = 1 KV
read) without the correctness risk (a cache miss or explicit delete always falls through to the
consistent source of truth).

**Alternatives considered**:

- KV-only, no D1 sessions table: rejected — fails FR-006 (see above).
- D1-only, no KV cache: acceptable simpler alternative, but skips the constitution's explicit "KV
  for sessions cache" stack decision without a stated reason to deviate; the cache-aside design gets
  both the mandated KV usage and correctness, so there's no real tradeoff to accept.

## Rate limiting: Workers native Rate Limiting binding vs. KV-based counter

**Decision**: KV-based fixed-window counter. Key: `ratelimit:{sessionTokenHash}:{windowStart}`,
value is a request count, TTL set to the window length. On each write request, increment (read + put
— see note on races below); if over the configured limit, reject before touching D1.

**Rationale**: Cloudflare's native Rate Limiting binding (`unsafe.bindings`, `type = "ratelimit"`)
is still a beta/"unsafe"-namespaced binding with coarse fixed period options — depending on a beta
binding for a foundational, every-request code path is a heavier commitment than this feature needs
to make on day one. A KV counter is simple, uses infrastructure already in this feature's scope (KV
is already being added for the session cache), and is precise enough for a resilience backstop
(Principle VII), which doesn't need to be exact — occasional under-counting from KV's eventual
consistency across edge POPs is an acceptable tradeoff for a throttle, unlike for session validity
(see previous section). If the native binding matures and the project wants to switch, this KV-based
limiter is small and isolated (`src/server/auth/
rate-limit.ts`) to swap out later — noted as a
candidate future ADR, not decided now.

**Alternatives considered**:

- Workers Rate Limiting binding: rejected for now per above; revisit once out of beta.
- Durable Objects for exact counting: rejected — adds a new primitive (Durable Objects aren't in the
  constitution's stack) for a resilience feature that doesn't need exact counting.

## D1 migrations tooling

**Decision**: `wrangler d1 migrations` (native), migration files under `migrations/` at repo root,
applied via `wrangler d1 migrations apply <db-name>` (locally and in CI before deploy).
`vitest.config.ts`'s `@cloudflare/vitest-pool-workers` config points at the same `wrangler.toml` D1
binding, which applies migrations automatically for the test environment (per the pool's
`migrations` support), so tests always run against current schema.

**Rationale**: Native tooling, zero extra dependencies, already implied by "D1 (relational)" in the
constitution's stack and by the existing `wrangler.toml`/`vitest.config.ts` wiring.

**Alternatives considered**: A third-party migration tool (e.g. drizzle-kit) — rejected for this
feature; nothing in the stack currently uses an ORM, and introducing one is a bigger decision than
this foundational feature should make unilaterally (candidate future ADR if query complexity grows
enough to want one).

## Cloudflare resources provisioned

Created ahead of this plan (one-time infra setup, matches docs/deployment.md's preview/production
split):

| Resource                               | Preview                                                       | Production                                                       |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| D1 database                            | `odograph-preview` (`a55a25d1-0270-44e7-8d85-ae4873626ca7`)   | `odograph-production` (`d8bcd8f6-3521-487d-aa78-8b7a075ef372`)   |
| KV namespace (sessions/settings cache) | `odograph-preview-cache` (`eaf8958e040049ecbe52408b28fa1d1c`) | `odograph-production-cache` (`aa415e9f6b9646d2ba2318090008c0f8`) |

The default (top-level) `wrangler.toml` config used by `wrangler dev` and by
`@cloudflare/vitest-pool-workers` reuses the **preview** database/namespace ids — local dev and
tests never call the remote API for D1/KV (Miniflare simulates them locally), so this is a safe
reuse rather than a redundant third resource.

## Dev/test-only session-issuing route

**Decision**: `POST /api/v1/_dev/session` — creates a tenant+user (if needed) and a session row
directly, returning the session cookie. Registered only when `c.env.ENVIRONMENT !== "production"` (a
plain-text var, not a secret, set per environment in `wrangler.toml`); returns 404 in production
regardless of request contents, rather than checking a header or query param an attacker could
forge.

**Rationale**: FR-009 requires this exist without being reachable in production. Gating on a
build/deploy-time environment var (checked inside the handler, and the route simply isn't registered
at all when the var says production) is stronger than a runtime secret check — there's no secret to
leak or forget to rotate.

**Alternatives considered**: Gate behind a header/token — rejected, that's a permanent backdoor
protected only by a secret staying secret, which is a worse failure mode than "the route doesn't
exist in this build."
