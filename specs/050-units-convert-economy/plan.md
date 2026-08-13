# Implementation Plan: Units Toggle Converts Fuel Economy

**Branch**: `050-units-convert-economy` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/050-units-convert-economy/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`src/server/db/repository.ts` gains two small private conversion helpers (`convertDistance`,
`convertVolume` — server-side counterparts to `src/client/distance.ts`'s client-only
`convertDistance`, since the server has no existing cross-import from client code) and a
`computeFuelEconomyForDisplay(nativeUnit, displayUnit, deltaDistance, volume)` function that
converts both legs into the target unit system and reuses the existing, already-tested
`computeFuelEconomy` — never reciprocally rescaling an already-computed ratio. `listFuelRecordsWithEconomy`,
`computeVehicleAggregates`, and `computeFuelPreview` each gain an optional `displayUnit` parameter
(defaulting to the vehicle's own native unit, preserving today's exact behavior when omitted), and
their three routes gain a matching optional `?unit=km|mi` query parameter. The four client display
sites (Garage, Dashboard, fuel-record table, live fuel preview) pass their already-existing
`distanceUnit` header preference through to these calls.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Hono on Cloudflare Workers (server), React 19
(client)

**Primary Dependencies**: Hono, D1 — no new dependency

**Storage**: N/A — no schema change; the conversion happens at read time on values already read

**Testing**: Extend the existing route-level tests (`tests/server/vehicle-aggregates.test.ts`,
`tests/server/fuel-record-crud.test.ts`, `tests/server/fuel-preview.test.ts`) with `?unit=` cases,
matching each file's own established convention.

**Target Platform**: Cloudflare Workers (server) + Browser PWA (client)

**Project Type**: Web application (small server extension + client wiring across 3 endpoints)

**Performance Goals**: N/A — same reads already performed, just a cheap arithmetic conversion
applied to already-fetched rows

**Constraints**: Per constitution Principle II, the conversion MUST stay server-side and MUST
reuse the existing division-safe `computeFuelEconomy` rather than inventing a second formula
(spec.md FR-002) — `computeFuelEconomyForDisplay` converts inputs, then delegates, so it inherits
the exact same `deltaDistance <= 0` guard for free. `computeVehicleAggregates`'s `averageFuelEconomy`
specifically must average the *already-display-unit* per-record economies, not reciprocally convert
the final native-unit average — those are mathematically different (average-of-reciprocals ≠
reciprocal-of-average), and only the former matches FR-002/SC-002.

**Scale/Scope**: `src/server/db/repository.ts` (2 new helpers + 1 new function +
`listFuelRecordsWithEconomy`/`computeVehicleAggregates`/`computeFuelPreview` extended),
`src/server/routes/v1/vehicles.ts` (3 routes accept an optional `?unit=` query param),
`src/client/vehicle-aggregates.ts`/`fuel-records.ts` (fetch wrappers pass `distanceUnit` through),
`src/client/components/Garage.tsx`/`DashboardView.tsx`/`FuelRecordPanel.tsx` (pass their existing
`distanceUnit` prop into the fetch calls instead of just using it for the odometer conversion
already shipped)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS — `computeFuelEconomyForDisplay` performs
  no new division of its own; it converts inputs (a multiply, never a division) and delegates the
  actual division to the existing, already-guarded `computeFuelEconomy`.
- **IV. No Interpolated Data**: PASS — a not-enough-data case (no prior record, non-positive delta,
  zero volume) stays not-enough-data in every unit system; converting `null` never produces a
  number.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: N/A — no new user-facing string;
  reuses the existing `fuelEconomyNotEnoughData`/economy-figure rendering already in place.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/050-units-convert-economy/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── db/repository.ts               # convertDistance/convertVolume/computeFuelEconomyForDisplay (new); listFuelRecordsWithEconomy/computeVehicleAggregates/computeFuelPreview (extend)
└── routes/v1/vehicles.ts          # 3 routes accept optional ?unit= (extend)

src/client/
├── vehicle-aggregates.ts          # getVehicleAggregates accepts a unit param (extend)
├── fuel-records.ts                # listFuelRecords + fetchFuelPreview accept a unit param (extend)
└── components/
    ├── Garage.tsx                 # pass distanceUnit into getVehicleAggregates (extend)
    ├── DashboardView.tsx          # pass distanceUnit into getVehicleAggregates (extend)
    └── FuelRecordPanel.tsx        # pass distanceUnit into listFuelRecords + fetchFuelPreview (extend)
```

**Structure Decision**: No new files — every change extends an already-shipped function/route/
component along an existing, well-understood seam (specs 040/041/047 all touch this exact code).

## Complexity Tracking

*No violations — section not applicable.*
