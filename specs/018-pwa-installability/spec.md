# Feature Specification: PWA Installability & App Shell

**Feature Branch**: `020-pwa-installability`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "PWA installability & app shell (issue #18, milestone M7): make
Odograph installable as a Progressive Web App — a web app manifest, app icons, and a minimal service
worker that lets the app open reliably (even on a flaky connection) and shows up as an installable
app on desktop and mobile, per constitution D-002. Scoped to installability and the app shell only —
not the offline write queue (#20) and not camera capture (#19). Must reconcile with the existing
strict per-request CSP (specs/015-csp-nonces): the app's HTML document must never be served from a
cache, since every real request needs a fresh, unpredictable nonce; only the static JS/CSS/icon
asset bundle is safe to precache."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner installs Odograph as an app (Priority: P1)

An owner visiting Odograph in their browser on a phone or laptop can add it to their home screen or
desktop like a native app — it gets its own icon, opens in its own window without browser chrome,
and shows the right name.

**Why this priority**: This is the entire point of the feature — without a manifest and a registered
service worker, no browser offers an install option at all.

**Independent Test**: Visit the app in a installability-capable browser (e.g. Chrome/Edge on desktop
or Android), confirm the browser recognizes it as installable, install it, and confirm it opens as a
standalone app with the correct name and icon.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on a supported browser, **When** the app has finished loading,
   **Then** the browser recognizes the app as installable (its own native install affordance becomes
   available).
2. **Given** an owner installs the app, **When** they open it from their home screen or app launcher
   afterward, **Then** it opens in its own standalone window, not inside a browser tab, with the
   app's name and icon shown correctly.
3. **Given** the installed app's icon, **When** viewed on a platform that crops icons into a
   different shape (e.g. a circle), **Then** the icon's design stays fully visible, not cropped into
   an unrecognizable shape.

---

### User Story 2 - Repeat visits load reliably on a flaky connection (Priority: P2)

An owner who has already loaded the app once gets a fast, reliable repeat load even when their
connection is slow or briefly drops mid-load, because the app's own code and icons don't need to be
re-fetched from scratch every time.

**Why this priority**: Without this, "installable" is a shallow win — an app that's slow or breaks
to open the moment the network is imperfect undermines the whole point of installing it in the first
place. This is explicitly not full offline support (that's #20); it's resilience for the common case
of a real but imperfect connection.

**Independent Test**: Load the app once with a normal connection, then reload it with the network
throttled or briefly interrupted — confirm the app's own code and icons still load without needing
every byte re-fetched, while the page itself still reflects the current, real server response for
each visit (never a stale cached copy of the page pretending to be current).

**Acceptance Scenarios**:

1. **Given** an owner has loaded the app at least once, **When** they reload it on a slow or
   intermittently interrupted connection, **Then** the app's own code and icons load without every
   byte being re-fetched from the network.
2. **Given** any visit to the app, **When** the page itself loads, **Then** it always reflects a
   real, current response from the server for that specific visit — never a previously cached copy
   of the page substituting for the real one.
3. **Given** a genuinely offline visitor with nothing cached yet (a true cold start, no prior
   visit), **When** they try to open the app, **Then** it's acceptable for the app not to load at
   all — this scenario requires the offline write queue (#20) and full offline support, which is out
   of scope here.

### Edge Cases

- An owner who has installed the app receives an update to the app's code (a new deploy) — the next
  time they open the installed app, it must eventually pick up the new version rather than being
  stuck on a stale copy forever.
- The app's install/repeat-load behavior must never let a visitor see or interact with a stale
  version of the security policy that protects every page load (each visit's protections must be as
  strong as if nothing were cached at all).
- A visitor on a browser or platform with no installability support at all must still be able to use
  the app normally in an ordinary browser tab — installability is an enhancement, never a
  requirement to use the app.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The app MUST declare enough metadata (name, icons, how it should open) that a
  supporting browser recognizes it as installable.
- **FR-002**: The app's icon MUST be provided in a form that survives being cropped into a different
  shape by the installing platform, without losing its recognizable design.
- **FR-003**: An installed instance of the app MUST open in its own standalone window, not inside
  ordinary browser tab chrome.
- **FR-004**: The app's own code and icon assets MUST be able to load from a local cache on a repeat
  visit, without needing every byte re-fetched over the network each time.
- **FR-005**: The actual page content and its security protections MUST always come from a live,
  current server response for every visit — never a cached copy of the page standing in for a real
  one, even when the app's own code and icons are served from cache.
- **FR-006**: An installed app MUST be able to receive and eventually reflect an update to the app's
  code after a new version is published, without requiring the owner to uninstall and reinstall it.
- **FR-007**: The app MUST remain fully usable in an ordinary browser tab on a browser or platform
  that doesn't support installing it at all.

### Key Entities

No new data entities — this feature adds static, build-time app metadata (manifest, icons) and a
client-side caching mechanism; nothing new is stored server-side.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A supporting browser offers to install the app within one normal page load, with no
  manual configuration by the visitor.
- **SC-002**: 100% of installed-app launches open in a standalone window with the correct name and
  icon, not browser tab chrome.
- **SC-003**: The app's icon remains fully recognizable under every icon-cropping shape a supporting
  platform applies (square, rounded-square, circle).
- **SC-004**: On a repeat visit with a throttled or briefly interrupted connection, the app's own
  code and icons load from cache rather than stalling on a full re-fetch, while the page itself
  still reflects a live, current server response and full security protections for that visit.
- **SC-005**: 100% of visits — installed or not, cached assets or not — carry the same from-scratch,
  unpredictable security protections as a visit with nothing cached at all.
- **SC-006**: The app works normally in an ordinary browser tab on a platform with no installability
  support, with zero functional loss beyond the absence of the install affordance itself.

## Assumptions

- **Scope boundary with #19/#20**: this feature is installability and repeat-load resilience for the
  app's own code and icons only. It does not attempt full offline usability (a genuinely offline
  cold start with nothing cached is explicitly acceptable to fail) and does not touch camera capture
  — those are separate, later features that build on the foundation this one lays.
- **The app's page content is never cached**: because every page load carries a fresh, single-use
  security nonce (specs/015-csp-nonces) that a cached copy would make stale and predictable, this
  feature's caching applies only to the app's own code and icon files, never to the page itself.
  This is a deliberate, permanent constraint of this app's security design, not a temporary
  limitation to be lifted later.
- **No custom "Install" button**: this feature relies on each supporting browser's own native
  install affordance (address-bar icon, browser menu item, or automatic install banner) rather than
  building a custom in-app prompt — a reasonable default for this project's scale, and revisitable
  later if real usage shows visitors aren't discovering the native affordance.
- **Visual identity**: the app's icon and color scheme come from the existing approved brand mark
  and design tokens already in the codebase — this feature does not invent any new visual identity.
