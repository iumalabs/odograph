# Data Model: RU/EN Language Toggle

This feature has no server-side or D1 data entities (spec.md Key Entities: "the selected
language is a client-side, per-device preference... not server-persisted data"). The only
"entity" is a client-side preference type, mirroring `theme.ts`'s `Theme` type exactly:

```ts
export type Language = "en" | "ru";
```

**Persistence**: `localStorage` key `odograph:language`, value one of the two strings above.
Missing or invalid stored value defaults to `"en"`.

**Relationships**: None. Independent of `Theme`, of the existing currency/distance-unit
preferences, and of any server-side/session data (Principle IX, FR-005).

**Validation rules**: None beyond the type itself — reading an unrecognized stored value falls
back to `"en"` rather than throwing (same defensive-read pattern `theme.ts`'s
`readStoredTheme()` already uses).

**State transitions**: `"en" ↔ "ru"`, toggled by the user via the RU/EN control; no other
transition exists.
