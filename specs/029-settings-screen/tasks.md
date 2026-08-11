# Tasks: Dedicated Settings Screen

**Input**: Design documents from `/specs/029-settings-screen/` **Prerequisites**: plan.md, spec.md,
research.md, data-model.md, quickstart.md

**Tests**: Not included — this codebase has no existing client-side unit/e2e test infrastructure
(research.md), and this feature relocates already-shipped, unmodified components. Verification is
`deno task check` plus a manual quickstart.md walkthrough, per this project's established practice
for client-only UI changes.

## Phase 1: Setup

None — no new dependency, no new directory.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 [P] In `src/client/design/icons.tsx`, add `SettingsIcon` ported verbatim from
      `docs/odograph-design.zip`'s icon sheet ("НАСТРОЙКИ" glyph): two horizontal rows each with a
      circular handle — `M4 7.5h8M17 7.5h3` + `circle cx=14.5 cy=7.5 r=2.3` + `M4 16.5h4M12.5
      16.5h7.5` + `circle cx=10.2 cy=16.5 r=2.3` — following the exact `commonProps`/`IconProps`
      pattern every other icon in that file uses (research.md)
- [X] T002 [P] In `src/client/i18n/strings.ts`, add `settingsNavLabel` ("SETTINGS", matching the
      existing all-caps nav-label style of `garageNavLabel`/`dashboardNavLabel`/
      `syncReviewNavLabel`) and `settingsScreenHeading` ("Settings", matching the existing
      `dashboardHeading`/`syncReviewHeading` sentence-case style)
- [X] T003 In `src/client/components/AppShell.tsx`, extend the `AppView` union to `"garage" |
      "dashboard" | "review" | "settings"`; widen `NAV_ITEMS`'s inline `labelKey` type from
      `"garageNavLabel" | "dashboardNavLabel" | "syncReviewNavLabel"` to also include
      `"settingsNavLabel"` (speckit-analyze finding — the existing inline union type must be
      extended or the new entry fails typecheck); add a `{ view: "settings", icon: SettingsIcon,
      labelKey: "settingsNavLabel" }` entry to `NAV_ITEMS` (import `SettingsIcon` from
      `../design/icons`), after T001/T002

**Checkpoint**: The nav rail has a fourth, correctly-labeled Settings entry; `AppView` includes
`"settings"`; no screen renders it yet.

---

## Phase 3: User Story 1 - Find account-level controls in one place (Priority: P1) 🎯 MVP

**Goal**: A dedicated Settings screen exists, is reachable from the nav rail, and the garage screen
no longer shows the three relocated controls.

- [X] T004 [US1] Create `src/client/components/SettingsView.tsx`: a component with no props that
      renders a heading (`t("settingsScreenHeading")`) followed by `<ApiTokens onError={...} />`,
      `<PushNotifications onError={...} />`, and `<AccountDeletion onConfirmDelete={...} />` in a
      vertical flex layout; accepts `onError: (message: string) => void` and `onConfirmDelete: ()
      => void` props so `App.tsx` can wire its existing `setError`/`handleDeleteAccount` handlers
      through unchanged (plan.md — thin composition, no new state)
- [X] T005 [US1] In `src/client/App.tsx`, add an `if (view === "settings")` branch (placed with the
      existing `dashboard`/`review` branches, before the garage fallback) rendering `<AppShell
      title={t("settingsScreenHeading")} view={view} onSelectView={setView}
      reviewBadgeCount={rejectedActionCount}><SettingsView onError={() =>
      setError(t("genericError"))} onConfirmDelete={handleDeleteAccount} /></AppShell>`, matching
      the exact structure of the `dashboard`/`review` branches; import `SettingsView`
- [X] T006 [US1] In `src/client/App.tsx`, remove the `<ApiTokens .../>`, `<PushNotifications
      .../>`, and `<AccountDeletion .../>` lines from the garage-view account-controls row
      (currently directly before `<SearchBar .../>`), and remove their now-unused imports
      (`AccountDeletion`, `ApiTokens`, `PushNotifications`) from the top of the file — `App.tsx` no
      longer references `handleDeleteAccount` directly at that call site, only via the T005 branch

**Checkpoint**: `deno task dev` shows a working Settings nav destination with all three controls;
the garage screen's account-controls row no longer shows them.

---

## Phase 4: User Story 2 - Manage API tokens from Settings exactly as before (Priority: P2)

**Goal**: Confirm the relocated `ApiTokens` component's create/reveal/list/revoke flow is
byte-for-byte behaviorally identical after the move (it is unmodified code, so this is a
verification task, not new implementation).

- [X] T007 [US2] Manually verify quickstart.md's "Validation scenario 2" against `deno task dev`:
      create a scoped API token from the Settings screen, confirm the one-time secret reveal/copy
      flow, confirm the token lists correctly (label/scope/created date/last-used), and revoke it

**Checkpoint**: API token management works identically to its pre-move behavior.

---

## Phase 5: User Story 3 - Manage push notifications and delete account from Settings exactly as before (Priority: P2)

**Goal**: Confirm the relocated `PushNotifications` and `AccountDeletion` components' state
handling and confirm-phrase gating are unchanged after the move.

- [X] T008 [US3] Manually verify quickstart.md's "Validation scenario 3" against `deno task dev`:
      toggle push notifications on/off from the Settings screen and confirm the status label
      updates correctly (or the unsupported/permission-denied state, if applicable); on account
      deletion, confirm an incorrect phrase keeps the delete button disabled, the exact phrase
      enables it, and Cancel aborts without sending a delete request

**Checkpoint**: Push notifications and account deletion work identically to their pre-move
behavior.

---

## Phase 6: Polish & Cross-Cutting

- [X] T009 Run `deno task check` (fmt, lint, typecheck, test, build) and fix any failures across
      all files touched by this feature
- [X] T010 Walk through quickstart.md's "Validation scenario 1" (garage decluttered, Settings
      reachable) and "Validation scenario 4" (navigating to Settings and back doesn't disturb the
      garage's selected vehicle) end-to-end against `deno task dev`

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the nav entry and i18n keys are
  shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** and **User Story 3 (Phase 5)**: strict —
  there is nothing to verify on the Settings screen until it exists.
- **User Story 2 (Phase 4)** and **User Story 3 (Phase 5)**: independent of each other, can run in
  either order or in parallel.
- **Phase 6 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That delivers the dedicated Settings screen itself —
reachable, decluttering the garage screen — which is this feature's entire point. User Stories 2
and 3 are verification-only passes confirming the moved components' existing behavior wasn't
altered in transit, since no implementation task actually changes their internals.
