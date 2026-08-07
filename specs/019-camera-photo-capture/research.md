# Phase 0 Research: Camera Photo Capture

No `[NEEDS CLARIFICATION]` markers remained in spec.md's Technical Context — the decisions below
were already recorded as Assumptions there. This file expands each into its rationale and the
alternatives considered, per `/speckit-plan`'s Phase 0 requirement.

## Decision: Native `capture` attribute over a custom in-app viewfinder

**Decision**: Implement "Take Photo" as a second, capture-hinted file input —
`<input type="file" accept="image/*" capture="environment">` — rather than a custom camera UI built
on `MediaDevices.getUserMedia()` + `<canvas>`. It's revealed by its own toggle button, mirroring the
existing "Attach a photo or receipt" control's reveal-then-interact pattern exactly (own state,
mutually exclusive with the existing upload toggle so at most one file input exists per record row
at a time), rather than an always-mounted hidden input auto-clicked via a ref. Two considerations
drove that specific shape, beyond the base `capture`-attribute decision:
- **e2e compatibility**: `e2e/tests/attachments.spec.ts` locates the existing upload input via
  `row.locator('input[type="file"]')` with no further narrowing — a second, simultaneously-mounted
  `<input type="file">` in the same row would make that locator match two elements and throw a
  Playwright strict-mode violation (default since ~1.14, still default in the
  `@playwright/test@^1.55.0` this repo's e2e/ pins). Never mounting both inputs for the same row at
  once avoids this without touching e2e/ (owned by a separate process, not this implementation).
- **Reliable user-gesture chain**: an always-mounted hidden input clicked programmatically via a ref
  callback re-fires on every re-render (inline ref functions get a new identity each render, so
  React detaches/reattaches on every commit while any state changes), which would reopen the camera
  unexpectedly; routing through `useEffect` to click once avoids that but breaks on browsers (Safari
  in particular) that only honor `.click()` on a file input within the same synchronous task as the
  actual user gesture. Reusing the existing toggle-then-interact pattern sidesteps both problems
  entirely by relying on the native input's own click, not a proxied one.

**Rationale**:
- Zero new permission model to design: the browser's native camera app handles permission prompts,
  device selection (front/back/external), and the actual capture UI (shutter, flash, retake) for
  free. A `getUserMedia`-based viewfinder would require building and maintaining all of that
  in-app.
- Zero feature detection required: browsers that don't support `capture` simply ignore the
  attribute and fall back to the ordinary file/photo picker — which is exactly User Story 2's
  required fallback behavior, delivered by the platform itself rather than app-level branching
  logic.
- Produces the same `File` object the existing `uploadAttachment()`/`uploadFuelAttachment()`
  functions already consume — no new upload plumbing, no new encoding step (a `getUserMedia` +
  `canvas.toBlob()` approach would need to reconstruct a `File`/`Blob` and pick a re-encoding
  quality, introducing a lossy step this approach avoids entirely).
- Consistent with constitution Principle V: the bytes that reach the server are exactly what the
  device camera app produced, sniffed and validated the same way as any other upload — no new
  trust boundary is introduced.

**Alternatives considered**:
- **`getUserMedia` + live in-app viewfinder**: rejected — meaningfully more implementation surface
  (permission UI, device switching, retake/confirm flow, encoding), and delivers no acceptance
  criterion from spec.md that the simpler approach doesn't already satisfy. Worth revisiting only if
  a future requirement needs in-app retake/crop before upload, which spec.md explicitly doesn't ask
  for.
- **`capture="user"` (front camera) or no `capture` hint at all**: rejected — `environment` (rear
  camera) is the correct default for photographing a vehicle, an odometer, or a receipt; `user`
  (selfie camera) has no plausible use case here, and omitting the hint entirely would leave the
  browser to pick a default (typically still rear-facing, but explicit is clearer intent).

## Decision: Surface the server's existing error codes instead of adding a new response shape

**Decision**: `uploadAttachment()`/`uploadFuelAttachment()` (in `service-records.ts`/
`fuel-records.ts`) parse the JSON body on a non-2xx response and throw a small typed
`AttachmentUploadError` carrying the server's already-returned `error` field (`"file_too_large"` |
`"unsupported_file_type"` | unrecognized), instead of the current bare
`throw new Error(...: ${res.status})`. `App.tsx`'s two upload handlers catch that type and map its
`code` to one of two new specific strings, falling back to `genericError` for anything else
(network failure, unrecognized code, etc.).

**Rationale**: The server (`src/server/routes/v1/service-records.ts:122-133`,
`fuel-records.ts` equivalent) already returns `{ error: "file_too_large" }` /
`{ error: "unsupported_file_type" }` with a `400` status — this information exists today and is
silently discarded by the client's `if (!res.ok) throw new Error(...)`. No server change, no new
response field, no version negotiation: this is purely a client-side change to stop discarding data
already on the wire.

**Alternatives considered**:
- **Add a new, richer server error response shape**: rejected — unnecessary; the existing shape
  already carries what FR-006 needs.
- **Inspect `res.status` alone (400 vs. other) without reading the body**: rejected — `400` is
  returned for both `file_too_large` and `unsupported_file_type`; only the body distinguishes them,
  and distinguishing them is the entire point of FR-006/User Story 3.

## Decision: No client-side image compression/resizing

**Decision**: Camera-captured photos are uploaded as-is, subject to the same existing 10 MB cap and
magic-byte allow-list as any other attachment — no client-side downscaling or re-encoding step is
added.

**Rationale**: Recorded as an Assumption in spec.md; modern phone camera JPEGs are almost always
well under the existing 10 MB cap in practice, and adding a compression step would introduce a new
lossy transformation, a new failure mode (compression itself failing or hanging on a low-end
device), and new implementation surface the feature description didn't ask for. If oversized camera
photos turn out to be a real-world problem post-launch, User Story 3's specific "too large" message
at least tells the user why, which is the more valuable near-term fix.

**Alternatives considered**:
- **Client-side `canvas`-based downscale before upload**: rejected for v1 — real complexity
  (quality/size trade-off, device performance variance) for a problem not established to occur in
  practice; revisitable later with real usage data.
