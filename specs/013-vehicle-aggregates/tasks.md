# Tasks: Server-Computed Per-Vehicle Aggregates

**Input**: Design documents from `/specs/013-vehicle-aggregates/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — division-safety edge cases for each of the three aggregates, their mutual
independence, duplicate-record exclusion, and the not-found-or-not-yours contract.

**Scope note**: No migration, no new dependency, no client/UI code — this feature is the backend
half of M6 only. The Dashboard UI that will call this endpoint (issue #17) is a separate, later
spec.

## Phase 1: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 In `src/server/db/repository.ts`: add the `VehicleAggregates` type
      (`{ costPerDistance: number | null; costPerTime: number | null; averageFuelEconomy: number
      | null }`)
      and a `computeVehicleAggregates(db, ctx, vehicleId)` stub that calls the existing
      `listServiceRecords(db, ctx, vehicleId)` and
      `listFuelRecordsWithEconomy(db, ctx,
      vehicleId)`, filters both to
      `duplicateOfId === null` (D-005), and returns
      `{ costPerDistance: null, costPerTime: null, averageFuelEconomy: null }` — computation itself
      lands in Phase 2/3
- [X] T002 [P] Add `GET /:vehicleId/aggregates` to `src/server/routes/v1/vehicles.ts`: resolve
      `vehicleId` via the existing `findVehicleById` (`404` if not found or not this tenant's, same
      contract as every other vehicle-nested route), then call T001's `computeVehicleAggregates` and
      return it as-is per contracts/api.md's response shape. Not rate-limited (read-only GET,
      matching every other `GET` in this file)

**Checkpoint**: The endpoint is reachable end-to-end and returns the correct `404` for a
missing/cross-tenant vehicle, and `200` with all three fields `null` for a valid vehicle — provable
before any real computation exists.

---

## Phase 2: User Story 1 - An owner sees what a vehicle costs to run (P1) 🎯 MVP

**Goal**: `costPerDistance` and `costPerTime` computed correctly from combined service + fuel record
data, independently null-guarded per research.md's table.

- [X] T003 [US1] In `computeVehicleAggregates` (`repository.ts`), implement `costPerDistance` and
      `costPerTime`: sum `cost` across the filtered service + fuel records (skipping any service
      record with a `null` cost); collect odometer-reading points (skipping `null` service-record
      readings) and record-date points across both types; guard each denominator per research.md's
      table (`< 2` qualifying points, or a `<= 0` span, yields `null` for that aggregate
      specifically, independent of the other)
- [X] T004 [P] [US1] Create `tests/server/vehicle-aggregates.test.ts` (cost-aggregate section): 1. A
      vehicle with one fuel and one service record at different odometer readings/dates produces a
      `costPerDistance`/`costPerTime` reflecting the _combined_ cost of both. 2. A vehicle with zero
      records returns `200` with both `null`. 3. A vehicle with exactly one qualifying record
      returns `null` for both (no span). 4. Two records at the identical odometer reading don't
      widen the distance span; two records on the identical date don't widen the time span. 5. A
      cost-flagged duplicate fuel or service record is excluded from the total (compare the
      aggregate before/after creating a record that gets flagged). 6. A service record with a `null`
      cost or `null` odometer reading is skipped from the relevant sum/span without erroring. 7.
      Deleting a record that contributed to the span/total causes the very next fetch to reflect its
      removal (e.g. deleting the higher-odometer record narrows or nulls `costPerDistance`, per
      SC-004's "added or deleted" freshness guarantee). 8. Requesting aggregates for a nonexistent
      vehicle id, and separately for another tenant's vehicle, both return `404` indistinguishably

**Checkpoint**: `deno task test` passes for the cost-aggregate section — the feature's core "what
does this vehicle cost" value is provable end-to-end.

---

## Phase 3: User Story 2 - An owner sees a vehicle's overall fuel economy (P2)

**Goal**: `averageFuelEconomy` computed as the mean of existing per-record fuel-economy values,
independent of whether `costPerDistance`/`costPerTime` could compute.

- [X] T005 [US2] In `computeVehicleAggregates` (`repository.ts`), implement `averageFuelEconomy`:
      the mean of the filtered fuel records' own `fuelEconomy` values that are themselves non-null;
      `null` if that set is empty
- [X] T006 [P] [US2] Extend `vehicle-aggregates.test.ts` (fuel-economy section): 1. A vehicle with
      two or more fuel records that each have a computable per-record economy produces
      `averageFuelEconomy` equal to their mean. 2. A vehicle with fuel records but no computable
      per-record economy yet (one fuel record, or all at the same odometer reading) returns
      `null`. 3. A vehicle with service records only (zero fuel records) returns `null` for
      `averageFuelEconomy` while `costPerDistance`/`costPerTime` still compute normally from the
      service data alone — proving the three aggregates are independent

**Checkpoint**: `deno task test` passes for the full test file — all three aggregates are
independently correct and null-safe.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T007 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] T008 Walk through quickstart.md end-to-end against `deno task dev` (or a real preview deploy),
      using the dev-session bootstrap route to seed a vehicle with a mix of service and fuel
      records, including a semantically-duplicate one, and confirm every step's expected response

## Dependencies

- **Phase 1 (Foundational)** → **all user story phases**: strict — both aggregates read through the
  same `computeVehicleAggregates` function and the same route.
- **User Story 1 (Phase 2)** → **User Story 2 (Phase 3)**: soft — both extend the same function and
  test file, but `averageFuelEconomy`'s computation doesn't depend on
  `costPerDistance`/`costPerTime`'s; they could be implemented in either order or in parallel by two
  people, at the cost of a merge conflict in the same function body.
- **Phase 4 (Polish)**: after everything else.

## Parallel execution examples

Once Phase 1 lands, the test-file tasks for each user story are independent of the route file:

```text
T004 [P] tests/server/vehicle-aggregates.test.ts (cost-aggregate section)
T006 [P] tests/server/vehicle-aggregates.test.ts (fuel-economy section, appended after T004)
```

T002 (route wiring) has no dependency on T003/T005's actual computation logic — it can be
implemented and tested against the T001 stub (which already returns a well-formed all-`null`
response) in parallel with either user story's computation work.

## Implementation strategy

**MVP = Phase 1 + Phase 2 (User Story 1).** `costPerDistance`/`costPerTime` alone already answer
this feature's primary question ("what does this vehicle cost me") and are P1; User Story 2
(`averageFuelEconomy`) is a P2 addition to the same response that rounds out the three aggregates
the constitution names, but the endpoint is genuinely useful — and independently demoable — after
Phase 2 alone.
