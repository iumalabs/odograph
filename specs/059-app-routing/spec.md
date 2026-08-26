# Feature Specification: Client-Side Routing (`/app` shell, stable landing URL)

**Feature Branch**: `059-app-routing`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Separate the app behind /app — landing page and authed shell currently share one route with no router. Introduce real client-side routing and move the authenticated app shell behind /app (e.g. /app, /app/dashboard, /app/fuel, etc.), while the public landing page owns / itself: / is always the public landing page regardless of session state (redirect an already-authenticated visitor into /app); /app/* is the authenticated shell and all its screens, gated on a valid session; sign-in/magic-link/OIDC callback routes get their own real paths too, rather than being modeled purely as component state. Tracked as GitHub issue #250 on iumalabs/odograph."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - `/` is always the public landing page, `/app` is always the authenticated shell (Priority: P1)

Today, `App.tsx` decides what to show purely from in-memory state (`identity`, `view`) under the single path `/`. A QA tester (or anyone) can't open the public landing page in a browser tab that already has a valid session without destructively clearing cookies — there's no stable URL for it. This story gives `/` and `/app` real, independent meaning: `/` always renders the public landing page for a visitor with no session, and an authenticated visitor is redirected into `/app`; `/app` (and its sub-paths) always render the authenticated shell for a visitor with a session, and an unauthenticated visitor is redirected to `/`.

**Why this priority**: This is the entire scope of issue #250 and the concrete problem it names (QA couldn't view the landing page without nuking cookies).

**Independent Test**: With no session, load `/app` directly — confirm it redirects to `/`. With a valid session, load `/` directly — confirm it redirects to `/app`. Sign out from `/app/account` — confirm the URL changes to `/`.

**Acceptance Scenarios**:

1. **Given** no active session, **When** the browser navigates directly to `/app` (or any `/app/*` path), **Then** the URL redirects to `/` and the public landing page renders.
2. **Given** a valid session, **When** the browser navigates directly to `/`, **Then** the URL redirects to `/app` and the Garage screen renders.
3. **Given** a signed-in user on any `/app/*` screen, **When** their session ends (sign out, account deletion, or a `needsReauth` sync event), **Then** the URL changes to `/` and the landing page renders.
4. **Given** a signed-out visitor who successfully signs up or signs in, **When** authentication completes, **Then** the URL changes to `/app` and the Garage screen renders.

---

### User Story 2 - Every authenticated screen has its own real, bookmarkable URL (Priority: P1)

Each of the app's screens (garage, dashboard, fuel, service, photos, reminders, planner, documents, review, settings, help, account) gets its own path under `/app/*` (e.g. `/app/dashboard`, `/app/fuel`). Clicking a nav-rail item navigates to that screen's real URL; browser back/forward moves between previously-visited screens; reloading on any of these URLs (or opening one as a fresh bookmark, with a valid session) lands directly on that screen.

**Why this priority**: The other half of issue #250's ask — deep-linkable, bookmarkable, back/forward-capable screens — and a direct prerequisite for #230/#231's screens (already shipped) to be reachable by URL at all.

**Independent Test**: Sign in, click through several nav-rail items, confirm the URL changes each time; use browser back — confirm it returns to the previous screen (not the previous scroll position within the same screen); reload on `/app/fuel` — confirm it lands on the Fuel screen, not Garage.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they click a nav-rail item, **Then** the URL updates to that screen's path and the browser history gains a new entry.
2. **Given** a signed-in user who has navigated through several screens, **When** they use the browser's back button, **Then** the app shows the previously-visited screen, matching the URL now shown.
3. **Given** a signed-in user, **When** they reload the page while on `/app/fuel`, **Then** the Fuel screen renders directly (not Garage, and not a redirect to `/app`).

---

### User Story 3 - Magic-link and Google sign-in land on a real `/app` URL, not just `/` (Priority: P2)

The server-side magic-link and Google OIDC callback routes currently redirect every outcome (success and failure) to `/?magicLink=...`/`/?oidc=...`. Once authentication succeeds, the visitor now has a session — they should land on `/app` (with the outcome banner still shown), not on the (now-incorrect-for-them) public landing page.

**Why this priority**: Directly named in the issue ("sign-in/magic-link/OIDC callback routes get their own real paths too"); secondary to User Story 1/2 because it's a small, mechanical follow-on once the `/app` split exists — the outcome banners themselves are unchanged, only which URL they appear on.

**Independent Test**: Complete a magic-link sign-in end-to-end (request → click the emailed link) and confirm the browser lands on `/app` with the "signed in" banner, not `/`.

**Acceptance Scenarios**:

1. **Given** a successful magic-link or Google sign-in/link (a session is issued), **When** the server redirects back to the app, **Then** the browser lands on `/app` and the existing outcome banner (`magicLinkOkBanner`, `oidcLinkedBanner`, etc.) still renders there.
2. **Given** a failed magic-link or Google attempt (no session is issued), **When** the server redirects back to the app, **Then** the browser lands on `/` (the existing behavior, unchanged) and the existing error banner still renders there.

---

### Edge Cases

- What happens to a genuinely unknown path (a typo, an old bookmark to a path that never existed)? It's treated the same as `/` — the landing/redirect logic doesn't special-case a 404; this app has no content that needs a dedicated "not found" page (every real path is either the landing page or one of the twelve known `/app/*` screens).
- What happens during the brief window before the client has confirmed whether a session exists (the existing `getCurrentIdentity()` check on load)? No redirect happens until that check resolves — a bookmarked `/app/dashboard` link for an actually-authenticated visitor must not flash-redirect to `/` and back before settling; the landing page already renders during this window today (unchanged), so this is a redirect-timing addition, not a new flash.
- What happens to the existing `?magicLink=`/`?oidc=` outcome query parameters across a redirect? They're preserved verbatim — the redirect changes only the path, never the query string, so the existing outcome-banner logic (which reads `location.search` on mount, unchanged by this feature) keeps working regardless of which path it lands on.
- What happens to the Documentation link's current in-page toggle behavior on the landing page (specs/057)? Unchanged — out of scope here. The issue's own proposed route table keeps `help` under `/app/*` (the authenticated shell's screens) and doesn't ask for a separate public documentation URL; the landing page's existing "Documentation" button continues to toggle `HelpView` inline rather than navigating to a URL.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST introduce real client-side routing (using the browser's History API), replacing the current in-memory-only `view`/`identity` state as the sole source of what renders.
- **FR-002**: `/` MUST render the public landing page for a visitor with no confirmed session. Once a session is confirmed, the app MUST redirect (replacing, not pushing, the history entry) to `/app`.
- **FR-003**: `/app` and every `/app/<screen>` path (dashboard, fuel, service, photos, reminders, planner, documents, review, settings, help, account) MUST render the corresponding authenticated screen for a visitor with a confirmed session. For a visitor with no confirmed session, the app MUST redirect (replacing) to `/`.
- **FR-004**: No redirect decision (FR-002/FR-003) MUST occur before the initial session check has resolved — avoids a visible bounce/flash for a valid deep link.
- **FR-005**: Clicking a nav-rail item MUST navigate (pushing a new history entry) to that screen's real `/app/<screen>` path; the browser's back/forward buttons MUST move between previously-visited screens accordingly.
- **FR-006**: Reloading the page on any `/app/<screen>` path MUST render that same screen directly (not silently fall back to Garage) for a visitor with a confirmed session.
- **FR-007**: A redirect between `/` and `/app` (FR-002/FR-003) MUST preserve the existing query string (e.g. `?magicLink=ok`), so the existing outcome-banner rendering is unaffected by which of the two paths it ends up on.
- **FR-008**: The server-side magic-link and Google OIDC callback routes MUST redirect a successful (session-issuing) outcome to `/app` (carrying its existing outcome query parameter) instead of `/`; a failed (non-session-issuing) outcome MUST continue redirecting to `/`, unchanged.
- **FR-009**: This feature MUST NOT require any server-side routing change beyond FR-008's two redirect targets — the existing Cloudflare Workers Assets configuration (`not_found_handling = "single-page-application"`, already in place) already serves the SPA shell for any unmatched path, including a hard reload on a client-only `/app/*` route.

### Key Entities

This feature has no new data entities — it's a client-side navigation change with no new persisted data, no new API surface beyond the two redirect-target edits in FR-008.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can load `/` in a browser that already has a valid session and immediately see themselves land in the authenticated app at `/app` — no manual cookie-clearing needed to view the public landing page in a fresh, unauthenticated tab.
- **SC-002**: Every one of the app's twelve authenticated screens has a distinct, reloadable, bookmarkable URL under `/app/*`.
- **SC-003**: Browser back/forward correctly moves between previously-visited screens within the authenticated app.

## Assumptions

- **Hand-rolled minimal router, not a new dependency.** The app's routing needs are a flat set of ~13 known paths with no nested layouts, no URL parameters, and no data-loading integration — well within what the History API plus a small path-to-view mapping handles directly, consistent with this project's existing bias toward not adding a dependency where the standard platform API already covers the need cleanly (research.md).
- **`help` and `account` stay under `/app/*`** (authenticated-shell scope), matching the issue's own proposed route table — not promoted to standalone public routes. The landing page's existing inline Documentation toggle (specs/057) is unchanged.
- **No dedicated 404/not-found page.** An unrecognized path is treated as `/` — this app has no content that would need a distinct "page not found" experience beyond falling back to the landing page.
- **No new automated tests** beyond `deno task check`'s typecheck — this project has no client-side test suite (server-only Vitest); verification is manual, per quickstart.md, matching every other client-only feature this session.
