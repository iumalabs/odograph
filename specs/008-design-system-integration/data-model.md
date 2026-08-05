# Phase 1 Data Model: Design System Integration

This feature introduces no server-side or D1 schema changes. It restyles the presentation of
existing entities (`Vehicle` — spec 006, `ServiceRecord`/`Attachment` — spec 007) without changing
their shape, and adds exactly one new piece of state, held entirely client-side.

## Theme preference (client-only, not persisted server-side)

| Field | Type | Notes |
|-------|------|-------|
| `theme` | `"dark" \| "light"` | Defaults to `"dark"` (the converged design direction) when no stored value exists. |

- **Storage**: browser `localStorage`, one key (e.g. `odograph:theme`).
- **Not a D1 table, not tenant-scoped, not synced across devices** — spec.md Assumptions and
  research.md's "Theme persistence" decision. No GDPR erasure design is needed (constitution
  Principle VIII) because this data never leaves the user's device or reaches the server; clearing
  browser site data already erases it.
- **Read**: on `App` mount, before first paint if possible (to avoid a flash of the wrong theme).
- **Write**: whenever the user activates the theme toggle (FR-004).

No other entities, fields, or relationships are introduced by this feature.
