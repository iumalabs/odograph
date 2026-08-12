# Phase 0 Research: Currency Display Setting

No `[NEEDS CLARIFICATION]` markers were left in the spec. This phase confirms implementation-level
decisions already implied by the codebase's existing conventions.

## Decision: State ownership (App.tsx, not a per-component hook instance)

**Decision**: `useCurrency()` is called exactly once, in `App.tsx`, and the resulting symbol/value
is threaded down as a plain prop to every component that needs it — the same convention already
used for every other piece of App-level state in this codebase (e.g. `selectedVehicleId`,
`vehicleOdometerUnit`).

**Rationale**: `src/client/theme.ts`'s existing `useTheme()` hook is a *misleading* precedent to copy
naively: it's called once (in `AppShell.tsx`) and its value is consumed only via a DOM side-effect
(`document.documentElement.dataset.theme`, read by global CSS) — no other component ever needs the
theme *value* itself, only the toggle function. Currency is different: five separate, sibling
components (`ServiceRecordPanel`, `FuelRecordPanel`, `PlanBoard`, `ExpenseBreakdownPanel`,
`DashboardView`) all need the *current symbol*, and a change made in `SettingsView` must be visible
in all of them immediately. If each component called its own `useCurrency()` instance
(each with its own `useState` seeded from `localStorage`), a change made in one instance would not
re-render any of the others — a classic multi-instance-`useState`-from-storage bug. Confirmed via
`grep`: this codebase uses no Context API anywhere (`createContext`/`useContext`: zero matches), so
lifting state to `App.tsx` and prop-threading is the established, idiomatic fix, not a new pattern.

**Alternatives considered**: A shared module-level pub-sub store (subscribe/notify outside React) —
would work, but introduces a pattern this codebase has never needed before, for a five-consumer
case prop-threading already handles cleanly. React Context — same objection; this project has
deliberately never introduced it even for oft-threaded values like `selectedVehicleId`, so adding it
just for this feature would be inconsistent with the rest of the app.

## Decision: Where the symbol is applied per component

**Decision**: A plain string prefix (`${symbol}${value}`) at each existing render site, not a
shared `formatMoney()` utility exported from `currency.ts`.

**Rationale**: The five call sites render cost figures in genuinely different shapes already
(`ExpenseBreakdownPanel.tsx` already has its own local `formatCost()` helper doing `.toFixed(2)`;
`DashboardView.tsx`'s `formatFigure()` is shared across *three* different metric types, only two of
which are money — `averageFuelEconomy` is a consumption figure, not a cost, and must never get a
currency symbol). Forcing one shared formatter across all five would either require passing a
`isMoney: boolean` flag through `DashboardView`'s existing generic helper (uglier than just
prefixing at the two call sites that are actually money) or duplicating logic anyway. Each site gets
the minimal, locally-correct change instead.

**Alternatives considered**: A shared `formatMoney(value, symbol)` export from `currency.ts` — real
but marginal reuse benefit (five one-line call sites, three different existing formatting
conventions already in place); not worth the indirection for this feature's scope.

## Decision: Currency list, labels, and default

**Decision**: `type Currency = "USD" | "EUR" | "RUB" | "GBP"`, symbol map `{USD: "$", EUR: "€", RUB:
"₽", GBP: "£"}`, default `"USD"` when no value is stored yet.

**Rationale**: Matches the source design prototype's own fixed list and default (`cur: '$'`)
verbatim — no invented options.
