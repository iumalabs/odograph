# Phase 0 Research: Search Across Vehicles and Records

## Decision: Direct SQL `LIKE`, no full-text-search index/service

**Decision**: Four `SELECT ... WHERE tenant_id = ? AND (colA LIKE ? OR colB LIKE ?) ESCAPE '\'`
queries, one per entity type, run via `Promise.all` — no D1 FTS5 virtual table, no external
search service (e.g. Cloudflare-adjacent hosted search).

**Rationale**: spec.md's own Assumptions section settles this — "no external search
index/service." At this app's scale (a personal/small-fleet vehicle tracker; a tenant's total row
count across all four tables is realistically in the hundreds, not millions), a handful of
`tenant_id`-scoped `LIKE` queries is fast enough and avoids the operational overhead of standing
up and keeping a search index in sync with four separate tables. `LIKE` in SQLite (D1's engine)
is case-insensitive for ASCII by default, covering the common case without extra code.

**Alternatives considered**:
- *D1/SQLite FTS5 virtual table*: Rejected — real added complexity (a shadow table per searched
  table, kept in sync via triggers or app-level writes) for a scale where a plain `LIKE` scan is
  already fast; also a schema-level commitment (virtual tables, triggers) disproportionate to a
  "quality-of-life" feature per the milestone's own framing.
- *An external hosted search service*: Rejected — a new operational dependency and a new class of
  data-residency question (tenant data replicated to a third service) for no scale benefit at this
  app's size.

## Decision: Escape `%`/`_` before embedding the query in a `LIKE` pattern

**Decision**: A pure `escapeLikePattern(query)` helper replaces `\` → `\\`, `%` → `\%`, `_` → `\_`
in the user's raw query before it's wrapped as `%<escaped>%` and bound with `LIKE ? ESCAPE '\'`.

**Rationale**: Without escaping, a user searching for a literal `%` or `_` (e.g. part of a VIN or
a shop name containing an underscore) would have those characters silently act as SQL wildcards
instead of matching literally — a correctness bug a real user could actually hit, not a
theoretical edge case, given VINs and business names routinely contain both characters.

**Alternatives considered**:
- *Don't escape, accept the wildcard leakage as a known quirk*: Rejected — this is cheap to fix
  correctly (one small pure function) and the alternative is a real, user-visible incorrect-match
  bug, not just a cosmetic issue.

## Decision: Search is a new top-level route, not nested under `vehicles.ts`

**Decision**: `GET /api/v1/search?q=...` lives in a new `src/server/routes/v1/search.ts`, mounted
directly on the app (like `account.ts`/`tokens.ts`/`push.ts`) — not as a route inside
`vehicles.ts`, and not vehicle-id-scoped at all.

**Rationale**: Every prior read route in this codebase (`/:vehicleId/aggregates`,
`/:vehicleId/expense-breakdown`, `/:vehicleId/report.pdf`, etc.) is scoped to one already-known
vehicle, resolved via `findVehicleById` before anything else runs. Search has no such starting
point — spec.md's own framing is explicit that the point is finding *which* vehicle a match
belongs to, so there is no vehicle id to resolve first. This makes it structurally different from
every prior route, and the file placement should reflect that rather than forcing it into
`vehicles.ts`'s vehicle-nested shape.

**Alternatives considered**:
- *A route nested under `vehicles.ts` anyway, iterating all the caller's vehicles server-side*:
  Rejected — `vehicles.ts`'s existing routes are all conceptually "operations on one vehicle
  identified in the URL"; forcing a tenant-wide operation into that file/pattern would be a worse
  fit than giving it its own top-level file, consistent with how `account.ts` (also tenant-wide,
  not vehicle-scoped) already has its own file.

## Decision: No duplicate exclusion — a deliberate divergence from the aggregate features

**Decision**: `searchTenantData` does not filter on `duplicateOfId` at all — a record flagged as a
semantic duplicate (constitution D-005) is included in results exactly like any other record.

**Rationale**: `computeVehicleAggregates`/`computeVehicleExpenseBreakdown`/`buildReportData` all
exclude duplicate-flagged records because *counting* the same real-world event twice would
overstate a cost total — a correctness requirement specific to summation. Search has no such
failure mode: showing a duplicate-flagged record in results doesn't "count" anything twice, and a
user might be searching specifically to find and resolve a flagged duplicate (spec.md's own
framing). Applying the aggregates' exclusion rule here would actively work against a real use
case, not protect one.

**Alternatives considered**:
- *Apply the same exclusion for consistency with other read paths*: Rejected — "consistency" isn't
  a goal in itself when the two features have different correctness requirements; spec.md
  explicitly documents this as a considered, deliberate difference, not an oversight to reconcile.

## Decision: Result shape — grouped by entity type, each carrying its own vehicle reference

**Decision**: The response groups matches by entity type (`vehicles`, `serviceRecords`,
`fuelRecords`, `documents`), and every non-vehicle result includes its `vehicleId` (and, for
display, the owning vehicle's name) so the client can navigate straight to the right vehicle.

**Rationale**: spec.md's own FR-008 requires this — "each non-vehicle result identifying which
vehicle it belongs to." A flat, ungrouped list would still need a type discriminator per item;
grouping by type up front is simpler for the client to render (one section per type) and matches
how the design mockup's own nav groups things by kind rather than presenting one undifferentiated
list.

**Alternatives considered**:
- *One flat, mixed-type list*: Rejected — would need the exact same per-item type/vehicle
  metadata anyway, with no rendering benefit over pre-grouping it server-side.
