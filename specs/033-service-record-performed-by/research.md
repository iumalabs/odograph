# Phase 0 Research: Service Record Performed-By Field

No `[NEEDS CLARIFICATION]` markers were left in the spec, so this phase confirms implementation-level
decisions already implied by the codebase's existing conventions rather than resolving open unknowns.

## Decision: Column shape

**Decision**: `performed_by TEXT CHECK (performed_by IN ('self', 'shop') OR performed_by IS NULL)`,
nullable, no default.

**Rationale**: D1 (SQLite) has no native enum type; a `CHECK` constraint is the established way this
project encodes a small fixed value set in a column (see `migrations/0015_documents.sql`'s `category`
column). Nullable with no default matches the spec's explicit "unset is a first-class, permanent
state" requirement (FR-006) — existing rows get `NULL` for free on migration, no backfill statement
needed.

**Alternatives considered**: A separate boolean (`is_self_performed`) loses the "unset" state without
a second nullable column, which is strictly worse than one `TEXT` column. A foreign key to a lookup
table is unwarranted for a fixed two-value set that will not grow (constitution: no speculative
abstraction).

## Decision: Client form control

**Decision**: A native `<select>` with three `<option>`s (empty string → unset, `"self"`, `"shop"`),
following the exact pattern `DocumentPanel.tsx` already uses for `DocumentCategory` (a `CATEGORIES`
array, a `*Label()` switch function routed through `t()`, a `<select>` bound to `value`/`onChange`).

**Rationale**: The mockup shows a two-way toggle, but this codebase has no existing toggle/segmented-
control component — introducing one for a single field would be a new UI primitive for no reuse
benefit. A `<select>` is the closest existing pattern that already handles the "one of a few labeled
values, one of which is empty/unset" shape (`DocumentPanel`'s category field), keeping this feature
free of new components per the codebase's own established convention.

**Alternatives considered**: Two radio buttons — visually closer to the mockup's toggle, but not
reusing any existing pattern in this codebase and not clearly better for a nullable field (a third,
implicit "neither selected" radio state is less discoverable than an explicit "—" option in a select).
Not chosen; can be revisited later as a pure visual polish pass if desired, independent of this
feature's data-layer scope.

## Decision: Where labels live

**Decision**: Three new i18n keys — one field label, one for "self", one for "shop" — added to
`src/client/i18n/strings.ts` alongside the existing `documentCategory*` keys, following the same
naming convention (`performedByLabel`, `performedBySelf`, `performedByShop`).

**Rationale**: Every other user-facing string in this codebase already routes through `t()`
(constitution Principle IX); this is a direct continuation, not a new pattern.
