# Phase 0 Research: PWA Installability & App Shell

No `NEEDS CLARIFICATION` markers remain in the Technical Context. The decisions below cover the
central architectural conflict this feature has to resolve (per-request CSP nonces vs. a cached app
shell), the tooling choice that makes that resolution mechanically enforceable rather than
hand-maintained, the icon/manifest content, and the update lifecycle.

## The core conflict: precache static assets, never precache or serve the HTML document

**Decision**: The service worker precaches only the built JS/CSS bundle and icon files
(content-hashed, immutable per build). It never precaches `index.html`, never registers a navigation
route/fallback, and has no fetch handler for navigation requests at all — every page load reaches
the Worker over the network unconditionally, exactly as it does today.

**Rationale**: `src/server/index.ts`'s exported `fetch` handler attaches a fresh,
`crypto.getRandomValues`-derived CSP nonce to every HTML response (specs/015-csp-nonces). A cached
HTML response would carry a stale, already-used nonce baked into it — reusing a nonce defeats its
entire purpose (an attacker who ever saw one use could reuse it), and any `<script>`/`<style>` tag
in that cached document would in any case be checked against the _live_ `Content-Security-Policy`
response header the browser applies to that navigation, not a header value baked into the cached
body — a mismatch that would simply break the page, since a service worker's `respondWith()` can
only substitute a response body/headers for what it returns, and Workbox's precache entries are
plain `Response` objects captured once at cache time, headers included. There is no way to make a
precached HTML response carry a fresh nonce on each serve; the only correct fix is to never precache
or serve it from cache at all. Static asset files carry no nonce and are already
content-hashed-immutable by Vite's own build output, so caching them has none of this problem.

**Alternatives considered**:

- **Precache the HTML shell with `vite-plugin-pwa`'s default `generateSW`/`navigateFallback`
  behavior**: rejected outright — this is the exact conflict above, not a workable variant of it.
- **Strip the nonce requirement from the CSP for cached responses only**: rejected — there's no
  mechanism to distinguish "this HTML came from the service worker's cache" from "this HTML came
  fresh from the Worker" at the point the browser evaluates CSP; weakening the policy to accommodate
  caching would weaken it for every request, undermining spec 015 entirely.
- **Cache the HTML but strip/re-issue the nonce inside the service worker before serving it**:
  rejected — the CSP header itself is a separate HTTP header the service worker would also have to
  rewrite in lockstep with rewriting the body, effectively re-implementing what the Worker already
  does correctly on every real request; simpler and more correct to just let the request reach the
  Worker.

## Tooling: `vite-plugin-pwa` with the `injectManifest` strategy, not `generateSW`

**Decision**: Add `vite-plugin-pwa` (`npm:vite-plugin-pwa@^1.3.0`, using `workbox-precaching` from
the `workbox-window`/`workbox-*` family at `^7.4.1`) configured with `strategies: "injectManifest"`
and a hand-written service worker source file (`src/client/sw.ts`) that calls
`precacheAndRoute(self.__WB_MANIFEST)` and nothing else — no `NavigationRoute`, no
`setDefaultHandler`, no runtime caching rules beyond the precache itself.

**Rationale**: `injectManifest` hands full control of the service worker's actual logic to
hand-written code — the plugin's only job is to inject the precache manifest (the list of built
asset URLs + content hashes) into `self.__WB_MANIFEST` at build time and handle cache
versioning/cleanup between deploys. This is the only strategy that makes "never precache or serve
navigation requests" a matter of _what code isn't there_ rather than a config flag to configure
correctly and hope isn't silently defaulted back on by a future dependency upgrade. `generateSW`
(the plugin's other, more automatic strategy) generates the entire service worker from a declarative
config including a `navigateFallback` option that exists specifically to serve a cached shell for
navigations — exactly the behavior this feature must not have; using it and just leaving that option
unset relies on nobody ever setting it, `injectManifest` makes the safe behavior the only behavior
the file's own code can produce.

**Alternatives considered**:

- **`generateSW`**: rejected per above — the safety property this feature needs (navigations never
  intercepted) has to come from the absence of specific hand-written code, which `generateSW`
  doesn't offer control over.
- **A fully hand-rolled service worker with no Workbox dependency at all**: rejected — correctly
  computing and maintaining the precache manifest (which built files exist, their content hashes,
  cleaning up stale cache entries between deploys) by hand is exactly the kind of bookkeeping
  Workbox's `precacheAndRoute` already solves correctly; reinventing it adds real bug surface (a
  missed cache-invalidation edge case silently serving stale JS) for no benefit once the one
  behavior that actually matters here (no navigation caching) is already guaranteed by not writing
  that code, not by which library provides the rest.

## Update lifecycle: `skipWaiting` + `clientsClaim`, always take the newest version

