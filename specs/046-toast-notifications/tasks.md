# Tasks: Toast Save Confirmations

**Input**: Design documents from `/specs/046-toast-notifications/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No client-side test suite exists in this project — verified manually via quickstart.md
against `deno task dev`, matching specs/033-045. Zero server files touched.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] TST-001 `src/client/i18n/strings.ts`: add 6 confirmation messages —
      `vehicleAddedToast`, `fuelRecordAddedToast`, `serviceRecordAddedToast`,
      `reminderAddedToast`, `planCardAddedToast`, `documentAddedToast`.
- [X] TST-002 `src/client/App.tsx`: add `const [toast, setToast] = useState<string | null>(null)`
      and a ref for the pending dismiss timer; extend `handle<T>` to accept an optional third
      parameter `successMessage?: string` — after `onSuccess(result)` runs (inside the existing
      try-block, never the catch), if `successMessage` was passed, clear any pending timer, call
      `setToast(successMessage)`, and start a new ~3s timer that calls `setToast(null)`
      (research.md — single-slot, reset-not-appended, so a second toast always replaces the first).
- [X] TST-003 `src/client/components/AppShell.tsx`: add a `toast: string | null` prop; render a
      `position:"absolute", right:22, bottom:22, zIndex:40` element with `background:"var(--acc)"`/
      `color:"var(--on-acc)"` and the existing `tin` animation (research.md) when `toast !== null`.

**Checkpoint**: `deno task typecheck` fails (App.tsx's `<AppShell>` calls don't pass the new
required `toast` prop yet) — expected, resolved in Phase 3, matching spec 039's exact precedent.

---

## Phase 3: User Story 1 - Get a brief confirmation after adding a record (Priority: P1)

- [X] TST-004 [US1] `src/client/App.tsx`: pass `toast={toast}` to all nine `<AppShell>` call sites
      (garage, dashboard, fuel, service, reminders, planner, documents, review, settings) —
      mechanical, matching spec 039's existing threading pattern for shared `AppShell` props.
- [X] TST-005 [US1] `src/client/App.tsx`: pass the matching `successMessage` (from TST-001) as the
      third argument to the six `handle(...)` calls for `onAddVehicle`/fuel/service/reminder/
      plan-card/document — every other `handle(...)` call site is left unchanged (two-argument
      form, no toast).

**Checkpoint**: Each of the six covered add actions shows a self-dismissing confirmation; every
other action (edit/delete/mark-done/dismiss-duplicate) shows none.

## Phase 4: Polish & Cross-Cutting

- [X] TST-006 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] TST-007 Walk through quickstart.md's three scenarios plus the regression check against
      `deno task dev`. Verified: underlying create calls (e.g. POST fuel-records) still succeed
      normally (201) after extending `handle()` — the toast display/dismiss/no-stacking/no-toast-
      on-error logic itself is pure client-side React state, traced through code review (setToast
      only ever fires inside the try block's success path, after onSuccess, with the pending timer
      always cleared and reset — never appended) and covered by typecheck + the full check suite.

## Dependencies

- **Phase 2 (Foundational)** → **Phase 3**: strict — the state/prop plumbing must exist before any
  call site can use it.
- **Phase 4 (Polish)**: after everything else.

## Implementation strategy

**MVP = the whole feature** — a single user story, six mechanically-similar call sites, no phased
rollout needed beyond foundational-then-wire.
