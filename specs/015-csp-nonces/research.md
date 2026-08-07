# Phase 0 Research: Strict CSP with Per-Request Nonces

No `NEEDS CLARIFICATION` markers remain in the Technical Context. The decisions below resolve the
one genuinely open technical question this feature has: how to attach a per-request response header
to requests that, today, never reach the Worker at all.

## Reaching every response: `run_worker_first = true`, not a path-scoped subset

**Decision**: Set `assets.run_worker_first = true` (not a path array) on every environment in
`wrangler.toml`, and add `assets.binding = "ASSETS"` so the Worker can fetch the built asset itself
via `env.ASSETS.fetch(request)`.

**Rationale**: Today, any request matching a file under `dist/client` (the built `index.html`,
hashed JS/CSS bundles, fonts, the favicon) is served directly by Cloudflare's static-asset layer and
never invokes the Worker's `fetch` export at all — confirmed by inspecting `src/server/
index.ts`,
whose Hono `app` only ever registers `/api/v1/*` routes today. FR-008 requires the policy on _every_
page load, with no excluded page or flow. A path-scoped `run_worker_first` (e.g. limited to `"/"`)
would cover this app's current entry point (it has no client-side routing — confirmed, no
`react-router` dependency, view switching is in-memory React state, spec 014), but would leave
Cloudflare's SPA-fallback path (`not_found_handling = "single-page-application"`) serving
`index.html` for any _other_, non-matching URL without ever reaching the Worker — a real coverage
gap against FR-008's "no page this protection excludes." Routing every request through the Worker
first closes that gap unconditionally, regardless of what URL a visitor lands on.

**Alternatives considered**:

- **Path-scoped `run_worker_first: ["/"]`**: rejected — technically sufficient for this app's
  _current_ routing reality, but silently reintroduces the exact gap FR-008 exists to prevent the
  moment any future path (a deep link, a future client-side route) gets requested and falls through
  to the unprotected SPA fallback. `true` costs one extra `fetch()` hop per static asset request in
  exchange for a guarantee that doesn't erode as the app grows.
- **Cloudflare `_headers` file** (a static, declarative way to attach response headers to asset
  responses, no Worker involvement): rejected outright — it can't express a value that's different
  on every single request, which is the entire point of a nonce.

## Where the CSP header gets attached: content-type-gated, not per-route

**Decision**: In the exported `fetch` handler, the request URL's path is checked _before_ calling
Hono: `/api/*` goes to `app.fetch` exactly as today (including its own legitimate 404s — never
routed to ASSETS regardless of status code), everything else is forwarded to
`env.ASSETS.fetch(request)`. The response's own `Content-Type` is inspected, and the CSP header
(built from a freshly generated nonce) is attached only when it starts with `text/html`. Every other
content type (JS, CSS, fonts, the SVG favicon) passes through completely unmodified. Branching on
Hono's response status instead of the path would be a bug: a legitimate API 404 (e.g.
`GET /api/v1/vehicles/<missing-id>`) would incorrectly fall through to `ASSETS.fetch`, which —
combined with `not_found_handling = "single-page-application"` — would silently return `index.html`
instead of the real JSON 404.

**Rationale**: CSP is a document-level policy — browsers only evaluate/enforce it from the response
that delivered the HTML document itself, never from a `<script src>`'s own response. Setting it on
every asset response would be harmless but pointless overhead; gating on content-type keeps the
"extra work" limited to the one response type where the header actually does anything, while still
satisfying `run_worker_first: true`'s uniform-coverage guarantee for the response that matters.

**Alternatives considered**:

- **Rewrite/inject a nonce attribute into the HTML body**: rejected for this feature specifically —
  confirmed by inspecting the current production build (`deno task build` →
  `dist/client/
  index.html`), there is no inline `<script>` or `<style>` tag anywhere in the
  output today, only external `<script src>`/`<link href>` references governed by `'self'`, not by a
  nonce at all. Rewriting the HTML body to inject an unused `nonce=""` attribute would add real
  complexity (parsing/streaming HTML, or a string-replace with its own fragility) for zero present
  benefit. The header-only approach already satisfies the Edge Cases requirement that a future
  inline-script feature can reuse this request's nonce value without a redesign — that future
  feature would read the same request-scoped nonce this module already generates and stamp it onto
  whatever inline tag it adds, at the point it's actually needed, not preemptively today.

## Nonce generation

**Decision**: `crypto.getRandomValues(new Uint8Array(16))`, base64-encoded — the conventional CSP
nonce shape (a base64 string of ≥128 bits of randomness), generated fresh inside the request handler
on every invocation, never cached, never derived from anything request-independent (not the session,
not the tenant, not a counter).

**Rationale**: `crypto.getRandomValues` is the standard Web Crypto API already available in
`workerd` and already relied on elsewhere in this codebase's ID/token generation — no new
dependency. 128 bits of entropy, freshly drawn per request, satisfies FR-003's "unpredictable and
unique per request, never reused, never derivable in advance" directly: there is no way to derive
request N's nonce from request N-1's.

**Alternatives considered**:

- **`crypto.randomUUID()`**: rejected as the primary mechanism — while also cryptographically
  random, a UUID's hyphenated, fixed-structure string format is not the conventional CSP nonce shape
  (base64) and carries no encoding benefit here; `getRandomValues` + base64 is what the CSP
  specification's own examples use.

## Policy shape for images, fonts, and the default fallback

**Decision**: `img-src 'self'`, `font-src 'self'` (the app self-hosts its web fonts via
`@fontsource/onest`/`@fontsource/jetbrains-mono`, imported in `src/client/design/base.css` and
bundled into the build output as same-origin `.woff2`/`.woff` files — no external font CDN),
`default-src 'self'` as the fallback for every directive not explicitly named, `object-src 'none'`
(this app embeds no plugins/objects, reasonable extra hardening per spec.md's Assumptions),
`base-uri 'self'` and `frame-ancestors 'self'` (standard defense-in-depth additions with no
functional cost to this app, also covered by spec.md's "additional hardening directives"
Assumption).

**Rationale**: Verified directly against what the app actually loads, not guessed. Every icon this
app renders (`src/client/design/icons.tsx`) is an inline `<svg>` React component — regular DOM
markup, not an `<img>` or `background-image` resource load, so it isn't governed by `img-src` at all
and needs no special allowance. The one real image resource is the favicon
(`<link rel="icon" href="/favicon.svg">`, a same-origin file), already covered by `'self'` alone. An
earlier draft of this document assumed the app used data-URI icons needing `img-src 'self'
data:` —
a data: URI observed during manual browser testing turned out to be the browser's own native
`<select>` element chrome, not anything this app's code emits, and a repo-wide grep for
`data:image`/`background-image` across `src/client/` confirmed there is none. Corrected to the
narrower `img-src 'self'` with no `data:` exception, since nothing in this app actually needs it.

**Alternatives considered**: none — these are the minimum permissive values needed for the app's
confirmed current behavior, not a design choice with real alternatives.

## Skipping the policy in the local development environment

**Decision**: The exported `fetch` handler skips CSP entirely when
`env.ENVIRONMENT ===
"development"` — the request still reaches `env.ASSETS` (or Vite's dev server,
in practice) and returns exactly as it would without this feature; no header is attached.

**Rationale**: Discovered empirically during implementation, not anticipated in the original design:
`deno task dev` serves the app through Vite's dev server, which injects its own inline
`<script type="module">` for the React Fast Refresh preamble — un-nonced, since Vite has no
knowledge of this feature's per-request nonce. Live-testing the strict policy against
`deno task dev` confirmed the browser correctly blocks that inline script exactly as designed
(proving the mechanism works) — but blocking it also means `window.$RefreshReg$`/`$RefreshSig$`
never get installed, and the React app never mounts. `deno task dev`'s `ENVIRONMENT=development` is
never reached by a real visitor — only `preview` and `production` are, and both of those always
serve the pre-built `dist/client` output directly (no Vite dev server, no inline scripts, confirmed
in the very first research pass above). Excluding exactly the one environment that both (a) is never
internet-facing and (b) is the only one with an inline-script conflict is the narrowest possible
carve-out — it doesn't touch the guarantee for anything a real visitor can ever load.

**Alternatives considered**:

- **Nonce-tag Vite's injected preamble**: rejected — would require patching or configuring Vite's
  React plugin internals to know about this feature's per-request nonce, real complexity for a
  script that only ever runs in an environment nothing this feature protects reaches anyway.
- **Add `'unsafe-inline'` alongside the nonce for script-src**: rejected outright — per the CSP
  specification, browsers that understand nonces ignore `'unsafe-inline'` when a nonce is also
  present, so this wouldn't even fix the dev-mode breakage, while also being exactly the exception
  FR-001 forbids.
- **Ship it broken in dev and tell contributors to work around it**: rejected — breaking every
  future contributor's local iteration loop for a header that protects nothing in that same
  environment is a real, avoidable cost for zero corresponding security benefit.
