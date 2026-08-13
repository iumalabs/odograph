# Data Model: Compress Photo Attachments Before Upload

No data model — no entity, schema, or API surface change. The `Attachment` type returned by the
existing upload endpoints (`id`, `contentType`, `size`, `createdAt`) is unchanged; only the byte
content and `Content-Type` header of the request that produces it may differ (JPEG instead of the
original format, when resized).

## New in-memory-only concept

- **`compressImageIfNeeded(file: File): Promise<File>`**: not a data entity — a pure client-side
  transform. Input and output are both transient `File` objects that exist only for the duration of
  an upload; nothing is persisted or sent to the server beyond what already was.
