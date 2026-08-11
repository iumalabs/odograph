# Implementation Plan: Search Across Vehicles and Records

**Branch**: `028-search` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-search/spec.md`

## Summary

Add a new, tenant-wide (not vehicle-nested) `searchTenantData(db, ctx, query)` repository
function running four parallel, tenant-scoped `LIKE` queries — one each against `vehicles`,
`service_records`, `fuel_records`, `documents` — and a new top-level route file (`search.ts`,
mounted like `account.ts`/`tokens.ts`, not nested under `vehicles.ts` like every other read route
so far) exposing `GET /api/v1/search?q=...`. No new table, no external search index/service — a
direct, computed-on-read SQL substring match, deliberately not excluding semantic duplicates
(unlike the cost-aggregate features).

## Technical Context

**Language/Version**: TypeScript 5.9, Cloudflare Workers (`workerd`)

**Primary Dependencies**: None new.

**Storage**: D1 — no new table. Four `SELECT ... WHERE tenant_id = ? AND (col1 LIKE ? OR col2
LIKE ?) ESCAPE '\'` queries (one per entity type), run in parallel via `Promise.all`, each scoped
by `ctx.tenantId` directly (this route has no vehicle id to resolve first, unlike every other
route in this codebase — tenant scoping is the only isolation boundary here, still enforced the
same way, per-query).

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` — same real-D1, `SELF.fetch` integration
pattern every other feature's route tests use; a small set of direct unit tests on the LIKE-escape
helper (pure function, no D1) for correctness against `%`/`_` in a user's query.

**Target Platform**: Cloudflare Workers (`workerd`); client adds a single search input + results
view, not nested inside a selected vehicle's panels (spec.md — the point is finding which vehicle
to go to, so this lives at the garage/dashboard level, not inside `App.tsx`'s
per-selected-vehicle section).

**Project Type**: Web application (existing single-Worker structure) — touches
`src/server/db/repository.ts`, a new `src/server/routes/v1/search.ts`, `src/server/index.ts`, and
a small `src/client/` addition (a new `search.ts` client wrapper + a `SearchBar`/`SearchResults`
component pair, mounted at the garage level).

**Performance Goals**: No new target — four independent, indexed-by-`tenant_id` `LIKE` queries
per search request; acceptable at this app's scale (a personal/small-fleet vehicle tracker, not a
multi-tenant SaaS with millions of rows per tenant).

**Constraints**: Repository layer remains the only D1 access point (Principle I) — this route has
no vehicle id to pre-resolve via `findVehicleById` (unlike every prior vehicle-nested route), so
tenant scoping is enforced directly in each of the four queries' own `WHERE tenant_id = ?` clause,
not via a pre-check; a query's `%`/`_` characters are SQL-escaped before being embedded in a
`LIKE` pattern, so a literal percent sign or underscore in a user's search term is matched
literally, not treated as a wildcard; a query shorter than 2 characters is rejected before any D1
access (FR-002); semantic duplicates are deliberately NOT excluded (FR-007, spec.md's documented
divergence from Principle-II-adjacent aggregate behavior — this isn't an aggregate, it's a lookup).

**Scale/Scope**: One new repository function (four parallel queries + a shared LIKE-escape
helper), one new top-level route file, one new client wrapper, a small new client UI (search input
+ grouped results list, not a full panel).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Tenant isolation via repository layer | All four queries live in `repository.ts`, each with its own `WHERE tenant_id = ?` clause scoped by `ctx.tenantId` — no vehicle id to pre-resolve, so isolation is enforced per-query rather than via a single upfront `findVehicleById` check (a structural difference from every prior route, not a weaker guarantee) | PASS |
| II, III | N/A — no aggregates computed, no offline-queue writes (read-only) | N/A |
| IV. No Interpolated Data | A search result shows only what actually matched — no inferred/guessed relevance ranking beyond "it matched" (spec.md Assumptions) | PASS |
| V-VIII | N/A — no attachments, no API tokens, no session changes, no new stored/erasable data | N/A |
| IX. i18n axes | New UI strings (search placeholder, group headings, empty-state text) route through the existing i18n infrastructure | PASS |
| X. Toolchain discipline | No new dependency | PASS |
| XI-XII | English-only artifacts; deploys only via the existing GitHub Actions pipeline | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/028-search/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/server/
├── db/
│   └── repository.ts                  # ADD: escapeLikePattern(query) (pure, no D1) and
│                                        #      searchTenantData(db, ctx, query) — four parallel
│                                        #      LIKE queries against vehicles/service_records/
│                                        #      fuel_records/documents, tenant-scoped, no
│                                        #      duplicate exclusion
├── routes/v1/
│   └── search.ts                       # ADD: mounted at /api/v1/search (top-level, like
│                                        #      account.ts/tokens.ts — not nested under
│                                        #      vehicles.ts, since this route is tenant-wide)
└── index.ts                            # MODIFY: app.route("/api/v1/search", search)

src/client/
├── search.ts                            # ADD: thin client wrapper for GET /api/v1/search?q=...
└── components/
    └── SearchBar.tsx                    # ADD: a search input + grouped results list, mounted
                                          #      at the garage/dashboard level (not inside a
                                          #      selected vehicle's panels)

tests/server/
└── search.test.ts                       # ADD: per-entity-type match correctness, cross-tenant
                                          #      isolation, case-insensitivity, partial-word
                                          #      match, short-query rejection, empty-result
                                          #      validity, duplicate-inclusion (the deliberate
                                          #      divergence), LIKE-special-character escaping
```

**Structure Decision**: `search.ts` is a new top-level route file (peer of `account.ts`/
`tokens.ts`/`push.ts`), not nested under `vehicles.ts` like every prior read route — this is the
first tenant-wide (not single-vehicle-scoped) read in the app, and the client UI similarly lives
at the garage level rather than inside `App.tsx`'s per-selected-vehicle section, since its whole
purpose is finding *which* vehicle to select next.
