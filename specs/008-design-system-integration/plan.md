# Implementation Plan: Design System Integration

**Branch**: `008-design-system-integration` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-design-system-integration/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Restyle the three screens that currently have real backing functionality — sign-in/sign-up,
garage (vehicle list + add), and a vehicle's service-record history (list + add + attachments) —
to match the approved "cockpit" dark design system from `docs/odograph-design.zip`, with a
fully-specified light theme as a persisted toggle. Presentation-layer only: no new API surface,
no behavior change to any existing operation.

## Technical Context

**Language/Version**: TypeScript (React 19, Vite 6) — same as existing client.

**Primary Dependencies**: `@fontsource/onest` and `@fontsource/jetbrains-mono` (self-hosted
variable-weight web fonts, npm packages, added as `npm:` specifiers per constitution Principle X)
— no other new dependencies. No icon library; the small icon set needed is hand-rolled inline SVG
matching the mockups' exact stroke spec.

**Storage**: Theme preference in `localStorage` (client-only, no server round-trip) — see spec.md
Assumptions.

**Testing**: `deno task test` (vitest, existing) for any testable logic (theme persistence
helper); this feature is otherwise presentation-only and verified via live browser check, per the
project's established UI-change discipline.

**Target Platform**: Same as existing client — Cloudflare Workers Static Assets, served as a Vite-
built SPA, evaluated at desktop and mobile (375px) viewport widths per FR-007/SC-004.

**Project Type**: Web application (existing single-repo Hono API + Vite React SPA structure).

**Performance Goals**: No new performance requirement beyond "doesn't regress" — self-hosted fonts
avoid a third-party render-blocking request; no other perf-sensitive work in this feature.

**Constraints**: Presentation-only (FR-003) — no change to any request/response shape; must
degrade to system fonts if the custom fonts fail to load (FR-010).

**Scale/Scope**: 3 screens restyled (auth, garage, service records), 1 new client-only state
(theme), 1 new stylesheet, small inline-SVG icon set (nav rail + a handful of action icons used by
the in-scope screens only — not the full mockup icon set, which includes icons for out-of-scope
screens per spec.md Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — N/A, no data-access change; this feature touches
  `src/client/` only.
- **II. Server-Computed, Division-Safe Aggregates** — N/A, no aggregates introduced.
- **III. Idempotent, Ordered Offline Sync** — N/A, no offline write queue involved.
- **IV. No Interpolated Data** — N/A, no new data. FR-006's empty states show honest "nothing yet"
  states, never invented placeholder data.
- **V. Private Object Storage with Validated Uploads** — N/A, no change to the attachment upload
  path's validation, ownership check, or storage (FR-003) — only how the existing upload UI looks.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: no new endpoints, no CSP-relevant
  change other than the font files themselves being same-origin (self-hosted, not a third-party
  font CDN) — no CSP relaxation needed.
- **VIII. GDPR Erasure by Design** — N/A, no new server-side or tenant-scoped data; the theme
  preference lives in `localStorage`, is device-local, and is already erased whenever the browser's
  site data is cleared — no server-side erasure obligation to design for.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS (FR-009): every existing
  string continues to route through `src/client/i18n/strings.ts`; the redesign changes layout and
  styling, not string authoring.
- **X. Toolchain Discipline** — PASS: the two new font packages are added to `deno.json`'s
  `imports` as `npm:` specifiers, same as every existing dependency; no Deno runtime API is used
  inside client or Worker code.
- **XI. English-Only Project Artifacts** — PASS: code/comments/commits in English; the design
  mockups' Russian copy is reference material only (spec.md Assumptions), not shipped text.
- **XII. GitHub-Actions-Only Deployment** — N/A, no deploy-process change.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/008-design-system-integration/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature adds no API surface and changes no existing
request/response contract (FR-003) — there is nothing to document as an interface contract beyond
what specs 002-007 already cover.

### Source Code (repository root)

```text
src/client/
├── App.tsx                     # split into screen components (see below); stays the
│                                # composition root (routing between auth/garage/detail state)
├── theme.ts                    # new: theme (dark/light) state + localStorage persistence
├── design/
│   ├── tokens.css              # new: CSS custom properties (colors, type, spacing, radius) —
│   │                            # dark values as :root defaults, light values under [data-theme="light"]
│   ├── base.css                 # new: font-face imports (via @fontsource), resets, base element styles
│   └── icons.tsx                 # new: small inline-SVG icon components (nav rail + action icons
│                                  # actually used by in-scope screens — spec.md Assumptions)
├── components/
│   ├── Logo.tsx                  # new: the approved gauge-mark logo, matches public/favicon.svg
│   ├── AuthScreen.tsx             # new: extracted from App.tsx's signed-out branch
│   ├── Garage.tsx                 # new: extracted vehicle list/cards + add-vehicle form
│   └── ServiceRecordPanel.tsx      # new: extracted service-record list/form/attachment UI
├── auth/                        # existing, unchanged
├── i18n/strings.ts               # existing, extended with new UI copy (empty states, theme
│                                  # toggle) — no new inline strings (FR-009)
├── vehicles.ts                    # existing, unchanged (no API contract change)
└── service-records.ts              # existing, unchanged (no API contract change)

deno.json                        # `imports` gains @fontsource/onest, @fontsource/jetbrains-mono
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level
directories. `App.tsx` is split into per-screen components under `src/client/components/` purely
to keep the file size manageable as the design adds real markup; this is a refactor of an existing
file, not a new architectural layer. Design tokens and fonts live under `src/client/design/`,
mirroring how `auth/`, `i18n/`, and the data-client modules (`vehicles.ts`, `service-records.ts`)
are already organized by concern.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
