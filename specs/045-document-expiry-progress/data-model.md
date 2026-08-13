# Phase 1 Data Model: Document Expiry Progress Bar

No new persisted entity, no schema change. `Document` gains one derived-at-read-time field.

## `Document` (extended)

| Field | Type | Notes |
|---|---|---|
| `isExpired` | `boolean` | Unchanged. |
| `reminderStatus` | `DocumentReminderStatus \| null` | Unchanged. |
| `windowFraction` | `number \| null` | **New.** Fraction of the fixed `DOCUMENT_COMING_UP_WINDOW_DAYS` (30-day) window elapsed, clamped to `1` once expired. `null` whenever `reminderStatus` is `on_track`, `null` (no expiry date), or absent. |

## Relationships

No new reads, no new writes. Computed inside the same `withDocumentStatus` pass every document read
already goes through.
