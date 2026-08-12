# Implementation Plan: Document Renew Shortcut

**Branch**: `036-document-renew-shortcut` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/036-document-renew-shortcut/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a `startRenew(document)` function to `DocumentPanel.tsx`, identical to the existing
`startEdit(document)` except it sets `draftExpiryDate` to `""` unconditionally instead of from
`document.expiryDate`. Render a "Renew" button next to the existing "Edit" button, shown only when
`document.isExpired || document.reminderStatus === "coming_up"` — both fields already exist on the
document objects this component already receives. No new prop, no new API call, no new entity.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), React 19 client

**Primary Dependencies**: React 19 — no new dependency

**Storage**: N/A — no schema/API change; reuses the existing `onUpdateDocument` prop verbatim

**Testing**: No client-side test suite exists in this project — verified via code review and a
`deno task dev` walkthrough, matching specs/033/034/035

**Target Platform**: Browser PWA (client only)

**Project Type**: Web application (this feature touches only one client component)

**Performance Goals**: N/A — no new computation, just an extra conditional button and a variant of
an existing function

**Constraints**: Must never write a new expiry date the owner did not explicitly type (FR-005) —
enforced by construction: `startRenew` clears the draft field, it never populates it with a computed
value, and `saveEdit`'s existing "empty string → null" handling is untouched

**Scale/Scope**: One new local function, one new conditionally-rendered button, one new i18n key —
all within `DocumentPanel.tsx`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **IV. No Interpolated Data**: PASS — this is the feature's entire design constraint (spec.md's own
  Assumptions section); `startRenew` only ever clears a field, never populates one with a guess.
- **IX. Separated Language and Locale Axes; i18n from Screen One**: PASS — the new "Renew" button
  label routes through `src/client/i18n/strings.ts` like every other user-facing string.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/036-document-renew-shortcut/
├── plan.md              # This file (/speckit-plan command output)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `research.md` — every implementation decision was already fully resolved in the feature
description and spec.md's Assumptions section; there is nothing left to research.

### Source Code (repository root)

```text
src/client/
├── i18n/strings.ts                    # new label: renewDocument (extend)
└── components/DocumentPanel.tsx       # startRenew function + conditional button (extend)
```

**Structure Decision**: Single-file change plus one i18n key — the smallest possible slice; no other
file in the codebase needs to change.

## Complexity Tracking

*No violations — section not applicable.*
