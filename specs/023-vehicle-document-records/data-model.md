# Phase 1 Data Model: Vehicle Document Records

## Entities

### `documents`

| Column         | Type                                                | Notes                                                              |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `id`           | TEXT PRIMARY KEY                                     | UUID                                                                 |
| `tenant_id`    | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE   | Redundant alongside `vehicle_id`, same direct-isolation-check pattern `service_records` uses |
| `vehicle_id`   | TEXT NOT NULL, FK → `vehicles.id` ON DELETE CASCADE  |                                                                       |
| `title`        | TEXT NOT NULL                                        | Free text (FR-001)                                                   |
| `category`     | TEXT NOT NULL                                        | One of `registration`, `insurance`, `warranty`, `inspection`, `other` (FR-002) — enforced at the application layer, not a CHECK constraint (matches how `service_records.description` etc. validate in-code rather than in SQL) |
| `expiry_date`  | TEXT                                                  | Optional, ISO 8601 date, nullable (FR-003) — never inferred if absent (Principle IV) |
| `notes`        | TEXT                                                  | Optional, free text                                                  |
| `created_at`   | TEXT NOT NULL                                        | ISO 8601                                                              |
| `updated_at`   | TEXT NOT NULL                                        | ISO 8601, refreshed on every update                                   |

`is_expired` is **not** a column — computed at read time in the repository layer as
`expiry_date IS NOT NULL AND expiry_date <= today` (research.md). This avoids a background job to
keep a stored flag from going stale.

**GDPR erasure decision**: Delete, cascading from `vehicles` — same reasoning as `service_records`
(specs/007): a document has no independent existence apart from the vehicle it documents.

### `document_attachments`

| Column          | Type                                                  | Notes                                                        |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `id`            | TEXT PRIMARY KEY                                         | UUID                                                          |
| `tenant_id`     | TEXT NOT NULL, FK → `tenants.id` ON DELETE CASCADE       | Same redundant-scoping pattern as `service_record_attachments` |
| `document_id`   | TEXT NOT NULL, FK → `documents.id` ON DELETE CASCADE     |                                                                 |
| `r2_key`        | TEXT NOT NULL                                            | `tenants/{tenantId}/documents/{documentId}/{id}` (research.md's generalized `attachmentKey`) |
| `content_type`  | TEXT NOT NULL                                            | The *sniffed* type (FR-012), never the client's declared one   |
| `size`          | INTEGER NOT NULL                                         | Bytes, post-EXIF-stripping (the actual stored size)             |
| `created_at`    | TEXT NOT NULL                                            | ISO 8601                                                        |

**GDPR erasure decision**: Delete — both the D1 row (cascades automatically via `document_id`/
`tenant_id` FKs) and the underlying R2 object (does **not** cascade automatically — every code
path that deletes a `document_attachments` row, or cascades away a row that owns one (deleting a
document, or a vehicle), MUST delete the R2 object *before* the D1 delete, identical contract to
`service_record_attachments`).

## Relationships

```text
vehicles (1) ───< (N) documents ───< (N) document_attachments
```

## Validation rules (from Functional Requirements)

- `title` and `category` are required (FR-001); `category` MUST be one of the five defined values
  (FR-002); `expiry_date`/`notes` are optional and never inferred if absent (FR-003).
- Creating a document for a `vehicle_id` that doesn't exist or belongs to a different tenant is
  refused identically to any other cross-tenant access (FR-004) — resolved via `findVehicleById`
  (specs/006) before insert, same as `createServiceRecord`.
- `is_expired` is derived, not stored (FR-007) — `true` when `expiry_date` is non-null and
  `<= today` (UTC, evaluated at request time).
- An update only ever changes the fields present in the request body — omitted fields keep their
  stored value (FR-008), same pattern `updateServiceRecord` established, including the ability to
  set `expiry_date` to `null` explicitly (distinguished from "field omitted" the same way
  `updateVehicle`/`updateServiceRecord` already distinguish omitted-vs-null in their patch types).
- Every read/update/delete of a `documents` or `document_attachments` row is scoped by `tenant_id`
  matching the caller's resolved tenant — a row that exists but belongs to a different tenant
  returns exactly the same response as a row that doesn't exist at all (FR-010).
- An attachment upload is accepted only if: its sniffed magic bytes match one of
  JPEG/PNG/WebP/PDF (FR-012), its size is ≤ 10MB (FR-013), and — for JPEG — after EXIF/APP1-segment
  stripping (FR-014). Nothing is written to D1 or R2 for an upload that fails any of these checks
  (FR-016).
- Deleting a `documents` row MUST first delete every one of its attachments' R2 objects, then let
  the D1 delete cascade remove the `document_attachments` rows (FR-009). Deleting a `vehicles` row
  (specs/006) MUST do the same for every one of its documents' attachments before the D1 delete —
  this feature adds a third call to `deleteVehicle`'s existing R2-cleanup retrofit, alongside the
  two specs/007/specs/009 already added (FR-017).

## Repository layer additions (shape, not full implementation)

All new functions live in `src/server/db/repository.ts`, alongside existing exports — no existing
export's signature changes except `attachmentKey()` in `src/server/attachments/storage.ts`
(research.md).

```text
type DocumentCategory = "registration" | "insurance" | "warranty" | "inspection" | "other";

type DocumentInput = {
  title: string; category: DocumentCategory;
  expiryDate: string | null; notes: string | null;
};

type Document = DocumentInput & {
  id: string; tenantId: string; vehicleId: string;
  isExpired: boolean; // derived at read time, not a stored column
  createdAt: string; updatedAt: string;
};

function createDocument(
  db: D1Database, ctx: TenantContext, vehicleId: string, input: DocumentInput, clientId?: string,
): Promise<Document>
// Caller has already resolved vehicleId belongs to ctx.tenantId via findVehicleById (FR-004) —
// mirrors createServiceRecord's trust contract. `clientId`/the `idempotent` middleware are the
// same generic, header-opt-in HTTP idempotency mechanism every other write route already uses
// (constitution Principle III's underlying `Idempotency-Key` support) — this is NOT offline-queue
// design (spec.md explicitly scopes that out); documents simply follow the established
// create/update/delete route convention every other resource in this codebase already follows.

function listDocuments(db: D1Database, ctx: TenantContext, vehicleId: string): Promise<Document[]>
function findDocumentById(db: D1Database, ctx: TenantContext, id: string): Promise<Document | null>
function updateDocument(
  db: D1Database, ctx: TenantContext, id: string, patch: Partial<DocumentInput>,
): Promise<Document | null>

// Returns the R2 keys of every attachment that WAS deleted (D1-side), so the caller (route layer)
// can delete the matching R2 objects — repository.ts never touches R2 itself (Principle I).
function deleteDocument(db: D1Database, ctx: TenantContext, id: string): Promise<string[] | null>

// Same shape as listAttachmentKeysForVehicle, for the deleteVehicle retrofit.
function listAttachmentKeysForVehicleDocuments(
  db: D1Database, ctx: TenantContext, vehicleId: string,
): Promise<string[]>

function createDocumentAttachment(
  db: D1Database, ctx: TenantContext,
  input: { documentId: string; r2Key: string; contentType: string; size: number },
): Promise<DocumentAttachment>
function findDocumentAttachmentById(
  db: D1Database, ctx: TenantContext, id: string,
): Promise<DocumentAttachment | null>
function listDocumentAttachmentsForDocument(
  db: D1Database, ctx: TenantContext, documentId: string,
): Promise<DocumentAttachment[]>
```
