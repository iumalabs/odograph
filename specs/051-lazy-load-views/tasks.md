# Tasks: Lazy-Load Non-Initial Views

**Input**: Design documents from `specs/051-lazy-load-views/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: None added — this repo has no client component test harness (research.md). Verification
is `deno task build`'s chunk output plus quickstart.md's manual walkthrough.

Two user stories, both P1 and tightly coupled (the loading-strategy change and "nothing breaks"
are two sides of the same edit) — implemented together as one phase.

## Phase 1: User Story 1 + User Story 2 - Smaller first load, every view still works (P1)

**Goal**: Non-initial views download on first navigation instead of upfront; every view keeps
working identically once loaded.

**Independent Test**: quickstart.md's three scenarios — smaller initial bundle, every view loads
once and works, a simulated chunk-load failure shows a recoverable per-view error.

- [X] T001 Add 3 new i18n keys (`viewLoadingLabel`, `viewLoadErrorLabel`, `viewLoadRetryLabel`) to
      `src/client/i18n/strings.ts`'s `en` table.
- [X] T002 Create `src/client/components/LazyViewBoundary.tsx`: a component combining a
      `Suspense` boundary (fallback using `viewLoadingLabel`) and a class-based error boundary
      (`getDerivedStateFromError`/`componentDidCatch`) rendering `viewLoadErrorLabel` plus a retry
      button (`viewLoadRetryLabel`) that resets the boundary's error state so React retries
      rendering its children (depends on T001).
- [X] T003 In `src/client/App.tsx`, replace the 8 static imports of `DashboardView`,
      `ExpenseBreakdownPanel`, `FuelRecordPanel`, `ServiceRecordPanel`, `ReminderRulePanel`,
      `PlanBoard`, `DocumentPanel`, `SyncReviewScreen`, `SettingsView` (9 components, `DashboardView`
      +`ExpenseBreakdownPanel` both live in the same `view === "dashboard"` block) with
      `React.lazy(() => import(...).then((m) => ({ default: m.X })))` calls, adapting each named
      export per research.md's decision. `AuthScreen`, `Garage`, `SearchBar`, and `AppShell` stay
      statically imported (depends on T002).
- [X] T004 Wrap each lazy component's usage inside its `if (view === "...")` block's `<AppShell>`
      children with `<LazyViewBoundary>` (dashboard's block wraps both `DashboardView` and
      `ExpenseBreakdownPanel` together, per research.md) — `AppShell` itself stays outside every
      boundary (depends on T003).
- [X] T005 `deno task check` (fmt, lint, typecheck, existing 346 server tests, repository-boundary
      script) — confirms no regression in anything the automated suite already covers (depends on
      T004).
- [X] T006 `deno task build` — confirm multiple JS chunks now exist in `dist/client/assets/`
      instead of one bundle containing every view (quickstart.md Scenario 1). Confirmed: 9 separate
      chunks (SyncReviewScreen, ExpenseBreakdownPanel, PlanBoard, ReminderRulePanel, DashboardView,
      DocumentPanel, ServiceRecordPanel, SettingsView, FuelRecordPanel), main bundle dropped from
      334.81KB to 273.51KB (depends on T005).
- [~] T007 Manual quickstart walkthrough (quickstart.md Scenarios 2 and 3) — **partially done**: no
      browser-automation tool was available in this session, so live in-browser navigation/error-
      simulation was not performed. Verified instead via `deno task dev` serving without import/
      build errors and careful code review of every wrapped call site. Flagged in the PR for a
      manual/QA pass (depends on T006).

**Checkpoint**: Production build chunks non-initial views separately; every view still works;
chunk-load failures are recoverable and scoped.

## Dependencies & Execution Order

T001 → T002 → T003 → T004 → T005 → T006 → T007 (linear — each step builds on the previous file's
final state; no parallelizable tasks given the small, single-file-dominant scope).

## Implementation Strategy

Single phase, single story pair — build the boundary component and its strings first (T001-T002),
then wire it into `App.tsx` (T003-T004), then verify mechanically (T005-T006) and manually
(T007) before shipping.
