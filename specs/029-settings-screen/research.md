# Research: Dedicated Settings Screen

## Decision: New nav destination follows the existing `AppView` + `NAV_ITEMS` pattern exactly

**Rationale**: `AppShell.tsx` already switches between three top-level views (`"garage" |
"dashboard" | "review"`) via a plain string union held as component state in `App.tsx`
(`useState<AppView>("garage")`), with `NAV_ITEMS` driving the icon rail and `App.tsx` branching on
`view` with early returns. Adding `"settings"` as a fourth union member and a fourth `NAV_ITEMS`
entry is a direct, zero-risk extension of an already-proven pattern (dashboard and review were
both added this same way in specs 013/014 and 021) — no router, no new state-management approach
needed.

**Alternatives considered**: A modal/overlay settings panel instead of a full nav destination —
rejected because the mockup icon sheet treats settings as a peer of other nav-level actions, and a
modal would be inconsistent with how Dashboard/Review (the two most recently added destinations)
are both full nav-switched screens, not modals.

## Decision: Settings icon ported verbatim from the mockup's icon sheet

**Rationale**: `docs/odograph-design.zip`'s "Иконки и лого" file (icon reference sheet) contains an
explicit settings glyph — a two-row sliders icon (not a gear/cog) — labeled "НАСТРОЙКИ", built from
the same stroke rules every other icon in `src/client/design/icons.tsx` already follows (`viewBox
0 0 24 24`, `currentColor` stroke, `strokeWidth 1.75`, round caps/joins, no fills except the
existing carve-out for filled dots). Its path data:
`M4 7.5h8M17 7.5h3` + `circle cx=14.5 cy=7.5 r=2.3` + `M4 16.5h4M12.5 16.5h7.5` + `circle cx=10.2
cy=16.5 r=2.3`. This is ported directly, matching how every existing icon in `icons.tsx` was
sourced (see that file's own header comment).

**Alternatives considered**: A generic gear/cog icon (the more common "settings" convention on the
web) — rejected in favor of exactly matching the mockup's own chosen glyph, consistent with this
project's practice of porting mockup icons verbatim rather than substituting a generic equivalent.

## Decision: No new test harness introduced

**Rationale**: The codebase currently has zero client-side unit tests (`tests/client/*` does not
exist) and zero e2e coverage of `ApiTokens`/`PushNotifications`/`AccountDeletion`. This feature
relocates existing, already-shipped components without touching their internals, so there is no
new logic to unit-test. Verification for this feature follows the same practice already used for
every other client-only change in this codebase: `deno task check` (fmt/lint/typecheck/build) plus
a manual `deno task dev` walkthrough confirming the relocated screen renders and each of the three
features still works end-to-end.

**Alternatives considered**: Introducing a client testing framework (e.g. Testing Library) as part
of this feature — rejected as out of scope; that is a standalone infrastructure decision this
small relocation feature should not bundle in, and QA/e2e infrastructure is explicitly owned by a
separate agent per this project's working agreement, not the dev-agent spec-kit cycle.

## Decision: `SettingsView` is a thin composition component, not a rewrite

**Rationale**: `ApiTokens`, `PushNotifications`, and `AccountDeletion` already each manage their
own expand/collapse state, error handling, and API calls independently (each is a
self-contained, already-tested-in-production component). `SettingsView` simply renders all three
in sequence with a heading, mirroring how `App.tsx` today just lays them out in a flex-wrap row —
no props need to change, no shared state needs to be lifted, since none of the three components
depend on each other.

**Alternatives considered**: Redesigning the three components into a unified settings-page layout
(e.g. tabs, an accordion shared across all three) — rejected per spec.md's explicit
"move, not a redesign" scope boundary (FR-005/FR-006/FR-007).
