# Phase 1 Data Model: Vehicle CRUD

## Entities

### `vehicles`

A single vehicle owned by exactly one tenant.

| Column          | Type                                              | Notes                                                                 |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `id`            | TEXT PRIMARY KEY                                   | UUID                                                                     |
| `tenant_id`     | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE |                                                                           |
| `name`          | TEXT NOT NULL                                      | User-chosen label, not unique (FR-010)                                  |
| `make`          | TEXT                                                | Optional (FR-002)                                                       |
| `model`         | TEXT                                                | Optional                                                                 |
| `year`          | INTEGER                                            | Optional; if present, MUST be in `[1900, currentYear + 10]` (FR-008)   |
| `vin`           | TEXT                                                | Optional, not unique (FR-010)                                           |
| `odometer_unit` | TEXT NOT NULL CHECK (`odometer_unit` IN ('km','mi')) | Governs how future odometer readings for this vehicle are interpreted |
| `created_at`    | TEXT NOT NULL                                      | ISO 8601                                                                 |
| `updated_at`    | TEXT NOT NULL                                      | ISO 8601, refreshed on every update                                     |

**GDPR erasure decision**: Delete, cascading from `tenants` — see research.md.

### `probe_resources` — removed

Retired in this feature's migration (research.md) — `vehicles` is the real tenant-scoped resource
its own code comment named as the trigger for its removal.

## Relationships

```text
tenants (1) ───< (N) vehicles
```

No other table references `vehicles` yet — service/fuel records (M3/M4) will add their own FK to
it later.

## Validation rules (from Functional Requirements)

- `name` MUST be a non-empty string (FR-001) — rejected (400) if missing or empty.
- `odometer_unit` MUST be exactly `'km'` or `'mi'` (FR-009) — rejected (400) otherwise, including if
  missing.
- `year`, if present, MUST be a whole number in `[1900, currentYear + 10]` (FR-008) — rejected (400)
  otherwise. Absent is valid (optional per FR-002).
- `make`, `model`, `vin` have no format or uniqueness constraint beyond being strings (FR-002,
  FR-010).
- An update (`PATCH`) only ever changes the fields present in the request body — omitted fields
  keep their stored value (FR-005/SC-003); `updated_at` is refreshed regardless of which fields
  changed.
- Every read/update/delete is scoped by `tenant_id` matching the caller's resolved tenant — a
  `vehicles.id` that exists but belongs to a different tenant returns exactly the same response as
  an id that doesn't exist at all (FR-007), the same pattern `findProbeResourceById` already
  established.

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`; `createProbeResource`/
`findProbeResourceById`/`ProbeResource` are removed (research.md).

```text
type Vehicle = {
  id: string;
  tenantId: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometerUnit: "km" | "mi";
  createdAt: string;
  updatedAt: string;
};

function createVehicle(
  db: D1Database,
  ctx: TenantContext,
  input: { name: string; make: string | null; model: string | null; year: number | null;
           vin: string | null; odometerUnit: "km" | "mi" },
): Promise<Vehicle>

function listVehicles(db: D1Database, ctx: TenantContext): Promise<Vehicle[]>

// Returns null both when no row has this id and when it belongs to a different tenant — same
// indistinguishability contract findProbeResourceById established (FR-007).
function findVehicleById(db: D1Database, ctx: TenantContext, id: string): Promise<Vehicle | null>

// `patch` only includes the fields being changed; returns null under the same
// not-found-or-not-yours contract as findVehicleById.
function updateVehicle(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; make: string | null; model: string | null; year: number | null;
                    vin: string | null; odometerUnit: "km" | "mi" }>,
): Promise<Vehicle | null>

// Returns whether a row was actually deleted (false if it didn't exist or belonged to a
// different tenant) — same not-found-or-not-yours contract.
function deleteVehicle(db: D1Database, ctx: TenantContext, id: string): Promise<boolean>
```
