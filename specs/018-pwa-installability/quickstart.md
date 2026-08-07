# Quickstart: PWA Installability & App Shell

`deno task test` covers what's automatable (no server-side change here — everything meaningful is
build-output shape and browser behavior). Installability, standalone-window behavior, and the
service worker's actual caching are only verifiable live in a real browser (same precedent as
specs/015-csp-nonces — no CSP/service-worker engine exists in `vitest`/`workerd`), using a
production-shaped build (`deno task build:preview` or `build:production`), not `deno task dev` (Vite
dev mode has no real build output to precache and no installable manifest served the same way — see
research.md's registration-mechanism reasoning).

Manual walkthrough:

1. `deno task build:preview && wrangler dev --env preview` (or deploy to a real preview URL) —
   installability requires HTTPS or `localhost`, and a real built asset bundle for the service
   worker to precache.
2. Load the app in Chrome/Edge. Confirm the browser's install affordance (address-bar icon or menu
   item) appears.
3. Install it. Confirm it opens in its own standalone window (no browser tabs/address bar), with the
   correct name and icon.
4. Open DevTools → Application → Manifest: confirm every field from contracts/pwa-assets.md is
   present and every icon loads without error. Check Service Workers: confirm `/sw.js` is registered
   and activated.
5. Open DevTools → Application → Cache Storage: confirm the precache contains the built JS/CSS/icon
   files, and does **not** contain `index.html` or any navigation entry.
6. Reload with DevTools' network throttling set to "Offline": confirm the JS/CSS/icons still load
   (from the precache) but the page navigation itself fails to load (expected — spec.md's own
   Assumption: a genuine offline cold start is out of scope).
7. Reload with the network back online: confirm the page loads normally and its
   `Content-Security-Policy` response header carries a fresh nonce (DevTools → Network → the
   document request → Response Headers) — not a value that matches any prior load.
8. Deploy a trivial change, reload the installed app: confirm the new version activates without
   needing to close and reopen the app first (uses the same-tab reload, not a fresh install).
