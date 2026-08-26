# Implementation Plan: RU/EN Language Toggle

**Branch**: `233-ru-en-language-toggle` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/060-ru-en-language-toggle/spec.md`

## Summary

Add a client-side RU/EN interface-language toggle. A module-level, `useSyncExternalStore`-backed
locale store (mirroring the existing `offline/queue.ts` pattern) drives a new `ru` sibling to
`strings.ts`'s existing `en` locale object; `t()` stays a plain synchronous function reading the
active locale, so every existing call site needs no change. `setLanguage`/`useLanguage`
(mirroring `theme.ts`'s `useTheme()`) persist the choice to `localStorage` and, because no
component in this codebase uses `React.memo`, a single `useLanguage()` call near `App.tsx`'s
root is enough to cascade a re-render through the whole tree on toggle. No server-side change;
no new dependency.

## Technical Context

**Language/Version**: TypeScript 5.9 (existing stack)

**Primary Dependencies**: React 19 (`useSyncExternalStore`, already used elsewhere in this
codebase — see Decision 1 in research.md), Vite 6. No new dependency.

**Storage**: `localStorage` key `odograph:language` (client-side, per-device) — no D1/server
involvement (see data-model.md).

**Testing**: `vitest` (`deno task test`). New `tests/client/i18n.test.ts` (plain module test, no
DOM/Worker runtime needed) requires widening `vitest.config.ts`'s `test.include` glob to also
match `tests/client/**/*.test.ts`. Everything requiring an actual rendered DOM is validated
manually via quickstart.md, matching the existing precedent for this client-only codebase
(specs/059's tasks.md: no client-side component test suite).

**Target Platform**: Browser (PWA) — same as the rest of `src/client`.

**Project Type**: Web application — existing single-Worker + SPA layout (`src/client` /
`src/server`), no new top-level directory.

**Performance Goals**: Language switch is a synchronous, in-memory operation with no network
round-trip — must feel instantaneous (no loading state, no reload).

**Constraints**: No grammatical-pluralization engine (spec.md Assumptions); interface language
MUST stay fully independent of currency/distance-unit/theme preferences (Principle IX, FR-005).

**Scale/Scope**: ~272 existing `en` string keys need `ru` translations (FR-001); 2 new call
sites for the toggle control itself (landing page header, app shell header).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle IX (Separated Language and Locale Axes)** — PASS. This feature is literally what
  the principle describes: interface language toggles independently of currency, distance unit,
  and theme (verified by FR-005 and quickstart.md scenario 7).
- **Additional Constraints, "Interface language (v1). English only..."** — CONFLICT as
  currently literally worded, but the same sentence explicitly anticipates this moment
  ("...so additional languages can be added later without a string-extraction rewrite"). Not a
  silent override: research.md Decision 7 resolves this via an explicit `tasks.md` task to amend
  that bullet and bump the constitution version (1.1.0 → 1.2.0, MINOR) per the Governance
  section's amendment procedure. Principle IX itself is unchanged.
- **Principle X (Toolchain Discipline)** — PASS. No new dependency; `deno fmt`/`deno lint`
  continue to gate via `deno task check`.
- **Principle XI (English-Only Project Artifacts)** — PASS. The feature *ships* Russian UI
  *content* (translated strings), which is the product itself and explicitly out of this
  principle's scope (code, comments, docs, specs, commit messages — all remain English).
- No other principle is implicated: no new data entity, no new API surface, no new auth/storage
  surface, no server-side change at all.

**Result**: PASS, with one governance action (constitution amendment) tracked as an explicit
task rather than silently skipped — see research.md Decision 7.

## Project Structure

### Documentation (this feature)

```text
specs/060-ru-en-language-toggle/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` — this feature adds no new API surface (100% client-side; server is untouched).

### Source Code (repository root)

```text
src/client/
├── i18n/
│   └── strings.ts        # add `ru` locale object + module-level locale store
│                          # (activeLocale, listeners, subscribe/getSnapshot, setLanguage,
│                          #  useLanguage) — t() itself is unchanged
└── components/
    ├── LandingPage.tsx    # add RU/EN toggle next to the existing theme toggle
    └── AppShell.tsx       # add RU/EN toggle next to the existing theme toggle

src/client/App.tsx         # single `useLanguage()` call near the root to cascade re-renders

tests/client/
└── i18n.test.ts           # new — en/ru key-parity + placeholder-parity check

vitest.config.ts           # widen test.include to also match tests/client/**/*.test.ts

.specify/memory/constitution.md   # amend the "Interface language (v1)" bullet (research.md
                                    # Decision 7); version bump 1.1.0 → 1.2.0
```

**Structure Decision**: Existing single-Worker + SPA layout (`src/client` / `src/server`), no
new top-level directory. All functional changes are client-side; the only additions outside
`src/client` are the new `tests/client/` directory (this project's first client-side test),
the `vitest.config.ts` include-glob widening it requires, and the constitution amendment
tracked as an explicit task.

## Complexity Tracking

No unjustified violations. The one Constitution Check item that isn't a plain PASS (the
"Interface language (v1): English only" bullet) is resolved via an explicit governance
amendment task, not a complexity trade-off — see research.md Decision 7.
