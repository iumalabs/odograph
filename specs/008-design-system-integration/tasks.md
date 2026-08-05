# Tasks: Design System Integration

**Input**: Design documents from `/specs/008-design-system-integration/` **Prerequisites**: plan.md,
spec.md, data-model.md, research.md, quickstart.md

**Tests**: No new automated tests — this is a presentation-layer feature (FR-003); correctness is
verified by the existing suite staying green (no server/data-client files touched) plus live
browser verification against quickstart.md, matching how prior UI-touching work in this project
(e.g. the whoami client fix) was verified.

**Design reference note**: task descriptions below embed exact values (hex colors, px sizes, SVG
path data) pulled directly from `docs/odograph-design.zip`'s "Кокпит - прототип" and "Иконки и
лого" mockups so each task is unambiguous. The mockups' placeholder wordmark ("ГАРАЖ"/"GARAGE") and
Russian copy are exploratory branding for illustration only — the shipped product name is
"Odograph" (already `t("appTitle")` in `src/client/i18n/strings.ts`) and all shipped strings stay
English per constitution Principle XI/D-002; only the visual system (palette, type, logo mark,
layout, iconography) is ported.

## Phase 1: Setup

- [X] T001 Add `@fontsource/onest` and `@fontsource/jetbrains-mono` as `npm:` specifiers to
      `deno.json`'s `imports` map (constitution Principle X), then run `deno install`
- [X] T002 [P] Create `src/client/design/tokens.css`: `:root` custom properties for the dark
      (default) palette — `--bg:#0a0c0f; --panel:#13171c; --panel2:#1a1f26; --line:#242b34;
      --fg:#e9eef4; --dim:#7f8b99; --acc:#d4ff3f; --acc2:#3ea6ff; --warn:#ff6b3d;
      --on-acc:#0a0c0f` — plus a `[data-theme="light"]` block overriding to the light palette:
      `--bg:#e9ebee; --panel:#ffffff; --panel2:#f4f6f8; --line:#d6dbe1; --fg:#0d1116;
      --dim:#5d6874; --acc:#3f5c00; --acc2:#0a66c2; --warn:#c2410c; --on-acc:#ffffff`. Also define
      `--radius-sm:5px; --radius-md:8px; --radius-lg:12px` (chips/inputs/cards per research.md)
- [X] T003 [P] Create `src/client/design/base.css`: import `@fontsource/onest/400.css` through
      `800.css` and `@fontsource/jetbrains-mono/400.css`/`500.css`/`700.css`; define
      `--font-ui: 'Onest', system-ui, sans-serif` and `--font-mono: 'JetBrains Mono', ui-monospace,
      monospace` custom properties (FR-010 fallback); a minimal reset (`box-sizing: border-box`
      on `*`, zero default `margin`); base `html, body` styles (`background: var(--bg); color:
      var(--fg); font-family: var(--font-ui)`); thin scrollbar styling
      (`scrollbar-width: thin; scrollbar-color: #2c3542 transparent`, matching the mockups)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T004 Create `src/client/theme.ts`: a `useTheme()` hook — reads `localStorage["odograph:theme"]`
      on mount (default `"dark"` if absent or invalid), sets `document.documentElement.dataset.theme`
      to match, and returns `[theme, toggleTheme]` where `toggleTheme` flips the value, writes it
      back to `localStorage`, and updates the `data-theme` attribute (data-model.md)
- [X] T005 [P] Create `src/client/design/icons.tsx`: hand-rolled inline SVG icon components, each
      `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
      stroke-linecap="round" stroke-linejoin="round"`, sized via a `size` prop (default 20):
      - `GarageIcon`: `<path d="M3 10.5 12 4l9 6.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M8.5 20v-4.5h7V20"/><path d="M8.5 17.5h7"/>`
      - `ServiceIcon`: `<path d="M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5z"/><circle cx="12" cy="12" r="3.2"/>`
      - `CarIcon`: `<path d="M3.5 15l1.9-5.3A2.2 2.2 0 0 1 7.5 8.2h9a2.2 2.2 0 0 1 2.1 1.5L20.5 15"/><path d="M3 15h18v3.2h-2"/><path d="M5 18.2H3V15"/><circle cx="7.5" cy="18.2" r="1.7"/><circle cx="16.5" cy="18.2" r="1.7"/>`
      - `AddIcon`: `<path d="M12 5v14M5 12h14"/>`
      - `UploadIcon`: `<path d="M12 4.5v9"/><path d="M8.5 8L12 4.5 15.5 8"/><path d="M4.5 14v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4"/>`
      - `ReceiptIcon`: `<path d="M6.5 3h11v18l-2.75-1.8L12 21l-2.75-1.8L6.5 21z"/><path d="M9.5 8h5M9.5 12h5"/>`
      - `CloseIcon` (not in the mockup's icon sheet — hand-rolled to the same spec since the design
        explicitly calls for "closest matching geometry, never an illustration" for entities not
        in the set): `<path d="M6 6l12 12M18 6L6 18"/>`
      Icon rules from the mockup (06 · ПРАВИЛА): `currentColor` only, no fills/gradients inside an
      icon, single stroke width per icon, no emoji.
