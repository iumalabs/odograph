# Phase 1 Data Model: Camera Photo Capture

No new D1 tables, columns, or R2 key layout. This feature reuses the existing attachment entities
unchanged:

- `service_record_attachments` (specs/007-service-record-crud/data-model.md)
- `fuel_record_attachments` (specs/009-fuel-record-crud/data-model.md)

A camera-captured photo becomes exactly the same row shape as a file-picker-uploaded one — same
`id`, `r2_key`, `content_type` (sniffed from bytes, not declared), `size` (post-EXIF-strip bytes),
`created_at`. Nothing distinguishes "captured via camera" from "picked from library" once stored;
spec.md's requirements don't ask for that distinction to be preserved.

## Client-side type addition (not persisted)

`AttachmentUploadError` — a small `Error` subclass added to `service-records.ts`/`fuel-records.ts`,
carrying the server's existing `error` response field so `App.tsx` can map it to a specific message
(research.md). This exists only for the duration of a failed upload's `catch` block; it is never
stored, serialized beyond the current request, or sent anywhere.

```text
AttachmentUploadError extends Error
├── code: "file_too_large" | "unsupported_file_type" | "unknown"
```
