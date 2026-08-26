# Phase 0 Research: Client-Side Routing

## Decision 1: Hand-rolled router (History API), not a routing library

**Decision**: `src/client/router.ts` — a `parseRoute()`/`navigate()`/`useRoute()` module built
directly on `history.pushState`/`replaceState` and the `popstate` event, plus a custom
`odograph:navigate` event (since `pushState`/`replaceState` themselves fire no event, only
back/forward's `popstate` does).

**Rationale**: The app's routing need is a flat set of ~13 known paths (`/`, `/app`, and 11
`/app/<screen>` siblings) with no nested layouts, no dynamic URL parameters, and no per-route
data-loading integration — every screen already fetches its own data independently of routing. A
library (React Router, TanStack Router, wouter, etc.) earns its dependency weight on route
matching, nested layouts, loaders, and code-splitting integration this app doesn't need for such a
small, flat route table. This matches the project's existing pattern of adding a dependency only
when the platform API genuinely doesn't cover the need (contrast: `idb`, `pdf-lib`, and
`web-push-browser` each wrap a real capability gap the platform doesn't expose directly; a flat
path-to-view switch has no such gap — `history.pushState` and `popstate` are exactly the primitives
a router would use internally anyway).

**Alternatives considered**:
- A small routing library (e.g. `wouter`, ~1.5 kB) — rejected: still a new dependency, new
  `deno.json` entry, and a new API surface to learn for a problem this small that a ~40-line
  module solves directly, with less indirection to reason about when the route table changes.
- `react-router` — rejected outright: far more capability (data routers, nested layouts, loaders)
  than this app's flat 13-path table needs; a much larger dependency for the same outcome.

## Decision 2: A separate `authChecked` flag, not `identity !== null` alone, gates the redirect

**Decision**: `App.tsx` gains `const [authChecked, setAuthChecked] = useState(false)`, set `true`
in both the success and failure branches of the existing `getCurrentIdentity()` effect. The
auth-guard redirect effect (`/` ↔ `/app`) only runs once `authChecked` is true.

**Rationale**: `identity === null` today means either of two different things — "the initial
session check hasn't resolved yet" or "confirmed, there is no session" — and the app has never
needed to tell them apart before (both currently render the same `LandingPage`). A redirect guard
does need to tell them apart: without `authChecked`, a bookmarked `/app/dashboard` link for an
already-authenticated visitor would redirect to `/` immediately on mount (since `identity` starts
null) and then bounce back to `/app/dashboard` a moment later once the session check resolves — a
visible flash the spec's Edge Cases section explicitly rules out (FR-004).

**Alternatives considered**:
- Delay rendering entirely until the session check resolves (a top-level loading spinner) —
  rejected: bigger behavior change than this feature calls for, and removes the existing (accepted)
  brief-landing-page-flash behavior for the `/` case, which isn't broken and isn't in scope to fix.

## Decision 3: No server-side routing change beyond the two redirect targets

**Decision**: Confirmed via `wrangler.toml`'s `[assets]` block — `not_found_handling =
"single-page-application"` and `run_worker_first = true` are already in place. Every non-`/api/`
request already reaches `src/server/index.ts`'s `handler.fetch`, which calls
`env.ASSETS.fetch(request)` — Cloudflare's asset layer serves `index.html` for any path that
doesn't match a real built asset, exactly what a hard reload on `/app/dashboard` needs, with no
change required. The CSP-nonce-attaching logic already wraps every HTML response this way
(specs/015-csp-nonces), so `/app/*` paths inherit it automatically too.

**Rationale**: This was the one open risk worth verifying before committing to client-only scope —
if the asset layer only served `index.html` at `/`, every deep `/app/*` URL would 404 on a hard
reload, breaking FR-006 outright. Reading the actual config and the existing `fetch` handler
confirms the fallback already covers arbitrary paths, not just `/`.

**Alternatives considered**: None — this was a verification step, not a design choice with real
alternatives.

## Decision 4: `help`/`account` stay under `/app/*`, not promoted to public routes

**Decision**: Matches the issue's own proposed route table verbatim — `help` and `account` are
listed as `/app/*` screens, not standalone public paths. The landing page's existing (specs/057)
inline "Documentation" toggle is untouched.

**Rationale**: Scope discipline — the issue's concern is the landing-vs-shell split and per-screen
URLs for the *authenticated* app; it does not ask for a second, publicly-routable documentation
URL. Introducing one would be a real (if small) scope expansion beyond what's asked, and the
existing inline-toggle UX (spec 057) already satisfies "reachable without a session" for that one
screen without needing its own URL.