- [X] T006 [P] Create `src/client/components/Logo.tsx`: the approved gauge-mark logo (matches
      `public/favicon.svg` exactly) — `<svg viewBox="0 0 32 32"><rect width="32" height="32"
      rx="9" fill="var(--acc)"/><path d="M8 21a8 8 0 0 1 16 0" fill="none" stroke="var(--on-acc)"
      stroke-width="2.2" stroke-linecap="round"/><path d="M16 19.5l5.2-5.8" fill="none"
      stroke="var(--on-acc)" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="20"
      r="1.7" fill="var(--on-acc)"/></svg>`, a `size` prop (default 34), and an optional
      `withWordmark` prop that renders `t("appTitle")` next to it in `font: 800 24px var(--font-ui);
      letter-spacing: -.03em` (mockups' logo-lockup spec: gap = 0.4× mark height, min lockup height
      24px) — wordmark is "Odograph" (existing i18n string), never the mockups' placeholder
      "ГАРАЖ"/"GARAGE" branding
- [X] T007 Create `src/client/components/AppShell.tsx`: the persistent chrome wrapping every
      signed-in screen — a 76px-wide icon nav rail (`border-right: 1px solid var(--line);
      background: var(--panel)`) containing only the `Logo` (mark-only, no wordmark) and a single
      `GarageIcon` nav entry (active-state: `border-left: 2px solid var(--acc); color: var(--acc)`)
      — no other nav entries, since no other screens exist yet (spec.md Assumptions); a 62px header
      (`border-bottom: 1px solid var(--line); background: var(--panel)`) showing the current screen
      title, with the theme-toggle control (T004's `toggleTheme`, rendered as the literal `◐`
      character in a `32×32px` bordered box, `border: 1px solid var(--line); border-radius: 8px`,
      per the mockups' exact toggle treatment) right-aligned. The main content area (where
      `children` render, below the header) uses `flex: 1; overflow: auto` so a long vehicle or
      service-record list scrolls independently rather than overflowing the viewport (spec.md Edge
      Cases). Accepts `title` and `children` props.

**Checkpoint**: Design tokens, fonts, icons, logo, theme persistence, and the shared app chrome
exist and compile — no screen restyled yet.

---

## Phase 3: User Story 1 - A visitor recognizes the product and can sign in without confusion (P1)

**Goal**: Restyle the signed-out screen to the approved design with zero change to any sign-in
flow's behavior.

- [ ] T008 [US1] Create `src/client/components/AuthScreen.tsx`: extract the signed-out JSX branch
      from `App.tsx` verbatim (same props/handlers/state wiring), then restyle — centered card
      (`max-width: 380px`, `margin: auto`) on `var(--bg)`, `Logo` with `withWordmark` above the
      card, tagline below in `color: var(--dim); font: 400 12px var(--font-mono)`; email input
      styled `background: var(--panel2); border: 1px solid var(--line); border-radius: 8px;
      padding: 11px 12px; color: var(--fg); font: 500 14px var(--font-ui)`; the two passkey
      buttons and the magic-link button as visually distinct primary/secondary controls (primary =
      solid `background: var(--acc); color: var(--on-acc)`, secondary = `border: 1px solid
      var(--line); color: var(--fg)`, both `border-radius: 8px; padding: 9px 14px; font: 600
      11.5px var(--font-ui)`); the Google sign-in link styled to match the secondary button
      treatment (not a bare `<a>`); status banners (`magicLinkSentBanner`, error banners, etc.)
      styled with a left accent bar — `border-left: 2px solid var(--acc2)` for informational,
      `var(--warn)` for `role="alert"` banners
- [ ] T009 [US1] Wire `AuthScreen` into `App.tsx`, replacing the old inline unstyled signed-out
      branch — `App.tsx` passes down the same state/handlers it already owns (email, identity
      setters, `handle()`), no new state introduced
- [ ] T010 [US1] Live-verify in a browser (`deno task dev`): signed-out screen matches the design
      tokens (inspect computed colors/fonts via the preview tool, not just visual screenshot), and
      each of the 3 sign-in paths (passkey, magic link, Google) still completes and lands on the
      signed-in view — confirms FR-003 (no behavior change)

**Checkpoint**: Sign-in screen restyled and functionally unchanged.

---

## Phase 4: User Story 2 - An owner reviews their garage at a glance (P1)

