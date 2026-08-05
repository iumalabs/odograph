# Phase 1 Data Model: Fuel Record CRUD + Attachments

## `fuel_records`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `tenant_id` | TEXT | `REFERENCES tenants(id) ON DELETE CASCADE` |
| `vehicle_id` | TEXT | `REFERENCES vehicles(id) ON DELETE CASCADE` |
| `fuel_date` | TEXT | required (FR-001) |
| `odometer_reading` | INTEGER | required — unlike service records, always required here since
  economy can't be computed without it (FR-001/FR-007) |
| `volume` | REAL | required (FR-001); unit implied by the vehicle's `odometerUnit`, per
  research.md — not stored per-record |
| `cost` | REAL | required (FR-001); zero accepted as entered (spec.md Edge Cases) |
| `station` | TEXT nullable | optional (FR-001) |
| `notes` | TEXT nullable | optional (FR-001) |
| `created_at` / `updated_at` | TEXT | ISO 8601, same convention as `service_records` |

**GDPR erasure**: Delete, cascading from `vehicles` — same decision and rationale as
`service_records` (spec 007 data-model.md): no independent retention value once the owning
vehicle is gone.

**No `fuel_economy` column** — computed at read time from the ordered set of a vehicle's fuel
records (research.md), never persisted (FR-008).

Indexes: `idx_fuel_records_vehicle_id (vehicle_id)`, `idx_fuel_records_tenant_id (tenant_id)` —
same shape as `service_records`' indexes.

## `fuel_record_attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `tenant_id` | TEXT | `REFERENCES tenants(id) ON DELETE CASCADE` |
| `fuel_record_id` | TEXT | `REFERENCES fuel_records(id) ON DELETE CASCADE` |
| `r2_key` | TEXT | internal, never returned to the client |
| `content_type` | TEXT | sniffed type, not the declared upload header |
| `size` | INTEGER | |
| `created_at` | TEXT | |

Identical shape and GDPR erasure decision to `service_record_attachments` (spec 007). R2 objects
are never cleaned up by the D1 cascade — every deletion path (fuel-record delete, and the
vehicle-delete retrofit) must explicitly delete the matching R2 objects (FR-006/FR-012).

Index: `idx_fuel_record_attachments_fuel_record_id (fuel_record_id)`.

## Repository layer additions (`src/server/db/repository.ts`)

- `createFuelRecord(db, ctx, vehicleId, input)` — same bootstrap shape as `createServiceRecord`;
  caller has already resolved `vehicleId` belongs to `ctx.tenantId`.
- `listFuelRecordsWithEconomy(db, ctx, vehicleId): Promise<(FuelRecord & { fuelEconomy: number | null })[]>`
  — the one function that isn't a direct service-record mirror: fetches all of a vehicle's fuel
  records ordered by `odometer_reading ASC, created_at ASC`, walks the list computing each
  record's economy per research.md's formulas, returns the full annotated list.
- `findFuelRecordById(db, ctx, id): Promise<(FuelRecord & { fuelEconomy: number | null }) | null>`
  — resolves the record's `vehicleId` first, calls `listFuelRecordsWithEconomy` for that vehicle,
  and returns the matching entry (or `null` under the same not-found-or-not-yours contract as
  `findServiceRecordById`) — ensures the detail endpoint's economy figure is always computed from
  the same whole-vehicle ordering as the list endpoint, never independently.
- `updateFuelRecord(db, ctx, id, patch)` — same partial-update pattern as `updateServiceRecord`.
- `deleteFuelRecord(db, ctx, id): Promise<string[] | null>` — same shape as `deleteServiceRecord`:
  returns the deleted record's attachments' R2 keys (queried before the D1 delete cascades),
  never touches R2 itself.
- `listAttachmentKeysForVehicleFuelRecords(db, ctx, vehicleId): Promise<string[]>` — mirrors
  `listAttachmentKeysForVehicle`'s join pattern, for the vehicle-delete retrofit.
- `createFuelAttachment`, `findFuelAttachmentById`, `listAttachmentsForFuelRecord` — identical
  shape to the `Attachment`-type functions in spec 007, operating on `fuel_record_attachments`.

## Vehicle-delete retrofit

`DELETE /api/v1/vehicles/:id` (specs 006/007) already calls `listAttachmentKeysForVehicle` +
`deleteAttachments` before the D1 delete. This feature extends that same route handler to also
call `listAttachmentKeysForVehicleFuelRecords` and delete those keys too — one combined R2 cleanup
before the vehicle row (and everything cascading from it) is removed, so no attachment of either
kind can outlive its vehicle (FR-012).
