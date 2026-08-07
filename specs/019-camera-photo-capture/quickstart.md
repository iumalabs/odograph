# Quickstart: Camera Photo Capture

`deno task check` covers formatting, linting, typechecking, and the existing server-side attachment
test suite (unchanged by this feature). Camera-opening behavior itself is device/browser-dependent
and not reproducible under `vitest`/`workerd` — verify live per the manual walkthrough below, using
a real build (`deno task build:preview`), not `deno task dev`.

Manual walkthrough:

1. `deno task build:preview` and open the preview URL (or `deno task dev` for the desktop-fallback
   steps, since camera hardware isn't required there).
2. **On a phone (User Story 1)**: open a vehicle's service record or fuel record panel, tap "Take
   Photo." Confirm the device's native camera app opens directly (not a general photo library
   browser). Capture a photo. Confirm it appears in the record's attachment list, matching the same
   pill style as an existing file-picker upload.
3. **On the same phone, cancel path (FR-007)**: tap "Take Photo" again, then back out of the camera
   without capturing anything. Confirm no upload occurs and no error is shown.
4. **On a desktop browser (User Story 2)**: open the same panel, click "Take Photo." Confirm a
   standard file/photo picker opens (not an error, not a dead end) and that selecting an existing
   image uploads and attaches it exactly as "Choose File" already does.
5. **Oversized photo (User Story 3 / FR-006)**: attempt to attach a photo larger than 10 MB (e.g. via
   "Choose File" with a large test image, since deliberately producing an oversized camera capture
   is device-dependent). Confirm the error shown specifically indicates the photo was too large, not
   the generic error message.
6. **Unsupported format (User Story 3 / FR-006)**: attempt to attach a file that isn't JPEG/PNG/
   WebP/PDF (e.g. a `.txt` file via "Choose File"). Confirm the error shown specifically indicates
   an unsupported format, not the generic error message.
7. **Accessibility (FR-008)**: using keyboard only (Tab/Enter), confirm "Take Photo" is reachable and
   activatable, and that a screen reader (or the browser's accessibility inspector) announces a
   real name for the control, not "button" alone.
8. Repeat steps 2-6 for a fuel record, not just a service record, to confirm parity between the two
   panels.
