# Quickstart: Compress Photo Attachments Before Upload

## Prerequisites

- `deno task dev` running locally, signed in, with at least one vehicle.

## Scenario 1: a large photo uploads smaller

1. Open a service record, fuel record, or document panel's attachment upload (either the
   camera-capture input or the general "Upload" input).
2. Select a large photo (several MB, thousands of pixels on the long side — e.g. an actual phone
   camera photo, or any downloaded high-resolution JPEG for testing).
3. In the browser's network panel, inspect the actual request body size sent to
   `POST /api/v1/{service-records,fuel-records,documents}/{id}/attachments` — confirm it's
   meaningfully smaller than the original file's size.
4. Open the resulting attachment (download it) and confirm it's still clearly legible and correctly
   oriented (matches how the original photo would have looked).

## Scenario 2: a small image and a PDF are untouched

1. Attach an image well under the resize threshold (e.g. a small screenshot) — confirm the network
   request body size matches the original file exactly (no re-encoding happened).
2. Attach a PDF via the general "Upload" input — confirm it uploads byte-identical to the original
   (same size, same `Content-Type: application/pdf`).

## Scenario 3: orientation is preserved

1. Using a phone (or a photo known to carry EXIF rotation metadata — e.g. a portrait photo taken
   with the phone held sideways relative to the sensor), attach it via the camera-capture input.
2. Confirm the uploaded/displayed attachment is right-side-up, matching what the photo looks like
   in the phone's own gallery app — not sideways or upside-down.

## Scenario 4: compression failure doesn't block the upload

1. In dev tools, temporarily break `createImageBitmap` or `HTMLCanvasElement.toBlob` (e.g. via a
   console override) to simulate an unsupported/failing browser API.
2. Attach a photo — confirm the upload still succeeds (with the original, unresized file), rather
   than failing or hanging.
