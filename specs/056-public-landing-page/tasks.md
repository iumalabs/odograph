# Tasks: Public Landing Page

**Input**: Design documents from `/specs/056-public-landing-page/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No new automated tests — this project has no client-side (React component) test suite
(`tests/` is server-only Vitest), and this feature adds no server-side logic. Verification is
`deno task check` (typecheck/build/fmt/lint) plus the manual walkthrough in quickstart.md, matching
this project's established pattern for UI-only changes (e.g. issue #241's fix).

## Phase 1: Setup

None — no new dependency, no new top-level directory; `src/client/components/`, `src/client/i18n/`,
and `src/client/design/` already exist.

## Phase 2: Foundational

**Purpose**: Extract the reusable sign-in form both the new landing hero and (indirectly, by
replacement) the app's auth entry point depend on.

- [X] PLP-001 Extract `src/client/components/SignInCard.tsx` (new file) from
      `AuthScreen.tsx`'s bordered card: same props (`email`, `onEmailChange`, `onSignUpPasskey`,
      `onSignInPasskey`, `onSendMagicLink`, `pending`, `magicLinkSent`, `magicLinkOutcome`,
      `oidcOutcome`, `googleSignInUrl`, `error`), same JSX and `Banner` sub-component, same
      pending-disables-buttons logic — a pure extraction, no behavior change. Does NOT include
      `AuthScreen`'s full-page centering wrapper (`minHeight:100vh`, centered flex) — `SignInCard`
      renders just the card, so it can sit inside the new hero's grid column.

**Checkpoint**: `SignInCard` type-checks and is unit-reachable; nothing wired to `App.tsx` yet, so
the app's actual rendered output hasn't changed.

---

## Phase 3: User Story 1 - An unauthenticated visitor understands the product and can sign in (Priority: P1) 🎯 MVP

**Goal**: Replace the bare `AuthScreen` with a real landing page (header + two-column hero) whose
right column is the real, functional `SignInCard` — not the design source's fabricated demo panel
— with zero regression to any of the four existing sign-in actions or their pending/banner states.

**Independent Test**: Load the app with no session; confirm the hero content renders and all four
sign-in actions still work exactly as they do today, per quickstart.md scenarios 1–3, 5.

### Implementation for User Story 1

- [X] PLP-002 [US1] `src/client/i18n/strings.ts`: add new `en` keys (Constitution Principle IX —
      no hardcoded copy at the JSX site): `landingKicker` ("VEHICLE MAINTENANCE LOG"),
      `landingHeadlineLine1`/`landingHeadlineLine2`/`landingHeadlineLine3` ("Every litre," / "every
      kilometre," / "every receipt."), `landingLead` ("Fill-ups, service, reminders, a work
      planner, a gallery and documents — for every vehicle in your garage."), `landingNote1`
      ("Passkey, magic link, or Google — no password required."), `landingNote2` ("Free to sign up
      — every new account gets its own private garage."), `landingDocsLink` ("Documentation"),
      `landingSignInButton` ("Sign in"). None of these carry over the design source's
      Cloudflare-Access, self-hosted, or "single owner for now" framing (research.md Decision 3).
- [X] PLP-003 [US1] New `src/client/components/LandingPage.tsx`: header (`<Logo withWordmark />`,
      a `landingDocsLink` link to `https://github.com/iumalabs/odograph` opening in a new tab with
      `rel="noopener noreferrer"`, a `landingSignInButton` that scrolls/anchors to the sign-in
      card) and a two-column hero (left: `landingKicker` + 3-line headline + `landingLead` +
      `landingNote1`/`landingNote2`; right: `<SignInCard {...props} />`, same props `App.tsx`
      passes today, forwarded through unchanged). No demo stats panel, no fabricated figures
      (FR-007). All copy via `t()`. Give the hero's grid container `className="landing-hero"`
      (matching `AppShell.tsx`'s existing convention of inline styles + a `className` hook
      reserved for the CSS-only mobile override) so PLP-005 has a stable selector.
