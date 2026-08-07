# Feature Specification: Camera Photo Capture

**Feature Branch**: `019-camera-photo-capture`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Camera photo capture (issue #19, milestone M7): let users attach a
photo captured directly from the device camera (or picked from the photo library on desktop/no-camera
devices) to a service record or fuel record, alongside the existing file-upload attachment flow.
Standalone feature, independent of the offline write queue (#20) — assume normal online connectivity;
do not design offline queuing or sync semantics here. Compose with the existing R2-backed attachment
upload flow rather than duplicating it."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Take a photo and attach it on the spot (Priority: P1)

An owner standing next to their vehicle after a service or fill-up wants to photograph a receipt or
odometer reading and attach it to the record immediately, without first saving the photo to their
device and then hunting for it in a file picker.

**Why this priority**: This is the entire point of the feature — turning attachment capture into a
single in-the-moment action instead of a two-step "take photo, then go find it" workflow. Without it,
users already have this outcome only through extra manual steps outside the app.

**Independent Test**: On a phone or other camera-equipped device, open a service record or fuel record,
choose "Take Photo," capture a photo with the device camera, and confirm it appears in the record's
attachment list as if it had been uploaded through the existing file picker.

**Acceptance Scenarios**:

1. **Given** a service record or fuel record open on a camera-equipped device, **When** the user
   chooses "Take Photo," **Then** the device's native camera interface opens directly (not a general
   file browser).
2. **Given** the camera interface is open, **When** the user captures a photo, **Then** the photo is
   uploaded through the same attachment flow as an existing file upload and appears in the record's
   attachment list on success.
3. **Given** the camera interface is open, **When** the user cancels without capturing a photo,
   **Then** no upload is attempted and the form returns to its prior state with no error shown.

---

### User Story 2 - Fall back gracefully without a camera (Priority: P2)

An owner working from a desktop computer, or any device without a usable camera, chooses "Take Photo"
expecting to attach an image and should not hit a dead end just because there's no camera to open.

**Why this priority**: "Take Photo" must be safe to offer everywhere attachments are supported today;
if it can dead-end on common devices, it can't replace or sit next to the existing upload entry point
without confusing users.

**Independent Test**: On a desktop browser (or any device without an accessible camera), choose "Take
Photo," confirm a standard photo picker opens instead, select an existing image, and confirm it
uploads and appears as an attachment exactly as it would have via the existing "Choose File" flow.

**Acceptance Scenarios**:

1. **Given** a device without a usable camera, **When** the user chooses "Take Photo," **Then** the
   system falls back to the standard photo/file picker rather than failing or showing an error.
2. **Given** the fallback picker is open, **When** the user selects an existing photo, **Then** it
   uploads and is attached identically to a photo selected via the existing "Choose File" control.

---

### User Story 3 - Understand why a captured photo was rejected (Priority: P3)

An owner captures a photo that turns out to be too large or in an unsupported format and needs to know
specifically what went wrong so they can decide whether to retake it, pick a different photo, or give
up on attaching one for now.

**Why this priority**: Nice-to-have clarity on top of a working capture flow — the capture and fallback
paths (P1/P2) deliver the core value on their own; this improves recovery when validation fails, which
is more likely with camera photos (larger file sizes) than with previously-saved library images.

**Independent Test**: Capture or select a photo that exceeds the existing size limit (or, separately,
an unsupported format) and confirm the error shown names the specific reason, distinct from the
system's generic error message.

**Acceptance Scenarios**:

1. **Given** a captured or selected photo larger than the existing per-attachment size limit, **When**
   the upload is attempted, **Then** the user sees a message specifically indicating the photo was too
   large, not a generic failure message.
2. **Given** a captured or selected photo in a format the system doesn't accept, **When** the upload is
   attempted, **Then** the user sees a message specifically indicating the format isn't supported, not
   a generic failure message.

---

### Edge Cases

- What happens when the user denies the browser's camera permission prompt? The system does not crash
  or hang; the browser's own handling applies and the user can still fall back to picking an existing
  photo.
- What happens when a captured photo exceeds the existing per-attachment size limit? Upload is
  rejected before anything is stored, consistent with existing file-upload validation, with a specific
  "too large" message (User Story 3).
- What happens when a captured photo is in a format the system doesn't recognize as a photo? Upload is
  rejected before anything is stored, consistent with existing file-upload validation, with a specific
  "unsupported format" message (User Story 3).
- What happens if the network drops mid-upload of a captured photo? Same behavior as an existing
  file-picker upload failing mid-flight today — no new offline retry or queuing behavior is introduced
  by this feature.
- What happens when a user takes multiple photos in a row for the same record? Each capture is treated
  as an independent attachment upload, consistent with the existing unbounded per-record attachment
  behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Users MUST be able to trigger a "Take Photo" action from the attachment area of both the
  service record and fuel record forms, alongside the existing file-upload action.
- **FR-002**: On a device with a usable camera, triggering "Take Photo" MUST open the device's native
  camera capture interface directly, rather than a general file/photo browser.
- **FR-003**: On a device without a usable camera (or where direct camera capture isn't supported),
  triggering "Take Photo" MUST fall back to the standard photo/file picker so the action never dead-ends.
- **FR-004**: A photo captured or selected via "Take Photo" MUST be submitted through the existing
  attachment upload flow and be subject to the same server-side validation (size limit, format
  allow-list) as a photo attached via the existing file-upload control.
- **FR-005**: The system MUST NOT introduce a separate upload endpoint, storage location, or data model
  for camera-captured photos — they are stored and retrieved as ordinary attachments.
- **FR-006**: When a captured or selected photo fails validation, the system MUST show the user a
  message that distinguishes "photo too large" from "unsupported photo format," rather than a single
  generic failure message.
- **FR-007**: If the user cancels the camera or picker without producing a photo, the system MUST NOT
  attempt an upload or show an error.
- **FR-008**: The "Take Photo" control MUST be operable via keyboard and have a programmatically
  associated accessible name, consistent with the accessible-name treatment of other controls in the
  attachment area.

*No new entities* — this feature reuses the existing attachment entities and upload path unchanged; see
Assumptions.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a camera-equipped device, a user can go from choosing "Take Photo" to seeing the
  captured photo listed as an attachment in one continuous action, with no manual file-saving or
  browsing step in between.
- **SC-002**: 100% of camera-captured or picker-selected photos that satisfy the existing size and
  format rules upload successfully through the same path as today's file-picker uploads (no regression
  to the existing upload success rate).
- **SC-003**: On desktop or camera-less devices, choosing "Take Photo" results in a working photo
  picker 100% of the time — it never fails to offer a way to attach a photo.
- **SC-004**: When a captured or selected photo is rejected, the user is told the specific reason
  ("too large" vs. "unsupported format") rather than a generic error, in 100% of rejection cases.

## Assumptions

- Camera capture is implemented using the browser/OS's native camera-capture affordance (the same
  mechanism that lets a file input request a fresh device photo directly) rather than a custom in-app
  live camera viewfinder — this maximizes device/browser compatibility and avoids introducing new
  camera-permission and live-preview UI that the feature description didn't ask for.
- Client-side image compression or resizing before upload is out of scope for this feature; the
  existing per-attachment size limit and format allow-list apply unchanged to camera-captured photos.
- No new server endpoints, storage locations, or database tables are introduced; this feature only
  adds a new client-side entry point (and more specific error feedback) into the existing attachment
  upload flow for service and fuel records.
- EXIF stripping, download behavior, and attachment retention/deletion behavior are unchanged from the
  existing attachment flow and are not affected by this feature.
- Normal online connectivity is assumed throughout; offline capture or queued uploads are explicitly
  out of scope and tracked separately (issue #20).
- This feature applies only to the two attachment surfaces that exist today (service records, fuel
  records) — no new record types are introduced.
