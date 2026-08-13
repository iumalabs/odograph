# Tasks: Live Fuel Consumption & Cost Preview

**Input**: Design documents from `/specs/040-live-fuel-preview/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Server-side Vitest unit tests are the norm for every other aggregate endpoint in this
codebase (`/aggregates`, `/expense-breakdown`) — this feature follows suit. No client-side test
suite exists in this project; the debounced-fetch UI is verified manually via quickstart.md against
`deno task dev`, matching specs/033-039.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] LFP-001 `src/server/db/repository.ts`: add `computeFuelPreview(db, ctx, vehicleId,
      odometerReading, volume, cost)` — loads the vehicle's `odometerUnit`, finds the most recent
      non-duplicate (`duplicateOfId === null`) fuel record by highest `odometerReading` (same lookup
      `listFuelRecordsWithEconomy` already performs), computes `economy` via the existing
      `computeFuelEconomy` function against `odometerReading - <that record's odometerReading>` and
      `volume`, and `costPerDistance = cost / deltaDistance` when `cost` is a positive number and
      `deltaDistance > 0`, else `null` for either. Returns `{ economy: number | null,
      costPerDistance: number | null }`. Returns `{ economy: null, costPerDistance: null }` outright
      if the vehicle doesn't exist (caller already 404s before this is reached, per route pattern).
- [X] LFP-002 `src/server/routes/v1/vehicles.ts`: add `GET /:vehicleId/fuel-preview` — tenant-scoped
      `findVehicleById` 404 check (matching `/aggregates`'s exact pattern), validate
      `odometerReading`/`volume` as required finite numbers and `cost` as an optional finite number
      via `c.req.query(...)`, `400 invalid_request` on failure, otherwise call
      `computeFuelPreview` and `c.json(...)` the result. Not rate-limited (contracts/api.md).
- [X] LFP-003 `src/client/fuel-records.ts`: add `fetchFuelPreview(vehicleId, odometerReading,
      volume, cost)` — a thin `jsonFetch` wrapper around `GET /api/v1/vehicles/:id/fuel-preview`
      with the three query params (`cost` only appended when present), returning
      `{ economy: number | null, costPerDistance: number | null }`.
- [X] LFP-004 `src/client/i18n/strings.ts`: add `fuelEconomyPreviewLabel: "Est. economy"` and
      `fuelCostPerDistancePreviewLabel: "Est. cost/distance"`.

**Checkpoint**: New endpoint is independently callable/testable via curl; no UI wiring yet.

---

## Phase 3: User Story 1 - See estimated fuel economy while filling out a new fill-up (Priority: P1)

**Goal**: The create-fuel-record form shows a live, debounced economy estimate as the owner types.

- [X] LFP-005 [US1] `src/client/components/FuelRecordPanel.tsx`: add a `vehicleId: string` prop
      (threaded from `App.tsx`'s `selectedVehicleId`, non-null in the branch that renders this
      panel) and internal `preview` state (`{ economy: number | null; costPerDistance: number | null
      } | null`).
- [X] LFP-006 [US1] `src/client/components/FuelRecordPanel.tsx`: a `useEffect` keyed on
      `[vehicleId, odometerReading, volume, cost]` (the create-form's controlled prop values, not
      the edit-form's `draftX` state) that: does nothing (clears any pending preview) when
      `odometerReading`/`volume` don't parse as positive finite numbers client-side (a cheap
      non-blank/parseable gate only — the actual division-safety and comparison-against-history
      computation stays server-side per Principle II); otherwise debounces ~400ms, then calls
      `fetchFuelPreview`, guarded by a `cancelled` flag (App.tsx/DashboardView.tsx's established
      per-effect pattern) so a stale in-flight response never overwrites a newer one; on fetch
      failure (e.g. offline), leaves `preview` as `null` rather than throwing.
- [X] LFP-007 [US1] `src/client/components/FuelRecordPanel.tsx`: render the economy half of the
      preview (only when `preview?.economy != null`) near the odometer/volume inputs, styled as a
      dim/hint value distinct from the saved-record `fuelEconomy` column's accent styling — matching
      spec.md FR-006's "visibly distinguishable" requirement.

**Checkpoint**: Typing a valid odometer+volume combo for a vehicle with prior history shows a live
economy estimate; clearing volume or typing a non-positive delta makes it disappear; a vehicle with
no prior fuel record never shows a preview.

---

## Phase 4: User Story 2 - See estimated cost per distance alongside the economy preview (Priority: P2)

**Goal**: Add the cost-per-distance half of the same preview when a cost value is present.

- [X] LFP-008 [US2] `src/client/components/FuelRecordPanel.tsx`: render the cost-per-distance half
      of the preview (only when `preview?.costPerDistance != null`), formatted with the existing
      `currencySymbol` prop (matching `DashboardView.tsx`'s `formatCostFigure` convention), next to
      the economy figure from LFP-007.

**Checkpoint**: Typing a positive cost value alongside a valid economy preview adds a cost-per-
distance figure; leaving cost blank shows the economy figure alone, never a cost-per-distance
placeholder.

## Phase 5: Polish & Cross-Cutting

- [X] LFP-009 `tests/server/fuel-preview.test.ts` (new file, matching `vehicle-aggregates.test.ts`'s
      route-level `SELF.fetch` convention — this codebase tests aggregate logic through its HTTP
      route rather than calling repository.ts functions directly with a raw D1Database): covers
      economy matching the saved-record formula (km and mi), costPerDistance when cost is supplied,
      no-prior-record, non-positive-distance, zero-volume, cost-omitted, and semantic-duplicate
      exclusion from the prior-record lookup.
- [X] LFP-010 Same file: `400` for missing/non-numeric required params and a non-numeric optional
      `cost`, `404` for an unknown vehicle — the full contract from contracts/api.md.
- [X] LFP-011 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature.
- [X] LFP-012 Walk through quickstart.md's API scenarios (curl) and client scenarios end to end
      against `deno task dev`, plus the regression check (edit-form unaffected). Verified: valid
      preview (`economy:8`), with cost (`costPerDistance:0.12` = 60/500), no prior record (both
      null), non-positive distance (both null), zero volume (both null), missing param (400),
      unknown vehicle (404) — all match contracts/api.md exactly. The debounced-fetch UI itself
      (client-side React state/effect) is covered by typecheck + the full `deno task check` pass;
      the edit-form is structurally unaffected since the new `useEffect` only watches the
      create-form's controlled props, never `draftOdometerReading`/`draftVolume`/`draftCost`.

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the endpoint must exist and be
  callable before either UI behavior can be wired.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4 renders one more piece of
  data the same `preview` state (built in Phase 3) already carries; no new fetch, no new endpoint
  call.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That alone delivers the feature's core value (a live,
server-computed, division-safe economy estimate while filling out the form). Phase 4 (cost/distance)
is a small, independent addition to the same preview state that can ship in the same PR without
re-touching Phase 3's fetch/debounce logic.
