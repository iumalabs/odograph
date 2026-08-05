# Phase 1 Data Model: Semantic Duplicate Detection & Resolution

No new tables. One additive column on each of the two existing record tables (spec 007/009).

## `fuel_records` (additive)

| Column | Type | Notes |
|---|---|---|
| `duplicate_of_id` | TEXT nullable | `REFERENCES fuel_records(id) ON DELETE SET NULL` — the
  earlier fuel record this one was flagged as a possible duplicate of at creation time, or `NULL`
  if never flagged (or flagged and since dismissed — dismissal sets this back to `NULL`,
  research.md). Self-referencing within the same table. |

Index: `idx_fuel_records_duplicate_of_id (duplicate_of_id)` — supports the "only compare against
unflagged records" query (`WHERE duplicate_of_id IS NULL`) staying index-friendly as history
grows, and the `ON DELETE SET NULL` cascade lookup.

## `service_records` (additive)

| Column | Type | Notes |
|---|---|---|
| `duplicate_of_id` | TEXT nullable | Same shape and semantics as `fuel_records.duplicate_of_id`,
  `REFERENCES service_records(id) ON DELETE SET NULL`. |

Index: `idx_service_records_duplicate_of_id (duplicate_of_id)`.

**GDPR erasure**: No change to either table's existing erasure decision (Delete, cascading from
vehicles) — `duplicate_of_id` is `ON DELETE SET NULL` rather than `CASCADE` specifically so
deleting the *referenced* record never blocks or cascades into deleting the *referencing* record
too (they're independent records that happen to reference each other, not a parent/child
ownership relationship).

## Repository layer changes (`src/server/db/repository.ts`)

- `FuelRecord`/`ServiceRecord` types gain `duplicateOfId: string | null`.
- `createFuelRecord`/`createServiceRecord`: before inserting, run the matching query
  (research.md's exact rules) scoped to `ctx.tenantId` and the given `vehicleId`; if a match is
  found, include its id as `duplicate_of_id` in the `INSERT`.
- `listFuelRecordsWithEconomy`: the odometer-ordered walk skips flagged records when updating the
  `previous` pointer and always assigns them `fuelEconomy: null` (research.md's exclusion design)
  — no change to `findFuelRecordById`'s delegation to this function, so detail and list stay
  consistent automatically, same as spec 009 already established.
- `dismissFuelRecordDuplicate(db, ctx, id): Promise<FuelRecordWithEconomy | null>` /
  `dismissServiceRecordDuplicate(db, ctx, id): Promise<ServiceRecord | null>` — same
  not-found-or-not-yours contract as every other tenant-scoped function; sets `duplicate_of_id` to
  `NULL` on the caller's own record.

No changes to `Attachment`/`FuelAttachment` or any attachment-related function — this feature
doesn't touch attachments at all.
