# Tasks: In-App Documentation Viewer

**Input**: Design documents from `/specs/057-in-app-documentation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No new automated tests — same rationale as specs 055/056 (no client-component test
suite, no new server-side logic). Verification is `deno task check` plus quickstart.md's manual
walkthrough.

## Phase 1: Setup

None — no new dependency, no new top-level directory.

## Phase 2: Foundational

**Purpose**: The content and icon both user-facing pieces of this feature depend on.

- [X] HLP-001 New `src/client/docs-content.ts`: `DocBlock`/`DocSection` types per data-model.md,
      and `export const en: DocSection[]` with the six sections (research.md Decision 2's table) —
      Getting started, Signing in, Fuel & consumption, Service & reminders, API access,
      Self-hosting. Every factual claim matches the real source cited in research.md's table (real
      auth methods, real fuel-economy calculation, real reminder mechanics, real
      `Authorization: Bearer` API tokens, real `wrangler`-based self-hosting) — no Cloudflare
      Access, `cloudflared`, or Docker content anywhere (FR-005).
- [X] HLP-002 [P] `src/client/design/icons.tsx`: new `HelpIcon` (circle + question mark, path data
      ported from the design source's `nav.help` SVG), following the file's existing
      `commonProps`/`IconProps` convention exactly like every other icon in this file.

**Checkpoint**: Content and icon exist and type-check; nothing renders them yet.

---

## Phase 3: User Story 1 - A signed-in user finds accurate help without leaving the app (Priority: P1) 🎯 MVP

**Goal**: A new "Help" nav destination shows a two-pane documentation screen (section list +
content + pagination) built from `docs-content.ts`.

**Independent Test**: Sign in, click "Help", confirm the section list and content render and
prev/next pagination works correctly at both ends, per quickstart.md scenarios 1–4.

### Implementation for User Story 1

- [X] HLP-003 [US1] `src/client/i18n/strings.ts`: add UI-chrome-only keys (Constitution Principle
      IX — the prose itself lives in `docs-content.ts`, see plan.md's Constitution Check):
      `helpNavLabel` ("Help"), `helpSectionsHeading` ("SECTIONS"), `helpPrevLabel` ("Previous"),
      `helpNextLabel` ("Next").
- [X] HLP-004 [US1] New `src/client/components/HelpView.tsx`: accepts `sections: DocSection[]` and
      an optional `onBack?: () => void` (rendered as a small back affordance when provided — used
      only by the signed-out entry point, US2). Local state holds the selected section id
      (defaulting to `sections[0].id`). Renders: left pane — `helpSectionsHeading` + the numbered
      section list (`sc-for`-equivalent `.map`), active item highlighted; right pane — kicker,
      title, lead, then each block rendered per `kind` (heading/paragraph/list/code/note, per
      data-model.md); bottom — prev/next controls using `helpPrevLabel`/`helpNextLabel`, each
      absent (not just disabled) at the first/last section respectively.
- [X] HLP-005 [US1] `src/client/components/AppShell.tsx`: add `"help"` to the `AppView` union and a
      new `NAV_ITEMS` entry (`HelpIcon`, `labelKey: "helpNavLabel"`), appended after the existing
      `"settings"` entry (the real app's nav already has two items — Review, Settings — the design
      mockup doesn't, so this follows the real app's existing append-at-the-end convention rather
      than the design's own item ordering).
- [X] HLP-006 [US1] `src/client/App.tsx`: add `HelpView` to the existing `lazy()` import block
      (same pattern as `SettingsView` etc.), and a new `if (view === "help")` branch — `AppShell`
      wrapping `<LazyViewBoundary><HelpView sections={docsEn} /></LazyViewBoundary>`, structured
      identically to every other view branch (same props passed to `AppShell`).
- [X] HLP-007 [US1] `src/client/design/responsive.css`: give `HelpView`'s two-column grid a
      `className="help-grid"` hook and add a `grid-template-columns: 1fr !important` rule under the
      existing `@media (max-width: 640px)` block, same pattern as `.landing-hero`/
      `.reminders-panel-grid`.

**Checkpoint**: User Story 1 fully functional — a signed-in user can open Help, read every
section, and page through them correctly.

---

## Phase 4: User Story 2 - The public landing page's documentation link opens this real viewer (Priority: P2)

**Goal**: The landing page's "Documentation" link (header, from spec 056) renders
`HelpView` in place instead of opening the external GitHub README.

**Independent Test**: While signed out, click "Documentation" on the landing page and confirm the
same Help content renders without requiring sign-in, per quickstart.md scenario 5.

### Implementation for User Story 2

- [X] HLP-008 [US2] `src/client/components/LandingPage.tsx`: replace the header's external
      `DOCS_URL` `<a target="_blank">` link (spec 056 shipped only this one link, not a separate
      hero secondary link) with a button that sets local state (`showDocs`); when `showDocs` is
      true, render `<HelpView sections={docsEn} onBack={() => setShowDocs(false)} />` in place of
      the hero grid, inside `LandingPage`'s existing header (research.md Decision 3 — no new
      "guest shell" chrome). Remove the now-unused `DOCS_URL` constant.

**Checkpoint**: Both user stories independently functional. The same documentation content is
reachable signed-in (nav rail) and signed-out (landing page), from one shared `HelpView`.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] HLP-009 Run `deno task check` (fmt, lint, typecheck, full suite, build) — all green.
- [X] HLP-010 Work through quickstart.md's manual validation steps 1–6 against a local
      `deno task dev` session in a real browser — signed-in Help navigation, section switching,
      content accuracy spot check, pagination at both ends, signed-out access from the landing
      page, and narrow-viewport layout.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None.
- **Foundational (Phase 2)**: No dependencies. BLOCKS Phase 3 (HelpView needs `docs-content.ts` and
  `HelpIcon`).
- **User Story 1 (Phase 3)**: Depends on Phase 2 only.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (HLP-008 renders the same `HelpView` HLP-004
  built) — independently *testable* per its own acceptance scenario, not independently *buildable*
  before US1 exists (same relationship spec 056's US2 had to its US1).
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- HLP-001 (content) and HLP-002 (icon) touch different files, no dependency — genuinely
  parallelizable.
- HLP-005 (AppShell nav entry) and HLP-007 (responsive CSS) can proceed in parallel with HLP-006
  once HLP-004's `HelpView` exists and its grid class name is decided.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (nothing to do) → Phase 2 (HLP-001, HLP-002) → Phase 3 (HLP-003 through HLP-007).
2. **STOP and VALIDATE**: quickstart.md scenarios 1–4 against a local signed-in session.
3. This alone closes issue #230's primary ask (accurate in-app documentation); User Story 2 wires
   the already-built spec 056 landing page link to it.

### Incremental Delivery

1. Phase 2 → content and icon exist, nothing user-visible changes yet.
2. Phase 3 → signed-in Help viewer ships (MVP, closes #230's primary ask).
3. Phase 4 → landing page's documentation link opens it too, signed out.
4. Phase 5 → full-suite check + manual sign-off.
