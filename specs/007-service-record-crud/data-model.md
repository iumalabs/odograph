# Phase 1 Data Model: Service Record CRUD + Attachments

## Entities

### `service_records`

| Column             | Type                                                | Notes                                                         |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                | TEXT PRIMARY KEY                                     | UUID                                                              |
| `tenant_id`         | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE   | Redundant alongside `vehicle_id`, same pattern `vehicles` uses for a direct isolation-check without a join |
| `vehicle_id`        | TEXT NOT NULL, FK → `vehicles.id` ON DELETE CASCADE  |                                                                    |
| `service_date`      | TEXT NOT NULL                                        | ISO 8601 date — when the service was performed (not `created_at`) |
| `description`       | TEXT NOT NULL                                        | What was serviced, free text                                     |
| `odometer_reading`  | INTEGER                                              | Optional (FR-002) — never estimated if absent (Principle IV)      |
| `cost`              | REAL                                                  | Optional, no currency conversion in v1 (spec.md Assumptions)      |
| `notes`             | TEXT                                                  | Optional, free text                                               |
| `created_at`        | TEXT NOT NULL                                        | ISO 8601                                                          |
| `updated_at`        | TEXT NOT NULL                                        | ISO 8601, refreshed on every update                               |

**GDPR erasure decision**: Delete, cascading from `vehicles` — same reasoning as `vehicles` itself
cascading from `tenants` (specs/006): a service record has no independent existence apart from the
vehicle it documents, and there's no reason to retain or anonymise an orphaned one.

### `service_record_attachments`

| Column               | Type                                                        | Notes                                                        |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`                  | TEXT PRIMARY KEY                                              | UUID                                                              |
| `tenant_id`           | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE            | Same redundant-scoping pattern                                   |
| `service_record_id`   | TEXT NOT NULL, FK → `service_records.id` ON DELETE CASCADE    |                                                                    |
| `r2_key`              | TEXT NOT NULL                                                 | `tenants/{tenantId}/service-records/{serviceRecordId}/{id}` (research.md) |
| `content_type`        | TEXT NOT NULL                                                 | The *sniffed* type (FR-010), never the client's declared one     |
| `size`                | INTEGER NOT NULL                                              | Bytes, post-EXIF-stripping (the actual stored size)               |
| `created_at`          | TEXT NOT NULL                                                 | ISO 8601                                                          |

**GDPR erasure decision**: Delete — both the D1 row (cascades automatically via
`service_record_id`/`tenant_id` FKs) and the underlying R2 object (does **not** cascade
automatically — D1's `ON DELETE CASCADE` only reaches other D1 rows, never R2; every code path that
deletes a `service_record_attachments` row MUST also delete its R2 object, and every code path that
cascades away rows that own attachments (deleting a service record, or a vehicle, or eventually a
tenant) MUST delete their R2 objects *before* the D1 delete, not assume the cascade handles it).

## Relationships

```text
vehicles (1) ───< (N) service_records ───< (N) service_record_attachments
```

## Validation rules (from Functional Requirements)

- `service_date` and `description` are required (FR-001); `odometer_reading`/`cost`/`notes` are
  optional and never inferred if absent (FR-002).
- Creating a service record for a `vehicle_id` that doesn't exist or belongs to a different tenant
  is refused identically to any other cross-tenant access (FR-003) — resolved via
  `findVehicleById` (specs/006) before insert, not a bare foreign-key existence check.
- An update only ever changes the fields present in the request body — omitted fields keep their
  stored value (FR-006), same pattern `updateVehicle` already established.
- Every read/update/delete of a `service_records` or `service_record_attachments` row is scoped by
  `tenant_id` matching the caller's resolved tenant — a row that exists but belongs to a different
  tenant returns exactly the same response as a row that doesn't exist at all (FR-008).
- An attachment upload is accepted only if: its sniffed magic bytes match one of
  JPEG/PNG/WebP/PDF (FR-010), its size is ≤ 10MB (FR-011, spec.md Assumptions), and — for JPEG —
  after EXIF/APP1-segment stripping (FR-012). Nothing is written to D1 or R2 for an upload that
  fails any of these checks (FR-014).
- Deleting a `service_records` row MUST first delete every one of its attachments' R2 objects, then
  let the D1 delete cascade remove the `service_record_attachments` rows (FR-007). Deleting a
  `vehicles` row (specs/006) MUST do the same for every one of its service records' attachments
  before the D1 delete — this feature retrofits that into `deleteVehicle`'s route handler (not the
  repository function itself, which stays D1-only per Principle I).

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`, alongside existing exports — no existing
export's signature changes except where noted.

```text
type ServiceRecordInput = {
  serviceDate: string; description: string;
  odometerReading: number | null; cost: number | null; notes: string | null;
};

function createServiceRecord(
  db: D1Database, ctx: TenantContext, vehicleId: string, input: ServiceRecordInput,
): Promise<ServiceRecord>
// Caller has already resolved vehicleId belongs to ctx.tenantId via findVehicleById (FR-003) —
// this function trusts that check happened, mirroring how createVehicle trusts ctx over any
// client-supplied id.

function listServiceRecords(db: D1Database, ctx: TenantContext, vehicleId: string): Promise<ServiceRecord[]>
function findServiceRecordById(db: D1Database, ctx: TenantContext, id: string): Promise<ServiceRecord | null>
function updateServiceRecord(
  db: D1Database, ctx: TenantContext, id: string, patch: Partial<ServiceRecordInput>,
): Promise<ServiceRecord | null>

// Returns the R2 keys of every attachment that WAS deleted (D1-side), so the caller (route layer)
// can delete the matching R2 objects — repository.ts never touches R2 itself (Principle I).
function deleteServiceRecord(db: D1Database, ctx: TenantContext, id: string): Promise<string[] | null>

// Same shape, for the deleteVehicle retrofit: every attachment R2 key across every service record
// belonging to this vehicle, without deleting anything yet.
function listAttachmentKeysForVehicle(db: D1Database, ctx: TenantContext, vehicleId: string): Promise<string[]>

function createAttachment(
  db: D1Database, ctx: TenantContext,
  input: { serviceRecordId: string; r2Key: string; contentType: string; size: number },
): Promise<Attachment>
function findAttachmentById(db: D1Database, ctx: TenantContext, id: string): Promise<Attachment | null>
```
