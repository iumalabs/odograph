# Implementation Plan: Public Landing Page

**Branch**: `056-public-landing-page` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/056-public-landing-page/spec.md`

## Summary

Replace the bare, centered `AuthScreen` that every unauthenticated (or session-expired) visitor
sees today with a real landing page: a header (logo, documentation link, sign-in) and a two-column
hero (kicker/headline/lead copy on the left, the actual sign-in card — passkey/magic-link/Google —
on the right, in place of the design source's fabricated demo-stats panel). Pure client-side UI
change: no new routes, no new API surface, no new persisted data. `AuthScreen`'s existing props and
behavior (pending state, magic-link/OIDC outcome banners) are preserved by extracting its card
content into a reusable `SignInCard` component used by both the new `LandingPage` and (unchanged)
`AuthScreen`'s call site in `App.tsx`.

## Technical Context

**Language/Version**: TypeScript / React (Vite), existing client stack.

**Primary Dependencies**: None new. No routing library is introduced (the app has none today and
this feature doesn't need one — same `!identity` render branch in `App.tsx`, just different JSX).

**Storage**: N/A — no new persisted data, no new API calls. The sign-in actions this page exposes
(`onSignUpPasskey`, `onSignInPasskey`, `onSendMagicLink`, Google OIDC link) are the exact same
handlers `App.tsx` already passes to `AuthScreen` today.

**Testing**: This project has no existing client-side (React component) test suite — `tests/`
contains only `tests/server/*.test.ts` (Vitest against the Worker). Client-side changes are
verified by `deno task check`'s typecheck/build steps plus a manual browser walkthrough (this
project's established pattern for UI-only changes; see quickstart.md).

**Target Platform**: Same Cloudflare Workers + Vite SPA as every other client change.

**Project Type**: Existing single-project web app. No new project/package.

**Performance Goals**: N/A — a static hero render, no data fetching added.

**Constraints**:
- Constitution Principle IX: every new user-facing string routes through `src/client/i18n/strings.ts`'s
  `t()` — no hardcoded copy at the JSX usage site, even though only the `en` locale ships.
- Constitution Principle IV: no fabricated/placeholder data presented as real (rules out the design
  source's demo stats panel — see spec.md Assumptions).
- Must not regress any of `AuthScreen`'s existing behavior (pending disable state, magic-link-sent
  banner, OIDC outcome banners, error banner) — these are extracted into a shared `SignInCard`
  component, not reimplemented.
- Must follow the app's existing responsive breakpoint convention (`src/client/design/responsive.css`)
  for the hero's two-column-to-one-column stack, not introduce a new one.

**Scale/Scope**: One new component (`LandingPage`), one extracted component (`SignInCard`, pulled
out of `AuthScreen`), new i18n string keys, one `App.tsx` call-site swap, new responsive CSS rules
for the hero grid.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation** — N/A. No data access; this page renders before any tenant/session exists.
- **II. Server-Computed Aggregates** — N/A, no aggregates.
- **III. Offline Sync** — N/A.
- **IV. No Interpolated Data** — Directly applies. The design source's demo stats panel (fabricated
  spend/consumption figures) is explicitly NOT carried over (spec.md Assumptions). **PASS**.
- **V–VIII, XII** — N/A (no object storage, no new tokens, no session/CSP change, no schema/GDPR
  surface, no deploy-path change).
- **IX. i18n** — Directly applies, and unlike the server-side email template (spec 055, which
  correctly does NOT route through the client `t()` system since it's server-rendered mail), this
  IS client UI. Every new string (kicker, headline lines, lead copy, documentation link label, any
  restructured `SignInCard` copy) gets a new key in `src/client/i18n/strings.ts`'s `en` object and
  is referenced via `t()` — no hardcoded JSX text. **PASS** (by construction, verified in Phase 1).
- **X. Toolchain Discipline** — No new dependency.
- **XI. English-Only Artifacts** — All new copy (and this plan) is English.

No violations. Complexity Tracking table not needed.

**Post-Phase-1 re-check**: data-model.md is N/A (no entities); quickstart.md introduces no new
dependency or data access. Conclusion unchanged: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/056-public-landing-page/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

No `data-model.md` (no entities — see spec.md Key Entities) and no `contracts/` (no new external
interface — this is a render-branch swap in an existing SPA, not a new API).

### Source Code (repository root)

```text
src/client/
├── components/
│   ├── LandingPage.tsx        # NEW — header + hero, renders SignInCard in place of demo panel
│   ├── SignInCard.tsx          # NEW — extracted from AuthScreen.tsx's card (same props/behavior)
│   └── AuthScreen.tsx          # DELETED — its only call site (App.tsx's `!identity` branch) is
│                                 replaced by LandingPage; confirmed (grep) no other call site
│                                 exists, so keeping it around unused would be dead code
├── i18n/
│   └── strings.ts              # MODIFIED — new `landing*` keys, English only (v1 scope)
├── design/
│   └── responsive.css          # MODIFIED — hero two-column → one-column breakpoint
└── App.tsx                     # MODIFIED — `!identity` branch renders LandingPage instead of
                                   AuthScreen (import swapped, not added alongside)
```

**Structure Decision**: Extract, don't duplicate, don't leave dead code. `SignInCard` holds all of
`AuthScreen`'s existing form markup and behavior unchanged (same props, same pending/banner logic);
`AuthScreen.tsx` is deleted outright since `LandingPage` becomes the sole `!identity` entry point
and nothing else imports `AuthScreen`. `LandingPage` is the new real entry point wired into
`App.tsx`.
