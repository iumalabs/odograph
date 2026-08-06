# Implementation Plan: Server-Computed Per-Vehicle Aggregates

**Branch**: `013-vehicle-aggregates` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-vehicle-aggregates/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A new read-only, vehicle-scoped endpoint returning three server-computed aggregates —
`costPerDistance`, `costPerTime`, `averageFuelEconomy` — derived at request time from a vehicle's
non-duplicate-flagged service and fuel records. No new table: everything is computed from data
`vehicles`, `service_records`, and `fuel_records` already store. The one genuinely new piece is
the aggregate-computation function itself, which extends the exact division-safety discipline
`computeFuelEconomy` (spec 009) already established in this codebase.

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers; React 19/Vite client) — same as
the existing server/client split. This feature is backend-only (no client changes).

**Primary Dependencies**: None new.

**Storage**: D1 — reads only, from the existing `vehicles`, `service_records`, and `fuel_records`
tables (migrations 0006-0008). No new table, no new column, no migration.

**Testing**: `deno task test` (vitest) — repository-layer unit coverage for the aggregate
computation's division-safety edge cases (zero records, one record, same-odometer records,
same-date records, duplicate-flagged records), plus route-layer coverage for tenant isolation and
the not-found-or-not-yours contract, mirroring `fuel-record-crud.test.ts`'s structure.

**Target Platform**: Cloudflare Workers (`workerd`) API only — no new client screen, no new Worker
entry point.

**Project Type**: Web application (existing structure) — this slice touches only the API layer.

**Performance Goals**: One aggregate computation per request, over one vehicle's own records —
bounded by that vehicle's own record count, no cross-vehicle or cross-tenant scan. No pagination
needed at this scale (same reasoning as every other per-vehicle list endpoint already in this
codebase).

**Constraints**: Every denominator (distance span, time span, fuel-record count) MUST be checked
for `<= 0` (or empty) before dividing, yielding `null` rather than `Infinity`/`NaN`/an error
(constitution Principle II, FR-005). Duplicate-flagged records MUST be excluded from every sum,
minimum, and maximum (FR-007).

**Scale/Scope**: 1 new repository function (`computeVehicleAggregates`), 1 new route
(`GET /:vehicleId/aggregates`), 0 new tables, 0 new client code.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: the new repository function takes a
  `TenantContext` and scopes every query by `tenant_id`, matching every existing function; the
  route calls `findVehicleById` first (same pattern as every other vehicle-nested route) so a
  vehicle belonging to a different tenant is refused before the aggregate function ever runs.
- **II. Server-Computed, Division-Safe Aggregates** — this is the central concern of the whole
  feature: `costPerDistance`, `costPerTime`, and `averageFuelEconomy` are each independently
  guarded against a zero/undefined denominator, exactly the principle this feature exists to
  extend (spec.md FR-005).
- **III. Idempotent, Ordered Offline Sync** — N/A, read-only endpoint, no writes.
- **IV. No Interpolated Data** — PASS: a denominator that can't support a real answer yields
  `null`, never an estimated or interpolated figure (FR-005/FR-006).
- **V. Private Object Storage with Validated Uploads** — N/A, no attachments involved.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: the new route sits behind the same
  session-authenticated `tenantContext` middleware every other vehicle-nested route already uses;
  it's a read, so no rate limiting is added (consistent with the existing GET routes in
  `vehicles.ts`, which are unrated the same way).
- **VIII. GDPR Erasure by Design** — N/A: no new table, no new stored data. This feature reads
  existing `service_records`/`fuel_records` rows whose own erasure behavior was already decided
  when those tables shipped (specs 007/009); nothing new to decide here.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — N/A: no user-facing strings
  in this feature (no UI ships with it).
- **X. Toolchain Discipline** — PASS: no new dependencies.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change; ships through the
  existing CI/preview/production pipeline unchanged.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/013-vehicle-aggregates/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/api.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── db/repository.ts        # extended: computeVehicleAggregates(db, ctx, vehicleId) — pure
│                             # aggregation over existing listServiceRecords/
│                             # listFuelRecordsWithEconomy results, no new SQL table
└── routes/v1/
    └── vehicles.ts          # extended: GET /:vehicleId/aggregates (findVehicleById guard,
                              # same not-found-or-not-yours contract as every other nested route)

tests/server/
└── vehicle-aggregates.test.ts   # new: division-safety edge cases (zero/one/duplicate-only
                                   # records, same-odometer, same-date), tenant isolation,
                                   # not-found-or-not-yours
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level
directories, no new table, no client changes. This feature adds exactly one repository function
and one route, following the same vehicle-nested-resource shape every prior record feature
(specs 006/007/009/011) already established, scoped down to backend-only since the Dashboard UI
that will call this endpoint is issue #17's own later spec.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
