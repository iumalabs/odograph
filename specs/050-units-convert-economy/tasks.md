# Tasks: Units Toggle Converts Fuel Economy

**Input**: Design documents from `specs/050-units-convert-economy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included — this is a server-computed aggregate change (constitution Principle II), and
this codebase's established convention (specs 040/047/049) is to extend the same route-level test
files with new cases rather than add a separate test phase.

There is a single user story (US1, P2) — no Setup/Foundational split needed; every task below is
required for that one story.

## Phase 1: User Story 1 - See fuel economy in the header's chosen unit system (Priority: P2)

**Goal**: Every fuel-economy figure (Garage stat, Dashboard chip, fuel-record table column, live
fuel-form preview) reflects the header's units toggle, computed server-side from raw values —
never a reciprocal rescale of an already-computed number.

**Independent Test**: quickstart.md steps 1-8 — a vehicle with fuel history, queried via `?unit=`
in both directions, produces correctly-converted (not naively-rescaled) economy figures, with
`?unit=` omitted or matching the vehicle's native unit staying byte-identical to today.

- [ ] T001 [US1] Add `convertDistance`/`convertVolume` private helpers and
      `computeFuelEconomyForDisplay(nativeUnit, displayUnit, deltaDistance, volume)` to
      `src/server/db/repository.ts`, next to the existing `computeFuelEconomy` (per research.md's
      convert-then-recompute decision; reuses `computeFuelEconomy` unchanged, never a second
      formula).
- [ ] T002 [US1] Extend `listFuelRecordsWithEconomy(db, ctx, vehicleId, displayUnit?)` in
      `src/server/db/repository.ts` to call `computeFuelEconomyForDisplay` with
      `displayUnit ?? vehicle.odometerUnit` (depends on T001).
- [ ] T003 [US1] Extend `computeVehicleAggregates(db, ctx, vehicleId, displayUnit?)` in
      `src/server/db/repository.ts` to pass `displayUnit` through to its
      `listFuelRecordsWithEconomy` call, so `averageFuelEconomy` averages already-converted
      per-record values (depends on T002).
- [ ] T004 [US1] Extend `computeFuelPreview(db, ctx, vehicleId, odometerReading, volume, cost,
      displayUnit?)` in `src/server/db/repository.ts` to call `computeFuelEconomyForDisplay`
      instead of `computeFuelEconomy` directly (depends on T001).
- [ ] T005 [P] [US1] Add optional `?unit=km|mi` query parsing (400 on an unrecognized non-empty
      value, matching `EXPENSE_GROUP_BY_VALUES`'s pattern) to `GET /:vehicleId/fuel-records` in
      `src/server/routes/v1/vehicles.ts` (depends on T002).
- [ ] T006 [P] [US1] Same `?unit=` parsing for `GET /:vehicleId/aggregates` in
      `src/server/routes/v1/vehicles.ts` (depends on T003).
- [ ] T007 [P] [US1] Same `?unit=` parsing for `GET /:vehicleId/fuel-preview` in
      `src/server/routes/v1/vehicles.ts` (depends on T004).
- [ ] T008 [P] [US1] Add a `unit?: DistanceUnit` param to `getVehicleAggregates` in
      `src/client/vehicle-aggregates.ts`, appended as `?unit=` when provided (depends on T006).
- [ ] T009 [P] [US1] Add a `unit?: DistanceUnit` param to `listFuelRecords` and `fetchFuelPreview`
      in `src/client/fuel-records.ts`, appended as `?unit=`/`&unit=` when provided (depends on
      T005, T007).
- [ ] T010 [US1] Pass `distanceUnit` into `getVehicleAggregates(vehicle.id, distanceUnit)` in
      `src/client/components/Garage.tsx` (depends on T008).
- [ ] T011 [US1] Pass `distanceUnit` into `getVehicleAggregates(vehicle.id, distanceUnit)` and
      `listFuelRecords(vehicle.id, distanceUnit)` in `src/client/components/DashboardView.tsx`
      (depends on T008, T009).
- [ ] T012 [US1] Pass `distanceUnit` into `fetchFuelPreview(...)`'s new param and thread it into
      whichever call lists fuel records for the table in
      `src/client/components/FuelRecordPanel.tsx` (depends on T009).
- [ ] T013 [US1] Extend `tests/server/vehicle-aggregates.test.ts` with `?unit=mi` cases for
      `averageFuelEconomy` (converted mean, not a reciprocal of the native mean) and a same-unit
      case matching FR-003 (depends on T003, T006).
- [ ] T014 [US1] Extend `tests/server/fuel-record-crud.test.ts` (or equivalent) with `?unit=mi`
      cases for `GET /fuel-records`'s per-record `fuelEconomy` (depends on T002, T005).
- [ ] T015 [US1] Extend `tests/server/fuel-preview.test.ts` with a `?unit=mi` case for `economy`
      (depends on T004, T007).
- [ ] T016 [US1] Run quickstart.md's manual verification against `deno task dev` (both the API
      calls and, if the dev server can be exercised in a browser, the four display sites) (depends
      on T001-T015).

**Checkpoint**: All fuel-economy figures respect the header's units toggle; `deno task check`
passes; quickstart.md scenarios all confirmed by hand.

## Dependencies & Execution Order

- T001 blocks T002, T003 (via T002), T004.
- T002 blocks T005, T013 (via T003), T014.
- T003 blocks T006, T013.
- T004 blocks T007, T015.
- T005/T006/T007 (routes) can run in parallel once their respective repository functions are done.
- T008/T009 (client wrappers) depend on the matching route(s); can run in parallel with each other.
- T010/T011/T012 (components) depend on their matching client wrapper(s); T011/T012 touch
  different files so can run in parallel with each other and with T010.
- T013/T014/T015 (tests) depend on their matching server-side implementation task, not on the
  client tasks — can run in parallel with T008-T012.
- T016 is last — depends on everything.

## Implementation Strategy

Single-story feature — implement server-side (T001-T007) first and verify with the new tests
(T013-T015) before wiring the client (T008-T012), since the client change is purely "pass one more
already-available prop/param through" once the server contract exists.
