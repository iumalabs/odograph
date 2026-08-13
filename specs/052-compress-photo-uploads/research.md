# Phase 0 Research: Compress Photo Attachments Before Upload

## Decision: 1600px longest-dimension threshold, JPEG quality 0.82

**Decision**: Resize only when `max(width, height) > 1600`; when resizing, re-encode as JPEG at
quality `0.82`.

**Rationale**: 1600px matches the performance audit's own suggested fix and is a well-established
"legible but not print-quality" target for a receipt/odometer photo viewed on a phone or laptop
screen — comfortably larger than any screen width this app is likely to be viewed on, so nothing
visually softens compared to today. Quality 0.82 is a conservative middle ground (JPEG quality
below ~0.7 starts showing visible blocking artifacts on text-heavy receipt photos; above ~0.9 gives
back most of the size savings the resize step is trying to achieve). Both are implementation
constants, not user-configurable, matching spec.md's Assumptions.

**Alternatives considered**: A byte-size target (e.g. "compress until under 500KB") instead of a
dimension cap. Rejected — iterative re-encoding to hit a byte target requires a
compress/measure/retry loop (more complexity, unpredictable runtime), whereas a single fixed
dimension + quality pass is O(1) and already gets most of the win, since dimension is the dominant
factor in a modern phone camera's file size (a 4000×3000 JPEG at any reasonable quality dwarfs a
1600×1200 one).

## Decision: `createImageBitmap` + `<canvas>` + `toBlob`, all standard browser APIs

**Decision**: `compressImageIfNeeded` uses `createImageBitmap(file)` to decode, draws it scaled
into a plain `<canvas>` via `CanvasRenderingContext2D.drawImage`, then calls
`HTMLCanvasElement.toBlob(callback, "image/jpeg", 0.82)` to get the re-encoded bytes, and wraps the
result in a new `File`.

**Rationale**: All three are long-standing, universally-supported browser APIs — no new dependency,
matching this project's existing "prefer standard platform APIs" pattern (e.g. the hand-rolled
magic-byte/EXIF-strip code server-side, chosen for the same reason per their own research notes).
`createImageBitmap` is preferred over an `<img>` element + `onload` because it's promise-based
(cleaner async flow, no DOM element needed) and is decode-only (no layout/paint side effects).

## Decision: rely on the browser's native EXIF-orientation-aware decode — no hand-rolled correction

**Decision**: This feature does not read or interpret the EXIF `Orientation` tag itself. It relies
on the fact that `createImageBitmap` (per the current, broadly-shipped Canvas/ImageBitmap spec
default) and `<img>`-based decoding both apply EXIF orientation automatically when decoding a JPEG
in evergreen browsers today — so the pixels drawn into the canvas are already correctly
right-side-up, and the re-encoded JPEG output has the correction baked into its pixel data (with no
EXIF tag needed afterward, since the server's existing `stripJpegExif` would delete any EXIF
segment anyway).

**Rationale**: Hand-rolling EXIF orientation parsing/correction would duplicate real complexity
(8 possible orientation values, some requiring a transpose+flip, not just a rotate) that the
platform already solves correctly and consistently. FR-006's requirement ("preserve the same
visual orientation... before this feature existed") is satisfied precisely because the decode step
this feature already needs (to draw into a canvas at all) is the same step that applies the
correction — there's no separate mechanism to get wrong.

**Alternatives considered**: Explicitly pass `{ imageOrientation: "from-image" }` to
`createImageBitmap`. Considered but not required — this is the current spec default in evergreen
browsers, so passing it explicitly is redundant; however, since older/inconsistent default
behavior was a real historical footgun in this exact API, the implementation will pass it
explicitly anyway as a defensive, self-documenting choice rather than relying on an unstated
default — this is a one-argument addition, not added complexity.

## Decision: single shared helper, called from the 3 existing upload functions, not from components

**Decision**: `compressImageIfNeeded` lives in one new file and is called once per upload function
(`service-records.ts`, `fuel-records.ts`, `documents.ts`), each in a single added line right before
their existing `fetch`. No `ServiceRecordPanel.tsx`/`FuelRecordPanel.tsx`/`DocumentPanel.tsx`
component code changes.

**Rationale**: All three components already funnel through these three functions for every
attachment path (camera-capture input and general file-upload input alike — confirmed by reading
all three panels' `<input type="file">` usages), so this is the one integration point that covers
every scenario in spec.md's User Story 1/2 without touching UI code at all. Matches FR-003
(non-image files pass through untouched) naturally too, since the helper's own type check is the
only gate — no per-input-type branching needed at the call sites.

## Decision: no automated test — verified manually plus the existing server-side attachment suite

**Decision**: No new test file. Verification is `deno task check` (confirms the existing
server-side attachment tests, which exercise the *server's* contract, still pass unmodified) plus a
manual quickstart walkthrough.

**Rationale**: Same situation as spec 051 — no client component/unit test harness exists in this
repo. The server-side tests already fully cover "does a valid JPEG upload succeed / does an invalid
file get rejected," which is the contract this feature must not break; there is nothing new on the
server to test, since this feature only changes client-side bytes before they're sent through an
already-tested endpoint.
