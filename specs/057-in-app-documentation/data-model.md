# Phase 1 Data Model: In-App Documentation Viewer

No persisted data, no new API surface — this is purely a client-side content shape, bundled with
the client in `src/client/docs-content.ts`.

## `DocBlock`

A single content unit within a section, rendered in order. Discriminated by `kind`.

| Field | Type | Notes |
|---|---|---|
| `kind` | `"heading" \| "paragraph" \| "list" \| "code" \| "note"` | Determines rendering; matches the design source's `isH`/`isP`/`isList`/`isCode`/`isNote` block types (research.md). |
| `text` | `string` | Present for `heading`, `paragraph`, `code`, `note`. For `code`, this is the literal command/snippet text, rendered in a monospace block — never executed, never interpolated with runtime values. |
| `items` | `Array<{ label: string; text: string }>` | Present only for `kind: "list"`. `label` is the short bolded lead-in (e.g. `"Passkey — "`), `text` is the rest of the line. Never a fixed-length array with blank entries — a section's list is exactly as long as it has real content. |

## `DocSection`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable slug (e.g. `"getting-started"`), used for the sidebar's active-item match and prev/next ordering — never re-derived from `title` (title changes shouldn't silently change identity). |
| `number` | `string` | Two-digit display label for the sidebar (e.g. `"01"`), matching the design's numbered-list convention (research.md's structure-is-information principle — genuinely ordered content, not decorative). |
| `kicker` | `string` | Short accent-colored eyebrow label above the section title (e.g. `"GETTING STARTED"`). |
| `title` | `string` | The section's heading, shown in both the sidebar and the content pane. |
| `lead` | `string` | One-paragraph introduction shown below the title, above the first block. |
| `blocks` | `DocBlock[]` | Ordered content, per the table above. |

## `en: DocSection[]`

The six sections (research.md Decision 2), in display/pagination order:

1. `getting-started`
2. `signing-in`
3. `fuel-and-consumption`
4. `service-and-reminders`
5. `api-access`
6. `self-hosting`

## Validation rules

- Every `DocSection.id` is unique — enforced by construction (a single hand-authored array), not a
  runtime check; no dynamic section creation exists.
- `blocks` is never empty — every section has at least a heading and a paragraph, per FR-002's
  "structured content" requirement.
- No `DocBlock.text` or `items[].text` references a feature, environment variable, or command this
  app doesn't actually have (FR-005) — verified against the real source per research.md's table
  while authoring `docs-content.ts`, not re-derived at runtime.
