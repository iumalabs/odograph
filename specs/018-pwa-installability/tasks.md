# Tasks: PWA Installability & App Shell

**Input**: Design documents from `/specs/018-pwa-installability/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/pwa-assets.md, research.md, quickstart.md

**Tests**: No automated `deno task test` coverage — plan.md's Testing section: there is no
server-side behavior here, and installability/service-worker caching/CSP-nonce-freshness are all
browser-only behaviors with no equivalent in `vitest`/`workerd` (same precedent as
specs/015-csp-nonces). Every acceptance criterion is verified live via quickstart.md.

## Phase 1: Setup

- [ ] T001 Add `vite-plugin-pwa` to `deno.json`'s `imports` (`npm:vite-plugin-pwa@^1.3.0`), run
      `deno install` to resolve it and its `workbox-*` sub-dependencies

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T002 [P] Confirm `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, and
      `apple-touch-icon.png` exist and match research.md's "Manifest content and icon set" decision
      (already generated from `public/favicon.svg` via ImageMagick; verify presence and dimensions
      with `identify`, don't regenerate unless missing)
- [ ] T003 [P] Create `public/manifest.webmanifest` per contracts/pwa-assets.md's exact shape
      (`name`/`short_name: "Odograph"`, `start_url`/`scope: "/"`, `display: "standalone"`,
      `background_color`/`theme_color: "#0a0c0f"`, the three icon entries from T002)
- [ ] T004 Extend `index.html`'s `<head>`:
      `<link rel="manifest"
      href="/manifest.webmanifest">`,
      `<link rel="apple-touch-icon"
      href="/icons/apple-touch-icon.png">`, and a
      `<meta name="theme-color" content="#0a0c0f">` tag

**Checkpoint**: The manifest and icons exist and are linked — a browser can already evaluate the
app's installability metadata, though nothing serves a service worker yet.

---

## Phase 3: User Story 1 - An owner installs Odograph as an app (P1) 🎯 MVP

**Goal**: A supporting browser recognizes the app as installable, and installing it opens a
standalone window with the correct name/icon that survives platform icon-cropping.

- [ ] T005 [US1] Create `src/client/sw.ts` (research.md's `injectManifest` strategy): imports
      `precacheAndRoute` from `workbox-precaching`, calls `precacheAndRoute(self.__WB_MANIFEST)`,
      and registers `self.skipWaiting()` on `install` and `clientsClaim()` (from `workbox-core`) on
      `activate` — no `NavigationRoute`, no `setDefaultHandler`, no other fetch handling of any kind
      (research.md's central constraint: the absence of navigation-handling code, not a config flag,
      is what guarantees FR-005)
- [ ] T006 [US1] Extend `vite.config.ts`: add the `VitePWA` plugin from `vite-plugin-pwa` with
      `strategies: "injectManifest"`, `srcDir: "src/client"`, `filename: "sw.ts"`,
      `injectRegister: null` (research.md: manual registration, not plugin-injected),
      `manifest: false` (the manifest is hand-written at `public/manifest.webmanifest` per T003, not
      plugin-generated), and `injectManifest.globPatterns` scoped to the built JS/CSS/icon output
      only
- [ ] T007 [US1] Create `src/client/pwa.ts`: a single exported function that calls
      `navigator.serviceWorker.register("/sw.js")` guarded by `"serviceWorker" in navigator`
      (older/unsupported browsers skip registration entirely rather than throwing — FR-007). Call it
      once from `src/client/main.tsx` on startup
- [ ] T008 [US1] Live-verify (quickstart.md steps 1-4): build with `deno task build:preview`,
      confirm the browser's install affordance appears, install the app, confirm it opens standalone
      with the correct name/icon, and confirm DevTools → Application → Manifest shows every field
      from contracts/pwa-assets.md with no icon load errors

**Checkpoint**: The app is installable and opens correctly (SC-001, SC-002, SC-003) — the MVP for
this feature is complete; the service worker registered in this phase already carries the precaching
logic User Story 2 verifies next (T005/T006's `precacheAndRoute` call is the same mechanism both
stories rely on — installability requires an active service worker to exist at all, and this project
has no reason to ship a deliberately no-op one only to add caching later).

---

## Phase 4: User Story 2 - Repeat visits load reliably on a flaky connection (P2)

**Goal**: Confirm the precaching this feature's implementation already includes (T005) behaves
correctly — assets serve from cache, navigations never do, and an update rolls out on the next
reload.

- [ ] T009 [US2] Live-verify (quickstart.md steps 5-6): confirm DevTools → Application → Cache
      Storage contains the precached JS/CSS/icon files and does **not** contain `index.html` or any
      navigation entry; with network throttling set to "Offline," confirm the JS/CSS/icons still
      load from the precache while the page navigation itself fails (expected — a genuine offline
      cold start is explicitly out of scope per spec.md's Assumptions)
- [ ] T010 [US2] Live-verify (quickstart.md step 7): with the network back online, confirm the page
      loads normally and its `Content-Security-Policy` response header carries a fresh nonce on
      every reload — never a value repeated from a prior load (FR-005/SC-005, the constraint this
      entire feature exists to protect)
- [ ] T011 [US2] Live-verify (quickstart.md step 8): deploy a trivial change (e.g. a comment) to a
      preview environment, reload the already-installed app, and confirm the new service worker
      version activates on that reload without needing to close and reopen the app first (FR-006,
      the `skipWaiting`/`clientsClaim` decision from research.md)

**Checkpoint**: Repeat-load resilience and the CSP-nonce-freshness guarantee are both confirmed live
(SC-004, SC-005) — this feature's central architectural conflict (research.md) is proven resolved,
not just designed.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T012 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T013 Confirm the app still works normally in an ordinary browser tab with no install/service
      worker activity at all (a browser/private-window context where
      `"serviceWorker" in
      navigator` is false, or service workers are disabled) —
      FR-007/SC-006

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: the dependency must be installed before
  `vite.config.ts` can import from it.
- **Phase 2 (Foundational)** → **User Story 1 (Phase 3)**: the manifest and icons must exist and be
  linked before there's anything for a browser to evaluate installability against.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: strict at the verification level — T009
  through T011 verify behavior of the exact service worker T005/T006 already implement; there is no
  separate implementation phase for User Story 2, only its own acceptance verification of work
  already done.
- **Phase 5 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, the icon-verification and manifest-creation tasks touch different files with no
dependency on each other:

```text
T002 [P] verify public/icons/*.png
T003 [P] create public/manifest.webmanifest
```

(T004 depends on both existing, so it's left unmarked and sequenced after.)

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** An installable app with a correctly
functioning (if unverified beyond installability) service worker is independently valuable and
already delivers this feature's primary promise; User Story 2 doesn't add new code — it's the
verification pass confirming the caching and CSP-nonce-freshness guarantees the same implementation
already provides actually hold up live, which is exactly the kind of claim this project's own
precedent (specs/015-csp-nonces) treats as requiring real-browser proof, not optional polish.
