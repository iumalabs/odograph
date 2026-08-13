# Implementation Plan: Live Fuel Consumption & Cost Preview

**Branch**: `040-live-fuel-preview` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-live-fuel-preview/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A new read-only, non-persisting endpoint `GET /api/v1/vehicles/:vehicleId/fuel-preview` computes an
estimated fuel-economy figure (and, if a cost query param is present, a cost-per-distance figure)
from draft `odometerReading`/`volume`/`cost` values against the vehicle's most recent prior
(non-duplicate) fuel record — reusing the exact same division-safe formula
`listFuelRecordsWithEconomy` already uses for saved records. `FuelRecordPanel.tsx`'s create form
calls this endpoint with a short debounce as the owner types, and renders the result as a
dim/hint-styled preview near the inputs, distinct from the saved-record economy column. No new
persisted field, no schema change — the preview is pure request/response, discarded either way.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Hono on Cloudflare Workers (server), React 19
(client)

**Primary Dependencies**: Hono, D1 — no new dependency

**Storage**: D1 (read-only query against the existing `fuel_records`/`vehicles` tables) — no schema
change, nothing new persisted

**Testing**: Vitest + `@cloudflare/vitest-pool-workers` for the new endpoint (server-side unit
tests are the norm for every other aggregate endpoint in this codebase, e.g. `/aggregates`,
`/expense-breakdown`); no client-side test suite exists in this project — the debounced-fetch UI is
verified via code review and a `deno task dev` walkthrough, matching specs/033-039

**Target Platform**: Cloudflare Workers (server) + Browser PWA (client)

**Project Type**: Web application (touches both halves — a small server endpoint plus client wiring)

**Performance Goals**: N/A — a single indexed-by-vehicle read against records the vehicle already
owns; no different in cost from the existing `/aggregates` endpoint's own read

**Constraints**: Per constitution Principle II, the estimate MUST be computed server-side, not in
the browser — the client's role is only to gate *when* to ask (non-blank, parseable numbers) and to
debounce the asking, never to run the division itself. Every denominator (odometer delta, volume,
distance for cost/distance) MUST be guarded for `<= 0`, matching `computeFuelEconomy`'s existing
contract.

**Scale/Scope**: `src/server/db/repository.ts` (one new function reusing the existing
`computeFuelEconomy` and the existing "previous non-duplicate record by odometer" lookup),
`src/server/routes/v1/vehicles.ts` (one new GET route), `src/client/fuel-records.ts` or equivalent
client API wrapper (one new fetch function), `src/client/components/FuelRecordPanel.tsx` (debounced
call + preview rendering), `src/client/i18n/strings.ts` (preview labels)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS (by design, not by exception) — the
  feature's own GitHub issue described this as a "purely client-side" preview, which would have
  directly violated this principle (fuel economy is named explicitly as an example aggregate that
  MUST be server-computed). This plan corrects that: the estimate is computed server-side via the
  new endpoint, reusing the exact same guarded `computeFuelEconomy` function and the same
  "previous record by odometer reading" lookup already used for saved records. Every denominator is
  guarded for `<= 0` before dividing, matching the existing contract exactly — no new division-safety
  logic invented, no new failure mode introduced.
- **IV. No Interpolated Data**: PASS — the preview only ever surfaces a real computation from the
  owner's own typed values against a real prior record; when no valid prior record or no positive
  distance/volume exists, nothing is shown (FR-003), never a guessed figure.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — new preview labels route
  through `i18n/strings.ts` like every other user-facing string.
- **I. Tenant Isolation via Repository Layer**: PASS — the new endpoint reads through the same
  tenant-scoped repository pattern every other vehicle-scoped GET route already uses (`findVehicleById`
  tenant check before touching any vehicle-scoped data).

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/040-live-fuel-preview/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── db/repository.ts               # new computeFuelPreview() (extend)
└── routes/v1/vehicles.ts          # new GET /:vehicleId/fuel-preview route (extend)

src/client/
├── fuel-records.ts                 # new fetchFuelPreview() API wrapper (extend)
├── components/FuelRecordPanel.tsx  # debounced preview fetch + rendering (extend)
└── i18n/strings.ts                 # new preview labels (extend)
```

**Structure Decision**: Web application — this feature is a small full-stack slice (one read-only
server endpoint + client wiring to call it), following the exact same `/:vehicleId/<noun>` GET
convention as the existing `/aggregates` and `/expense-breakdown` endpoints in the same route file.
No new component files, no new client or server module beyond the one new repository function and
one new route.

## Complexity Tracking

*No violations — section not applicable.*
