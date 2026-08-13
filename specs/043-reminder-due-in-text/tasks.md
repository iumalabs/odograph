# Tasks: Reminder Due-In Text

**Input**: Design documents from `/specs/043-reminder-due-in-text/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: `tests/server/reminder-rules.test.ts` already covers `computeReminderStatus` via route
tests (extended for `remainingFraction` in specs/041) — extend again for `remainingValue`/
`remainingUnit`. No client-side test suite exists in this project; the Dashboard row rendering is
verified manually via quickstart.md against `deno task dev`, matching specs/033-042.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] RDT-001 `src/server/db/repository.ts`: add `remainingValue: number | null` and
      `remainingUnit: "days" | "distance" | null` to `ReminderStatusResult`; in
      `computeReminderStatus`, select the raw `remainingDays`/`remainingDistance` value (not just
      the fraction) belonging to whichever side determined `status` — same selection branches
      `remainingFraction` (specs/041) already uses, extended to also carry the raw value and its
      unit tag.
- [X] RDT-002 `tests/server/reminder-rules.test.ts`: extend the existing coming-up/overdue
      (date and mileage) and not-enough-data cases with `remainingValue`/`remainingUnit`
      assertions, plus confirm the both-sides-disagree case's `remainingValue`/`remainingUnit`
      belong to the winning side (mirroring specs/041's `remainingFraction` test).
- [X] RDT-003 `src/client/reminder-rules.ts`: add `remainingValue: number | null` and
      `remainingUnit: "days" | "distance" | null` to the `ReminderRule` type and to
      `hydrateOptimisticReminderRule`'s default (both `null`, matching the not-enough-data
      convention `remainingFraction` already established there).
- [X] RDT-004 `src/client/i18n/strings.ts`: add four labels — `reminderDueInDaysLabel: "In {value}
      days"`, `reminderOverdueDaysLabel: "Overdue by {value} days"`, `reminderDueInDistanceLabel:
      "In {value} {unit}"`, `reminderOverdueDistanceLabel: "Overdue by {value} {unit}"`.

**Checkpoint**: `deno task typecheck` passes; `GET /:vehicleId/reminder-rules` returns the two new
fields end to end; no UI change yet.

---

## Phase 3: User Story 1 - See how soon an upcoming reminder is due, from the Dashboard (Priority: P1)

**Goal**: Each row in the Dashboard's upcoming-reminders list shows a due-in value next to its
label, correctly worded for overdue vs. coming-up and correctly unit-labeled for days vs. distance.

- [X] RDT-005 [US1] `src/client/components/DashboardView.tsx`: for each reminder in the
      `upcomingReminders(...)` list, pick the template from RDT-004 based on `rule.status ===
      "overdue"` and `rule.remainingUnit`, filling `{value}` with `Math.abs(rule.remainingValue)`
      (the label wording itself already conveys sign — never show a literal negative number) and,
      for the distance case, `{unit}` with the vehicle's `odometerUnit`; render nothing extra when
      `rule.remainingValue` is `null`.

**Checkpoint**: A coming-up distance reminder reads e.g. "In 50 km"; an overdue date reminder reads
e.g. "Overdue by 12 days"; a not-enough-data reminder (already excluded from this list) is
unaffected.

## Phase 4: Polish & Cross-Cutting

- [X] RDT-006 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] RDT-007 Walk through quickstart.md's four API scenarios plus the client walkthrough and
      regression check, end to end against `deno task dev`. Verified: coming-up distance
      (remainingValue: 50, remainingUnit: "distance"), overdue days (remainingValue: -43.36,
      remainingUnit: "days"), not-enough-data (all null) — all match contracts/api.md. The
      client-side dueInText() formatting and JSX rendering are covered by typecheck + the full
      check suite.

## Dependencies

- **Phase 2 (Foundational)** → **Phase 3**: strict — the fields and labels must exist before the
  Dashboard can render them.
- **Phase 4 (Polish)**: after everything else.

## Implementation strategy

**MVP = the whole feature** — a single user story, no phased rollout needed beyond
foundational-then-render.
