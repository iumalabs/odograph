# Research: Service Record CRUD + Attachments

## Magic-byte validation: hand-rolled, no dependency

**Decision**: A ~15-line function comparing an upload's first bytes against four known signatures —
JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF` at offset 0 + `WEBP` at offset 8,
skipping the variable 4-byte RIFF chunk size in between), PDF (`%PDF-`). The declared `Content-Type`
header is never trusted for the accept/reject decision — only the sniffed type is.

**Rationale**: For exactly four known formats, hand-rolling is smaller, has zero supply-chain
surface, and is trivially auditable — a reviewer can read the whole check in one screen. `file-type`
(the most common npm option) works in Workers but ships a 100+-format tokenizer abstraction built
for a much broader problem than a fixed four-format allowlist; `magic-bytes.js` is smaller but still
buys little over a direct byte comparison at this scope.

**Alternatives considered**: `file-type` — rejected, disproportionate surface for the actual need.
`magic-bytes.js` — rejected for the same reason, marginally.

## EXIF/GPS stripping: hand-rolled JPEG marker-segment removal, JPEG-only

**Decision**: A JPEG-specific function that walks the file's marker segments from the SOI (`FFD8`)
and drops every APP1 (`FFE1`) segment — where EXIF (including GPS) lives — copying every other
segment through unmodified, stopping at SOS (`FFDA`) and copying the remaining entropy-coded scan
data verbatim. PNG and WebP uploads are stored as-is, not stripped — see spec.md's Assumptions for
why that's a documented scope boundary, not an oversight.

**Rationale**: No actively-maintained, Workers-compatible library does this well — the two evaluated
(`exif-be-gone`, `no-exif`) are Node-stream/Buffer-based and unmaintained. The operation itself is
narrow enough (delete a byte range, don't parse or rewrite EXIF semantics) that hand-rolling is both
simpler and more trustworthy than adapting a Node-oriented library to Workers. JPEG is the format
the constitution's own Principle V rationale names explicitly ("GPS-tagged photos leak the vehicle
owner's home address") and the one phone cameras overwhelmingly use for GPS-tagged EXIF — PNG's
`eXIf` chunk (a 2017 spec addition) and WebP's optional EXIF flag are both rare in practice (most
phone-originated WebP is transcoded from JPEG without carrying EXIF forward), so scoping the
guarantee to JPEG covers the real-world risk without inflating this feature into a general
metadata-stripping library.

**Alternatives considered**: A full PNG chunk-stripper (drop `eXIf`/`tEXt`/`iTXt`/`zTXt` chunks,
same length-prefixed-segment pattern) — deferred, not rejected outright; noted as a reasonable v1.1
addition once the JPEG path is proven, not required for this feature's Principle V compliance since
the spec's own Assumptions already scope the guarantee to JPEG.

## R2 upload handling: buffer via `arrayBuffer()`, not stream-through

**Decision**: Read the full upload into memory with `await c.req.arrayBuffer()`, enforce a
`Content-Length` pre-check against the size cap before reading, run magic-byte detection and (for
JPEG) EXIF stripping against the buffered bytes, then `put()` the resulting `Uint8Array` to R2 with
`httpMetadata.contentType` set to the sniffed (not declared) type.

**Rationale**: Both magic-byte sniffing and JPEG marker-walking need random access to the buffered
bytes — neither can operate on a stream without buffering internally anyway. Given the 10MB size cap
(spec.md's Assumptions) sits comfortably inside a Worker's default 128MB memory limit even with a
second, stripped copy held simultaneously, buffering is the simpler, correct choice here — streaming
straight to R2 would only be worth it if this feature skipped validation entirely, which Principle V
doesn't allow. `Content-Length` is checked first as a fast-fail (reject before allocating anything
for a request that's already claiming to be oversized) and the actual buffered byte length is also
checked afterward as a fallback for a missing or understated header.

**Alternatives considered**: Streaming the request body straight into R2's `put()` — rejected,
incompatible with needing to inspect and modify the bytes before they're stored.

## R2 binding and key naming

**Decision**: New binding `ATTACHMENTS` (R2Bucket), added to `wrangler.toml`'s default/preview/
production sections following the existing D1/KV pattern. Object keys are
`tenants/{tenantId}/service-records/{serviceRecordId}/{attachmentId}` — tenant-scoped in the key
itself (defense in depth alongside the D1-side ownership check, and makes a future bulk-erasure pass
for a tenant's objects a simple prefix list, consistent with constitution Principle VIII's
per-prefix erasure-decision requirement).

**Rationale**: Mirrors the existing binding-per-resource pattern (`DB`, `SESSION_CACHE`, `EMAIL`)
rather than introducing a new naming convention. The tenant-prefixed key path means a bug that
somehow bypassed the D1 ownership check would still not let one tenant enumerate or guess another
tenant's object keys, since the tenant id segment isn't guessable from a public API surface (object
keys are never returned to the client directly — only attachment ids, resolved server-side).

**New infrastructure needed**: An R2 bucket doesn't exist yet on this account (no prior feature has
used R2) — provisioning it (`preview` and `production` buckets) is an external, one-time action
outside this repository's CI, the same category as the D1/KV resources created once during
bootstrap. Flagged for the repo owner before this feature can be deployed and live-smoke-tested,
same shape as prior features' external dependencies (Google OAuth client, Cloudflare Email Service
domain onboarding).
