# Implementation Plan: In-App Documentation Viewer

**Branch**: `057-in-app-documentation` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/057-in-app-documentation/spec.md`

## Summary

Add a new "Help" nav destination (10th item, new icon) and a two-pane documentation screen (section
list + structured content, prev/next pagination), matching the design source's `scr.help` layout
structure. All content is rewritten from scratch to describe the app's real behavior — real auth
methods, real fuel-economy calculation, real reminder mechanics, real API tokens, real
`wrangler`-based self-hosting — replacing the design's fictional Cloudflare-Access/Docker content
entirely. The content is reachable both signed-in (new `AppShell` view) and signed-out (reused
directly from the landing page's "Documentation" link, replacing its current external GitHub-README
link from spec 056).

## Technical Context

**Language/Version**: TypeScript / React (Vite), existing client stack.

**Primary Dependencies**: None new.

**Storage**: N/A — no new persisted data, no new API route. Content is a static TS module bundled
with the client.

**Testing**: Same as specs 055/056 — no client-component test suite exists; verification is
`deno task check` (typecheck/build/fmt/lint) plus a manual browser walkthrough.

**Target Platform**: Same Cloudflare Workers + Vite SPA as every other client change.

**Project Type**: Existing single-project web app. No new project/package.

**Performance Goals**: N/A — static content, no data fetching.

**Constraints**:
- Constitution Principle IV, applied to documentation accuracy (not just data): every factual claim
  must match real, currently-implemented behavior. No Cloudflare Access, `cloudflared`, or Docker
  content (FR-005).
- Constitution Principle IX (i18n): all short UI-chrome strings (nav label, "Sections" heading,
  prev/next button labels) go through `t()`, matching every other screen. The documentation prose
  itself does not — see Constitution Check below for why, and how it still satisfies the
  principle's actual intent.
- Must be reachable without a session (FR-006) — both signed-in (new nav destination) and
  signed-out (landing page's documentation link, replacing spec 056's external GitHub link).
- Must follow the app's existing responsive breakpoint convention for the two-column-to-one-column
  stack at narrow widths (FR-007).

**Scale/Scope**: One new content module (six sections), one new `HelpView` component (two-pane
layout + section state + pagination), one new `HelpIcon`, one `AppShell`/`App.tsx` wiring pass for
the new "help" view, one change to `LandingPage.tsx`'s documentation link (now in-app, not
external), new i18n keys for the UI chrome only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation** — N/A. Documentation content has no per-tenant data; it's static and
  identical for every viewer, signed in or not.
- **II. Server-Computed Aggregates** — N/A.
- **III. Offline Sync** — N/A.
- **IV. No Interpolated Data** — Directly applies, extended to documentation accuracy rather than
  runtime data: every claim in the shipped content must be real (FR-005, SC-002). **PASS** —
  verified against the actual implementation while writing content (research.md documents which
  real code path backs each claim).
- **V–VIII, XII** — N/A, except VIII (GDPR erasure) is *referenced accurately* in the "Signing in"
  section (the real `DELETE /api/v1/account` endpoint), not implemented or changed by this feature.
- **IX. i18n** — Applies with a documented, deliberate scope split. Short, repeated UI-chrome
  strings (nav label, "Sections" heading, prev/next labels — the same *kind* of string every other
  `t()` call covers) go through `t()` as usual. The documentation *prose* (six sections' worth of
  headings/paragraphs/lists/code/notes — long-form content, not short UI chrome) lives in one
  dedicated module (`src/client/docs-content.ts`), structured as `{ en: [...sections] }` — the same
  shape `strings.ts` itself uses (`{ en: {...} }`), deliberately ready for a parallel `ru` array the
  same way `strings.ts` is ready for a parallel `ru` object. Principle IX's stated rationale is
  avoiding "a large, error-prone rewrite" from strings scattered inline at their usage sites —
  centralizing all prose in one file, in one place, is exactly what avoids that outcome; nothing
  about the principle requires prose paragraphs to be individually-keyed `t()` calls the way a
  9-word button label is. This mirrors how spec 055 established that server-rendered email content
  doesn't route through the client `t()` system either, for an analogous reason (different kind of
  content, different mechanism, same underlying "no scattered hardcoding" goal upheld by a
  different, equally centralized structure). **PASS**, with this reasoning made explicit rather than
  silently deviating from precedent.
- **X. Toolchain Discipline** — No new dependency.
- **XI. English-Only Artifacts** — All new copy, and this plan, is English.

No violations. Complexity Tracking table not needed.

**Post-Phase-1 re-check**: data-model.md's `DocSection`/`DocBlock` shapes introduce no new data
access, no new dependency, and no new externally-reachable surface. Conclusion unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/057-in-app-documentation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

No `contracts/` — no new external interface (no new HTTP route).

### Source Code (repository root)

```text
src/client/
├── docs-content.ts             # NEW — the six DocSection entries (research.md/data-model.md)
├── components/
│   ├── HelpView.tsx             # NEW — two-pane layout: section list + content blocks + pagination
│   ├── AppShell.tsx              # MODIFIED — 10th nav item ("help"), new AppView union member
│   └── LandingPage.tsx           # MODIFIED — "Documentation" link renders HelpView in place
│                                   (signed-out), replacing the external GitHub link from spec 056
├── design/
│   ├── icons.tsx                  # MODIFIED — new HelpIcon
│   └── responsive.css             # MODIFIED — two-column-to-one-column stack for HelpView
├── i18n/
│   └── strings.ts                 # MODIFIED — new UI-chrome keys only (not the prose content)
└── App.tsx                        # MODIFIED — new `view === "help"` branch (signed-in) using
                                    the same AppShell pattern every other view already follows
```

**Structure Decision**: One new content module + one new view component, reused as-is from both the
signed-in (`AppShell`-wrapped, via a new `AppView` member) and signed-out (`LandingPage`, replacing
its external documentation link) entry points — not two separate implementations of the same UI.
