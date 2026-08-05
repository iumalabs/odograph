# Phase 0 Research: Fuel Record CRUD + Attachments

## Fuel-economy calculation: ordering and division-safety

**Decision**: Compute economy at read time in the repository layer, in a single per-vehicle query:

1. Fetch every fuel record for the vehicle, ordered by `odometer_reading ASC, created_at ASC` (the
   `created_at` tiebreak makes ordering deterministic when two records share an odometer reading).
2. Walk the ordered list; for each record after the first, `delta = record.odometerReading -
   previous.odometerReading`.
3. If `delta > 0`: economy is computed from `delta` and `record.volume` (see unit formulas below).
   If `delta <= 0` (no previous record, or a non-positive delta from a same/lower odometer
   reading): economy is `null` — the explicit "not enough data" state (FR-009).
4. Return the ordered list with `fuelEconomy: number | null` attached to each record; the route
   layer filters this down to the single requested record for the detail endpoint, or returns the
   full list for the list endpoint — but always computed from the *whole* vehicle's records, never
   a value fetched from a stored column.

**Rationale**: Ordering by odometer reading (not creation order) is required by spec.md's edge
case: an owner can backfill an earlier fill-up after later ones already exist, and the "previous
fill-up" must always mean "the record with the next-lower odometer reading," not "whatever was
created most recently." Computing this at read time (never storing `fuelEconomy` as a column)
means an edit to any record's odometer reading automatically produces correct economy figures for
every record around it on the very next read, with no separate recomputation/cache-invalidation
step to get wrong (FR-008) — this is the same reasoning constitution Principle II already applies
project-wide.

**Alternatives considered**:
- **Store economy as a column, recompute on every write to neighboring records**: rejected —
  requires identifying and updating every "downstream" record whenever an odometer reading
  changes anywhere in the vehicle's history (an edit to record N could change record N+1's stored
  economy), which is exactly the kind of cache-invalidation complexity Principle II's "never
  client-side, always derived" framing is designed to avoid. A single sorted read-time pass is both
  simpler and always correct.
- **Order by `created_at` (creation order) instead of odometer reading**: rejected — explicitly
  contradicts spec.md's backfill edge case; creation order has no necessary relationship to
  chronological/odometer order once backfilling is allowed.

## Fuel economy unit formulas

**Decision**:
- Kilometer-based vehicles (`odometerUnit: "km"`): **L/100km** = `volume / (delta_km / 100)`.
- Mile-based vehicles (`odometerUnit: "mi"`): **MPG** = `delta_mi / volume` (US gallon, matching
  the "gallons" assumption below).

**Rationale**: These are the two standard fuel-economy expressions paired with each distance unit
already in use (spec 006's `odometerUnit`); no third unit system is introduced. The API returns a
single `fuelEconomy: number | null` per record — the client already knows the vehicle's
`odometerUnit` (it's rendering that vehicle's screen) and derives the correct label ("L/100km" or
"MPG") from it, the same way the client already labels odometer figures without the server
re-stating the unit on every record (spec 006/007 precedent).

**Alternatives considered**: returning both a value and a unit string per record — rejected as
redundant: the unit is a property of the vehicle, not the individual fuel record, and is already
known wherever a fuel record is rendered.

## Fuel volume unit: liters vs. gallons

**Decision**: Derived from the vehicle's existing `odometerUnit`, not a new independently-settable
field: `km` vehicles record volume in liters, `mi` vehicles record volume in (US) gallons. No new
column on `vehicles` or `fuel_records` — this is a display/interpretation convention applied
uniformly at the API boundary (same layer that already turns `odometerUnit` into economy-unit
labels above), not stored data.

**Rationale**: This is the common real-world pairing (metric-distance countries use liters,
US-imperial usage pairs miles with gallons) and reuses a field that already exists and is already
proven to work this way for distance figures — adding a second, independently-selectable unit
field would let a vehicle end up in an inconsistent state (e.g. km + gallons) that the UI would
then have to handle for no real benefit, when no such combination was requested.

**Alternatives considered**: a new `volumeUnit` field on `vehicles`, freely combinable with
`odometerUnit` — rejected as unnecessary flexibility for a v1 feature; can be added later as a
genuinely additive change (a new nullable column, defaulting to the derived value) if a real need
for the km+gallons/mi+liters combination ever surfaces.

## Attachment validation: reuse vs. reimplement

**Decision**: Reuse `src/server/attachments/{validate,strip-exif,storage}.ts` verbatim — no
changes, no fuel-specific variants.

**Rationale**: Spec 007 already researched and hand-rolled magic-byte detection, JPEG EXIF
stripping, and the R2 storage wrapper for exactly this purpose (receipt/photo attachments on a
tenant-owned record); fuel-record receipts have the identical validation requirements (same
allowed formats, same size cap, same EXIF/GPS privacy concern). Only the R2 key convention
changes: `tenants/{tenantId}/fuel-records/{fuelRecordId}/{attachmentId}`, mirroring service
records' `tenants/{tenantId}/service-records/{serviceRecordId}/{attachmentId}` shape exactly —
`attachmentKey()` already takes the parent-record id as a parameter, so no code change is needed
there either, just a different `serviceRecordId`-shaped argument.

**Alternatives considered**: a generic "attachment owner type" abstraction (service record OR fuel
record) — rejected as premature generalization for two call sites; if a third attachment-bearing
entity appears later, that's the point to generalize, not before (matches the project's existing
preference for concrete, duplicated-but-simple code over speculative abstraction, e.g. how vehicle
and service-record repository functions already don't share a generic "tenant-scoped CRUD" base).

## Client UI: extending spec 008's design system

**Decision**: `FuelRecordPanel.tsx` mirrors `ServiceRecordPanel.tsx`'s structure (list + empty
state + inline add-form + attachment upload/chips), reusing the same token-driven inline styles
and the existing `AddIcon`/`UploadIcon`/`ReceiptIcon` icon components — no new icons needed. The
economy figure renders as a right-aligned mono value next to cost/odometer, using `var(--acc)` for
a computed value and `var(--dim)` with an explicit "—" placeholder for the "not enough data" state
(never a blank cell, so it's visibly a known-absent value rather than looking like missing data
loaded incorrectly).

**Rationale**: Spec 008 shipped a complete, reusable design system and component pattern one
feature ago specifically so later features wouldn't re-derive styling decisions — FR-014 requires
using it, and `ServiceRecordPanel.tsx` is the closest existing precedent (same list+form+attachment
shape) to mirror directly.

**Alternatives considered**: a shared generic `RecordPanel` component parameterized over
service/fuel records — rejected for the same reason as the attachment-abstraction alternative
above: two call sites with real per-entity differences (fuel records have no `odometerReading`
free-text description the way service records do; they have an economy column) don't yet justify
a shared abstraction layer, and forcing one now risks the same premature-generalization cost noted
in spec 007's own precedent (which never generalized vehicles/service-records into a shared base
despite the CRUD shape being nearly identical).
