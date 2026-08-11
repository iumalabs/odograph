# Tasks: Maintenance History PDF Export

**Input**: Design documents from `/specs/027-pdf-export/` **Prerequisites**: plan.md, spec.md,
data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — `buildReportData` unit tests (the feature's actual correctness surface,
research.md), route-level integration tests (auth, cross-tenant, empty-vehicle, response headers).

## Phase 1: Setup

- [X] T001 Add `"pdf-lib": "npm:pdf-lib@^1.17.1"` to `deno.json`'s `imports` map (alphabetical
      position, matching the existing convention) and run `deno install`

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 In `src/server/db/repository.ts`, alongside `computeVehicleExpenseBreakdown`, add
      `getVehicleHistoryForReport(db, ctx, vehicleId)` per data-model.md: the identical
      `Promise.all([listServiceRecords(...), listFuelRecordsWithEconomy(...)])` +
      `duplicateOfId === null` filter shape, returning `{ services, fuels }` unaggregated
      (research.md — third occurrence of this shape, now worth naming once)
- [X] T003 [P] Create `src/server/reports/maintenance-history-report.ts`: the `ReportData`/
      `ReportServiceRow`/`ReportFuelRow` types (data-model.md) and the PURE function
      `buildReportData(vehicle, services, fuels): ReportData` — no `pdf-lib` import, no I/O;
      computes `vehicleSpec` (joined make/model/year, `null` if all three are unset),
      `generatedAt` (today, date-only string), maps each record to its row type (missing fields
      stay `null`, never fabricated), and sums `totalMaintenanceCost`/`totalFuelCost`/`totalCost`
      (a missing service-record cost contributes `0`, FR-008)

**Checkpoint**: `getVehicleHistoryForReport` and `buildReportData` exist, type-check, and are
directly unit-testable — no `pdf-lib` rendering or route wired yet.

---

## Phase 3: User Story 1 - An owner downloads a maintenance history report (P1) 🎯 MVP

**Goal**: End-to-end PDF download, correctly scoped, correctly excluding duplicates.

- [X] T004 [P] [US1] Create `src/server/reports/render-pdf.ts`: `renderReportPdf(data:
      ReportData): Promise<Uint8Array>` using `pdf-lib` — creates a `PDFDocument`, embeds a
      standard font, draws a header (vehicle name/spec, generated date), a service-records
      section and a fuel-records section (one line per row, "not provided" text for any `null`
      field), and a summary section (three totals); adds a new page when the running Y-position
      would overflow the current one (manual pagination, `pdf-lib` has no automatic flow layout);
      no business logic here — every value it draws comes pre-computed from `ReportData`
- [X] T005 [P] [US1] Create `tests/server/pdf-export.test.ts` (`buildReportData` unit section,
      no HTTP/D1 involved): 1. A vehicle with known make/model/year produces the joined
      `vehicleSpec`; one with none of the three produces `null`. 2. Service and fuel records map
      to rows with every provided field intact. 3. A record with a missing field (cost, station,
      fuel economy) maps to `null` in its row, never a fabricated value (FR-007). 4. Summary
      totals equal the hand-computed sums, with a missing service-record cost contributing `0`
      (FR-008, SC-004). 5. A duplicate-flagged record passed in is excluded (mirrors
      `computeVehicleExpenseBreakdown`'s existing filter — this test seeds already-filtered input,
      proving `buildReportData` itself does no re-filtering of its own, matching data-model.md's
      documented boundary: filtering happens once, in `getVehicleHistoryForReport`)
- [X] T005a [P] [US1] Extend `pdf-export.test.ts` (repository section, speckit-analyze finding
      C1): directly test `getVehicleHistoryForReport` against real D1 (mirrors how
      `vehicle-aggregates.test.ts` tests `computeVehicleExpenseBreakdown`): seed a service record
      and a same-date/same-description duplicate for a vehicle, call
      `getVehicleHistoryForReport`, and confirm the returned `services` array excludes the
      duplicate (FR-006) — precise, avoids relying on any downstream PDF-byte comparison
- [X] T006 [US1] Implement `GET /:vehicleId/report.pdf` in `src/server/routes/v1/vehicles.ts`
      (same not-a-new-mount-point convention every prior nested resource established): resolves
      `vehicleId` via `findVehicleById` first (`404` if not found/not yours, FR-002); calls
      `getVehicleHistoryForReport`, then `buildReportData`, then `renderReportPdf`; returns the
      bytes via `c.body()` with `Content-Type: application/pdf` and `Content-Disposition:
      attachment; filename="..."` (sanitized vehicle name), mirroring the existing attachment-
      download route's `c.body()` pattern (contracts/api.md); read-only, not rate-limited
