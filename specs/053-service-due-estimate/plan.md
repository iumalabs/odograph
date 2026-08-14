# Implementation Plan: History-Based Service Due Estimate

**Branch**: `053-service-due-estimate` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/053-service-due-estimate/spec.md`

## Summary

The service-entry form should show an estimated next-due odometer reading for recurring
maintenance work, computed from the vehicle's own service-record history (two or more records
sharing the same description), and let the owner turn that estimate into a real `reminder_rules`
entry with one action. Follows the exact precedent already shipped for the fuel-entry form's live
preview (specs/040): a pure, server-computed `GET` endpoint the client polls/reads, since
Constitution Principle II forbids computing aggregates client-side. The accept action is a new
`POST` that reuses the existing reminder-rule creation path and the existing idempotency
middleware (mirrors specs/049's mark-done flow).

## Technical Context

**Language/Version**: TypeScript 5.9, targeting `workerd` (server) and browsers (client SPA).

**Primary Dependencies**: Hono 4.13 (API, versioned under `/api/v1`), React 19 (client SPA, Vite
build), D1 (`odograph-preview`/production databases) via the existing repository layer in
`src/server/db/repository.ts`.

**Storage**: D1. No schema changes — reads existing `service_records` and `reminder_rules` tables;
the accept action writes a `reminder_rules` row via the existing insert path, no new columns.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers`, integration-style against a real D1
test database (`tests/server/*.test.ts`) — matches the project's existing convention of testing
server logic through the actual Hono routes, not framework-agnostic unit tests. No separate
frontend test suite exists in this repo; the client-side hint/button is verified manually via
`deno task dev`, consistent with other small UI additions in this codebase.

**Target Platform**: Cloudflare Workers (API) + React SPA served as Workers Static Assets (PWA).

**Project Type**: Web application (existing single-repo `src/server/` + `src/client/` structure).

**Performance Goals**: No new goals — this computes over one vehicle's own service-record rows
(bounded, small per-tenant dataset), same cost class as the existing fuel-preview and aggregates
endpoints it mirrors.

**Constraints**: Constitution Principle II (server-computed aggregates only — no client-side
math); Principle IV (no fabricated data — estimate must be clearly labeled, never shown with
fewer than 2 data points); Principle I (tenant isolation via the repository layer, `:vehicleId`
resolved and ownership-checked before any computation, matching every other vehicle-nested route).

**Scale/Scope**: One new read-only `GET` endpoint + repository function, one new `POST` accept
endpoint + repository function, one small UI addition to the existing service-entry form
(`ServiceRecordPanel.tsx`). No new screens, no new entities, no schema migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS. Both new endpoints resolve `:vehicleId`
  via the existing `findVehicleById(db, tenant, vehicleId)` ownership check before doing anything
  else (identical to `/fuel-preview` and every other vehicle-nested route); the new repository
  functions accept `TenantContext` and scope every query by it, same as the rest of
  `repository.ts`.
- **II. Server-Computed, Division-Safe Aggregates** — PASS by design: the estimate (an average
  interval, essentially a derived aggregate) is computed entirely in a new repository function
  and returned by a `GET` route; the client only renders what the server returns. The "≥2 usable,
  non-zero-interval records" rule (spec FR-003) is this feature's version of the
  zero-denominator guard Principle II requires.
- **III. Idempotent, Ordered Offline Sync** — PASS. The accept action (`POST`, a real write) goes
  through the existing `idempotent` middleware, same as every other write route
  (`plan-cards.ts`, mark-done). No new idempotency mechanism needed.
- **IV. No Interpolated Data** — PASS by design: FR-003/FR-005/FR-011 exist specifically to
  satisfy this — no estimate below the 2-record threshold, always labeled as computed, never
  written anywhere until explicitly accepted.
- **V–VIII, X–XII** — N/A. No file storage, no new auth surface, no schema/erasure question (no
  new table), no new tooling, no deploy-path change.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS, must be honored during
  implementation: the estimate's label/hint text goes through the existing i18n infrastructure
  (`src/client/i18n`), same as every other user-facing string in `ServiceRecordPanel.tsx` — no
  hardcoded strings at the usage site.

No violations. Complexity Tracking section not needed.

**Post-Phase-1 re-check**: data-model.md, contracts/api.md, and quickstart.md introduced nothing
that changes the above — no new table, no new auth surface, all computation server-side, the
accept write path reuses `createReminderRule` and the existing `idempotent` middleware unchanged.
Still no violations.

## Project Structure

### Documentation (this feature)

```text
specs/053-service-due-estimate/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts        # + computeServiceDueEstimate(), + acceptServiceDueEstimate()
└── routes/v1/
    └── vehicles.ts           # + GET  /:vehicleId/service-due-estimate
                                # + POST /:vehicleId/service-due-estimate/accept

src/client/
└── components/
    └── ServiceRecordPanel.tsx  # + estimate hint + accept button, wired to the two new routes

tests/server/
└── service-due-estimate.test.ts   # new — mirrors fuel-preview.test.ts / plan-card-crud.test.ts
```

**Structure Decision**: No new top-level structure — this slots directly into the existing web
application layout (`src/server/`, `src/client/`, `tests/server/`), following the exact file
placement of the fuel-preview feature (specs/040) it mirrors.

## Complexity Tracking

*No Constitution Check violations — section not applicable.*
