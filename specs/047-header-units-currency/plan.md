# Implementation Plan: Header Currency and Units Toggles

**Branch**: `047-header-units-currency` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/047-header-units-currency/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Two independent additions to `AppShell.tsx`'s header, both driven by preferences `App.tsx` already
manages or newly manages the same way: a currency pill (reusing the existing `useCurrency()` state
already threaded through the app, spec 035) with a dropdown, and a units pill toggling a new
`useDistanceUnit()` preference (`"km" | "mi"`, localStorage-backed, mirroring `useCurrency()`'s own
pattern). A new pure `src/client/distance.ts` module exposes `convertDistance(value, from, to)` —
an exact linear conversion, no rounding presented as precision. Five read-only display sites
(Garage's odometer stat, `DashboardView`'s reminder due-in distance text, `FuelRecordPanel`'s and
`ServiceRecordPanel`'s odometer table columns, `ReminderRulePanel`'s interval-summary text) convert
through it when a vehicle's own `odometerUnit` differs from the chosen display unit. Every
distance-related form input field is explicitly left alone — still labeled and validated against
each vehicle's own native unit.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — the currency preference already exists (specs/035); the new units preference is
client-only `localStorage`, same posture, no schema/API change; no distance value is ever
re-stored, only converted at render time

**Testing**: No client-side test suite exists in this project — the conversion function itself is a
small, pure, hand-verified formula (verified against the standard 1 km = 0.621371 mi constant);
overall behavior verified via code review and a `deno task dev` walkthrough, matching specs/033-046

**Target Platform**: Browser PWA (client only — no server changes)

**Project Type**: Web application (this feature touches only the client half)

**Performance Goals**: N/A — no new data fetching; conversion is an O(1) multiply at render time

**Constraints**: Per constitution Principle IV, the conversion factor MUST be a fixed, universal,
exact constant — never a fabricated or approximated-but-presented-as-exact value (spec.md FR-003).
Distance form inputs MUST NOT be touched by this feature (spec.md FR-004/SC-003) — protects data
entry correctness, since a value the owner types must always be interpreted in the vehicle's actual
stored unit. Fuel-economy/cost-per-distance conversion is explicitly out of scope (spec.md FR-006) —
converting those correctly needs a reciprocal (L/100km↔MPG), not linear, relationship and more
extensive per-call-site unit threading; deferred rather than risking a subtly wrong formula in this
already-large feature.

**Scale/Scope**: `src/client/distance.ts` (new — `useDistanceUnit()` hook + `convertDistance()`),
`src/client/components/AppShell.tsx` (currency dropdown pill + units toggle pill), `src/client/App.tsx`
(`useDistanceUnit()` call, threading `distanceUnit`/`onDistanceUnitChange` to `AppShell` at all 9
call sites, threading the resolved display value into Garage/DashboardView/FuelRecordPanel/
ServiceRecordPanel/ReminderRulePanel), those five components (accept the already-converted value or
a small helper), `src/client/i18n/strings.ts` (new labels: units pill text, currency dropdown
already has labels from specs/035)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: N/A — `convertDistance` is a pure
  multiplication by a fixed constant on an already-computed value, not a new aggregate/division; no
  interval, no records involved, same posture as the currency symbol swap (spec 035) already does
  client-side.
- **IV. No Interpolated Data**: PASS by construction — the conversion factor is the standard,
  universally-fixed km↔mi constant (0.621371 / 1.609344), never estimated; this is the crux of why
  fuel-economy conversion (a fundamentally different, reciprocal relationship, easy to get subtly
  wrong) is explicitly deferred rather than risked in this pass.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — new pill/label strings
  route through `strings.ts`; unit symbols themselves ("km"/"mi") are not translated strings (they're
  the vehicle's own stored unit value, already displayed as-is elsewhere in the app, e.g. Garage's
  existing unit chip).

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/047-header-units-currency/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── distance.ts                        # NEW: useDistanceUnit() + convertDistance()
├── i18n/strings.ts                    # units pill label, currency pill reuses existing labels (extend)
├── App.tsx                            # useDistanceUnit(), thread to AppShell + 5 display sites (extend)
├── components/AppShell.tsx            # currency dropdown pill + units toggle pill (extend)
├── components/Garage.tsx              # convert the odometer stat (extend)
├── components/DashboardView.tsx       # convert the reminder due-in distance text (extend)
├── components/FuelRecordPanel.tsx     # convert the odometer table column (extend)
├── components/ServiceRecordPanel.tsx  # convert the odometer table column (extend)
└── components/ReminderRulePanel.tsx   # convert intervalSummary's distance text (extend)
```

**Structure Decision**: One new small pure-logic module (`distance.ts`, mirroring `currency.ts`'s
existing shape exactly); every other change is additive to components that already exist and
already receive props from `App.tsx` — no new component files, no Context API (matches this
codebase's established convention).

## Complexity Tracking

*No violations — section not applicable.*
