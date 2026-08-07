# Implementation Plan: PWA Installability & App Shell

**Branch**: `020-pwa-installability` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-pwa-installability/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the
execution workflow.

## Summary

Makes Odograph installable: a web app manifest, an icon set rasterized from the existing approved
brand mark, and a service worker (via `vite-plugin-pwa`'s `injectManifest` strategy) that precaches
only the built JS/CSS/icon bundle. The service worker deliberately has no navigation route or
fallback of any kind — every page load reaches the Worker over the network unconditionally, so it
always gets the fresh, single-use CSP nonce spec 015 depends on. This is the central conflict this
feature exists to resolve: a typical PWA setup precaches and serves the HTML shell from cache, which
is fundamentally incompatible with per-request CSP nonces; this feature gets the installability and
repeat-load-resilience benefits without that trade-off, at the cost of a genuinely offline cold
start not working (explicitly acceptable per spec.md).

## Technical Context

**Language/Version**: TypeScript (Vite-built React 19 SPA client) — same as the existing client. No
server-side (Hono/Workers) code changes beyond `index.html`'s `<head>` additions and confirming
existing static-asset serving already covers the new files (it does — `env.ASSETS.fetch` serves
anything under `dist/client` unmodified for non-`text/html` content types).

**Primary Dependencies**: New — `vite-plugin-pwa@^1.3.0` and its `workbox-*` family (`workbox-core`,
`workbox-precaching`, pinned to the `^7.4.1` line `vite-plugin-pwa` itself depends on).

**Storage**: None server-side. Client-side: the browser's own Cache Storage API, managed entirely by
the service worker/Workbox — no new application-level persistence.

**Testing**: No new `deno task test` coverage — there is no server-side behavior to test, and
installability/service-worker caching/CSP-nonce-freshness are all browser-only behaviors with no
equivalent in `vitest`/`workerd` (same precedent as specs/015-csp-nonces). Verified live via
`deno task build:preview` + a real browser, per quickstart.md.

**Target Platform**: Every browser visiting the Vite-built, Workers-served client — installability
itself only manifests in browsers that support it (Chrome/Edge/Android; Safari/iOS has partial,
different support), but the underlying manifest/service-worker files are harmless, ignored assets on
any browser that doesn't (FR-007).

**Performance Goals**: Repeat page loads fetch JS/CSS/icons from the local cache instead of the
network when available (SC-004) — no measurable target beyond "doesn't require every byte
re-fetched," since this app's total asset size is small enough that the qualitative win (resilience
on a flaky connection) matters more than a specific millisecond target.

**Constraints**: The service worker MUST NOT intercept, cache, or serve navigation requests under
any circumstance (FR-005) — this is the one hard constraint the rest of the design exists to
protect, enforced by the `injectManifest` strategy's own file simply containing no code capable of
doing so (research.md).

**Scale/Scope**: 1 new dependency (+ its Workbox sub-dependencies), 1 new service worker source
file, 1 new client bootstrap module (registration), 1 new manifest file, 4 already-generated icon
files, `index.html` additions (manifest link, apple-touch-icon link), `vite.config.ts` plugin
wiring, `deno.json` dependency declaration.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Tenant Isolation via Repository Layer** — N/A, no data access at all.
- **II. Server-Computed, Division-Safe Aggregates** — N/A.
- **III. Idempotent, Ordered Offline Sync** — N/A to _this_ feature specifically (no write queue
  exists yet — that's #20); this feature explicitly lays the service-worker foundation #20 will
  build on, without itself making any offline-write claim.
- **IV. No Interpolated Data** — N/A, no data of any kind involved.
- **V. Private Object Storage with Validated Uploads** — N/A, no uploads.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — this feature's entire design exists to
  protect, not weaken, the CSP guarantee spec 015 already established (research.md's central
  conflict resolution) — verified live per quickstart.md step 7.
- **VIII. GDPR Erasure by Design** — N/A, no new stored data of any kind (browser Cache Storage
  holds copies of public, static build artifacts — nothing personal, nothing to erase).
- **IX. Separated Language and Locale Axes; i18n from Screen One** — the manifest's `name`/
  `short_name`/`description` are static, single-locale metadata read by the OS install UI, not
  in-app UI text routed through `t()` — consistent with how `<title>` in `index.html` is already
  handled (also static, also outside the `t()` system) for the same reason: it's metadata the
  browser/OS reads before the app (and its i18n system) ever runs.
- **X. Toolchain Discipline** — the new dependency is declared as an `npm:` specifier in
  `deno.json`, resolved via `deno install`, same as every existing dependency; no Deno runtime API
  is used inside the service worker itself (it runs in the browser, not `workerd` — a distinct
  constraint from the Worker-code rule this principle is actually about, but worth confirming
  explicitly: the service worker's own code has zero Deno-specific imports of any kind).
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change; the new files build
  as part of the existing `vite build`/`build:preview`/`build:production` tasks already wired into
  every deploy workflow.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/018-pwa-installability/
├── plan.md                    # This file (/speckit-plan command output)
├── research.md                # Phase 0 output (/speckit-plan command)
├── data-model.md               # Phase 1 output (/speckit-plan command)
├── contracts/pwa-assets.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md               # Phase 1 output (/speckit-plan command)
└── tasks.md                    # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
public/
├── manifest.webmanifest        # new: contracts/pwa-assets.md's exact shape
└── icons/
    ├── icon-192.png             # already generated (rasterized from favicon.svg)
    ├── icon-512.png              # already generated
    ├── icon-512-maskable.png      # already generated (full-bleed, no corner rounding)
    └── apple-touch-icon.png        # already generated (180x180, flattened onto dark bg)

src/client/
├── sw.ts                       # new: the injectManifest service worker source
│                                 #  (precacheAndRoute only — research.md)
├── pwa.ts                      # new: navigator.serviceWorker.register("/sw.js") call
└── main.tsx                     # extended: calls pwa.ts's registration on startup

index.html                      # extended: <link rel="manifest">,
                                  #  <link rel="apple-touch-icon">, theme-color <meta>

vite.config.ts                  # extended: VitePWA plugin, strategies: "injectManifest",
                                  #  srcDir/filename pointing at src/client/sw.ts,
                                  #  injectRegister: null (manual registration — research.md)

deno.json                       # extended: vite-plugin-pwa npm: specifier
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories.
Everything this feature adds lives inside `public/` (static assets) and `src/client/` (the existing
client tree), following the same layout every prior client feature already uses.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
