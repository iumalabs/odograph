# Phase 1 Data Model: Search Across Vehicles and Records

## Entities

No new table or column — this feature reads existing `vehicles`/`service_records`/
`fuel_records`/`documents` (specs/006/007/009/023). No GDPR erasure decision needed: nothing new
is stored.

### `SearchResults` (in-memory shape, pure output of `searchTenantData`)

| Field             | Type                        | Notes                                        |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| `vehicles`             | `VehicleMatch[]`               | FR-003                                              |
| `serviceRecords`         | `RecordMatch[]`                  | FR-004                                                |
| `fuelRecords`              | `RecordMatch[]`                    | FR-005                                                  |
| `documents`                  | `RecordMatch[]`                      | FR-006                                                    |

### `VehicleMatch`

| Field   | Type              |
| --------- | ------------------ |
| `id`        | string              |
| `name`        | string                |
| `make`          | string \| null          |
| `model`           | string \| null            |
| `year`               | number \| null              |
| `vin`                  | string \| null                |

### `RecordMatch` (shared shape for service records, fuel records, and documents)

| Field         | Type    | Notes                                                                 |
| --------------- | -------- | ------------------------------------------------------------------------ |
| `id`               | string    |                                                                              |
| `vehicleId`           | string      | For navigation (FR-008)                                                       |
| `vehicleName`            | string        | The owning vehicle's name, for display without a further lookup (FR-008)         |
| `date`                      | string          | `service_date`/`fuel_date` — omitted (absent) for a document match, which has none |
| `title`                        | string            | The record's primary matched-on text: `description` (service), `station` (fuel, or `""` if unset), `title` (document) |
| `notes`                           | string \| null      | Carried through as-is, whether or not it was the actual matched field — enough context to show why it matched (FR-008) |

## Validation / behavior rules (from Functional Requirements)

- `query` MUST be at least 2 characters after trimming — shorter is rejected before any D1 access
  (FR-002).
- Every one of the four queries filters `tenant_id = ctx.tenantId` directly — there is no upfront
  `findVehicleById`-style check to inherit scoping from, since there's no single vehicle id in the
  request (FR-009).
- Matching is a case-insensitive substring match (`LIKE '%<escaped query>%' ESCAPE '\'`,
  research.md) against the fields named in FR-003 through FR-006 — a record matches if *any* of
  its listed fields contains the query.
- `duplicateOfId` is never checked — a duplicate-flagged record is included exactly like any
  other (FR-007, research.md's documented divergence from the aggregate features).
- An empty match on all four entity types (all empty arrays) is a valid `200` response, not an
  error (FR-010).

## Repository layer addition (shape, not full implementation)

Lives in `src/server/db/repository.ts`, alongside the other computed-on-read functions.

```text
const LIKE_ESCAPE_CHAR = "\\";

// PURE — no D1 access, directly unit-testable (research.md).
function escapeLikePattern(query: string): string {
  return query
    .replaceAll(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR + LIKE_ESCAPE_CHAR)
    .replaceAll("%", LIKE_ESCAPE_CHAR + "%")
    .replaceAll("_", LIKE_ESCAPE_CHAR + "_");
}

type VehicleMatch = { id: string; name: string; make: string | null; model: string | null; year: number | null; vin: string | null };
type RecordMatch = { id: string; vehicleId: string; vehicleName: string; date: string | null; title: string; notes: string | null };
type SearchResults = { vehicles: VehicleMatch[]; serviceRecords: RecordMatch[]; fuelRecords: RecordMatch[]; documents: RecordMatch[] };

function searchTenantData(db: D1Database, ctx: TenantContext, query: string): Promise<SearchResults>
// Trims query, requires length >= 2 (FR-002) — caller (route) is expected to have already
// validated this, but the function itself doesn't re-trust that; escapes the query once via
// escapeLikePattern, then runs four Promise.all'd queries:
//   vehicles:        WHERE tenant_id = ? AND (name LIKE ? OR make LIKE ? OR model LIKE ? OR vin LIKE ?) ESCAPE '\'
//   service_records: JOIN vehicles ON vehicle_id = vehicles.id
//                     WHERE service_records.tenant_id = ? AND (description LIKE ? OR notes LIKE ?) ESCAPE '\'
//   fuel_records:     JOIN vehicles ON vehicle_id = vehicles.id
//                     WHERE fuel_records.tenant_id = ? AND (station LIKE ? OR notes LIKE ?) ESCAPE '\'
//   documents:        JOIN vehicles ON vehicle_id = vehicles.id
//                     WHERE documents.tenant_id = ? AND (title LIKE ? OR notes LIKE ?) ESCAPE '\'
// Each JOIN pulls the owning vehicle's name for RecordMatch.vehicleName — no separate lookup.
```
