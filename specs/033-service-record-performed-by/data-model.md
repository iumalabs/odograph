# Phase 1 Data Model: Service Record Performed-By Field

## Entity: Service Record (extended)

Existing entity (`specs/007-service-record-crud/data-model.md`), gaining one attribute.

| Attribute     | Type                   | Constraints                                  | Notes                                                                 |
| ------------- | ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| `performedBy` | `"self" \| "shop" \| null` | Optional on create/edit; nullable in storage | New. Purely descriptive — no other field/entity derives from this one. |

No other Service Record attribute changes. No new entity, no new relationship, no cascading effect on
attachments, duplicate detection, or the entity's identity/ownership fields.

## Storage shape

```sql
ALTER TABLE service_records
  ADD COLUMN performed_by TEXT
  CHECK (performed_by IN ('self', 'shop') OR performed_by IS NULL);
```

Existing rows: `performed_by` is `NULL` after migration (SQLite `ALTER TABLE ADD COLUMN` with no
`DEFAULT` populates existing rows with `NULL`) — matches FR-006 exactly, no backfill statement
required.

## API request/response shape (informative — see quickstart.md for the full request/response bodies)

- **Create** (`POST /api/v1/vehicles/:vehicleId/service-records`): request body gains optional
  `performedBy: "self" | "shop"`. Absent or omitted → stored as `null`.
- **Update** (`PATCH /api/v1/service-records/:id`): request body gains optional
  `performedBy: "self" | "shop" | null`. Presence-checked the same way every other optional patch
  field on this route already is (`"performedBy" in body`) — explicit `null` clears the value,
  omitting the key leaves the existing value untouched.
- **Read** (`GET /api/v1/service-records/:id`, list endpoint): response gains `performedBy` on every
  returned Service Record object, `"self" | "shop" | null`.

## Validation rules

- `performedBy`, if present in a request body, MUST be exactly the string `"self"` or `"shop"` (create)
  or one of `"self" | "shop" | null` (update, where `null` means "clear it"). Any other value
  (including empty string, a number, etc.) is a `400 invalid_request`, matching this route's existing
  validation style for every other field.
