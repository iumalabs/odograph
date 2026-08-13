# Phase 0 Research: Lazy-Load Non-Initial Views

## Decision: adapt named exports to `React.lazy` in `App.tsx`, don't touch the 9 view files

**Decision**: All 9 candidate view components (`DashboardView`, `ExpenseBreakdownPanel`,
`FuelRecordPanel`, `ServiceRecordPanel`, `ReminderRulePanel`, `PlanBoard`, `DocumentPanel`,
`SyncReviewScreen`, `SettingsView`) are exported as named exports (`export function X(...)`), not
default exports — confirmed via a grep across all 9 files. `React.lazy` requires a promise
resolving to `{ default: Component }`. Rather than adding an `export default` to each of the 9
files (which would touch 9 files for a cosmetic reason), each lazy import in `App.tsx` adapts the
named export inline: `lazy(() => import("./components/DashboardView").then((m) => ({ default: m.DashboardView })))`.

**Rationale**: Keeps the change contained to `App.tsx` + one new file + `strings.ts`, matching
FR-004's "no view's rendered output may change" — literally zero lines touched inside any view
component. Also avoids a mixed named+default export convention across the codebase, which every
other component file in this project doesn't have.

**Alternatives considered**: Add `export default` to each of the 9 files. Rejected — larger diff
for no behavioral benefit, and this project's existing convention (confirmed by grep) is named
exports everywhere; introducing default exports on 9 files just for `React.lazy` would be
inconsistent with the rest of `src/client/components/`.

## Decision: `Suspense` boundary + a small custom error boundary, scoped per view, inside `AppShell`

**Decision**: A new `LazyViewBoundary` component wraps `<Suspense fallback={...}><ErrorBoundary>{children}</ErrorBoundary></Suspense>`
(or equivalently combined into one component), placed as the child of `<AppShell>` in each
`if (view === "...")` block — `AppShell` itself, and its props, are unchanged and rendered
synchronously outside the boundary.

**Rationale**: `Suspense` alone only handles the *pending* state of a lazy import; a genuinely
failed dynamic `import()` (network failure, or a stale service-worker cache requesting a chunk
hash that no longer exists after a redeploy) rejects the promise, which `Suspense` does not catch
— only a component with `static getDerivedStateFromError`/`componentDidCatch` does (there is no
hooks-based equivalent in React 19). Placing the boundary *inside* `AppShell`'s children (not
wrapping `AppShell` itself) is what satisfies FR-005: the header/nav/vehicle-picker/currency-toggle
never suspend, only the view content area does.

**Alternatives considered**: A single app-wide error boundary at the root. Rejected — a chunk-load
failure for one view would then blank the entire app (including the header/nav a user needs to
navigate away from the broken view), rather than just that view's content, contradicting FR-006's
"without breaking the rest of the app."

## Decision: `ExpenseBreakdownPanel` shares the dashboard's lazy boundary, not its own

**Decision**: `ExpenseBreakdownPanel` is only ever rendered inside the `view === "dashboard"`
branch, alongside `DashboardView`. Both are lazy-imported and rendered inside the *same*
`LazyViewBoundary`, rather than each getting an independent one.

**Rationale**: They always appear together (one screen), so splitting them into two independent
Suspense boundaries would only risk a visible two-stage pop-in (dashboard stats appearing, then a
beat later the expense chart) for no bundle-size benefit — Vite will still code-split them into
separate chunks by module graph regardless of how many Suspense boundaries wrap them, since
chunking is determined by import() call sites, not by boundary nesting.

## Decision: no test-suite coverage added — this repo has no client component test harness

**Decision**: Verification is `deno task build` (confirms real multi-chunk output) plus a manual
quickstart walkthrough of every view, documented in `quickstart.md`. No new automated test is
added.

**Rationale**: `tests/` in this repo is exclusively server-side (`vitest` + Cloudflare Workers
pool) — there is no existing React Testing Library / jsdom setup for client components anywhere in
this codebase (confirmed via `deno.json`'s dependency list and a repo-wide search for
`@testing-library`). Introducing one would be a much larger, separate infrastructure decision, out
of scope for a loading-strategy fix. This matches how prior purely-client-behavior specs in this
project (e.g. 047's units toggle, 048's currency swap) were verified — `deno task check` plus a
manual walkthrough, not new client tests.
