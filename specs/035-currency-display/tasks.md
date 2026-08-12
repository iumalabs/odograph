# Tasks: Currency Display Setting

**Input**: Design documents from `/specs/035-currency-display/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No client-side test suite exists in this project for component-level UI — verified
manually via quickstart.md against `deno task dev`, matching the established pattern from
specs/033/034. This feature touches zero server files, so no server test coverage applies either.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] CD-001 Create `src/client/currency.ts`: `export type Currency = "USD" | "EUR" | "RUB" |
      "GBP"`; a `CURRENCY_SYMBOLS: Record<Currency, string>` map (`$`/`€`/`₽`/`£`); a
      `currencySymbol(currency: Currency): string` helper; `useCurrency(): [Currency, (next:
      Currency) => void]` mirroring `theme.ts`'s `localStorage`-backed pattern exactly (key
      `"odograph:currency"`, default `"USD"` on unset/invalid stored value, no DOM side-effect
      needed unlike theme's) — research.md's decision: called exactly once, from `App.tsx`
- [X] CD-002 [P] `src/client/i18n/strings.ts`: add `currencySettingLabel: "Currency"`,
      `currencyUsdLabel: "US Dollar"`, `currencyEurLabel: "Euro"`, `currencyRubLabel: "Russian
      Ruble"`, `currencyGbpLabel: "British Pound"` near the existing `settingsScreenHeading`/
      `apiTokensToggle` keys

**Checkpoint**: `deno task typecheck` passes; the hook exists and is importable, even though nothing
calls it yet.

---

## Phase 3: User Story 1 - Choose a currency once, see it everywhere (Priority: P1)

**Goal**: A currency selector in Settings, and every existing cost display across the app reflects
the chosen currency's symbol, defaulting to USD.

- [X] CD-003 [US1] `src/client/App.tsx`: call `useCurrency()` once near the top of the component;
      compute `const symbol = currencySymbol(currency);`
- [X] CD-004 [US1] `src/client/components/SettingsView.tsx`: add `currency: Currency` and
      `onCurrencyChange: (value: Currency) => void` props; add a `<select>` control (matching the
      vehicle-form's existing odometer-unit `<select>` pattern) with the four currency options,
      each labeled via CD-002's i18n keys, under a `currencySettingLabel` heading; wire it into
      `App.tsx`'s render call (pass `currency`/`setCurrency` from CD-003)
- [X] CD-005 [US1] `src/client/components/DashboardView.tsx`: add `currencySymbol: string` prop;
      prefix it onto the `costPerDistanceLabel` and `costPerTimeLabel` chips' rendered figures only
      (NOT `averageFuelEconomyLabel` — research.md: that's a consumption figure, not money); wire
      the prop from `App.tsx`
- [X] CD-006 [P] [US1] `src/client/components/ServiceRecordPanel.tsx`: add `currencySymbol: string`
      prop; prefix it onto the per-row `record.cost` display (both the read view and, if a symbol
      makes sense there too, leave the edit-form's raw numeric input unprefixed — an input field
      showing a bare editable number is standard, the symbol belongs on the read-only display);
      wire the prop from `App.tsx`
- [X] CD-007 [P] [US1] `src/client/components/FuelRecordPanel.tsx`: add `currencySymbol: string`
      prop; prefix it onto the per-row `record.cost` display (same read-view-only scope as CD-006);
      wire the prop from `App.tsx`
- [X] CD-008 [P] [US1] `src/client/components/PlanBoard.tsx`: add `currencySymbol: string` prop;
      prefix it onto the `card.estimatedCost` display; wire the prop from `App.tsx`
- [X] CD-009 [P] [US1] `src/client/components/ExpenseBreakdownPanel.tsx`: add `currencySymbol:
      string` prop; update the local `formatCost(value)` helper to `formatCost(value, symbol)`
      returning `` `${symbol}${value.toFixed(2)}` ``; wire the prop from `App.tsx`

**Checkpoint**: Changing currency in Settings is immediately reflected on every cost figure across
the app; a fresh session with no prior choice shows USD by default; average fuel economy never
shows a currency symbol.

## Phase 4: Polish & Cross-Cutting

- [X] CD-010 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] CD-011 Walk through quickstart.md's five scenarios end-to-end against `deno task dev`

## Dependencies

- **Phase 2 (Foundational)** → **Phase 3 (User Story 1)**: strict — the hook and i18n keys must
  exist before any component can consume them.
- Within Phase 3: CD-003 (App.tsx wiring point) should land first since every other task in the
  phase wires into it, but CD-005 through CD-009 touch disjoint files and are independently
  parallelizable once CD-003 exists.
- **Phase 4 (Polish)**: after everything else.

## Implementation strategy

**Single user story, single priority (P1)** — there is no smaller independently-shippable slice
than "the setting exists and every cost figure reflects it"; a currency selector with only some
cost figures updated would be a visibly incomplete, confusing feature, not a valid MVP checkpoint.
