# Implementation Plan: Document Expiry Progress Bar

**Branch**: `045-document-expiry-progress` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/045-document-expiry-progress/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`Document`/`withDocumentStatus` gains `windowFraction: number | null` — the fraction of the
existing fixed `DOCUMENT_COMING_UP_WINDOW_DAYS` (30-day) window already used to classify
`reminderStatus` that has elapsed, reusing the exact `remainingDays` computation
`computeDocumentReminderStatus` already performs (previously discarded after classification).
`null` unless `reminderStatus` is `coming_up` or `overdue`. `DocumentPanel.tsx` renders a progress
bar only when this field is non-null.

## Technical Context

**Language/Version**: TypeScript (Deno-managed), Hono on Cloudflare Workers (server), React 19
(client)

**Primary Dependencies**: Hono, D1 — no new dependency

**Storage**: N/A — no schema change; `windowFraction` is derived at read time exactly like
`isExpired`/`reminderStatus` already are, inside the existing `withDocumentStatus`

**Testing**: Extend the existing document-status tests (`tests/server/document-crud.test.ts` or
wherever `computeDocumentReminderStatus`/`isExpired`/`reminderStatus` are already covered) with
`windowFraction` assertions. No client-side test suite exists in this project — the card rendering
is verified via code review and a `deno task dev` walkthrough, matching specs/033-044.

**Target Platform**: Cloudflare Workers (server) + Browser PWA (client)

**Project Type**: Web application (small server extension + client rendering change)

**Performance Goals**: N/A — no new query; rides the same per-document status computation already
performed on every read

**Constraints**: Per constitution Principle II, `windowFraction` MUST be computed server-side —
satisfied by construction (reuses `computeDocumentReminderStatus`'s own already-computed
`remainingDays`). Per Principle IV, no reference "issued"/"valid-from" date is invented — the
window is the same fixed, already-existing 30-day constant, not a guessed per-document start date
(spec.md Assumptions — this directly resolves the ambiguity the originating issue flagged).

**Scale/Scope**: `src/server/db/repository.ts` (`Document` type + `withDocumentStatus`/
`computeDocumentReminderStatus` extended), `src/client/documents.ts` (type extended to match),
`src/client/components/DocumentPanel.tsx` (render the bar)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Server-Computed, Division-Safe Aggregates**: PASS — `windowFraction` reuses the exact
  `remainingDays / DOCUMENT_COMING_UP_WINDOW_DAYS` division `computeDocumentReminderStatus` already
  performs conceptually (currently just a threshold comparison; this plan makes the ratio itself
  available); the denominator is a fixed nonzero constant, never zero, so no new guard is needed
  beyond what already exists.
- **IV. No Interpolated Data**: PASS — this is the crux of the plan: no invented "valid-from" date.
  The window is fixed and already used elsewhere; `windowFraction` is `null` whenever there isn't a
  real expiry date to measure against, or the document isn't yet within the window.

No violations. No entries needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/045-document-expiry-progress/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/db/repository.ts   # Document + withDocumentStatus/computeDocumentReminderStatus: add windowFraction (extend)

src/client/
├── documents.ts                     # Document type: add windowFraction (extend)
└── components/DocumentPanel.tsx     # render progress bar (extend)
```

**Structure Decision**: No new files — mirrors specs/041/043's exact shape (extend an existing
derived-at-read-time computation, extend the client type, render in an existing component).

## Complexity Tracking

*No violations — section not applicable.*
