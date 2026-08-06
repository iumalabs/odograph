# Implementation Plan: Dashboard UI

**Branch**: `014-dashboard-ui` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-dashboard-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the
execution workflow.

## Summary

A new nav-rail screen that fetches every owned vehicle's already-computed aggregates (spec 013) and
reminder statuses (spec 011) and renders one summary card per vehicle — cost figures, a "not enough
data" fallback where a figure is `null`, and a needs-attention flag when any reminder is
`coming_up`/`overdue`. Selecting a card switches the existing single-page app into its current
Garage/detail view for that vehicle. Client-only: no new API route, no new table, no new computation
— this feature is entirely `src/client/`.

## Technical Context

**Language/Version**: TypeScript (React 19/Vite client) — this feature touches only the client; the
server API it consumes (specs 006/011/013) is unchanged.

**Primary Dependencies**: None new.

**Storage**: N/A — reads existing endpoints only, stores nothing of its own.

**Testing**: No automated client test exists anywhere in this project yet (every prior UI feature —
Garage, service/fuel record panels, reminder rules — was verified live via `deno task dev`, not a
unit-test suite); this feature follows the same established pattern rather than introducing a new
tooling decision on its own. `deno task test` (server-side vitest) has nothing new to cover, since
no server code changes.

**Target Platform**: Vite-built React SPA served by the existing Cloudflare Worker, browser-only.

**Project Type**: Web application (existing structure) — this slice touches only `src/client/`.

**Performance Goals**: One fetch per vehicle for aggregates plus one for reminder rules (both
endpoints already exist and are already used elsewhere per-vehicle) — bounded by the owner's own
vehicle count, no new server-side cost. No pagination at this scale (spec.md Assumptions, matching
Garage's own precedent).

**Constraints**: Every aggregate figure MUST render its `null` → "not enough data" state
(constitution Principle II is a server-side concern already satisfied by spec 013; this feature's
job is to never let a `null` reach the screen as blank space, FR-003). Tenant scoping is inherited
for free — every request this screen makes already goes through the same session-scoped routes every
other screen uses; there is no new authorization surface to get wrong.

**Scale/Scope**: 0 new API routes, 0 new tables, 1 new client data wrapper
(`src/client/vehicle-aggregates.ts`), 1 new component (`DashboardView.tsx`, plus a small vehicle
summary card sub-component), `AppShell.tsx` gains a second, now-interactive nav entry, `App.tsx`
gains a `view` state switch.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Tenant Isolation via Repository Layer** — N/A/PASS: no new server code; every fetch this
  screen makes goes through routes whose tenant scoping was already established and tested in specs
  006/011/013.
- **II. Server-Computed, Division-Safe Aggregates** — PASS: this feature computes nothing — it
  renders exactly what spec 013 already returns, including its `null` states, without ever
  re-deriving or guessing a number client-side (FR-003).
- **III. Idempotent, Ordered Offline Sync** — N/A, read-only screen, no writes.
- **IV. No Interpolated Data** — PASS: a `null` aggregate or a vehicle with no records renders an
  explicit "not enough data"/empty state, never an invented figure (FR-003/FR-007).
- **V. Private Object Storage with Validated Uploads** — N/A, no attachments involved.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — N/A/PASS: no new route; existing
  session-authenticated `GET` routes are reused as-is.
- **VIII. GDPR Erasure by Design** — N/A: no new table or column.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS (FR-008): every new string
  (empty states, "not enough data", "all good", nav label) routes through
  `src/client/i18n/strings.ts`, same as every screen before it.
- **X. Toolchain Discipline** — PASS: no new dependencies.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/014-dashboard-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/ui.md      # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── vehicle-aggregates.ts        # new: thin client wrapper for GET /vehicles/:id/aggregates,
│                                  # mirrors reminder-rules.ts's shape (types + one fetch function)
├── components/
│   ├── AppShell.tsx               # extended: second nav-rail entry (Dashboard), both entries now
│   │                                # clickable and call back into App.tsx's view switch, instead
│   │                                # of the single hardcoded/inert Garage entry
│   └── DashboardView.tsx          # new: fetches every vehicle's aggregates + reminder rules,
│                                    # renders one summary card per vehicle (styled per spec 008),
│                                    # empty state for zero vehicles, "not enough data"/"all good"
│                                    # states per FR-003/FR-004
└── App.tsx                        # extended: `view: "garage" | "dashboard"` state; selecting a
                                     # Dashboard card sets `view = "garage"` and
                                     # `selectedVehicleId`, landing on the existing detail flow
                                     # unchanged (FR-005)

src/client/i18n/strings.ts         # extended: dashboard nav label, "not enough data"/"all good"
                                     # strings (reusing existing keys where one already fits, e.g.
                                     # fuelEconomyNotEnoughData)
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories,
no server changes. This feature is the first to introduce a genuine multi-screen nav (previously
`AppShell`'s nav rail was decorative — a single static, non-interactive entry); everything else
follows the exact styled-card/empty-state component pattern every panel since spec 008 already
established.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
