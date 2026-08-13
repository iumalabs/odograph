# Implementation Plan: Compress Photo Attachments Before Upload

**Branch**: `052-compress-photo-uploads` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/052-compress-photo-uploads/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A new `src/client/compress-image.ts` exports `compressImageIfNeeded(file: File): Promise<File>`:
for a JPEG/PNG/WebP file whose longest dimension exceeds 1600px, it decodes via
`createImageBitmap`, draws the scaled-down result to a canvas, and re-encodes as JPEG (quality
0.82) via `canvas.toBlob`; anything else (already-small image, PDF, or any failure at any step)
returns the original `File` unchanged. All three attachment-upload client functions
(`uploadAttachment` in `service-records.ts` and `fuel-records.ts`, `uploadDocumentAttachment` in
`documents.ts`) call this once, immediately before their existing `fetch`, so every attachment
path (camera capture and general file picker, across all three record types) benefits without any
component/UI change.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), browser Canvas/`createImageBitmap` APIs — no new
dependency

**Primary Dependencies**: None new — `createImageBitmap`, `HTMLCanvasElement`/`CanvasRenderingContext2D`,
`HTMLCanvasElement.toBlob` are all standard browser APIs already assumed available (this app
already requires a modern browser for WebAuthn/camera capture).

**Storage**: N/A — no persistence change; only the bytes sent to the already-existing attachment
upload endpoints change, when they change at all.

**Testing**: Same situation as spec 051 — this repo has no client component/unit test harness.
Verification is manual (quickstart.md) plus confirming the existing server-side attachment tests
(`tests/server/*attachment*`, `tests/server/fuel-record-crud.test.ts`'s attachment describe block,
etc.) still pass unmodified, since the server-side contract (what a valid attachment upload looks
like) is untouched by this feature.

**Target Platform**: Browser PWA (client-only change; no server route or validation logic touched)

**Project Type**: Web application — client-only

**Performance Goals**: Meaningfully reduce upload bytes for a full-resolution phone camera photo
(SC-001) — directional, not a specific byte target (varies by source photo).

**Constraints**: Per FR-005, the compressed output MUST remain a type the server's `detectFileType`
magic-byte check accepts (JPEG) and MUST stay under `MAX_ATTACHMENT_BYTES` — trivially true since
compression only ever reduces size relative to an already-accepted-size original (FR-007 falls
back to the original if compression would grow it). Per FR-006, orientation correctness relies
entirely on the browser's own EXIF-aware decode when an image is drawn into a canvas (standard,
current behavior in evergreen browsers per research.md) — this feature does not hand-roll EXIF
orientation parsing.

**Scale/Scope**: One new file (`src/client/compress-image.ts`), three one-line call-site additions
(the three existing `uploadAttachment`/`uploadDocumentAttachment` functions). No component, route,
or server file changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **V. Verified File Content, Not Declared Type**: PASS — this feature runs entirely before the
  existing server-side magic-byte check; it changes what bytes are sent, never what check is
  applied to them. The server still independently verifies the uploaded bytes are a real JPEG
  regardless of what this feature does client-side.
- **VIII. GDPR Erasure by Design**: N/A — no storage/deletion logic touched.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: N/A — no new user-facing
  string; this feature is silent (the existing upload UI/toasts are unchanged).

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/052-compress-photo-uploads/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` — no API surface change.

### Source Code (repository root)

```text
src/client/
├── compress-image.ts        # new: compressImageIfNeeded(file) -> Promise<File>
├── service-records.ts       # uploadAttachment calls compressImageIfNeeded first (extend)
├── fuel-records.ts          # uploadAttachment calls compressImageIfNeeded first (extend)
└── documents.ts             # uploadDocumentAttachment calls compressImageIfNeeded first (extend)
```

**Structure Decision**: A single shared flat utility module (matching this project's existing flat
`src/client/*.ts` convention for standalone concerns like `distance.ts`/`currency.ts`), called from
the three existing upload functions rather than touched at the component/UI layer — no component
prop changes needed since compression happens transparently inside the already-existing upload
call.
