# Implementation Plan: Richer Garage Cards

**Branch**: `041-richer-garage-cards` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-richer-garage-cards/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`Garage.tsx` gains two large stats (odometer, average fuel economy — both already fetched via
`getVehicleAggregates`) styled with the mockup's visual weight, plus a progress bar for the card's
most-urgent reminder. The bar's fill fraction is a new server-computed field,
`remainingFraction: number | null`, added to `computeReminderStatus`'s existing return shape by
exposing an intermediate value that function already calculates internally (the same fraction
already used to classify `on_track`/`coming_up`/`overdue`) — no new formula, no new division-safety
rule, just returning a value the function already derives.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Hono on Cloudflare Workers (server), React 19
(client)

**Primary Dependencies**: Hono, D1 — no new dependency

**Storage**: N/A — no schema change, no new persisted field; `remainingFraction` is derived at read
time exactly like `status`/`byDate`/`byMileage`/`dueDate`/`dueOdometer` already are

**Testing**: `computeReminderStatus` already has direct unit tests (pure function, no D1) — extend
those with `remainingFraction` assertions. Route-level tests for `/reminder-rules` already assert
the response shape; extend for the new field. No client-side test suite exists in this project —
the card rendering is verified via code review and a `deno task dev` walkthrough, matching
specs/033-040.

**Target Platform**: Cloudflare Workers (server) + Browser PWA (client)

**Project Type**: Web application (small server extension + client rendering change)

**Performance Goals**: N/A — no new query, no new endpoint; `remainingFraction` rides along the
exact same `computeReminderStatus` call `listReminderRulesWithStatus` already makes per rule

**Constraints**: Per constitution Principle II, `remainingFraction` must be computed server-side —
this plan satisfies that by construction, since it's the exact same computation
`computeReminderStatus` already performs for status classification, now also returned instead of
being discarded after use. Per Principle IV, the client must never fabricate a fill percentage:
`remainingFraction` is `null` whenever `status` is `not_enough_data`, and the client's only job is
converting a non-null fraction into a CSS width, never estimating one itself.

**Scale/Scope**: `src/server/db/repository.ts` (`ReminderStatusResult`/`computeReminderStatus`
extended with `remainingFraction`), `src/client/reminder-rules.ts` (type extended to match),
`src/client/components/Garage.tsx` (render the two large stats + progress bar; fetch
`averageFuelEconomy` alongside the existing `currentOdometer`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS — `remainingFraction` is computed
  server-side, inside the already-tested, already-division-guarded `computeReminderStatus`
  (its `remainingDays / rule.intervalDays` and `remainingDistance / rule.intervalDistance`
  divisions are pre-existing and already guarded by the surrounding null-checks — this plan adds no
  new division). `averageFuelEconomy` is likewise already server-computed (specs/013) — this feature
  only renders it more prominently, doesn't recompute it.
- **IV. No Interpolated Data**: PASS — both figures resolve to `null`/not-enough-data exactly when
  the existing computations already resolve to their own not-enough-data states; no new guess path
  is introduced anywhere.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — no new user-facing string
  beyond what already exists (`fuelEconomyNotEnoughData`, existing status-color convention);
  confirm no literal strings are added without a `t()` key during implementation.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/041-richer-garage-cards/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/db/repository.ts   # ReminderStatusResult + computeReminderStatus: add remainingFraction (extend)

src/client/
├── reminder-rules.ts          # ReminderRule type: add remainingFraction (extend)
└── components/Garage.tsx      # large odometer/economy stats + progress bar (extend)
```

**Structure Decision**: No new files — this rides entirely inside existing types/functions/
components. The server change is additive to an existing return shape; the client change is
additive to an existing component's rendering.

## Complexity Tracking

*No violations — section not applicable.*
