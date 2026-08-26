# Implementation Plan: Client-Side Routing (`/app` shell, stable landing URL)

**Branch**: `059-app-routing` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/059-app-routing/spec.md`

## Summary

Introduce a minimal, hand-rolled client-side router (History API + a small path↔view mapping) so
`/` and `/app/*` become real, independently-loadable URLs instead of the current single-route,
state-only rendering. `App.tsx`'s existing per-view render branches are otherwise unchanged — they
now key off a router-derived `route` instead of local `useState<AppView>`. Two server-side redirect
targets change (magic-link/OIDC success outcomes now land on `/app`, not `/`); no other server
change is needed since Workers Assets' existing SPA fallback (`not_found_handling =
"single-page-application"`) already serves the app shell for any unmatched path.

## Technical Context

**Language/Version**: TypeScript / React (Vite) client; two-line Hono route edits server-side.

**Primary Dependencies**: None new — see research.md Decision 1 for why a routing library isn't
justified here.

**Storage**: N/A.

**Testing**: No new automated tests — this project has no client-side test suite (server-only
Vitest). `deno task check`'s typecheck step catches any prop/type drift; the rest is manual
browser verification (direct navigation, reload, back/forward, sign-in/out), per quickstart.md.

**Target Platform**: Cloudflare Workers (the two redirect-target edits) + Vite SPA (the router
itself), same as every other change this session.

**Project Type**: Existing single-project web app. No new project/package.

**Performance Goals**: N/A — `history.pushState`/`popstate` are synchronous, no network cost.

**Constraints**:
- No new dependency (research.md Decision 1).
- No redirect before the initial session check resolves (spec FR-004) — requires distinguishing
  "session check still pending" from "confirmed no session," which today's `identity` state alone
  doesn't do (research.md Decision 2).
- Existing outcome-banner query-param handling (`?magicLink=`/`?oidc=`) must keep working
  regardless of which path (`/` or `/app`) it lands on (FR-007).
- Zero server-side routing change beyond the two redirect-target strings (FR-009) — verified
  against the existing `[assets]` config in `wrangler.toml` (research.md Decision 3).

**Scale/Scope**: One new client module (`router.ts`), `App.tsx`'s ~13 render branches re-keyed off
the router instead of local state (mechanical, not a rewrite), `AppShell.tsx`'s `onSelectView`
callers unchanged (same signature), two server-side redirect-string edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation** — N/A, no data access changes.
- **II. Server-Computed Aggregates** — N/A.
- **III. Offline Sync** — N/A; the offline queue's own state is untouched by this change.
- **IV. No Interpolated Data** — N/A, no data rendered by this feature.
- **V–VIII, XII** — N/A (no object storage, no new tokens, no schema/GDPR surface, no deploy-path
  change). Session/transport security (VII) is unaffected — the two redirect edits change only the
  target *path* of an existing, already-correct redirect; the session-issuing logic itself is
  untouched.
- **IX. i18n** — N/A, no new user-facing strings.
- **X. Toolchain Discipline** — No new dependency (research.md Decision 1).
- **XI. English-Only Artifacts** — This plan and all code comments are English.
- **XII. GitHub-Actions-Only Deployment** — N/A, no deploy-path change; confirmed no
  `wrangler.toml`/CI change is needed (research.md Decision 3).

No violations. Complexity Tracking table not needed.

**Post-Phase-1 re-check**: quickstart.md introduces no new dependency or data access. Conclusion
unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/059-app-routing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

No `data-model.md` (no entities) and no `contracts/` (no new HTTP surface — FR-008's two edits are
to existing routes' redirect targets, not new endpoints).

### Source Code (repository root)

```text
src/client/
├── router.ts                    # NEW — parseRoute/navigate/useRoute/pathForView, History-API-based
└── App.tsx                      # MODIFIED — `view` derived from useRoute() instead of useState;
                                    setView navigates instead of setting local state; new auth-guard
                                    effect (redirect between `/` and `/app` once the session check
                                    resolves); AppShell/LandingPage call sites otherwise unchanged

src/server/routes/v1/auth/
├── magic-link.ts                 # MODIFIED — 2 of 4 redirect targets: success outcomes → `/app`
└── oidc/google.ts                # MODIFIED — 2 of 3 redirect targets: success outcomes → `/app`
```

**Structure Decision**: One new module, everything else a targeted edit to existing files — no
component is rewritten, no prop signature changes on `AppShell`/`LandingPage`/any per-screen view
component.
