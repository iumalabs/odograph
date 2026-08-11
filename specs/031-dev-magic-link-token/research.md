# Research: Dev-Only Magic-Link Token Retrieval Endpoint

## Decision: Reuse and export `notFoundOutsideDev` rather than duplicate it

**Rationale**: `src/server/auth/dev-session.ts` already implements exactly the production-inertness
guarantee this feature needs — a middleware checked first, before any other middleware or work,
returning `c.notFound()` when `c.env.ENVIRONMENT === "production"`. It is currently module-private
(not exported). Duplicating this logic in a second file would create two independent places that
must both stay correct for "dev-only routes are truly inert in production" to hold — a single
export-and-reuse keeps that guarantee centralized in one place, matching this project's general
preference for one source of truth over parallel copies.

**Alternatives considered**: Writing a second, identical middleware in the new route file —
rejected; it's the same three lines of logic, but security-relevant inertness logic is exactly the
kind of code where "two copies that must both stay correct" is worse than one shared export, even
for something this small.

## Decision: New route lives in its own small file (`dev-magic-link.ts`), not inside `dev-session.ts`

**Rationale**: `dev-session.ts`'s own doc comment frames its routes as "Dev/test-only
session-issuing routes... Stand in for real login... until one of those exists" — a substitute for
real auth. This feature's route is a different kind of thing: a read-only test hook that sits
*alongside* the real magic-link flow (which already fully exists), not a substitute for it. Keeping
it in a separate, purpose-named file makes that distinction clear at a glance, while still living
in the same `src/server/auth/` directory as its closest sibling.

**Alternatives considered**: Adding the route directly onto the existing `magicLinkAuth` Hono app
in `src/server/routes/v1/auth/magic-link.ts` — rejected; that file's routes are all real,
production-live auth endpoints (`/request`, `/link`, `/verify`), and mixing a dev-only route into
that same Hono sub-app increases the risk of the dev-only gate being forgotten or misapplied on a
future edit to that file. A separate file with a separate mount point keeps the "dev-only" concern
structurally impossible to miss.

## Decision: Mount at `/api/v1/_dev/magic-link-token`, sibling to `/api/v1/_dev/session`

**Rationale**: The `_dev` path prefix is this project's own established convention for the
dev/test-only surface (`devSession` is mounted at `/api/v1/_dev/session`) — reusing that prefix for
a second dev-only route keeps all such routes discoverable under one namespace, rather than
introducing a new naming convention for what is conceptually the same category of thing.

**Alternatives considered**: Nesting it under `/api/v1/_dev/session/magic-link-token` — rejected;
a magic-link token has nothing to do with a session, and nesting it there would imply a
relationship that doesn't exist.

## Decision: Query-parameter `email`, GET method, matching `findMagicLinkTokenByEmail`'s own key

**Rationale**: The repository function this route wraps is already keyed by `email` — using the
same parameter name and a `GET` (this is a pure read, no side effect) keeps the HTTP surface a
direct, unsurprising reflection of the function it wraps.

**Alternatives considered**: A path parameter (`/api/v1/_dev/magic-link-token/:email`) — rejected;
email addresses containing `/`-adjacent characters or requiring encoding are handled more simply as
a query parameter (matching how `search.ts`'s `q` parameter and other query-keyed routes in this
codebase already work) than as a path segment.
