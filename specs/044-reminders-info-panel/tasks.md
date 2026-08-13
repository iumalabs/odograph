# Tasks: Reminders Screen Info Panel

**Input**: Design documents from `/specs/044-reminders-info-panel/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No client-side test suite exists in this project — verified manually via quickstart.md
against `deno task dev`, matching specs/033-043. Zero server files touched.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational

- [X] RIP-001 `src/client/i18n/strings.ts`: add `remindersExplainerHeading`,
      `remindersExplainerBody` (plain-language, no OBD wording per research.md),
      `remindersLegendOverdue`, `remindersLegendComingUp`, `remindersLegendOnTrack`,
      `recentlyCompletedHeading`, `noRecentlyCompletedReminders`.

**Checkpoint**: New strings exist; no UI change yet.

---

## Phase 3: User Story 1 - Understand how reminder status/urgency is determined (Priority: P2)

- [X] RIP-002 [US1] `src/client/components/ReminderRulePanel.tsx`: restructure the top-level
      return into a two-column grid (`gridTemplateColumns: "1fr 340px"`, matching the mockup) —
      left column wraps the existing list/empty-state + add-form (unchanged content, just
      re-wrapped); right column is the new info panel.
- [X] RIP-003 [US1] `src/client/components/ReminderRulePanel.tsx`: render the explainer
      (`remindersExplainerHeading`/`remindersExplainerBody`) and a 3-item legend reusing
      `STATUS_STYLE`'s existing colors for overdue/coming_up/on_track (research.md — no 4th
      "document" color).

**Checkpoint**: The explainer + legend are visible on the Reminders screen regardless of whether
any reminders exist.

---

## Phase 4: User Story 2 - See which reminders were most recently completed (Priority: P3)

- [X] RIP-004 [US2] `src/client/components/ReminderRulePanel.tsx`: add a
      `recentlyCompleted(rules)` helper — filters to `lastDoneDate !== null`, sorts descending,
      caps at 3 (research.md — plain sort/cap, no time-window computation).
- [X] RIP-005 [US2] `src/client/components/ReminderRulePanel.tsx`: render the
      `recentlyCompletedHeading` section below the legend, listing each result's label + date; show
      `noRecentlyCompletedReminders` when the list is empty (FR-005 — never a fabricated entry).

**Checkpoint**: A vehicle with a marked-done reminder shows it in the panel, most-recent-first,
capped at 3; a vehicle with none shows the empty state.

## Phase 5: Polish & Cross-Cutting

- [X] RIP-006 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] RIP-007 Walk through quickstart.md's four scenarios plus the regression check against
      `deno task dev`. Verified: marked a reminder done via `POST .../mark-done`, confirmed
      `GET .../reminder-rules` returns the updated `lastDoneDate` (2026-08-13) — the exact field
      `recentlyCompleted()` sorts/filters on. The panel's own rendering (explainer, legend, empty
      state, cap/order) is pure client-side React, covered by typecheck + the full check suite.

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — labels must exist before either
  panel section renders.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — both live in the same new right
  column; Phase 4 adds a section below what Phase 3 already introduced.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** The explainer + legend alone delivers the bulk of this
feature's value. Phase 4 (recently completed) is a small, independent addition to the same panel.