**Decision**: The service worker calls `self.skipWaiting()` in its `install` handler and
`clientsClaim()` (from `workbox-core`) in its `activate` handler — a newly deployed service worker
takes over immediately rather than waiting for every open tab of the old version to close first.

**Rationale**: The default service worker lifecycle (a new version stays "waiting" until no client
still holds the old one) exists to protect apps with fragile in-flight client state across a version
boundary; this app has no such state to protect (it's a thin REST client with no client-side offline
queue yet — that's #20's concern, and it will need its own reasoning about version transitions once
it exists). Taking the newest version immediately means FR-006 ("an installed app eventually
reflects an update") happens on the very next reload rather than depending on the owner closing
every tab first, which is the more common, expected behavior for a project this size and avoids the
classic "why isn't my update showing up" complaint.

**Alternatives considered**:

- **Default lifecycle (wait for all clients to close)**: rejected — no in-flight state exists yet to
  protect, so the only effect is unnecessarily delaying updates for no benefit.

## Manifest content and icon set

**Decision**: `public/manifest.webmanifest` declares `name`/`short_name: "Odograph"`,
`start_url: "/"`, `scope: "/"`, `display: "standalone"`, and
`background_color`/`theme_color:
"#0a0c0f"` (the dark theme's `--bg`, matching the existing
`public/favicon.svg`'s own color choices). Icons: `icon-192.png`/`icon-512.png` (purpose `"any"`)
and `icon-512-maskable.png` (purpose `"maskable"`, full-bleed background with no corner rounding
baked in, so an OS-applied circular/rounded-square mask can't crop into the glyph) — all three
rasterized directly from the approved `public/favicon.svg` gauge-mark logo (also embedded inline in
`src/client/components/Logo.tsx`) via ImageMagick, not redrawn. `apple-touch-icon.png` (180x180,
flattened onto the same dark background since iOS ignores alpha) is linked separately via
`<link rel="apple-touch-icon">` in `index.html`'s `<head>`, since iOS Safari doesn't read the
manifest for its home-screen icon at all.

**Rationale**: Every color and the icon's design come directly from files already in the repository
— spec.md's own Assumption is that this feature invents no new visual identity. The app supports
both a dark and light theme at runtime (`src/client/design/tokens.css`), but a manifest's
`background_color`/`theme_color` are static values fixed at install time, not something a runtime
toggle can update — the dark theme is the app's primary, default presented identity (it's what
`favicon.svg` itself already commits to), so it's the reasonable static choice.

**Alternatives considered**:

- **Redrawing/regenerating the icon design from scratch**: rejected — spec.md is explicit that no
  new visual identity should be invented; the approved mark already exists and rasterizing it
  directly guarantees pixel-for-pixel consistency with `Logo.tsx`'s in-app rendering.
- **Using the light theme's colors for the manifest**: rejected — arbitrary given both themes are
  equally "real"; the dark theme is what the existing favicon already committed to, so following
  that precedent is more consistent than picking a fresh default.

## Service worker registration: manual, from a same-origin external module — no CSP changes needed

**Decision**: The service worker is registered with a small, explicit
`navigator.serviceWorker.register("/sw.js")` call inside a new `src/client/pwa.ts` module, called
once from `main.tsx` — not auto-injected by `vite-plugin-pwa`'s own HTML-transform registration
script (`injectRegister` is set to `null`/disabled).

**Rationale**: `index.html`'s existing entry script
(`<script type="module"
src="/src/client/main.tsx">`) already has no `nonce` attribute and works
under the current CSP without one, because it's an _external_ same-origin script (`src="..."`, not
an inline `<script>...</script>` body) — CSP's nonce requirement only governs inline script content;
`script-src 'self' 'nonce-X'` already permits any same-origin external script regardless of nonce.
The same reasoning applies to `worker-src` (governing where a Service Worker's script may be fetched
from), which falls back to `script-src` when unset in this app's policy (no `worker-src`/
`child-src` directive exists) — a same-origin `/sw.js` is covered by the existing `'self'` term with
zero CSP changes required. Registering manually from `main.tsx` (rather than trusting the plugin's
own injected registration snippet) keeps the actual registration code visible and consistent with
this codebase's preference for explicit code over generated magic, and this specific CSP interaction
is exactly the kind of claim that must still be confirmed live in a real browser before shipping
(vitest/`workerd` has no CSP engine — specs/015-csp-nonces's own precedent).

**Alternatives considered**:

- **Let `vite-plugin-pwa` auto-inject its own registration `<script>` into `index.html`**: rejected
  — no functional difference once the CSP reasoning above holds, but hand-writing the registration
  call keeps it visible in source rather than generated into the built HTML, and avoids depending on
  the plugin's injected script tag also correctly avoiding CSP issues (which it likely would, but
  there's no reason to rely on an assumption about generated code when writing the one line by hand
  is just as easy and fully auditable).
