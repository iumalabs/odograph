# Tasks: Compress Photo Attachments Before Upload

**Input**: Design documents from `specs/052-compress-photo-uploads/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: None added — no client test harness exists in this repo (research.md). Verification is
the existing server-side attachment test suite (unmodified contract) plus quickstart.md's manual
walkthrough.

Two user stories, both P1 and inseparable in implementation (the compression logic and its
fallback/passthrough behavior are the same function) — implemented together as one phase.

## Phase 1: User Story 1 + User Story 2 - Smaller uploads, nothing else breaks (P1)

**Goal**: Large camera photos upload meaningfully smaller; every other attachment path (PDFs,
already-small images, failure fallback, orientation) is unaffected.

**Independent Test**: quickstart.md's four scenarios — smaller upload for a large photo, unchanged
upload for a small image/PDF, correct orientation, and graceful fallback on a simulated failure.

- [X] T001 Create `src/client/compress-image.ts` exporting
      `compressImageIfNeeded(file: File): Promise<File>`: returns `file` unchanged for any
      non-`image/jpeg`/`image/png`/`image/webp` type; decodes via
      `createImageBitmap(file, { imageOrientation: "from-image" })`; if
      `max(width, height) <= 1600`, returns `file` unchanged; otherwise draws the scaled bitmap
      (aspect-ratio preserved, longest side = 1600) into a `<canvas>`, calls
      `canvas.toBlob(cb, "image/jpeg", 0.82)`, wraps the result in a new `File` (same base name,
      `.jpg` extension, `type: "image/jpeg"`), and returns whichever of the original/compressed
      `File` is smaller (FR-007). Wraps the whole decode/draw/encode sequence in a try/catch that
      returns the original `file` on any failure (FR-004).
- [X] T002 [P] In `src/client/service-records.ts`'s `uploadAttachment`, call
      `await compressImageIfNeeded(file)` and use its result in place of `file` for both the
      `Content-Type` header and the request body (depends on T001).
- [X] T003 [P] In `src/client/fuel-records.ts`'s `uploadAttachment`, same change as T002 (depends
      on T001).
- [X] T004 [P] In `src/client/documents.ts`'s `uploadDocumentAttachment`, same change as T002
      (depends on T001).
- [X] T005 `deno task check` (fmt, lint, typecheck, existing server test suite, repository-boundary
      script) — confirms the server-side attachment contract this feature must not break is still
      green (depends on T002, T003, T004). 346/346 tests pass; `deno task build` succeeds (main
      bundle 273.51KB → 274.24KB, a negligible increase from the new small module).
- [~] T006 Manual quickstart walkthrough (all 4 scenarios) — **not performed**: no browser-
      automation tool was available in this session, and `createImageBitmap`/`<canvas>` are
      browser-only APIs that can't be exercised via a headless script either. This task's logic
      (T001) got the most careful code-level scrutiny of the three specs shipped this session as a
      result — but a real manual/QA pass (ideally on an actual phone, to exercise camera EXIF
      orientation genuinely) is the single most valuable follow-up check for this feature before
      it's trusted (depends on T005).

**Checkpoint**: All three attachment upload paths compress large photos client-side; every existing
capability (PDFs, small images, failure fallback, orientation) is unaffected.

## Dependencies & Execution Order

T001 blocks T002/T003/T004 (three different files, safe to do in parallel once T001 exists) → T005
→ T006.

## Implementation Strategy

Build the shared helper first (T001) since it's the only real logic in this feature; wiring it into
the three upload functions (T002-T004) is mechanical and identical across all three, then verify
mechanically (T005) and manually (T006).
