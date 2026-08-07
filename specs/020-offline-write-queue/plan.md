# Implementation Plan: Offline Write Queue

**Branch**: `020-offline-write-queue` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-offline-write-queue/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Adds a client-side offline write queue (IndexedDB-backed) that every covered mutation (vehicle
create; service/fuel record create/edit/delete/dismiss-duplicate; reminder create/delete/mark-done)
is routed through instead of calling `fetch` directly. Each queued action gets a client-generated
UUID that doubles as the idempotency key (and, for creates, the resource's own id — assigned before
the record ever reaches the server). The queue drains as one strictly-ordered, single-flight loop —
ordering is a byproduct of never having more than one request in flight, not a server-side
reordering mechanism. Server-side, a new tenant-scoped `write_operations` table backs a small,
opt-in idempotency middleware: replaying the same `Idempotency-Key` returns the original stored
response instead of re-executing the write. Create endpoints additionally accept a client-supplied
`id`, falling back to server-generation when absent (fully backward compatible with existing API
token clients from specs/017). No change to specs/010's duplicate detection, which continues to
operate unchanged inside the same create paths.

## Technical Context

**Language/Version**: TypeScript throughout — Vite-built React 19 SPA client, Hono/Workers server.

**Primary Dependencies**: New — `idb` (Jake Archibald's minimal Promise-based IndexedDB wrapper,
~1.2KB gzipped, same PWA-tooling lineage as the already-installed `workbox-*` packages). This is a
deliberate exception to defaulting to zero new dependencies: hand-rolled raw IndexedDB (callback-
and-event based, easy to get transaction lifetimes subtly wrong) is a correctness risk this
feature's entire purpose — never losing a user's offline entry — can't absorb (research.md).
No other new dependency; the server side uses only what's already in `deno.json`.

**Storage**: New client-side storage — one IndexedDB database, one object store for pending
actions (browser-native, no application server involved). New server-side storage — one D1 table,
`write_operations` (idempotency ledger), migration `0013_idempotency_keys.sql`. No changes to any
existing table.

**Testing**: Split by layer, unlike specs/018-019 (which had no server-testable surface at all).
Server-side idempotency middleware and client-supplied-id creates get full `tests/server/**`
coverage under `@cloudflare/vitest-pool-workers` (this is ordinary, fully-testable Worker logic —
same pattern as `tests/server/api-tokens.test.ts`). The client queue engine (IndexedDB, drain loop,
`navigator.onLine`) has no equivalent under this repo's `vitest.config.ts` (no browser/IndexedDB
globals in the `workerd` test pool) and is verified live per quickstart.md, same precedent as
specs/018/019. Automated e2e coverage is out of scope for this implementation (owned by a separate
QA process, not touched here).

