# Tasks: Client-Side Routing (`/app` shell, stable landing URL)

**Input**: Design documents from `/specs/059-app-routing/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No new automated tests — this project has no client-side test suite (research.md/
spec.md Assumptions). Verification is `deno task check`'s typecheck step plus quickstart.md's
manual walkthrough.

## Phase 1: Setup

None — no new dependency, no new top-level directory.

## Phase 2: Foundational

**Purpose**: The router module both user stories' `App.tsx` changes depend on.

- [X] RTE-001 New `src/client/router.ts`: `AppView`-keyed `VIEW_PATHS` map (`garage` → `/app`,
      `dashboard` → `/app/dashboard`, ... all 11 non-garage screens under `/app/<screen>`);
      `parseRoute(pathname): { kind: "landing" } | { kind: "app"; view: AppView }` (any path not in
      `VIEW_PATHS` and not exactly `/app` falls back to `{ kind: "landing" }` — spec.md's Edge
      Cases, no dedicated 404 path); `pathForView(view): string`; `navigate(path, { replace? }):
      void` (`history.pushState`/`replaceState`, then dispatches a custom `odograph:navigate`
      event since programmatic history changes fire no native event); `useRoute(): Route` (a React
      hook subscribing to both `popstate` and `odograph:navigate`, re-parsing
      `location.pathname` on each).

**Checkpoint**: `router.ts` type-checks and is unit-reachable; `App.tsx` untouched, nothing
user-visible changes yet.

---

## Phase 3: User Story 1 - `/` is always the public landing page, `/app` is always the authenticated shell (Priority: P1) 🎯 MVP

**Goal**: Direct navigation to `/app` without a session redirects to `/`; direct navigation to `/`
with a session redirects to `/app`; sign-out/sign-in change the URL accordingly.

**Independent Test**: quickstart.md scenarios 1–4, 7.

### Implementation for User Story 1

- [X] RTE-002 [US1] `src/client/App.tsx`: add `const [authChecked, setAuthChecked] =
      useState(false)`, set `true` in both the success and failure paths of the existing
      `getCurrentIdentity()` effect (research.md Decision 2 — distinguishes "still checking" from
      "confirmed no session," required so a valid deep link doesn't flash-redirect before settling,
      per FR-004). Replace `const [view, setView] = useState<AppView>("garage")` with `const route
      = useRoute()` and a derived `const view: AppView = route.kind === "app" ? route.view :
      "garage"`. Add a new effect: once `authChecked` is true, if `route.kind === "app" &&
      !identity`, `navigate("/" + location.search, { replace: true })`; if `route.kind ===
      "landing" && identity`, `navigate("/app" + location.search, { replace: true })` (FR-007 —
      preserves the existing `?magicLink=`/`?oidc=` query string across the redirect).

**Checkpoint**: User Story 1 fully functional — `/` and `/app` redirect correctly in both
directions, gated on the real session state, with no premature bounce.

---

## Phase 4: User Story 2 - Every authenticated screen has its own real, bookmarkable URL (Priority: P1)

**Goal**: Nav-rail clicks produce real URLs and history entries; back/forward moves between
screens; reloading on a deep `/app/<screen>` path renders that screen directly.

**Independent Test**: quickstart.md scenarios 5–6.

### Implementation for User Story 2

- [X] RTE-003 [US2] `src/client/App.tsx`: replace the `setView` function (previously
      `useState`'s setter) with `function setView(next: AppView) { navigate(pathForView(next)); }`
      — every existing `onSelectView={setView}` call site on `AppShell` (all ~13, unchanged prop
      name/signature) now pushes a real history entry instead of only updating local state.
      Reload-on-deep-path (FR-006) needs no separate change: `useRoute()`'s initial state already
      parses `location.pathname` on mount (RTE-001), and every `if (view === "X")` branch already
      keys off the router-derived `view` from RTE-002.

**Checkpoint**: Both this story and User Story 1 fully functional — every screen is reachable,
navigable, and reloadable by URL.

---

## Phase 5: User Story 3 - Magic-link and Google sign-in land on a real `/app` URL (Priority: P2)

**Goal**: A successful (session-issuing) magic-link or Google outcome redirects to `/app`, not `/`;
a failed outcome is unchanged.

**Independent Test**: quickstart.md scenarios 8–9.

### Implementation for User Story 3

- [X] RTE-004 [US3] `src/server/routes/v1/auth/magic-link.ts`: change the two session-issuing
      redirect targets — `/?magicLink=linked` → `/app?magicLink=linked` (the `consumed.
      linkingUserId` success branch) and `/?magicLink=ok` → `/app?magicLink=ok` (the plain sign-in/
      sign-up success branch). The two non-session error redirects (`!consumed`, the unique-
      constraint conflict) stay `/?magicLink=error`, unchanged.
- [X] RTE-005 [US3] `src/server/routes/v1/auth/oidc/google.ts`: change the two session-issuing
      redirect targets — `/?oidc=linked` → `/app?oidc=linked` and `/?oidc=ok` → `/app?oidc=ok`. The
      one non-session error redirect stays `/?oidc=error`, unchanged.

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] RTE-006 Run `deno task check` (fmt, lint, typecheck, full suite, build) — all green.
- [X] RTE-007 Work through quickstart.md's manual validation steps 1–9 against a local
      `deno task dev` session in a real browser.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None.
- **Foundational (Phase 2)**: No dependencies. BLOCKS Phase 3 and Phase 4 (both need `router.ts`).
- **User Story 1 (Phase 3)**: Depends on Phase 2 only.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (RTE-003 reuses the `route`/`view` derivation
  RTE-002 introduces in the same file) — not independently buildable before US1's `App.tsx` change
  lands, though its own acceptance scenarios test a different behavior (navigation/history, not
  the redirect guard).
- **User Story 3 (Phase 5)**: Independent of Phases 3–4 — a different pair of files
  (`magic-link.ts`/`oidc/google.ts`), genuinely parallelizable with the client-side work.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- RTE-004 and RTE-005 (different files, no dependency on each other or on the client-side tasks) —
  genuinely parallelizable with Phase 3/4's `App.tsx` work.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (nothing to do) → Phase 2 (RTE-001) → Phase 3 (RTE-002).
2. **STOP and VALIDATE**: quickstart.md scenarios 1–4, 7.
3. This alone closes the concrete problem issue #250 names (QA couldn't view the landing page
   without clearing cookies); User Story 2 adds per-screen URLs on top of the same mechanism, User
   Story 3 is a small, independent server-side follow-on.

### Incremental Delivery

1. Phase 2 → router module exists, nothing user-visible changes yet.
2. Phase 3 → `/` ↔ `/app` redirect works (MVP, closes the issue's concrete complaint).
3. Phase 4 → every screen gets a real URL, nav-rail clicks and back/forward work accordingly.
4. Phase 5 → magic-link/Google success lands on `/app`.
5. Phase 6 → full-suite check + manual sign-off.
