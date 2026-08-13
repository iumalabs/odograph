# Implementation Plan: Reminder Due-In Text

**Branch**: `043-reminder-due-in-text` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/043-reminder-due-in-text/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`computeReminderStatus` gains a second new field alongside specs/041's `remainingFraction`:
`remainingValue: number | null` (the raw remaining days or distance, absolute value, from whichever
side determined `status`) and `remainingUnit: "days" | "distance" | null`. `DashboardView.tsx`'s
upcoming-reminders list formats these via two new i18n templates (due-in vs. overdue wording, per
unit), matching the mockup's due-in text while keeping all language in `strings.ts` (Principle IX)
and all math server-side (Principle II).

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Hono on Cloudflare Workers (server), React 19
(client)

**Primary Dependencies**: Hono, D1 — no new dependency

**Storage**: N/A — no schema change; `remainingValue`/`remainingUnit` are derived at read time
inside the same `computeReminderStatus` call already made per rule, exactly like specs/041's
`remainingFraction`

**Testing**: Extend `computeReminderStatus`'s existing route-level tests
(`tests/server/reminder-rules.test.ts`) with `remainingValue`/`remainingUnit` assertions. No
client-side test suite exists in this project — the Dashboard row rendering is verified via code
review and a `deno task dev` walkthrough, matching specs/033-042.

**Target Platform**: Cloudflare Workers (server) + Browser PWA (client)

**Project Type**: Web application (small server extension + client rendering change)

**Performance Goals**: N/A — no new query; rides the same `computeReminderStatus` call
`listReminderRulesWithStatus` already makes per rule

**Constraints**: Per constitution Principle II, the raw remaining figure MUST be computed
server-side — satisfied by construction, reusing the exact intermediate values (`remainingDays`,
`remainingDistance`) `computeReminderStatus` already derives internally (previously discarded after
classification, same pattern specs/041 already established for `remainingFraction`). Per
Principle IX, all wording (due-in vs. overdue phrasing, unit labels) lives in `strings.ts` — the
server returns only numbers and a unit tag (`"days" | "distance"`), never a formatted sentence.

**Scale/Scope**: `src/server/db/repository.ts` (`ReminderStatusResult`/`computeReminderStatus`
extended with `remainingValue`/`remainingUnit`), `src/client/reminder-rules.ts` (type extended to
match), `src/client/i18n/strings.ts` (4 new templated labels: due-in/overdue × days/distance),
`src/client/components/DashboardView.tsx` (render the due-in text per reminder row, using the
vehicle's `odometerUnit` for the distance unit label)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS — `remainingValue` is the exact
  `remainingDays`/`remainingDistance` intermediate `computeReminderStatus` already computes and
  guards (both are simple subtractions against an already-validated interval, not a new division);
  no new computation is introduced.
- **IV. No Interpolated Data**: PASS — `remainingValue`/`remainingUnit` are `null` exactly when
  `status` is `not_enough_data`; FR-005 explicitly forbids showing anything in that case.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS by design — this feature
  exists specifically to avoid a server-formatted sentence; the server returns a number + unit tag,
  the client selects and fills an i18n template. Confirm during implementation that no literal
  string (e.g. "days", "km") is hardcoded outside `t()`.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/043-reminder-due-in-text/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/db/repository.ts   # ReminderStatusResult + computeReminderStatus: add remainingValue/remainingUnit (extend)

src/client/
├── reminder-rules.ts          # ReminderRule type: add remainingValue/remainingUnit (extend)
├── i18n/strings.ts            # 4 new due-in/overdue × days/distance labels (extend)
└── components/DashboardView.tsx  # render due-in text per reminder row (extend)
```

**Structure Decision**: No new files — mirrors specs/041's exact shape (extend an existing derived
response type, extend the client type to match, add rendering in an existing component).

## Complexity Tracking

*No violations — section not applicable.*
