# Implementation Plan: Reminders Screen Info Panel

**Branch**: `044-reminders-info-panel` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/044-reminders-info-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`ReminderRulePanel.tsx`'s single-column layout becomes a two-column grid (list+form on the left,
matching the mockup's `1fr 340px` split) with a new static info panel on the right: a plain-language
explainer (no OBD wording), a 3-color legend reusing the component's own existing `STATUS_STYLE`
colors, and a "recently completed" list — a client-side sort/cap over the already-fetched `rules`
prop by `lastDoneDate` descending, mirroring `DashboardView.tsx`'s established `upcomingReminders()`
pattern (filter/sort/slice over already-server-provided fields, not a new aggregate).

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — no schema/API change; reuses each rule's already-fetched `lastDoneDate`

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033-043

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — no new data fetching; the panel renders from the `rules` prop the
component already receives

**Constraints**: The "recently completed" list MUST be a plain sort/cap (most-recent-first, capped),
never a time-windowed filter requiring a new "now" comparison — spec.md's Assumptions explicitly
scope this down to avoid implying a completion history this data model doesn't have

**Scale/Scope**: `src/client/components/ReminderRulePanel.tsx` (layout restructure + new panel),
`src/client/i18n/strings.ts` (new explainer/legend/heading strings)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: N/A — the recently-completed list is a sort/cap
  over an already-fetched field (`lastDoneDate`), not a new derived aggregate; no division, no new
  computation, matching `DashboardView.tsx`'s already-accepted `upcomingReminders()` precedent.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — every new string
  (explainer paragraph, legend labels, heading) routes through `strings.ts`.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/044-reminders-info-panel/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── i18n/strings.ts                    # explainer/legend/heading strings (extend)
└── components/ReminderRulePanel.tsx   # two-column layout + info panel (extend)
```

**Structure Decision**: No new files, no new data-model.md/contracts (nothing new is persisted or
exposed via any API) — a client-only layout and content addition to an existing component.

## Complexity Tracking

*No violations — section not applicable.*
