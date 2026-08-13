# Implementation Plan: Replace Russian Ruble with Kyrgyzstani Som

**Branch**: `048-kgs-currency-swap` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/048-kgs-currency-swap/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`Currency` (`src/client/currency.ts`) swaps its `"RUB"` member for `"KGS"`, with a `с` symbol
replacing `₽` in `CURRENCY_SYMBOLS`; `readStoredCurrency`'s validator swaps the recognized value
accordingly (an old stored `"RUB"` now falls through to the existing default, matching FR-004 for
free — no new fallback logic needed). The three UI call sites that list currencies by name
(`SettingsView.tsx`'s `<select>`, `AppShell.tsx`'s header dropdown from spec 047) swap their
`"RUB"` option for `"KGS"`, and `strings.ts`'s `currencyRubLabel` becomes `currencyKgsLabel`.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — client-local `localStorage` preference only (spec 035), no schema/API change

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-047

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A

**Constraints**: An old stored `"RUB"` value must degrade gracefully to the existing default
(spec.md FR-004) — satisfied automatically once `"RUB"` is removed from the validator's recognized-
value list, the same mechanism that already handles any other invalid/missing stored value.

**Scale/Scope**: `src/client/currency.ts`, `src/client/i18n/strings.ts`,
`src/client/components/SettingsView.tsx`, `src/client/components/AppShell.tsx` — four small,
mechanical edits, all renaming/swapping one existing enum member.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — the swapped label still
  routes through `strings.ts` like every other currency label already does.
- No other principle implicated — no new data, no new computation, no new persisted field.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/048-kgs-currency-swap/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── currency.ts                     # Currency type + CURRENCY_SYMBOLS + validator (extend)
├── i18n/strings.ts                 # currencyRubLabel -> currencyKgsLabel (extend)
└── components/
    ├── SettingsView.tsx            # <option value="RUB"> -> KGS (extend)
    └── AppShell.tsx                # CURRENCY_OPTIONS entry (extend)
```

**Structure Decision**: No new files — every change is a rename/swap inside existing, already-
shipped code (specs 035/047).

## Complexity Tracking

*No violations — section not applicable.*
