# Phase 0 Research: Replace Russian Ruble with Kyrgyzstani Som

No `[NEEDS CLARIFICATION]` markers were left in the spec.

## Decision: Symbol is `с`, matching the existing single-glyph convention

**Decision**: Kyrgyzstani Som's `CURRENCY_SYMBOLS` entry is `"с"` (the informal, widely-used
single-character abbreviation), not the word "som" or the ISO code "KGS" as the displayed glyph.

**Rationale**: Unlike USD/EUR/RUB/GBP, the Kyrgyzstani som has no dedicated Unicode currency symbol
in common use (no equivalent to `₽`/`₴`/`₸` for som). `с` is the closest match to this app's
existing convention of a single glyph per currency, keeping cost figures' visual width consistent
with the other three.

## Decision: Old stored `"RUB"` values fall back to the existing default, no migration needed

**Decision**: `readStoredCurrency`'s validator simply no longer recognizes `"RUB"` — an owner whose
browser still has that value stored falls through to the function's existing `"USD"` default,
exactly like any other invalid/missing stored value already does today.

**Rationale**: This is the same fallback path spec 035 already built and this app already relies on
elsewhere (e.g. a corrupted or manually-edited `localStorage` value); no new migration or special-
casing is needed to satisfy FR-004.
