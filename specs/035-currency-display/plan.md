# Implementation Plan: Currency Display Setting

**Branch**: `035-currency-display` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/035-currency-display/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A new client-local (`localStorage`-backed) `useCurrency()` hook, instantiated once in `App.tsx`
(mirroring how every other piece of App-level state is owned there and threaded down as props —
this codebase uses no Context API anywhere), providing a `Currency` value and a symbol string passed
down as a plain prop to the five components that already render a cost figure, plus a
`currency`/`onCurrencyChange` pair passed to `SettingsView` for the selector control itself.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: Browser `localStorage` only — no server involvement, no schema change, no API change

**Testing**: No client-side test suite exists in this project (server Vitest + a separately
QA-owned e2e suite) — verified via code review and a live `deno task dev` walkthrough, matching the
established pattern for prior client-only features (specs/033, specs/034)

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — a `localStorage` read/write and a string prefix, negligible cost

**Constraints**: Must not alter any stored or computed numeric value (FR-005); must not add any
server round-trip or offline-queue interaction (spec's explicit persistence-model decision)

**Scale/Scope**: One new client module (`currency.ts`), one new prop on five existing components
(`ServiceRecordPanel`, `FuelRecordPanel`, `PlanBoard`, `ExpenseBreakdownPanel`, `DashboardView`),
a currency/onCurrencyChange pair added to `SettingsView`, and the corresponding wiring in `App.tsx`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS — no computation of any kind happens here;
  a symbol is prefixed onto numbers the server already computed, client-side, with no math.
- **IV. No Interpolated Data**: PASS — explicitly the point of this feature's scope boundary (FR-005):
  no currency conversion, ever; the number shown is always exactly the number the server returned.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — this feature directly
  closes an explicit gap this principle names (currency as a locale axis); the four currency labels
  (USD/EUR/RUB/GBP) and the settings-screen label route through `src/client/i18n/strings.ts` like
  every other user-facing string.
- **X. Toolchain Discipline**: PASS — no new dependency.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/035-currency-display/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── currency.ts                            # new: useCurrency() hook, Currency type, symbol map
├── App.tsx                                # useCurrency() instantiated once; props threaded down
├── i18n/strings.ts                        # new labels (currency setting heading + 4 names)
└── components/
    ├── SettingsView.tsx                   # currency selector control (extend)
    ├── DashboardView.tsx                  # symbol on cost-per-distance/time chips (extend)
    ├── ServiceRecordPanel.tsx             # symbol on cost display (extend)
    ├── FuelRecordPanel.tsx                # symbol on cost display (extend)
    ├── PlanBoard.tsx                      # symbol on estimated-cost display (extend)
    └── ExpenseBreakdownPanel.tsx          # symbol in formatCost helper (extend)
```

**Structure Decision**: Purely additive to the client half of the app; no server file is touched.
One new small module, everything else extends an already-existing component with one new prop —
no new component, no new route.

## Complexity Tracking

*No violations — section not applicable.*