- [X] PLP-004 [US1] `src/client/App.tsx`: replace the `AuthScreen` import and the `!identity`
      branch's `<AuthScreen .../>` render with `<LandingPage .../>` (identical prop list, just a
      different component). Delete `src/client/components/AuthScreen.tsx` — grep-confirmed it has
      no other call site, so it becomes dead code otherwise.
- [X] PLP-005 [US1] `src/client/design/responsive.css`: add a `.landing-hero { grid-template-columns: 1fr !important }`-style rule (matching this file's existing `!important`-override convention for
      per-component mobile rules, e.g. `.reminders-panel-grid`) under the existing
      `@media (max-width: 640px)` block (same breakpoint every other mobile rule in this file
      already uses — not a new one) stacking the landing hero's two-column grid to one column.

**Checkpoint**: User Story 1 fully functional — the landing page is the real `!identity` entry
point, every sign-in action works exactly as before, and it's usable at mobile widths.

---

## Phase 4: User Story 2 - A visitor can read documentation before signing in (Priority: P2)

**Goal**: Confirm the documentation links PLP-003 already wires up open a real, working
destination — independent of exercising any sign-in action.

**Independent Test**: Click "Documentation" (header or hero) and confirm it opens the project's
real public GitHub README in a new tab, per quickstart.md scenario 4.

### Implementation for User Story 2

- [X] PLP-006 [US2] Manual verification only (no code change expected beyond PLP-003's links): both
      documentation links open `https://github.com/iumalabs/odograph` in a new tab, with correct
      `target`/`rel` attributes, reachable without touching any sign-in action first. If PLP-003's
      links are missing `target="_blank"`/`rel="noopener noreferrer"`, fix them here.

**Checkpoint**: Both user stories independently functional. The landing page fully replaces
`AuthScreen` as the app's real, accurate unauthenticated entry point.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] PLP-007 Run `deno task check` (fmt, lint, typecheck, full suite, build) — all green. This is
      the only automated verification this feature has (no new tests — see Tests note above), so
      it must pass cleanly, including the typecheck step catching any prop drift between
      `LandingPage`, `SignInCard`, and `App.tsx`'s existing handler wiring.
- [X] PLP-008 Work through quickstart.md's manual validation steps 1–6 against a local
      `deno task dev` session in a real browser — first load, all four sign-in actions,
      session-expired reuse, documentation links, narrow-viewport stacking, and a check that no
      fabricated data appears anywhere on the page.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — nothing to do.
- **Foundational (Phase 2)**: No dependencies. BLOCKS Phase 3 (US1 needs `SignInCard` to build the
  hero's right column).
- **User Story 1 (Phase 3)**: Depends on Phase 2 only.
- **User Story 2 (Phase 4)**: Depends on Phase 3 (PLP-003 is where the documentation links are
  actually built) — independently *testable* per its own acceptance scenario, but not
  independently *buildable* before US1 exists, since there's no separate documentation-link
  component to build in isolation.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- PLP-002 (i18n strings) and PLP-001 (SignInCard extraction) touch different files and have no
  dependency on each other — genuinely parallelizable.
- PLP-005 (responsive CSS) can start as soon as PLP-003's hero grid class names are decided, in
  parallel with PLP-004 (App.tsx wiring).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (nothing to do) → Phase 2 (PLP-001) → Phase 3 (PLP-002 through PLP-005).
2. **STOP and VALIDATE**: quickstart.md scenarios 1–3, 5 against a local unauthenticated load.
3. This alone closes issue #229's primary ask (a real landing page with working real sign-in);
   User Story 2 is a small, already-built-in verification pass on top of it.

### Incremental Delivery

1. Phase 2 → `SignInCard` exists, nothing user-visible changes yet.
2. Phase 3 → the real landing page ships, replacing `AuthScreen` (MVP, closes #229's primary ask).
3. Phase 4 → documentation links verified/fixed.
4. Phase 5 → full-suite check + manual sign-off.
