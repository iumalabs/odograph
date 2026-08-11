# Phase 0 Research: Maintenance History PDF Export

## Decision: `pdf-lib` for PDF generation

**Decision**: Use `pdf-lib` (`npm:pdf-lib@^1.17.1`), declared in `deno.json`'s `imports` map
exactly like every existing dependency (e.g. `web-push-browser`).

**Rationale**: Confirmed workerd-compatible — pure JS, no native bindings, no `fs`/Node-only
`Buffer`-specific APIs, operates on `Uint8Array`/`ArrayBuffer` throughout. It builds PDFs
programmatically (text, shapes, embedded fonts) rather than converting HTML, which matches this
feature's need exactly (a simple, generated text/table report) without requiring a headless
browser binding Workers doesn't have. Real-world precedent exists for PDF generation on `workerd`
using this exact library. Adds roughly 250KB gzipped to the Worker bundle, well within Cloudflare's
size limits.

**Alternatives considered**:
- *HTML-to-PDF via a headless browser (e.g. Cloudflare's Browser Rendering)*: Rejected — a much
  heavier dependency (a whole browser-automation binding) for a report that's plain text/tables,
  no CSS layout needed; also a different pricing/infrastructure surface than a pure-JS library.
- *A different pure-JS PDF library*: Rejected — no better-documented, equally simple alternative
  specifically for programmatic (non-HTML) PDF generation was found; `pdf-lib` is the established
  choice for this exact use case on Workers.

## Decision: Split "what goes in the report" from "how it's laid out on the page"

**Decision**: `buildReportData(vehicle, services, fuels)` is a pure function (no `pdf-lib`, no I/O)
that computes the exact structured content — rows, per-field "not provided" fallbacks, and summary
totals. `renderReportPdf(data)` is a separate function that only handles `pdf-lib` layout/
pagination, with zero business logic of its own.

**Rationale**: A generated PDF's raw bytes are not reliably substring-searchable for verifying
exact text content in a test without also taking on a PDF-*parsing* dependency (a second new
dependency this feature doesn't otherwise need, and `pdf-lib`'s own content-stream encoding isn't
a stable contract to test against). Splitting the concern means every correctness question this
spec actually cares about — which records are included, how missing fields render, whether sums
are right, whether duplicates are excluded — is answered by fast, direct unit tests on
`buildReportData`'s plain-object output, with no PDF involved at all. `renderReportPdf` then only
needs a thin smoke test (valid `%PDF-` header, non-trivial byte length) since its only job is
"faithfully lay out already-correct data," not decide what's correct.

**Alternatives considered**:
- *One combined function, tested only via PDF structural smoke tests*: Rejected — this would mean
  the feature's actual correctness requirements (FR-004 through FR-008) have no direct test
  coverage, only an indirect "a PDF came back" check.
- *Add a PDF-parsing library to enable full content-based test assertions*: Rejected — a second
  new dependency solely for test verification, when a pure-function split achieves the same
  confidence for free.

## Decision: New `getVehicleHistoryForReport` repository helper, reusing the established shape

**Decision**: `getVehicleHistoryForReport(db, ctx, vehicleId)` returns
`{ services: ServiceRecord[], fuels: FuelRecord[] }` — the same
`Promise.all([listServiceRecords(...), listFuelRecordsWithEconomy(...)])` call plus the same
`duplicateOfId === null` filter `computeVehicleExpenseBreakdown` (specs/026) and
`computeVehicleAggregates` (specs/013) both already use, just without folding the result into
sums.

**Rationale**: A third near-identical inline fetch+filter (this would be the third call site doing
the exact same `Promise.all` + filter shape) is better extracted once than copy-pasted a third
time — the report's route handler and `buildReportData` both need the same filtered, unaggregated
lists `computeVehicleExpenseBreakdown` computes over but doesn't expose.

**Alternatives considered**:
- *Inline the fetch+filter directly in the route handler, as the two existing aggregate functions
  each do*: Rejected — three near-identical inline blocks is exactly the kind of duplication
  worth naming once, especially since this is the third occurrence, not the second.

## Decision: Report download is a plain URL, not a fetch+blob dance

**Decision**: The client exposes `reportDownloadUrl(vehicleId)` — a plain string URL builder — and
the UI renders a normal link/button pointing at it; the browser handles the download natively via
the response's `Content-Disposition: attachment` header.

**Rationale**: This mirrors the existing `attachmentDownloadUrl` pattern (`documents.ts`/
`service-records.ts`) exactly — a same-origin, cookie-authenticated `GET` request doesn't need
`fetch()` + `Blob` + manual `<a download>` object-URL construction; the browser's native handling
of `Content-Disposition: attachment` on a direct navigation already does the right thing, and is
simpler than the client-side fetch/blob pattern some SPAs use for downloads that actually need
in-memory processing first (which this feature doesn't).

**Alternatives considered**:
- *`fetch()` + `Blob` + object URL, matching how some file-download UIs work*: Rejected as
  unnecessary complexity — there's no client-side processing step between "server has the bytes"
  and "browser should save them," so the plain-URL approach already established for attachments
  is sufficient and consistent.
