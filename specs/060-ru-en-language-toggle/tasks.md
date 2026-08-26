# Tasks: RU/EN Language Toggle

**Input**: Design documents from `/specs/060-ru-en-language-toggle/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: One automated test is included — not TDD-style contract tests (the spec didn't
request tests), but a deliberate architectural decision from research.md Decision 6: a
key-parity check is the only mechanical way to enforce SC-001 ("no screen silently stays in
English"), and it's cheap since `strings.ts` needs no DOM/Worker runtime to test.

## Phase 1: Setup

- [X] LNG-001 Widen `vitest.config.ts`'s `test.include` from `["tests/server/**/*.test.ts"]`
      to also match `tests/client/**/*.test.ts` (this project's first client-side test —
      needs no `cloudflareTest`/Miniflare bindings, so no other config change is required).

**Checkpoint**: Test runner can discover a client-side test; nothing else changes yet.

---

## Phase 2: Foundational

**Purpose**: The `ru` locale content and the reactive locale-store mechanism the toggle UI
(User Story 1) depends on. Blocking — the toggle has nothing to switch to until this exists.

- [X] LNG-002 `src/client/i18n/strings.ts`: add `export type Language = "en" | "ru";`, a
      module-level locale store mirroring `src/client/offline/queue.ts`'s
      `subscribe`/`getSnapshot`/`notify` pattern (research.md Decision 1) — `listeners: Set<()
      => void>`, `activeLocale` initialized from `localStorage["odograph:language"]` (default
      `"en"` on missing/invalid value, matching `theme.ts`'s `readStoredTheme()` defensive-read
      pattern), `subscribe(listener)`, `getSnapshot(): Language`, and `setLanguage(lang:
      Language)` that writes `localStorage`, mutates `activeLocale`, and notifies listeners.
      Export `useLanguage(): [Language, (lang: Language) => void]` built on
      `useSyncExternalStore(subscribe, getSnapshot)`, same return shape as `theme.ts`'s
      `useTheme()`. Update `t()`'s internals to read `activeLocale` from the store instead of
      the current hardcoded `"en"` constant — its public signature is unchanged.
- [X] LNG-003 `src/client/i18n/strings.ts`: add the `ru` locale object (translating
      `appTitle` through `signOutLabel` — landing page, help nav, and account/session copy) and
      register it: `const locales = { en, ru } as const;`.
- [X] LNG-004 `src/client/i18n/strings.ts`: extend the `ru` object with translations for
      `emailLabel` through `oidcLinkedBanner` (passkey/magic-link/Google auth and
      account-linking copy).
- [X] LNG-005 `src/client/i18n/strings.ts`: extend the `ru` object with translations for
      `vehiclesHeading` through `closeVehicle` (vehicle fields, VIN lookup, photo gallery,
      service record fields).
- [X] LNG-006 `src/client/i18n/strings.ts`: extend the `ru` object with translations for
      `fuelRecordsHeading` through `noRecentlyCompletedReminders` (fuel record fields, shared
      edit/delete actions, reminder rules and their status/legend copy — note
      `reminderDueInDaysLabel`/`reminderOverdueDaysLabel`/etc. keep the single-form
      simplification per research.md Decision 5, not per-count grammatical variants).
- [X] LNG-007 `src/client/i18n/strings.ts`: extend the `ru` object with translations for
      `documentsHeading` through `genericError` (documents, maintenance planner, expense
      breakdown, search).
- [X] LNG-008 `src/client/i18n/strings.ts`: extend the `ru` object with translations for
      `garageNavLabel` through `allGood` (nav rail labels, settings screen, currency options,
      dashboard headings and aggregate labels).
- [X] LNG-009 `src/client/i18n/strings.ts`: extend the `ru` object with the remaining keys,
      `deleteAccountToggle` through `viewLoadRetryLabel` (account deletion, API tokens, offline
      sync/review, entity/action labels, reject reasons, push notifications, loading/error
      states) — this completes 100% key coverage (FR-001, SC-001).
- [X] LNG-010 [P] New `tests/client/i18n.test.ts`: assert `Object.keys(ru)` is exactly
      `Object.keys(en)` (same set, same length) and, for every key whose `en` value contains a
      `{name}` placeholder, the `ru` value contains the same placeholder name(s) (research.md
      Decision 6). Run `deno task test` and confirm it passes — this is the mechanical proof
      LNG-003–LNG-009 left no key untranslated or no placeholder dropped.

**Checkpoint**: `ru` locale is complete and verified by LNG-010; nothing user-visible changes
yet (no toggle UI, `activeLocale` still only ever resolves to whatever `localStorage` already
had, which is always `"en"` today since there was no prior way to set it to `"ru"`).

---

## Phase 3: User Story 1 - A Russian-reading visitor switches the whole app to Russian (Priority: P1) 🎯 MVP

**Goal**: A visible RU/EN toggle in both headers switches every rendered string immediately,
with no reload, and the choice persists.

**Independent Test**: quickstart.md scenarios 1–8.

### Implementation for User Story 1

- [X] LNG-011 [US1] `src/client/App.tsx`: call `useLanguage();` once near the component root
      (alongside the existing `useSyncExternalStore(subscribeQueue, getQueueSnapshot)` call at
      line ~212), matching research.md Decision 1's cascade approach. The hook's return value
      doesn't need to be read here — its subscription is what forces the whole un-memoized tree
      to re-render on language change.
- [X] LNG-012 [US1] `src/client/components/LandingPage.tsx`: import `useLanguage` from
      `../i18n/strings` alongside the existing `useTheme` import; add an `EN / RU` toggle
      control next to the existing theme toggle (same header region, ~line 81), routing its own
      "EN"/"RU" labels through `t()` per FR-007 — no hardcoded literal outside the translation
      table. Clicking sets the language to whichever value isn't currently active.
- [X] LNG-013 [US1] `src/client/components/AppShell.tsx`: same toggle addition as LNG-012, in
      the app shell's header next to its existing theme toggle (~line 413).
- [X] LNG-014 [US1] Work through quickstart.md's manual validation scenarios 1–8 against a
      local `deno task dev` session in a real browser — landing page switch, toggle-back,
      reload persistence, new-tab persistence, authenticated app shell switch, multi-screen
      coverage, independence from theme/currency/distance-unit, and user-entered data staying
      unaffected.

**Checkpoint**: User Story 1 fully functional — this is also the feature's only story, so this
is feature-complete pending the Polish phase below.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] LNG-015 Amend `.specify/memory/constitution.md`'s Additional Constraints bullet
      "Interface language (v1). English only, fully routed through the i18n layer required by
      Principle IX, so additional languages can be added later without a string-extraction
      rewrite." to describe the shipped RU/EN toggle instead (Principle IX's own text is
      unchanged — only this locked-decision bullet describes the new reality). Add a Sync
      Impact Report entry and bump the version header from `1.1.0` to `1.2.0` (MINOR — expands
      existing guidance, doesn't remove or redefine a Core Principle), per the Governance
      section's amendment procedure (research.md Decision 7).
- [X] LNG-016 Run `deno task check` (fmt, lint, typecheck, full test suite including the new
      `tests/client/i18n.test.ts`, build) — all green.

**Checkpoint**: Feature complete, constitution in sync, fully verified.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. Independent of Phase 2's content but LNG-010 (Phase 2)
  needs it done first so the test runner can even discover the new test file.
- **Foundational (Phase 2)**: LNG-002 (store mechanism) has no dependencies. LNG-003–LNG-009
  (translation chunks) all edit the same `ru` object in the same file — strictly sequential,
  each depends on the previous one having landed, not parallelizable despite being separate
  checklist items. LNG-010 depends on LNG-001 and LNG-003–LNG-009 all being complete (needs the
  full, final `ru` object to assert full-coverage parity). BLOCKS Phase 3 (the toggle has
  nothing real to switch to otherwise).
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion. LNG-011–LNG-013 touch three
  different files, genuinely parallelizable with each other; LNG-014 (manual validation) needs
  all three landed first.
- **Polish (Phase 4)**: Depends on Phase 3 being complete. LNG-015 (constitution amendment) and
  LNG-016 (`deno task check`) are independent of each other in principle, but running LNG-016
  last catches any fmt/lint issue LNG-015's edit might introduce too.

### Parallel Opportunities

- LNG-010 is marked [P] relative to Phase 3's tasks in the sense that it's independently
  verifiable the moment Phase 2's translation work lands — it doesn't block LNG-011–LNG-013
  from starting, only from being considered "done" alongside a fully verified `ru` table.
- LNG-011, LNG-012, LNG-013 (three different files: `App.tsx`, `LandingPage.tsx`,
  `AppShell.tsx`) are genuinely parallelizable.

---

## Implementation Strategy

### MVP First (and only)

This feature has a single P1 user story — there is no smaller MVP slice than the one described
above. Sequence: Phase 1 → Phase 2 (LNG-002, then LNG-003–LNG-009 in order, then LNG-010) →
Phase 3 → Phase 4.

### Incremental Delivery

1. Phase 1 → test runner ready, nothing else changes.
2. Phase 2 → `ru` locale exists and is verified complete; still invisible to users (no toggle
   yet, and `localStorage` can't yet be set to `"ru"` through the UI).
3. Phase 3 → the toggle is live; this is the feature, fully working end to end.
4. Phase 4 → governance housekeeping (constitution amendment) and final full-suite sign-off.
