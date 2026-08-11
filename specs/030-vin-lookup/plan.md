# Implementation Plan: VIN Lookup on Vehicle Add

**Branch**: `030-vin-lookup` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-vin-lookup/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add make/model/year/VIN fields to the add-vehicle form, plus an explicit "Look up" action that
calls a new server-side proxy route (`GET /api/v1/vin-lookup/:vin`) wrapping the NHTSA vPIC decode
API. On success, only the fields NHTSA actually returned are pre-filled into the (still fully
editable) form; on any failure — network/service error, or a successful-but-empty/undecodable
response — the form degrades to plain manual entry with a non-blocking message. The lookup is a
pre-submit assist step only: it never touches the offline write queue, and vehicle creation itself
is completely unchanged (the fields it accepts are already optional and nullable).

## Technical Context

**Language/Version**: TypeScript; Hono on Cloudflare Workers (server), React 19 (client)

**Primary Dependencies**: No new npm dependency — implemented with the platform `fetch()`, same as
the existing Google OAuth token exchange and Web Push delivery calls.

**Storage**: N/A for the lookup itself (transient, per-form-session, never persisted on its own).
No new D1 migration — `vehicles.make/model/year/vin` are already nullable (migration 0006).

**Testing**: `vitest` via `deno task test` for the server proxy's response-parsing/error-shaping
logic (pure, given a mocked `fetch`); the live call to `vpic.nhtsa.dot.gov` itself is deliberately
not unit-tested, matching this project's established precedent for real external HTTP calls
(`google.ts`, `send-reminder-push.ts`).

**Target Platform**: Cloudflare Workers (server proxy route); browser PWA client (form)

**Project Type**: Web application (Cloudflare Worker backend + React client) — this feature touches
both

**Performance Goals**: N/A beyond "don't make the form feel broken" — a single on-demand lookup
per explicit user action, not a per-keystroke or background call.

**Constraints**: Must degrade gracefully and never block vehicle creation (spec.md FR-006/FR-007/
FR-008); must never show a guessed/partial value (FR-005, constitution Principle IV); must not
enter the offline write queue (FR-009); add-vehicle form must work fully offline exactly as today
when VIN lookup is skipped (FR-010).

**Scale/Scope**: One new server route, one new client wrapper function, form field additions to one
existing component (`Garage.tsx`), no schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Tenant Isolation via Repository Layer)**: The lookup route touches no D1 data at
  all (it's a pure proxy to an external API, keyed by nothing tenant-specific) — no tenant-isolation
  surface exists to violate. It still sits behind `tenantContextOrToken` like every other route
  (signed-in owners only), consistent with the rest of the API surface, but this is an access-control
  choice, not a tenant-isolation requirement. PASS.
- **Principle II (Server-Computed, Division-Safe Aggregates)**: N/A — no aggregate involved. PASS.
- **Principle III (Idempotent, Ordered Offline Sync)**: Directly relevant — VIN lookup MUST NOT go
  through the offline write queue (FR-009); it is a live, non-idempotent read against a third party
  that cannot be queued/replayed like a write. Vehicle creation itself (already offline-queued)
  remains completely unchanged. PASS (by explicit exclusion, not by extension).
- **Principle IV (No Interpolated Data)**: Directly relevant and the feature's central constraint —
  a field NHTSA doesn't return MUST stay blank, never guessed or inferred (FR-003, FR-005). PASS
  (by design).
- **Principle V (Private Object Storage with Validated Uploads)**: N/A — no upload involved. PASS.
- **Principle VI (Hardened API Tokens)**: N/A — unaffected. PASS.
- **Principle VII (Locked-Down Session and Transport Security)**: The new route is a write-adjacent,
  externally-calling read; per this principle's "every write path" rate-limiting mandate and as a
  defense-in-depth measure against relaying abuse traffic to a third party through this app's
  identity, the route is rate-limited via the existing `rateLimitBySession` middleware (same
  mechanism every write route already uses), even though it performs no D1 write. CSP: the app's
  `connect-src` falls back to `default-src 'self'` (`src/server/security/csp.ts`) — a direct
  browser-side fetch to `vpic.nhtsa.dot.gov` would be CSP-blocked, which is exactly why this is a
  server-side proxy route rather than a client-side fetch. PASS (by design).
- **Principle VIII (GDPR Erasure by Design)**: N/A — the lookup result is transient and never
  persisted independently; only the owner-reviewed, owner-saved vehicle fields (already covered by
  existing vehicle erasure handling) are stored. PASS.
- **Principle IX (Separated Language and Locale Axes)**: Directly relevant to why this feature
  degrades gracefully rather than treating an empty NHTSA response as an error — NHTSA's US/Canada-
  focused coverage would otherwise silently under-serve exactly the non-US, metric-unit owners this
  principle protects. New UI strings route through existing i18n infrastructure. PASS.
- **Principle X (Toolchain Discipline)**: No new dependency; `deno fmt`/`deno task check` gate
  applies as normal. PASS.
- **Principle XI (English-Only Project Artifacts)**: Spec, plan, code comments in English. PASS.
- **Principle XII (GitHub-Actions-Only Deployment)**: N/A — no deployment-path change. PASS.
- **D-003 (Auth v1)**: Already establishes Google as a named third-party dependency (OIDC) —
  precedent for depending on a second named third party (NHTSA vPIC); no conflict.

No violations. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/030-vin-lookup/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── vin-lookup/
│   └── decode-vin.ts        # NEW: decodeVin(vin, fetchFn?) -> DecodeResult, mirrors
│                             #      google.ts's ExchangeResult pattern (never throws)
├── routes/v1/
│   └── vin-lookup.ts         # NEW: GET /:vin, behind tenantContextOrToken + rateLimitBySession
└── index.ts                  # MODIFY: mount the new route at /api/v1/vin-lookup

src/client/
├── vin-lookup.ts              # NEW: lookupVin(vin) client wrapper (plain fetch, NOT the
│                               #      offline queue — this is a read, not a write)
├── components/
│   └── Garage.tsx              # MODIFY: add-vehicle form gains make/model/year/vin inputs
│                                #        plus a "Look up" button and status message
├── vehicles.ts                 # MODIFY: createVehicle's input type widens to accept optional
│                                #        make/model/year/vin; hydrateOptimisticVehicle reads
│                                #        them from the action body instead of hardcoding null
└── i18n/strings.ts             # MODIFY: new field labels, lookup button/status strings
```

**Structure Decision**: Touches both the existing single Worker (`src/server/`) and single client
tree (`src/client/`) — no new top-level directory beyond a small `src/server/vin-lookup/` module
for the isolated fetch wrapper, mirroring how `src/server/push/` and `src/server/auth/oidc/` each
isolate their own external-call logic.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
