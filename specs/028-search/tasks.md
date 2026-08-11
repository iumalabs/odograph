# Tasks: Search Across Vehicles and Records

**Input**: Design documents from `/specs/028-search/` **Prerequisites**: plan.md, spec.md,
data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — per-entity-type match correctness, cross-tenant isolation, case-
insensitivity, partial-word matching, short-query rejection, empty-result validity, duplicate
inclusion, LIKE-escape correctness.

## Phase 1: Setup

None — no migration, no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 In `src/server/db/repository.ts`, add the PURE `escapeLikePattern(query: string):
      string` helper (data-model.md) — escapes `\`, `%`, `_` in that order, so a literal percent
      sign or underscore in a search query matches literally rather than acting as a SQL wildcard
      (research.md)
- [X] T002 In `src/server/db/repository.ts`, add `searchTenantData(db, ctx, query)` per
      data-model.md: four `Promise.all`'d queries (vehicles; service_records JOIN vehicles; fuel_
      records JOIN vehicles; documents JOIN vehicles), each `WHERE <table>.tenant_id = ? AND
      (<field> LIKE ? OR <field> LIKE ?) ESCAPE '\'` using the escaped query from T001, each
      scoped directly by `ctx.tenantId` (no upfront `findVehicleById`-style check — there's no
      single vehicle id here, FR-009); returns `SearchResults` grouped by entity type; does NOT
      filter on `duplicateOfId` (FR-007, research.md's deliberate divergence from the aggregate
      features)

**Checkpoint**: `escapeLikePattern` and `searchTenantData` exist, type-check, and are directly
callable — no route wired yet.

---

## Phase 3: User Story 1 - An owner finds a record without remembering which vehicle it's on (P1) 🎯 MVP

**Goal**: End-to-end tenant-wide search, correct matches across all four entity types.

- [X] T003 [US1] Create `src/server/routes/v1/search.ts` (new top-level route file, mounted like
      `account.ts`/`tokens.ts` — not nested under `vehicles.ts`, research.md): `GET /` behind
      `tenantContextOrToken` (matching every other read route's auth posture, not the
      session-only posture `account.ts`'s sensitive write route uses); validates `q` (required,
      trimmed length >= 2, FR-002) — `400` with nothing searched otherwise; calls
      `searchTenantData` and returns its result directly (already grouped by entity type,
      contracts/api.md); read-only, not rate-limited
- [X] T004 Wire `search` into `src/server/index.ts` under `/api/v1/search`
- [X] T005 [P] [US1] Create `tests/server/search.test.ts` (match-correctness section): 1. A query
      matching a vehicle's name/make/model/VIN returns that vehicle (FR-003). 2. A query matching
      a service record's description/notes, a fuel record's station/notes, or a document's
      title/notes returns that record, each including its `vehicleId`/`vehicleName` (FR-004,
      FR-005, FR-006, FR-008). 3. A query matching nothing returns all-empty arrays, `200`, not an
      error (FR-010, SC-004). 4. A partial-word, mixed-case query still matches (SC-003).

**Checkpoint**: `deno task test` passes for the match-correctness section.

---

## Phase 4: User Story 2 - Search never reveals another tenant's data (P1)

**Goal**: Cross-tenant isolation, proven directly (this route has no vehicle id to inherit
scoping from, so it needs its own explicit isolation test, not a reused vehicle-ownership check).

- [X] T006 [P] [US2] Extend `search.test.ts` (isolation section): seed matching vehicles/service
      records/fuel records/documents under two different tenants using the *same* search term,
      search from one tenant, and confirm only that tenant's own results appear across all four
      result arrays (SC-002, FR-009).

**Checkpoint**: `deno task test` passes for the isolation section.

---

## Phase 5: User Story 3 - A too-short query is rejected (P2)

**Goal**: The 2-character minimum, enforced before any D1 access.

- [X] T007 [P] [US3] Extend `search.test.ts` (short-query section): 1. A one-character (or empty,
      or whitespace-only-after-trim) query is rejected (`400`) rather than matching everything
      (SC-005, FR-002). 2. A missing `q` parameter is also rejected (`400`).

**Checkpoint**: `deno task test` passes for the short-query section.

---

## Phase 6: Polish — duplicate inclusion and LIKE-escape correctness

**Goal**: The two behaviors most likely to be silently broken by a future refactor if not
directly tested: the deliberate non-exclusion of duplicates, and correct escaping of `%`/`_`.

- [X] T008 [P] Extend `search.test.ts` (duplicate-inclusion section): seed a service record and a
      same-date/same-description duplicate of it, search for their shared text, and confirm BOTH
      appear in `serviceRecords` — the deliberate divergence from
      `computeVehicleAggregates`/`computeVehicleExpenseBreakdown`'s exclusion rule (FR-007,
      research.md)
- [X] T009 [P] Extend `search.test.ts` (LIKE-escape section), speckit-analyze cleanup — split into
      a true pure unit test plus an integration-level proof: 1. Direct assertions on
      `escapeLikePattern` itself (no D1, no HTTP): `escapeLikePattern("50%")` produces the
      backslash-escaped literal, same for `_` and for a literal backslash. 2. End-to-end via
      `searchTenantData`/the route: seed one record containing a literal `%` in its notes and one
      that doesn't, search for the `%`-containing substring, and confirm only the first is
      found — not "everything" (proving the escaping actually prevents wildcard leakage in
      practice, not just that the helper's output looks right in isolation). Same for `_`.

## Phase 7: Client

- [X] T010 [P] Implement `src/client/search.ts`: thin wrapper for `GET /api/v1/search?q=...`,
      mirroring `vehicle-aggregates.ts`'s `jsonFetch` pattern
- [X] T011 Implement `src/client/components/SearchBar.tsx`: a text input plus a grouped results
      list (one section per entity type, each item showing its matched text and, for non-vehicle
      results, which vehicle it belongs to and a way to navigate there); an empty-state message
      when there are no results yet or nothing matched; new UI strings routed through the
      existing i18n infrastructure (constitution Principle IX)
- [X] T012 Modify `src/client/App.tsx` (or `Garage.tsx`, whichever renders the top-level
      multi-vehicle view): mounts `SearchBar` at the garage/dashboard level, not inside the
      per-selected-vehicle panels section (plan.md — the point of search is finding which vehicle
      to select, so it belongs above that selection, not inside it)

## Phase 8: Polish & Cross-Cutting

- [X] T013 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary
      guard) and fix any failures across all files touched by this feature
- [X] T014 Walk through quickstart.md end-to-end against `deno task dev`

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — `searchTenantData` is shared
  by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** → **User Story 3 (Phase 5)**: soft — all
  three extend the same route/test file.
- **Phase 6 (Polish — duplicate/escape)**: after Phase 3 (needs the working search path to test
  against) — can run any time after, not gated on Phases 4-5.
- **Phase 7 (Client)** → after Phase 5 (needs the full, validated route contract).
- **Phase 8 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That delivers "search finds the right record on the
right vehicle" — this feature's entire point. User Story 2 (cross-tenant isolation) is scheduled
immediately after since, unlike every prior route, this one has no vehicle-ownership check to
inherit isolation from — it needs its own direct proof. User Story 3 (short-query rejection) and
the Phase 6 polish items (duplicate inclusion, LIKE-escaping) round out correctness without
blocking the MVP.
