# Phase 1 Data Model: Maintenance History PDF Export

## Entities

No new table or column — this feature reads existing `service_records`/`fuel_records` (specs/007/
009) and generates a document that is never persisted. No GDPR erasure decision needed.

### `ReportData` (in-memory shape, pure output of `buildReportData`)

| Field                  | Type                        | Notes                                                       |
| ------------------------ | ---------------------------- | ---------------------------------------------------------- |
| `vehicleName`             | string                       | FR-003                                                       |
| `vehicleSpec`              | string \| null               | `"make model year"` joined from whatever's known, `null` if all three are unset (FR-003) |
| `generatedAt`               | string                       | ISO 8601 date-only, computed at request time (FR-003)         |
| `serviceRows`                | `ReportServiceRow[]`          | Chronological (FR-004), duplicate-excluded (FR-006)            |
| `fuelRows`                    | `ReportFuelRow[]`              | Chronological (FR-005), duplicate-excluded (FR-006)              |
| `totalMaintenanceCost`          | number                          | Sum of `serviceRows[].cost`, missing cost counted as 0 (FR-008)   |
| `totalFuelCost`                   | number                            | Sum of `fuelRows[].cost` (fuel cost is never null — repository.ts, `fuel_records.cost` is `NOT NULL`) |
| `totalCost`                         | number                              | `totalMaintenanceCost + totalFuelCost`                              |

### `ReportServiceRow`

| Field             | Type              | Notes                                          |
| ------------------- | ------------------ | ------------------------------------------------- |
| `date`                | string              | `service_date`                                     |
| `description`           | string                | Always present (required field on the record itself) |
| `odometerReading`         | number \| null        | Rendered as "not provided" when `null` (FR-007)         |
| `cost`                      | number \| null          | Rendered as "not provided" when `null` (FR-007)            |

### `ReportFuelRow`

| Field             | Type              | Notes                                                |
| ------------------- | ------------------ | ------------------------------------------------------- |
| `date`                | string              | `fuel_date`                                              |
| `station`               | string \| null        | Rendered as "not provided" when `null`                     |
| `volume`                  | number                  | Always present (required field)                              |
| `cost`                      | number                    | Always present (required field, never null)                     |
| `odometerReading`             | number                      | Always present (required field for fuel records)                   |
| `fuelEconomy`                    | number \| null                | Rendered as "not provided" when `null` (e.g. the vehicle's first fill-up, nothing to compare against) |

## Validation / behavior rules (from Functional Requirements)

- `buildReportData` never invents `vehicleSpec`, `odometerReading`, `cost`, `station`, or
  `fuelEconomy` — each is either the record's own value or explicitly `null`, and rendering maps
  `null` to a literal "not provided" string, never a blank or a guessed figure (FR-007).
- `totalMaintenanceCost`/`totalFuelCost` sum only `serviceRows`/`fuelRows` — i.e. only records
  already resolved as belonging to this vehicle's own tenant and not flagged as a duplicate
  (FR-006, FR-008); a service record with `cost === null` contributes `0`, matching
  `computeVehicleExpenseBreakdown`'s identical rule (specs/026).
- `serviceRows`/`fuelRows` are both empty for a vehicle with no qualifying records — `renderReportPdf`
  MUST still produce a valid document, with a visible "no recorded history yet" note rather than an
  empty or malformed page (FR-009).
- The route resolving `vehicleId` MUST confirm it belongs to `ctx.tenantId` (via the existing
  `findVehicleById`) before any report data is fetched or generated — refused identically to a
  nonexistent vehicle otherwise (FR-002).

## Repository layer addition (shape, not full implementation)

Lives in `src/server/db/repository.ts`, alongside `computeVehicleAggregates`/
`computeVehicleExpenseBreakdown`.

```text
function getVehicleHistoryForReport(
  db: D1Database, ctx: TenantContext, vehicleId: string,
): Promise<{ services: ServiceRecord[]; fuels: FuelRecord[] }>
// Promise.all([listServiceRecords(...), listFuelRecordsWithEconomy(...)]), filtered to
// duplicateOfId === null — identical shape to computeVehicleExpenseBreakdown's own fetch, just
// returning the filtered lists unaggregated (research.md).
```

## Report generation modules (shape, not full implementation)

```text
// src/server/reports/maintenance-history-report.ts — PURE, no pdf-lib, no I/O
function buildReportData(
  vehicle: Vehicle, services: ServiceRecord[], fuels: FuelRecord[],
): ReportData

// src/server/reports/render-pdf.ts — pdf-lib layout/pagination only, no business logic
function renderReportPdf(data: ReportData): Promise<Uint8Array>
```
