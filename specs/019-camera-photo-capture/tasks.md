# Tasks: Camera Photo Capture

**Input**: Design documents from `/specs/019-camera-photo-capture/` **Prerequisites**: plan.md,
spec.md, data-model.md, research.md, quickstart.md

**Tests**: No new `deno task test` coverage — plan.md's Testing section: this repo has no
client-side unit-test harness (`vitest.config.ts` only exercises `tests/server/**`), and
camera-capture behavior is inherently browser/device-dependent. Every acceptance criterion is
verified live via quickstart.md. Automated e2e coverage is out of scope (owned by a separate QA
process, not this implementation).

## Phase 1: Setup

No setup tasks — no new dependency, no scaffolding. This feature only extends existing files.

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T001 [P] Add `CameraIcon` to `src/client/design/icons.tsx`, hand-rolled to the file's existing
      icon spec (24x24 viewBox, `currentColor` stroke only, no fill) since it isn't in the mockup's
      icon sheet — matching the file's own documented rule for such cases (research.md)
- [ ] T002 [P] Add `takePhotoLabel: "Take Photo"` to the `en` string table in
      `src/client/i18n/strings.ts`, alongside the existing `attachmentUploadLabel`

**Checkpoint**: The icon and label User Story 1's control needs both exist — nothing yet renders
them.

---

## Phase 3: User Story 1 - Take a photo and attach it on the spot (P1) 🎯 MVP

**Goal**: A "Take Photo" control on the service record and fuel record attachment areas opens the
device camera directly on a camera-equipped device and uploads the captured photo through the
existing attachment flow.

- [ ] T003 [US1] In `src/client/components/ServiceRecordPanel.tsx`, add a "Take Photo" toggle button
      (mirroring the existing "Attach a photo or receipt" button at ServiceRecordPanel.tsx:357-376:
      same visual treatment, `CameraIcon` instead of `UploadIcon`, `t("takePhotoLabel")`) that reveals
      a second `<input type="file" accept="image/*" capture="environment">` wired to the same
      `onUploadAttachment` handler as the existing file input, with a `<label>`/`aria-label`
      association so the control has a programmatic accessible name distinct from the existing
      toggle's (FR-008)
- [ ] T004 [P] [US1] Apply the same "Take Photo" addition to
      `src/client/components/FuelRecordPanel.tsx` (mirrors FuelRecordPanel.tsx:408-409 the same way
      T003 mirrors ServiceRecordPanel.tsx)
- [ ] T005 [US1] Live-verify on a camera-equipped phone (quickstart.md steps 2-3): confirm "Take
      Photo" opens the native camera app directly for both a service record and a fuel record,
      confirm a captured photo appears in the attachment list, and confirm cancelling the camera
      without capturing produces no upload attempt and no error (FR-007)

**Checkpoint**: Users on a phone can capture and attach a photo in one action for both record types
(SC-001) — the MVP for this feature is complete.

---

## Phase 4: User Story 2 - Fall back gracefully without a camera (P2)

**Goal**: Confirm the same markup Phase 3 already ships (`capture="environment"` is a hint, not a
requirement — unsupported browsers ignore it) degrades to the standard photo picker with no dead end.

- [ ] T006 [US2] Live-verify on a desktop browser (quickstart.md step 4): confirm "Take Photo" opens
      a standard file/photo picker for both a service record and a fuel record, and that selecting an
      existing image uploads and attaches it identically to the existing "Choose File" control

**Checkpoint**: "Take Photo" never dead-ends on a camera-less device (SC-003) — no new code was
needed for this story; it verifies a guarantee the platform itself provides for the control Phase 3
already implemented.

---

## Phase 5: User Story 3 - Understand why a captured photo was rejected (P3)

**Goal**: A rejected upload (too large / unsupported format) shows a specific reason instead of the
single generic error message.

- [ ] T007 [US3] In `src/client/service-records.ts`, add an `AttachmentUploadError` class (extends
      `Error`, carries a `code: "file_too_large" | "unsupported_file_type" | "unknown"` field per
      data-model.md) and update `uploadAttachment()` to read the JSON body on a non-2xx response and
      throw it with the server's `error` field as `code` (falling back to `"unknown"` if the body
      doesn't parse or match)
- [ ] T008 [P] [US3] Apply the same change to `uploadAttachment()` in `src/client/fuel-records.ts`
      (mirrors T007)
- [ ] T009 [US3] Add `attachmentTooLargeError` and `attachmentUnsupportedTypeError` strings to the
      `en` table in `src/client/i18n/strings.ts`, alongside `genericError`
- [ ] T010 [US3] In `src/client/App.tsx`, update `handleUploadAttachment` to catch
      `AttachmentUploadError`, map `code` to `attachmentTooLargeError` / `attachmentUnsupportedTypeError`
      / `genericError` (for `"unknown"` or a non-`AttachmentUploadError` failure), and call `setError`
      with the mapped message
- [ ] T011 [US3] Apply the same change to `handleUploadFuelAttachment` in `src/client/App.tsx`
      (mirrors T010, same file — sequenced after T010, not parallel)
- [ ] T012 [US3] Live-verify (quickstart.md steps 5-6): attempt an oversized upload and an
      unsupported-format upload for both record types, confirm each shows its specific message, not
      the generic one

**Checkpoint**: Validation failures are self-explanatory (SC-004) for both record types.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T013 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T014 [P] Accessibility live-verify (quickstart.md step 7): confirm both new "Take Photo"
      controls are keyboard-reachable and activatable, and expose a real accessible name (FR-008)
- [ ] T015 [P] Confirm the existing "Choose File" / "Attach a photo or receipt" flow is unchanged and
      still works for both record types (no regression to the pre-existing upload path)

## Dependencies

- **Phase 2 (Foundational)** → **User Story 1 (Phase 3)**: the icon and label T003/T004 render must
  exist first.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: strict at the verification level — T006
  verifies fallback behavior of the exact control T003/T004 already implement; there is no separate
  implementation phase for User Story 2.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: User Story 3 improves error feedback for
  the same upload path User Story 1's control triggers; it's independently implementable in parallel
  with Phase 3/4 (different files: T007-T011 never touch `ServiceRecordPanel.tsx`/
  `FuelRecordPanel.tsx`) but is sequenced after here for narrative clarity — a team could start Phase
  5 as soon as Phase 2 is done.
- **Phase 6 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, both tasks touch different files with no dependency on each other:

```text
T001 [P] add CameraIcon to src/client/design/icons.tsx
T002 [P] add takePhotoLabel to src/client/i18n/strings.ts
```

Within Phase 3, the two panel components are independent:

```text
T003 [US1] ServiceRecordPanel.tsx
T004 [P] [US1] FuelRecordPanel.tsx
```

Within Phase 5, the two API modules are independent (T010/T011 are not parallel — same file):

```text
T007 [US3] service-records.ts
T008 [P] [US3] fuel-records.ts
```

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** A working "Take Photo" control that opens the camera and
uploads through the existing flow already delivers this feature's primary promise for both record
types. User Story 2 adds no new code — it's the verification pass confirming the platform-provided
fallback (same precedent as specs/018-pwa-installability's User Story 2) actually holds. User Story
3 is additive polish on top of an already-working capture flow and can be built in parallel with, or
after, User Story 1.
