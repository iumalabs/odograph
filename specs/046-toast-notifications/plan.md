# Implementation Plan: Toast Save Confirmations

**Branch**: `046-toast-notifications` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/046-toast-notifications/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`App.tsx`'s existing generic `handle<T>(action, onSuccess)` wrapper (already used by every write
action in the app) gains an optional third parameter, `successMessage?: string`; when the action
resolves without throwing and a message was passed, a new `toast: string | null` state is set,
auto-clearing after a fixed delay via a single reset-on-each-call timer (never stacking — FR-005).
`toast` is threaded to `AppShell.tsx` (which already wraps every screen) alongside the props spec
039 already threads there, rendered as a fixed bottom-right overlay reusing the existing `tin`
entrance animation from `base.css`. Only the six `onAdd*` call sites (vehicle, fuel, service,
reminder, plan card, document) pass a `successMessage`; every other `handle(...)` call is
unaffected (omits the third argument, no toast fires).

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — pure client-side transient UI state, never persisted

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-045

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — no new data fetching

**Constraints**: A toast MUST NOT appear for a failed save (spec.md FR-003) — satisfied by
construction, since `successMessage` is only ever surfaced from inside `handle`'s existing
try-block, after `onSuccess` already ran, never from the existing `catch` branch that sets `error`.
A second toast MUST replace, not stack with, a still-visible one (FR-005) — satisfied by always
resetting the same single `toast` state + timer rather than appending to a list.

**Scale/Scope**: `src/client/App.tsx` (`toast` state, `handle` extended, 6 call sites pass a
message, `toast` threaded to all 9 `<AppShell>` calls), `src/client/components/AppShell.tsx` (new
`toast` prop + overlay render), `src/client/i18n/strings.ts` (6 new confirmation messages)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — all six confirmation
  messages route through `strings.ts`, matching every other user-facing string in this app.
- No other principle implicated — no new data, no new server computation, no new persisted state.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/046-toast-notifications/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── App.tsx                        # toast state, handle() extended, 6 call sites (extend)
├── components/AppShell.tsx        # toast prop + overlay render (extend)
└── i18n/strings.ts                # 6 new confirmation messages (extend)
```

**Structure Decision**: No new component file for the toast itself — it's a small overlay rendered
directly inside `AppShell.tsx` (the persistent chrome every screen already goes through), the same
placement decision spec 039 made for the header vehicle switcher. No new hook/context module either
— a single `toast` state + `handle()` extension in `App.tsx` is enough for six known call sites; a
generic toast-queue abstraction would be premature for this scope (spec.md's Assumptions explicitly
defer broader coverage).

## Complexity Tracking

*No violations — section not applicable.*