**Goal**: Restyle the vehicle list and add-vehicle form to the approved card layout, using only
fields the `Vehicle` entity actually has (name, make, model, year, VIN, odometerUnit) — no
fuel-consumption or next-service stats, since those aren't tracked at the vehicle level yet
(constitution Principle IV: no invented data).

- [ ] T011 [US2] Create `src/client/components/Garage.tsx`: each vehicle renders as a card —
      `border: 1px solid var(--line); background: var(--panel); border-radius: 12px; padding:
      16px`, name in `font: 600 20px var(--font-ui); letter-spacing: -.02em`, make/model/year (only
      the fields present) as a `font: 400 11px var(--font-mono); color: var(--dim)` line next to
      the name, and VIN + odometer unit (when present) as small chips — `font: 500 10.5px
      var(--font-mono); border: 1px solid var(--line); border-radius: 5px; padding: 4px 8px;
      color: var(--dim)` — below the name, wrapping the mockups' card structure exactly but with
      the photo placeholder and fuel/service stat columns omitted (no backing data)
- [ ] T012 [US2] Empty state in `Garage.tsx` (same file as T011, not parallel — sequenced after
      it): when the vehicle list is empty, render a dashed
      card — `border: 1px dashed var(--line); border-radius: 12px; padding: 18px` — with
      `CarIcon`, inviting copy via a new i18n key, and the add-vehicle form directly below/within
      it (mockups' pattern: an inline dashed "add" affordance, not a separate modal)
- [ ] T013 [US2] Add-vehicle form in `Garage.tsx` styled per the mockups' text-input pattern (the
      ТО form's "РАБОТА" field, which is prose not telemetry): `background: var(--panel2); border:
      1px solid var(--line); border-radius: 8px; padding: 11px 12px; color: var(--fg); font: 500
      14px var(--font-ui)` for the name field, same treatment for the `<select>` odometer-unit
      control, and a solid `AddIcon` + label submit button matching the primary-button treatment
      from T008
- [ ] T014 [US2] [P] Add new i18n keys to `src/client/i18n/strings.ts` for any new copy this story
      needs (e.g. an empty-state invite string) — FR-009; reuse existing keys
      (`vehiclesHeading`, `vehicleNameLabel`, etc.) wherever they already say what's needed
- [ ] T015 [US2] Wire `Garage` into `App.tsx` inside the new `AppShell` (T007), replacing the old
      inline unstyled vehicle list/form — same state/handlers, no behavior change
- [ ] T016 [US2] Live-verify in a browser: existing vehicles render as styled cards with correct
      field omission for missing optional fields (no blank space, no "null"), the empty state
      renders when a fresh tenant has none, and adding a vehicle appends a new card with no reload

**Checkpoint**: Garage screen restyled; card layout, empty state, and add-vehicle flow all
functionally unchanged from before.

---

## Phase 5: User Story 3 - An owner reviews and adds to a vehicle's service history (P2)

**Goal**: Restyle the service-record list/form/attachment UI per the mockups' "ТО" screen,
adapted to the fields this project's `ServiceRecord`/`Attachment` entities actually have (no
self/shop toggle — that field doesn't exist in this schema).

- [ ] T017 [US3] Create `src/client/components/ServiceRecordPanel.tsx`: extract the service-record
      section from `App.tsx`, restyle as a table-like list matching the mockups' ТО row structure
      — header row `font: 400 9.5px var(--font-mono); color: var(--dim); letter-spacing: .08em;
      text-transform: uppercase; background: var(--panel2)` over columns DATE/DESCRIPTION/ODOMETER/
      COST; each row `border-bottom: 1px solid var(--line)`, description in `font: 500 13px
      var(--font-ui)` with `notes` (when present) as a secondary `font: 400 10.5px var(--font-mono);
      color: var(--dim)` line beneath it (mirroring the mockups' work+parts two-line cell),
      odometer/cost right-aligned in `font: 400 12.5px var(--font-mono)`
- [ ] T018 [US3] Empty state in `ServiceRecordPanel.tsx` (same file as T017, not parallel —
      sequenced after it): dashed card (same treatment as T012)
      with `ServiceIcon` and an inviting new i18n string when the selected vehicle has no records
- [ ] T019 [US3] Add-service-record form in `ServiceRecordPanel.tsx`: an accent-bordered panel when
      open (`border: 1px solid var(--acc); background: var(--panel); border-radius: 12px; padding:
      16px 18px`), description field styled like T013's text input (Onest, prose), date/odometer/
      cost fields styled with `font: 500 14px var(--font-mono)` (numeric/telemetry, per the
      mockups' distinction between the "РАБОТА" text field and the "ОДОМЕТР"/"СТОИМОСТЬ" mono
      fields), a solid accent SAVE button matching T008/T013's primary-button treatment
- [ ] T020 [US3] Attachment UI in `ServiceRecordPanel.tsx`: an `UploadIcon` + label control per
      record that opens a file input; on successful upload, show inline success feedback styled
      like the mockups' toast (`background: var(--panel2); border: 1px solid var(--line);
      border-radius: 9px; padding: 10px 14px; animation: tin .14s ease` — define the `tin`
      keyframe, `opacity 0→1` + `translateY(8px)→0`, in `base.css`), and list existing attachments
      per record as small chips using `ReceiptIcon` (same chip treatment as T011's VIN chip)
- [ ] T021 [US3] [P] Add new i18n keys to `src/client/i18n/strings.ts` for any new copy this story
      needs (empty-state invite, upload success message) — FR-009; reuse existing keys
      (`serviceDateLabel`, `uploadAttachment`, etc.) wherever they already say what's needed
- [ ] T022 [US3] Wire `ServiceRecordPanel` into `App.tsx`/`Garage.tsx`'s vehicle-selection flow,
      replacing the old inline unstyled service-record UI — same state/handlers, no behavior change
- [ ] T023 [US3] Live-verify in a browser: add a service record, upload a JPEG attachment, confirm
      the styled success feedback and that the attachment lists correctly, confirm download of the
      attachment still works exactly as before (FR-003)

**Checkpoint**: Service-record screen restyled; list, form, and attachment upload/download all
functionally unchanged from before.

---

## Phase 6: User Story 4 - An owner switches between light and dark theme (P3)

**Goal**: Make the T004 theme hook and T007 toggle control actually reachable and correct across
every in-scope screen, including the signed-out `AuthScreen` (which has no `AppShell`).

- [ ] T024 [US4] Add a minimal theme-toggle control (same `◐` treatment as T007's) to
      `AuthScreen.tsx`'s corner, wired to the same `useTheme()` hook (T004) — signed-out visitors
      can toggle theme before signing in, and the choice already applies globally since `data-theme`
      lives on `document.documentElement`
- [ ] T025 [US4] Live-verify in a browser: toggle theme from both the signed-out screen and the
      signed-in `AppShell` header, confirm every visible element across all 3 in-scope screens
      re-renders legibly in the light palette (no element left hardcoded to a dark-only color),
      reload and confirm the choice persisted (FR-005), toggle back to dark and confirm that
      persists too

**Checkpoint**: Both themes fully usable and the choice survives a reload, from any screen.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T026 [P] Responsive pass: at a 375px-wide viewport, confirm no horizontal page scroll and
      every control from Phases 3-6 remains reachable — adjust `Garage.tsx`'s and
      `ServiceRecordPanel.tsx`'s grid/flex layouts to collapse to a single column below a
      reasonable breakpoint (FR-007/SC-004/Edge Cases)
- [ ] T027 [P] Font-fallback check: block the `@fontsource` CSS/font requests in devtools, reload,
      and confirm all text remains legible via the `--font-ui`/`--font-mono` system-font fallback
      stacks defined in T003 (FR-010)
- [ ] T028 Run `deno task check` (fmt, lint, typecheck, full existing test suite, repository-
      boundary guard) and fix any failures — expect zero server-side or data-client file changes,
      so the existing suite should pass unchanged (FR-003/SC-002)
- [ ] T029 Walk `quickstart.md` end-to-end against `deno task dev` in a real browser, all 7
      sections, confirming SC-001 through SC-004

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict — tokens/fonts must exist before icons/
  logo/shell reference them.
- **Phase 2 (Foundational)** → **all user story phases**: strict — every screen restyle depends on
  tokens, icons, the logo, the theme hook, and (for US2/US3) `AppShell`.
- **User Story 1 (Phase 3)**, **User Story 2 (Phase 4)**: both P1, independent of each other (auth
  screen and garage screen share no component) — can proceed in either order or in parallel.
- **User Story 3 (Phase 5)**: depends on User Story 2's `Garage.tsx` existing (a vehicle must be
  selectable before its service records can be shown), but not on User Story 1.
- **User Story 4 (Phase 6)**: depends on `AppShell` (Phase 2/US2) existing for the signed-in toggle
  and `AuthScreen` (Phase 3/US1) existing for the signed-out toggle — done last among the stories
  since it touches both.
- **Phase 7 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, T005/T006 touch different new files and have no dependency on each other (T004 is
independent of both; T007 depends on T005/T006 existing):

```text
T005 [P] src/client/design/icons.tsx
T006 [P] src/client/components/Logo.tsx
```

Within each user-story phase, the "[P]" empty-state and i18n-string tasks touch different files
than the main component task and can proceed alongside it once the component file itself exists.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 + Phase 4.** Both User Story 1 (sign-in) and User Story 2
(garage) are P1 — together they cover every screen a new owner touches before they've logged a
single service record, which is the highest-value slice to ship first. User Story 3 (service
records) and User Story 4 (theme toggle) round out the full redesign but are P2/P3, sequenced
after the P1 slice per spec.md's priorities.
