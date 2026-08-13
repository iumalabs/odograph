# Implementation Plan: Lazy-Load Non-Initial Views

**Branch**: `051-lazy-load-views` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/051-lazy-load-views/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`src/client/App.tsx` statically imports 9 view components even though only one renders at a time.
Every branch gated behind an explicit `if (view === "...")` (dashboard, fuel, service, reminders,
planner, documents, review, settings — plus `ExpenseBreakdownPanel`, rendered only inside the
dashboard branch) switches to `React.lazy(() => import(...))`. `AuthScreen` and `Garage`/
`SearchBar` — the two possible "first screen" states (logged-out vs. already-authenticated) — stay
statically imported per FR-005, as does `AppShell` itself (the always-visible header/nav). A new
small `LazyViewBoundary` component (Suspense + a class-based error boundary, since Suspense alone
doesn't catch a failed dynamic `import()`) wraps each lazy view's content inside its own
`<AppShell>` block, satisfying FR-003 (loading state) and FR-006 (recoverable error state) without
AppShell itself ever suspending.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19, Vite 6

**Primary Dependencies**: React's built-in `lazy`/`Suspense` — no new dependency

**Storage**: N/A — no data change

**Testing**: This repo's test suite (`tests/server/`) is server-only (`vitest` + `@cloudflare/vitest-pool-workers`); there is no existing client component test harness. Verification is via
`deno task build` (confirms multiple output chunks exist) plus a manual quickstart walkthrough
covering every view (per FR-002/FR-004) — documented in quickstart.md. This mirrors how prior
purely-client specs (e.g. 047's header toggle) were verified in this project.

**Target Platform**: Browser PWA (client-only change; no server route touched)

**Project Type**: Web application — client-only

**Performance Goals**: Reduce the JavaScript parsed before first interactive paint by excluding
non-initial-view code (SC-001) — no specific byte target, since the actual number will vary as
views grow; the requirement is directional (smaller than today's single bundle) and verified via
`deno task build`'s chunk output.

**Constraints**: Per FR-005, `AppShell` and the initial screen (`AuthScreen` pre-login, `Garage`/
`SearchBar` post-login) must never show a Suspense fallback under normal load — only the content
*inside* AppShell's children switches to a lazy boundary, never AppShell itself. Per FR-004, no
view's rendered output may change — this is strictly a loading-strategy change, so no prop,
markup, or behavior inside any view component is touched.

**Scale/Scope**: `src/client/App.tsx` (8 static imports → `React.lazy`, one new `LazyViewBoundary`
wrapper per `if (view === "...")` block), one new file `src/client/components/LazyViewBoundary.tsx`,
3 new i18n keys in `src/client/i18n/strings.ts`. No other file changes — the 9 view components
themselves are untouched (their default export becomes the target of a dynamic import, which needs
no change to the component's own source if it's already a named or default export — confirmed
during Phase 0 research below).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — the 3 new user-facing
  strings (loading label, error label, retry label) go through `strings.ts`/`t()` like every other
  string in this codebase, not inline literals.
- **II. Server-Computed, Division-Safe Aggregates**: N/A — no aggregate/computation involved, pure
  client loading strategy.
- **III. Idempotent Offline Sync**: N/A — no write path touched.
- **IV. No Interpolated Data**: N/A — no data fabrication risk; a failed chunk load shows an
  explicit error state (FR-006), never a fabricated view.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/051-lazy-load-views/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` — this feature touches no API surface (client-only, no new/changed endpoint).

### Source Code (repository root)

```text
src/client/
├── App.tsx                          # 8 static imports -> React.lazy; each `if (view === ...)` block's content wrapped in LazyViewBoundary (extend)
├── components/
│   └── LazyViewBoundary.tsx         # new: Suspense + error-boundary wrapper for a lazy view
└── i18n/strings.ts                  # 3 new keys: loading / error / retry labels (extend)
```

**Structure Decision**: Single new small component plus edits to the one file (`App.tsx`) that
already owns view selection — no new architectural layer, matches this project's existing
"components/" flat structure.