**Target Platform**: Every browser visiting the Vite-built, Workers-served client. IndexedDB and the
`online`/`offline` events are supported in every browser this project already targets (same set as
specs/018-pwa-installability's service worker).

**Performance Goals**: No throughput target. The queue drains one request at a time by design
(ordering guarantee, not a performance optimization) — SC-005's "completes a large backlog" is a
correctness bar (doesn't fail outright), not a latency target.

**Constraints**: MUST NOT reorder actions for the same vehicle (FR-005) — satisfied structurally by
single-flight, strictly-FIFO draining of one global queue, since a per-vehicle order is always a
subsequence of a correctly-maintained total order; no per-vehicle bookkeeping is needed. MUST NOT
lose a pending action across an app/device restart (FR-008) — satisfied by IndexedDB being the
source of truth for the queue, not in-memory React state. MUST NOT treat a rate-limited (429) or
network-transient failure as a rejection (FR-010) — the drain loop's retry/backoff logic is the
enforcement point. MUST NOT weaken session security while handling long-offline session expiry
(FR-011) — detecting a 401 pauses the queue and prompts re-authentication; it never silently retries
with a known-stale session or extends one client-side.

**Scale/Scope**: New client module `src/client/offline/` (4 files: db, network-status, queue,
merge). 4 existing client mutation modules extended to route through it (11 functions total). 4
existing panel-ish components extended with pending/rejected visual markers, plus 1 new small
sync-status indicator component. Server: 1 migration, 1 new middleware file, 4 route files extended
(idempotency wrapping + client-supplied-id on creates). New i18n strings. New `tests/server/`
coverage for the idempotency middleware and client-id creates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: `write_operations` is tenant-scoped
  (`tenant_id` FK, `ON DELETE CASCADE`); every idempotency lookup is keyed by `(tenant_id,
  idempotency_key)`, never by `idempotency_key` alone, so one tenant's key can never short-circuit
  or leak into another's. Idempotency-key storage/lookup happens through the same repository layer
  as everything else — route handlers still never reach D1 directly.
- **II. Server-Computed, Division-Safe Aggregates** — N/A, no aggregate math in this feature.
- **III. Idempotent, Ordered Offline Sync** — this feature *is* the direct implementation of this
  principle: client-generated UUID idempotency key on every queued write (FR-006); per-vehicle
  creation order preserved via single-flight FIFO draining (FR-005); server rejections marked
  needing-attention, never silently dropped or silently treated as success (FR-009/FR-013).
- **IV. No Interpolated Data** — PASS: a pending action shown optimistically is real user input the
  user just entered, not invented data, and it's visibly marked "pending" rather than presented as
  server-confirmed fact (FR-002); a rejected action's changes are explicitly never applied (FR-013),
  so the UI never silently shows a value that isn't actually true server-side.
- **V. Private Object Storage with Validated Uploads** — N/A: attachment uploads are explicitly out
  of scope for this feature (spec.md Assumptions); no R2/upload path is touched.
- **VI. Hardened API Tokens** — PASS: the `Idempotency-Key` header is optional at the HTTP contract
  level — existing API-token clients (specs/017) that don't send it get exactly today's behavior,
  no dedup, no change. Only this project's own web client (which always sends it) gets the new
  behavior.
- **VII. Locked-Down Session and Transport Security** — PASS: a 401 during queue drain pauses
  syncing and surfaces a re-authentication prompt (FR-011); it never retries with the same expired
  session, extends session lifetime client-side, or bypasses the existing session-validation
  middleware in any way.
- **VIII. GDPR Erasure by Design** — decided here, per the constitution's requirement that this be
  settled before the feature ships: `write_operations` rows are **deleted**, not anonymised, on
  account erasure — enforced structurally via `tenant_id ... ON DELETE CASCADE`, consistent with
  every other tenant-scoped table. Rationale: the table holds only transient sync bookkeeping (an
  idempotency key, a stored HTTP response, a timestamp) with no meaning independent of the
  already-erased resources it corresponds to — nothing here needs to survive erasure for audit,
  billing, or legal-hold reasons the way e.g. financial records might.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: every new user-facing
  string (pending/rejected markers, the offline indicator, the sign-in-again prompt) routes through
  `t()` against `src/client/i18n/strings.ts`.
- **X. Toolchain Discipline** — PASS: the one new dependency (`idb`) is declared as an `npm:`
  specifier in `deno.json` and resolved via `deno install`, identically to every existing
  dependency; it runs entirely in the browser (never inside the Worker/`workerd` runtime), so it
  doesn't touch the Deno-vs-`workerd` boundary this principle actually governs.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change. The new migration is
  picked up automatically by the existing `deno task migrate:preview` CI step (already runs on
  every PR per `.github/workflows/deploy-preview.yml`); no local `wrangler deploy` of any kind.

No violations — Complexity Tracking section is not needed. (This is the largest feature built under
this workflow so far; the size is managed through `tasks.md`'s phase/user-story slicing, not through
a constitution exception.)

## Project Structure

### Documentation (this feature)

```text
specs/020-offline-write-queue/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature doesn't add a new externally-facing API shape so much as it
adds one optional request header (`Idempotency-Key`) and one optional request-body field (`id`, on
creates only) to routes that already exist and are already documented in specs/006/007/009/011's
own contracts. data-model.md documents the new `write_operations` table and the header/field
addition instead of a separate contracts file.

### Source Code (repository root)

```text
migrations/
└── 0013_idempotency_keys.sql        # new: write_operations table

src/server/
├── middleware/
│   └── idempotency.ts               # new: Idempotency-Key short-circuit/store middleware
├── db/
│   └── repository.ts                 # extended: write_operations lookups/inserts;
│                                      #   create* functions accept an optional client id
└── routes/v1/
    ├── vehicles.ts                   # extended: idempotency middleware on create;
    │                                  #   nested service/fuel-record/reminder creates too
    ├── service-records.ts            # extended: idempotency middleware on update/delete/
    │                                  #   dismiss-duplicate
    ├── fuel-records.ts               # extended: same
    └── reminder-rules.ts             # extended: idempotency middleware on delete/mark-done

src/client/
├── offline/
│   ├── db.ts                        # new: idb wrapper — opens the IndexedDB database/store
│   ├── network-status.ts            # new: navigator.onLine + online/offline event subscription
│   ├── queue.ts                     # new: enqueue/drain/subscribe/getSnapshot — the engine
│   └── merge.ts                     # new: overlays pending actions onto a server-fetched list
├── vehicles.ts                      # extended: createVehicle routes through the queue
├── service-records.ts               # extended: create/update/delete/dismissDuplicate do too
├── fuel-records.ts                  # extended: same
├── reminder-rules.ts                # extended: create/delete/markDone do too
├── i18n/strings.ts                  # extended: pending/rejected/offline/reauth strings
├── components/
│   ├── SyncStatusIndicator.tsx      # new: small offline/pending/rejected-count indicator (FR-003/FR-012)
│   ├── ServiceRecordPanel.tsx       # extended: pending/rejected marker per record
│   ├── FuelRecordPanel.tsx          # extended: same
│   ├── ReminderRulePanel.tsx        # extended: same
│   └── Garage.tsx                   # extended: pending marker on a not-yet-synced vehicle
└── App.tsx                          # extended: renders server lists merged with queue state
                                       #   via offline/merge.ts; mounts SyncStatusIndicator

tests/server/
└── idempotency.test.ts              # new: replay-returns-original-response, cross-tenant
                                       #   isolation, client-supplied-id honored on create
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories.
Server changes extend the existing `src/server/` tree with one new middleware file and one new
migration; client changes add one new cohesive `src/client/offline/` module rather than scattering
queue logic across the four mutation files it's consumed from.
