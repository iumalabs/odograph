# Feature Specification: Compress Photo Attachments Before Upload

**Feature Branch**: `052-compress-photo-uploads`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Photos/receipts upload at full camera resolution, no client-side
compression (GitHub issue #162). A performance audit found that photo capture across the app
(service records, fuel records, documents) uploads the file exactly as captured — a fresh phone
photo (typically 3-8MB JPEG) uploads at full resolution over what's often a mobile connection when
logging a fill-up or service record. The server already allows up to 10MB. Fix: client-side resize
via canvas/createImageBitmap to something like 1600px on the long side before upload. Scope: only
applies to actual image files (JPEG/PNG/WebP) selected via either the camera-capture input or the
general file-upload input; PDF receipts and any file that's already small are never touched. Must
still pass the server's existing validation (magic-byte type check, size cap), and must not corrupt
or misorient the photo — relying on the browser's own EXIF-aware image decode (standard behavior
when drawing an image to a canvas) rather than hand-rolling orientation correction."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A camera photo uploads faster and uses less data (Priority: P1)

An owner photographing a receipt or odometer reading after a fill-up, service, or document capture
wants the attachment to upload quickly, without waiting on or burning mobile data for a
full-resolution photo they only need to be legible.

**Why this priority**: This is the entire point of the feature — everything else (format handling,
fallback behavior) exists to make this safe, not because it's independently valuable.

**Independent Test**: Attach a large (multi-megabyte, several-thousand-pixel) photo via any of the
three attachment flows (service record, fuel record, document) and confirm the bytes actually sent
to the server are meaningfully smaller than the original file, while the resulting attachment still
opens and is clearly legible.

**Acceptance Scenarios**:

1. **Given** a freshly captured camera photo whose longest side exceeds the resize threshold,
   **When** the owner attaches it, **Then** the uploaded file is downscaled (smaller dimensions and
   byte size) before it's sent, and the resulting attachment is still clearly legible.
2. **Given** a photo whose longest side is already within the resize threshold, **When** the owner
   attaches it, **Then** it uploads unchanged — no forced re-encode or quality loss for a file that
   didn't need it.

---

### User Story 2 - Non-photo attachments and edge cases are never touched or broken (Priority: P1)

An owner attaching a PDF receipt, or attaching a photo on a device/browser where client-side
resizing isn't available or fails, expects the attachment to upload exactly as it does today — this
feature must never block or corrupt an upload.

**Why this priority**: Equal priority to User Story 1 — a "performance" feature that breaks or
silently degrades any existing attachment path isn't a net improvement.

**Independent Test**: Attach a PDF and confirm it's uploaded byte-for-byte unchanged; simulate a
resize failure and confirm the original file still uploads successfully.

**Acceptance Scenarios**:

1. **Given** a PDF file selected via the general upload input, **When** the owner attaches it,
   **Then** it uploads completely unchanged — this feature never processes non-image files.
2. **Given** client-side resizing fails for any reason (decode error, unsupported browser API),
   **When** the owner attaches a photo, **Then** the original, unmodified file is uploaded instead
   of blocking the attachment.
3. **Given** a photo captured in portrait or landscape orientation with camera-recorded rotation
   metadata, **When** it's resized by this feature, **Then** the resulting image still displays
   right-side-up, matching how it would display before this feature existed.

---

### Edge Cases

- What happens to a PNG or WebP image (not just JPEG)? → Resized the same way as a JPEG when it
  exceeds the threshold; the output is a JPEG (photographic re-compression), since every attachment
  scenario in this app is a photo/receipt, not a graphic requiring lossless/transparent output.
- What happens if the resized output would somehow be larger than the original (rare, e.g. an
  already-small but oddly-encoded source)? → The system uses whichever is smaller — this feature
  exists to reduce upload size, never to increase it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an owner selects an image file (JPEG, PNG, or WebP) whose longest dimension
  exceeds a defined threshold, the system MUST downscale it client-side, preserving aspect ratio,
  before uploading.
- **FR-002**: An image file already within the threshold MUST upload unchanged — no forced
  re-encoding or quality loss.
- **FR-003**: A non-image file (e.g. a PDF receipt) MUST never be processed by this feature — it
  uploads exactly as selected.
- **FR-004**: If client-side resizing fails for any reason, the system MUST fall back to uploading
  the original, unmodified file rather than blocking the attachment.
- **FR-005**: A resized photo MUST still pass the server's existing attachment validation (allowed
  file type, size cap) — this feature must never produce an attachment the server would otherwise
  reject.
- **FR-006**: A resized photo MUST preserve the same visual orientation the original photo would
  have shown before this feature existed — no sideways or upside-down results introduced by
  resizing.
- **FR-007**: If a resize attempt would produce a larger file than the original, the system MUST
  upload the original instead.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A typical modern phone camera photo (several megabytes, thousands of pixels on the
  long side) uploads as a meaningfully smaller file after this feature, without a human-noticeable
  loss of legibility for its purpose (reading a receipt, plate, or odometer).
- **SC-002**: Every existing attachment capability (PDF upload, an already-small image, the
  camera-capture flow, the general upload flow, across service records/fuel records/documents)
  continues to work exactly as it does today.
- **SC-003**: No attachment upload is ever blocked or fails as a direct result of this feature —
  worst case, an unresized original still uploads.

## Assumptions

- The resize threshold and output quality are implementation-chosen reasonable defaults (no
  specific number was mandated) — documented in plan.md/research.md, not user-configurable.
- Converting a PNG/WebP input to JPEG output on resize is acceptable for this app's exclusive use
  case (photos of receipts/documents/odometers) — not a general-purpose image tool with
  transparency or lossless requirements.
- This is a pure loading/bandwidth optimization — no new UI control, no user-visible setting, no
  change to what attachments look like once uploaded (beyond the intentional resize itself) or how
  they're displayed/downloaded afterward.
- The existing server-side EXIF-stripping pass (JPEG APP1 segment removal) remains unchanged and
  still runs on whatever bytes arrive — this feature doesn't replace or duplicate that
  responsibility, it only changes what's uploaded before that step ever runs.
