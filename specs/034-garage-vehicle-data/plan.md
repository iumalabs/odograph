# Implementation Plan: Garage Cards Show Vehicle Data

**Branch**: `034-garage-vehicle-data` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/034-garage-vehicle-data/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add current odometer to the existing `VehicleAggregates` server response (one new field, computed
via the already-existing `getVehicleCurrentOdometer` helper, run in parallel with the aggregate's
existing queries), and reuse `DashboardView.tsx`'s exact per-vehicle
`Promise.all([aggregates, reminderRules])` client-fetch pattern in `Garage.tsx` to surface both the
odometer and a most-urgent-reminder indicator on each Garage card. No new route, no new entity.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Cloudflare Workers runtime

**Primary Dependencies**: Hono (server routing), React 19 (client), D1 — no new dependency

**Storage**: N/A — reads existing `service_records`/`fuel_records`/`reminder_rules` tables, no
schema change

**Testing**: Vitest against `wrangler`/Miniflare (extend `tests/server/vehicle-aggregates.test.ts` or
equivalent existing suite)

**Target Platform**: Cloudflare Workers (server), browser PWA (client)

**Project Type**: Web application (single Worker serving API + static client)

**Performance Goals**: N/A — one additional indexed-scope query per vehicle-aggregates request,
same cost class as the existing aggregate computation it rides alongside

**Constraints**: Must not change `GET /api/v1/vehicles/:vehicleId/aggregates`'s existing fields —
additive only, so `DashboardView.tsx`'s existing consumption of this same endpoint is unaffected

**Scale/Scope**: One server-side field addition, one client type addition, and additions to two
existing client files (`Garage.tsx`, `App.tsx`) — no new files beyond tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer**: PASS — `getVehicleCurrentOdometer` is already
  tenant-scoped; no new query path introduced.
- **II. Server-Computed, Division-Safe Aggregates**: PASS — the odometer figure is computed
  server-side (already was, for internal use); the client never computes it.
- **III. Idempotent, Ordered Offline Sync**: N/A — this is a read-only addition to an existing GET
  response; no write/queue behavior changes.
- **IV. No Interpolated Data**: PASS — a vehicle with no recorded odometer reading gets `null`, never
  a guessed value (FR-002); a failed per-vehicle fetch shows no data for that vehicle, never a stale
  or fabricated fallback (FR-006).
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — any new label routes
  through `src/client/i18n/strings.ts` like every other user-facing string.
- **X. Toolchain Discipline**: PASS — no new dependency.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/034-garage-vehicle-data/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
└── db/repository.ts                  # computeVehicleAggregates: add currentOdometer (extend)

src/client/
├── vehicle-aggregates.ts             # VehicleAggregates type: add currentOdometer (extend)
├── components/Garage.tsx             # per-vehicle fetch + card display (extend)
├── App.tsx                            # no change expected (Garage already receives `vehicles` as
│                                       # a prop; the new fetch is self-contained inside Garage.tsx,
│                                       # matching DashboardView.tsx's own self-contained fetch)
└── i18n/strings.ts                   # new labels (extend)

tests/server/
└── vehicle-aggregates.test.ts         # extend with currentOdometer coverage (or equivalent
                                        # existing test file covering this endpoint — confirm exact
                                        # filename during implementation)
```

**Structure Decision**: Pure extension of two already-established patterns: the aggregates endpoint
(`specs/013-vehicle-aggregates`-era) and `DashboardView.tsx`'s per-vehicle summary-fetch pattern
(reused verbatim in `Garage.tsx`, not reinvented). No new files beyond tests.

## Complexity Tracking

*No violations — section not applicable.*