- [X] T007 [P] [US1] Extend `pdf-export.test.ts` (route integration section): 1. Requesting the
      report for a vehicle with both service and fuel records returns `200`,
      `Content-Type: application/pdf`, a `Content-Disposition: attachment` header, and bytes
      starting with the `%PDF-` magic header (SC-001). Duplicate-exclusion correctness itself is
      already covered precisely at the repository layer (T005a) and the data-assembly layer
      (T005) — this section only proves the route wires them together into a valid response, not
      content correctness again (research.md; speckit-analyze finding C1 replaced the previous
      byte-length comparison here with T005a's direct assertion). 2. Requesting a different
      tenant's vehicle or a made-up id returns `404` identically for both (SC-003, FR-002).

**Checkpoint**: `deno task test` passes for the unit and route sections — this is the feature's
core value proof.

---

## Phase 4: User Story 2 - An owner sees an accurate cost summary (P2)

**Goal**: Already implemented by T003/T005 (`buildReportData`'s summary computation) — this phase
is validation-only, confirming the summary is correctly wired end to end through the route.

- [X] T008 [P] [US2] Extend `pdf-export.test.ts` (summary end-to-end section): seed a vehicle with
      service and fuel records of known costs (including one service record with no cost), request
      the report, and confirm — via a direct call to `buildReportData` on the same
      `getVehicleHistoryForReport` result the route itself would use — that the totals match a
      hand-computed sum (SC-004), closing the loop between the unit-level guarantee (T005) and the
      actual route's data flow.

**Checkpoint**: `deno task test` passes for the summary section.

---

## Phase 5: User Story 3 - An owner with no history still gets a valid report (P3)

**Goal**: The empty-vehicle case, guaranteed never to error.

- [X] T009 [P] [US3] Extend `pdf-export.test.ts` (empty-history section): 1. `buildReportData`
      called with empty `services`/`fuels` arrays produces `ReportData` with empty row arrays and
      all-zero totals, no error. 2. `renderReportPdf` on that empty `ReportData` still produces
      valid PDF bytes (`%PDF-` header) — confirms `pdf-lib`'s pagination logic in T004 doesn't
      assume at least one row exists. 3. `GET /:vehicleId/report.pdf` for a freshly-created
      vehicle with zero records returns `200` with a valid PDF, not an error (SC-005, FR-009).

**Checkpoint**: `deno task test` passes for the empty-history section.

---

## Phase 6: Client

- [X] T010 [P] In `src/client/vehicle-aggregates.ts`, add `reportDownloadUrl(vehicleId): string`
      — a plain URL builder, no `fetch()` (research.md — mirrors `attachmentDownloadUrl`'s
      existing pattern)
- [X] T011 Modify `src/client/App.tsx`: add a "Download report" link/button in the
      per-selected-vehicle section, pointing at `reportDownloadUrl(selectedVehicleId)` — a plain
      anchor tag relying on the response's `Content-Disposition` header for the browser's native
      download handling, no client-side blob/fetch logic; new UI string routed through the
      existing i18n infrastructure (constitution Principle IX)

## Phase 7: Polish & Cross-Cutting

- [X] T012 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [X] T013 Walk through quickstart.md end-to-end against `deno task dev`, opening the downloaded
      PDF in an actual viewer to visually confirm layout/pagination looks correct

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict — `pdf-lib` must be installed before
  `render-pdf.ts` (T004) can import it, though `buildReportData` (T003) itself needs no dependency.
- **Phase 2 (Foundational)** → **all user story phases**: strict.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)**: soft —
  Phase 4 and Phase 5 both extend the same test file and route, validating cases the Phase 3
  implementation already structurally handles (a missing-cost row, an empty-records vehicle) —
  no new production code beyond what T002/T003/T004/T006 already wrote.
- **Phase 6 (Client)** → after Phase 3 (needs the working route to link to).
- **Phase 7 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, T003 (`buildReportData`, pure, no dependency on `pdf-lib`) can proceed in parallel
with T002 (repository helper) — the two only need to agree on `ReportData`'s shape, already fixed
by data-model.md:

```text
T002     src/server/db/repository.ts — getVehicleHistoryForReport
T003 [P] src/server/reports/maintenance-history-report.ts — buildReportData (independent of T002)
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers "download a correct,
downloadable report" — this feature's entire point — with its actual correctness guarantees
(right records, right fallbacks, right sums) proven at the fast, pure-function `buildReportData`
layer (research.md), not by parsing generated PDF bytes. User Stories 2 and 3 (Phases 4-5) add no
new production code — they're validation passes confirming behavior the Phase 3 implementation
already structurally provides, scheduled after it rather than duplicating effort ahead of it.
