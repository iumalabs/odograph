# Implementation Plan: Camera Photo Capture

**Branch**: `019-camera-photo-capture` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-camera-photo-capture/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Adds a "Take Photo" entry point beside the existing "Attach a photo or receipt" file picker on the
service record and fuel record panels. It uses the browser's native camera-capture affordance
(`<input type="file" accept="image/*" capture="environment">`) so supporting devices open the camera
directly, while devices without a camera silently get the ordinary photo picker — no feature
detection needed, no new server endpoint, no new dependency. The one behavioral addition beyond the
new entry point is client-side: the existing upload functions start surfacing the server's already-
returned `file_too_large` / `unsupported_file_type` error codes (previously discarded) as specific
user-facing messages instead of one generic failure message.

## Technical Context

**Language/Version**: TypeScript (Vite-built React 19 SPA client) — same as the existing client.
Client-only change; no server-side (Hono/Workers) route, validation, or schema change of any kind.

**Primary Dependencies**: None new. Uses the existing `fetch`/`File`/HTML
`<input type="file" capture>` browser primitives already available to the client bundle.

**Storage**: Unchanged. Same R2 attachment objects and `service_record_attachments` /
`fuel_record_attachments` D1 tables (specs/007, specs/009) — no schema change, no new columns.

**Testing**: No new `deno task test` coverage — this repo has no client-side unit-test harness
(`vitest.config.ts` only exercises `tests/server/**` under `@cloudflare/vitest-pool-workers`; see
specs/018-pwa-installability/plan.md for the same precedent), and camera-capture behavior is
inherently browser/device-dependent, not reproducible under `workerd`. Verified live via
`deno task build:preview` + a real device/browser per quickstart.md. Automated end-to-end coverage
for this flow is out of scope for this implementation — e2e/ is owned by a separate QA process.

**Target Platform**: Every browser visiting the Vite-built, Workers-served client. The "Take Photo"
control's camera-opening behavior manifests on camera-equipped mobile browsers (iOS Safari, Chrome/
Android); on desktop or camera-less devices the identical control degrades to the standard photo
picker (FR-003) — both paths are the same markup, no branching client code required.

**Performance Goals**: No throughput target. SC-001's "one continuous action" bar is a UX property
(no intermediate save-to-device step), not a latency budget.

**Constraints**: MUST NOT introduce any new upload path, size limit, or format allow-list — the
existing 10 MB cap and magic-byte allow-list (`src/server/attachments/validate.ts`) apply unchanged
to camera-captured photos (Assumptions). MUST NOT require any script or attribute the existing
strict CSP (specs/015-csp-nonces) doesn't already allow — `capture` is a plain HTML attribute, not
inline script, so no CSP change is needed.

**Scale/Scope**: 2 client components extended (`ServiceRecordPanel.tsx`, `FuelRecordPanel.tsx`), 2
client API modules extended (`service-records.ts`, `fuel-records.ts`) to surface the server's
existing error codes, `App.tsx`'s two upload handlers extended to map those codes to specific
messages, 1 new icon (`CameraIcon`), a handful of new i18n strings. No server route changes, no
migrations, no new dependencies.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — N/A, no data-access code touched; the existing
  ownership-checked attachment endpoints are reused unmodified.
- **II. Server-Computed, Division-Safe Aggregates** — N/A.
- **III. Idempotent, Ordered Offline Sync** — N/A to *this* feature specifically (no write queue
  exists yet — that's #20); this feature assumes normal online connectivity throughout (spec.md
  Assumptions) and makes no offline-write claim of its own.
- **IV. No Interpolated Data** — N/A, no data of any kind involved.
- **V. Private Object Storage with Validated Uploads** — PASS: reuses the existing validated upload
  path (magic-byte detection, size cap, EXIF stripping, ownership-checked reads) unchanged; this
  feature adds only a new client-side entry point into that path, never bypasses or weakens it.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: no new script source or CSP
  accommodation is needed (`capture` is a declarative HTML attribute); the existing rate limiting on
  the attachment POST endpoints (`rateLimitBySession`) is untouched and still applies to
  camera-captured uploads exactly as it does to file-picker uploads today.
- **VIII. GDPR Erasure by Design** — N/A: no new table, column, or R2 key prefix is introduced —
  camera-captured attachments are ordinary attachment rows already covered by the erasure decision
  documented in specs/007/009's data-model.md (R2 objects deleted before the owning record's D1 row).
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: every new user-facing
  string (the "Take Photo" label, the two specific error messages) routes through `t()` against
  `src/client/i18n/strings.ts`, per FR-001/FR-006.
- **X. Toolchain Discipline** — PASS: no new dependency; `deno task check` (fmt, lint, typecheck,
  test, repository-boundary check) gates this feature exactly as every other feature.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change; this feature ships
  through the existing `vite build` / `build:preview` / `build:production` tasks already wired into
  every deploy workflow.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-camera-photo-capture/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature introduces no new API endpoint or request/response shape —
it reuses the existing `POST /api/v1/{service-records,fuel-records}/:id/attachments` contract
documented in specs/007-service-record-crud and specs/009-fuel-record-crud unchanged (data-model.md
records the one behavioral note: the client now reads a field of that existing response it
previously ignored).

### Source Code (repository root)

```text
src/client/
├── design/
│   └── icons.tsx                    # extended: + CameraIcon (hand-rolled, not in the mockup's
│                                     #   icon sheet — per that file's own rule for such cases)
├── i18n/
│   └── strings.ts                   # extended: + takePhotoLabel, attachmentTooLargeError,
│                                     #   attachmentUnsupportedTypeError
├── service-records.ts               # extended: uploadAttachment() throws a typed
│                                     #   AttachmentUploadError carrying the server's error code
├── fuel-records.ts                  # extended: same, for fuel record attachments
├── components/
│   ├── ServiceRecordPanel.tsx       # extended: new "Take Photo" trigger + capture input,
│   │                                 #   alongside the existing "Choose File" toggle
│   └── FuelRecordPanel.tsx          # extended: same
└── App.tsx                          # extended: handleUploadAttachment /
                                      #   handleUploadFuelAttachment map the typed error's code to
                                      #   a specific message, falling back to genericError otherwise
```

No `src/server/`, `migrations/`, or `wrangler.toml` changes — every server-side piece this feature
depends on (validation, error codes, storage, EXIF stripping) already exists and is reused as-is.

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories.
This is a client-only change set confined to `src/client/`, following the same layout every prior
client feature already uses.
