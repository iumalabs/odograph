# Feature Specification: Lazy-Load Non-Initial Views

**Feature Branch**: `051-lazy-load-views`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Client bundle has no code-splitting — every view loads eagerly
(GitHub issue #161). src/client/App.tsx statically imports every view component (Garage,
DashboardView, FuelRecordPanel, ServiceRecordPanel, ReminderRulePanel, DocumentPanel, PlanBoard,
SettingsView, SyncReviewScreen, ExpenseBreakdownPanel) even though App() only ever renders one
view at a time via a view-state switch. No React.lazy/dynamic import() exists anywhere in
src/client, and vite.config.ts sets no manualChunks. A user who never opens Documents or the
Planner still downloads and parses their JS in the single ~335KB production bundle on first load —
a time-to-interactive hit, especially on mobile networks. Fix: wrap each view component in
React.lazy(() => import(...)) plus a Suspense fallback in App.tsx, so a view's JS is only fetched
the first time it's actually opened. Scope: this is a pure loading-performance change — no new
user-facing functionality, no change to what any screen looks like or does once loaded, only when
its code downloads. The always-visible app shell (AppShell.tsx, header, nav) and the first view
shown on load should stay eagerly loaded so the initial screen has no added Suspense flash; other
views lazy-load on first navigation to them."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First load downloads less JavaScript (Priority: P1)

An owner opening the app for the first time (or after a cache-busting deploy) wants the initial
screen to become interactive as fast as possible, without waiting on code for screens they haven't
opened yet.

**Why this priority**: This is the entire point of the feature — a smaller initial download is the
only outcome that matters, and it's what makes every other scenario below possible.

**Independent Test**: Load the app fresh (empty cache) and confirm, via the browser's network
panel, that the JavaScript fetched before the first screen becomes interactive no longer includes
the code for every other view — only the app shell and whichever view is shown first.

**Acceptance Scenarios**:

1. **Given** a fresh page load with an empty cache, **When** the app becomes interactive,
   **Then** the network request list shows separate JavaScript chunks per view rather than one
   single bundle containing all of them.
2. **Given** the app has just loaded, **When** the owner has not yet navigated to Documents, the
   Planner, or Settings, **Then** none of those screens' JavaScript has been downloaded yet.

---

### User Story 2 - Opening any screen still works exactly as before (Priority: P1)

An owner navigating to any screen — Garage, Dashboard, Fuel records, Service records, Reminders,
Documents, Planner, Settings, the sync-review screen — expects it to open and behave exactly as it
does today, whether or not its code has been downloaded yet.

**Why this priority**: Equal priority to User Story 1 — a loading-performance change that breaks or
visibly disrupts navigation isn't a net improvement. Every screen must keep working exactly as
before; only the timing of when its code arrives may change.

**Independent Test**: Navigate to every screen in the app, from a fresh page load and from an
already-warm session, and confirm each renders and functions identically to before this change,
with at most a brief, clearly-loading state on a screen's very first open.

**Acceptance Scenarios**:

1. **Given** a fresh page load, **When** the owner navigates to a screen for the first time,
   **Then** a brief loading indicator is shown while that screen's code downloads, then the screen
   renders normally.
2. **Given** a screen has already been opened once this session, **When** the owner navigates to
   it again, **Then** it renders immediately with no loading indicator (its code is already
   downloaded).
3. **Given** any screen, **When** it finishes loading, **Then** it looks and behaves identically to
   how it did before this change — same data, same layout, same interactions.

---

### Edge Cases

- What happens if a screen's code fails to download (e.g. offline mid-navigation, or a stale
  cached page requesting a chunk that no longer exists after a new deploy)? → The owner sees a
  clear, recoverable error state for that screen rather than a blank page or an unhandled crash;
  the rest of the app (already-loaded screens, the header/nav) keeps working.
- Does the always-visible app shell (header, navigation, currency/units toggle, sync/offline
  status) ever show a loading state? → No — the shell and whichever view is shown immediately on
  load are not part of this change's lazy-loading scope, so the first screen a returning owner
  sees never flashes a loading indicator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST NOT include a non-initial view's code in the JavaScript downloaded
  before the app's first screen becomes interactive.
- **FR-002**: The system MUST download a view's code on the owner's first navigation to that view
  within the session, and MUST NOT re-download it on subsequent visits to the same view within the
  same session.
- **FR-003**: While a view's code is downloading, the system MUST show a clearly-loading state
  rather than a blank screen or a frozen interaction.
- **FR-004**: Every view MUST render and behave identically to its pre-change behavior once its
  code has loaded — no functional, visual, or data differences.
- **FR-005**: The always-visible app shell and the view shown immediately on load MUST NOT exhibit
  a loading state under normal conditions (warm or cold cache) — only views reached by navigating
  away from the initial screen are lazy-loaded.
- **FR-006**: If a view's code fails to download, the system MUST show a clear, recoverable error
  state scoped to that view, without breaking the rest of the app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The JavaScript downloaded and parsed before the initial screen becomes interactive is
  measurably smaller than today's single bundle (fewer non-initial-view bytes shipped upfront).
- **SC-002**: Every view remains fully functional — a full pass through every screen (Garage,
  Dashboard, Fuel records, Service records, Reminders, Documents, Planner, Settings, sync review)
  shows no behavioral or visual regression versus before this change.
- **SC-003**: Navigating to an already-visited view within the same session never re-triggers a
  loading state for it.

## Assumptions

- The "first view shown on load" is whichever view the app already selects by default today (the
  existing initial `view` state) — this feature doesn't change which view that is.
- No new user-facing functionality is introduced; this is purely a loading-strategy change, so
  there's no new UI copy beyond a generic loading/error state for lazy-loaded views.
- Splitting granularity is per top-level view component (the same components already statically
  imported in `App.tsx` today) — not a finer-grained split within a single view.
- The existing PWA service-worker precache behavior (spec 040-era `vite-plugin-pwa` setup) is out
  of scope: precaching may still eagerly cache the split chunks in the background after install;
  this feature only changes what's required for the *first interactive paint*, not what the service
  worker eventually caches for offline use.
