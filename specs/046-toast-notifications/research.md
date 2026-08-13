# Phase 0 Research: Toast Save Confirmations

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Extend the existing `handle()` wrapper rather than build a separate notification system

**Decision**: `handle<T>(action, onSuccess, successMessage?)` — a third, optional parameter. When
present and `action()` resolves without throwing, `setToast(successMessage)` fires right alongside
the existing `onSuccess(result)` call.

**Rationale**: Every write action in this app already funnels through this one function (21 call
sites), which already distinguishes success (`onSuccess`) from failure (`catch` → `setError`).
Reusing it means the "never show a toast for a failed save" guarantee (FR-003) comes for free from
the function's existing control flow, rather than needing a second, separately-maintained
success/failure classification.

## Decision: Single `toast: string | null` state, not a queue

**Decision**: One state slot, reset (not appended to) on every new toast, with its auto-dismiss
timer cleared and restarted each time.

**Rationale**: FR-005 explicitly requires a second toast to replace, not stack with, a visible one.
A queue would need its own dequeue/display-duration logic for a feature whose entire real-world use
case (per the six covered call sites) rarely fires two saves within one toast's display window; the
single-slot design is simpler and already satisfies every requirement.

## Decision: Rendered inside `AppShell.tsx`, not a new top-level component

**Decision**: The overlay lives directly in `AppShell.tsx`'s existing JSX, as a
`position:absolute` element sibling to the header/nav — no new file, no context provider.

**Rationale**: `AppShell` already wraps every signed-in screen (per its own existing comment) and
already receives per-render props from `App.tsx` at all nine call sites (spec 039 established this
exact wiring pattern for the header vehicle switcher) — the toast just rides the same channel. A
React context would only pay off if many deeply-nested components needed to trigger toasts
independently; here, only `App.tsx`'s own `handle()` ever does.

## Decision: Reuse the existing `tin` animation and accent styling, no new keyframes

**Decision**: The toast reuses `base.css`'s already-defined `tin` entrance animation and the
`--acc`/`--on-acc` color pair, matching the mockup's own toast treatment
(`background:var(--acc);color:var(--on-acc)`).

**Rationale**: `tin` is already used for every other transient/entrance UI element in this app
(dropdowns, newly-added cards); introducing a second animation for one more transient element would
be inconsistent for no benefit.
