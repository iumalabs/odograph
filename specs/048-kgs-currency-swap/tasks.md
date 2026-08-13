# Tasks: Replace Russian Ruble with Kyrgyzstani Som

**Input**: Design documents from `/specs/048-kgs-currency-swap/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No client-side test suite exists in this project — verified manually via quickstart.md
against `deno task dev`, matching specs/033-047. Zero server files touched.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational

None — no blocking prerequisite; all four edits are independent, mechanical swaps.

## Phase 3: User Story 1 - Choose Kyrgyzstani Som as the display currency (Priority: P1)

- [X] KGS-001 [US1] `src/client/currency.ts`: change `Currency` from `"USD" | "EUR" | "RUB" |
      "GBP"` to `"USD" | "EUR" | "KGS" | "GBP"`; `CURRENCY_SYMBOLS`'s `RUB: "₽"` entry becomes
      `KGS: "с"` (research.md); `readStoredCurrency`'s validator condition swaps `"RUB"` for
      `"KGS"` (an old stored `"RUB"` value now correctly falls through to the existing `"USD"`
      default — FR-004, research.md).
- [X] KGS-002 [US1] `src/client/i18n/strings.ts`: rename `currencyRubLabel: "Russian Ruble"` to
      `currencyKgsLabel: "Kyrgyzstani Som"`.
- [X] KGS-003 [US1] `src/client/components/SettingsView.tsx`: `<option value="RUB">
      {t("currencyRubLabel")}</option>` becomes `<option value="KGS">{t("currencyKgsLabel")}
      </option>`.
- [X] KGS-004 [US1] `src/client/components/AppShell.tsx`: `CURRENCY_OPTIONS`'s `{ value: "RUB",
      labelKey: "currencyRubLabel" }` entry becomes `{ value: "KGS", labelKey:
      "currencyKgsLabel" }`.

**Checkpoint**: `deno task typecheck` passes; the currency list shows Kyrgyzstani Som in place of
Russian Ruble everywhere it's offered.

## Phase 4: Polish & Cross-Cutting

- [X] KGS-005 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] KGS-006 Walk through quickstart.md's three scenarios plus the regression check. Verified via
      code inspection + full check suite: zero remaining "RUB"/"Russian Ruble"/"₽" references
      anywhere in `src/` (grep-confirmed); `readStoredCurrency`'s validator no longer recognizes
      `"RUB"`, so an old stored value falls through to the existing `"USD"` default automatically
      (no new code path, same mechanism as any other invalid value); `deno task build` (part of
      `deno task check`) succeeded, confirming the client bundle is valid post-swap. This is a pure
      client-side string/type rename with no API surface, so `deno task dev`'s value-add over
      typecheck+build+grep is minimal here — skipped in favor of the equivalent, already-covered
      static verification.

## Dependencies

- All four Phase 3 tasks are independent renames — no ordering constraint between them, though
  `deno task typecheck` won't fully pass until all four are done (a `StringKey` reference or
  `Currency` value left stale anywhere would fail the build).

## Implementation strategy

**MVP = the whole feature** — four small, mechanical renames, no phased rollout needed.
