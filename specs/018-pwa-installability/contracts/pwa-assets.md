# Phase 1 Contracts: PWA Assets

## `GET /manifest.webmanifest`

Served as a static asset (`content-type: application/manifest+json`), linked from `index.html` via
`<link rel="manifest" href="/manifest.webmanifest">`. Not `text/html`, so `src/server/index.ts`'s
CSP-injection branch (which only touches `text/html` responses) never modifies it — it passes
through unmodified regardless of environment.

```json
{
  "name": "Odograph",
  "short_name": "Odograph",
  "description": "Vehicle maintenance tracker",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0a0c0f",
  "theme_color": "#0a0c0f",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

## `GET /sw.js`

The service worker script, built by `vite-plugin-pwa`'s `injectManifest` strategy from
`src/client/sw.ts`. Same-origin, served as `application/javascript`. Registered via
`navigator.serviceWorker.register("/sw.js")` from `src/client/pwa.ts`.

**Caching contract**:

- Precaches every built JS/CSS/icon asset (content-hashed filenames) via
  `precacheAndRoute(self.__WB_MANIFEST)` — cache-first for these URLs specifically, matched by exact
  hashed path.
- Registers no route, fallback, or fetch handler for navigation requests (`index.html` or any other
  page URL) — every navigation reaches the network unconditionally, every time, with no exception.
  `/manifest.webmanifest` itself is also never precached (not a build-output asset in the Vite
  sense) — it's small, static, and safe to just always fetch fresh, same as any other non-navigation
  static file this service worker doesn't touch.
- Calls `self.skipWaiting()` on install and `clientsClaim()` on activate — a newly deployed version
  takes over on the very next reload, not after every open tab of the previous version closes.

## `apple-touch-icon.png`

Linked via `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` in `index.html`'s
`<head>` — not part of the manifest (iOS Safari ignores the manifest for its home-screen icon).
