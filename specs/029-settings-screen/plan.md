# Implementation Plan: Dedicated Settings Screen

**Branch**: `029-settings-screen` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-settings-screen/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Move `ApiTokens`, `PushNotifications`, and `AccountDeletion` out of `App.tsx`'s garage-view
account-controls row and into a new dedicated `SettingsView` screen, reached via a fourth
`AppShell` nav-rail destination (`"settings"`). This is a pure client-side UI relocation — the
three components' internal logic, their `account.ts`/`api-tokens.ts`/`push.ts` API wrappers, and
every backend route are unchanged. The unrelated session controls sharing today's account-controls
row (signed-in-as, sync status, add-passkey, link-Google-account, magic-link linking) stay on the
garage screen exactly as they are — out of scope.

## Technical Context

**Language/Version**: TypeScript, React 19 (client); no server-side changes in this feature

**Primary Dependencies**: Existing client stack only — no new dependency. Reuses `AppShell`,
`design/icons.tsx`, `i18n/strings.ts`, and the three existing components as-is.

**Storage**: N/A — no data model change; the three relocated components already read/write via
their existing API wrappers.

**Testing**: No pre-existing client test infrastructure in this repo (confirmed: no
`tests/client/*`, no e2e coverage of these three features). This feature does not introduce one —
consistent with how prior client-only UI work in this codebase has shipped, verified via
`deno task check` (fmt/lint/typecheck/build) plus a live `deno task dev` smoke test rather than a
new test harness.

**Target Platform**: Browser (PWA client), same as the rest of the app

**Project Type**: Web application (Cloudflare Worker backend + React client) — this feature is
client-only

**Performance Goals**: N/A — this is a UI relocation with no new data fetching or new endpoints;
existing per-component load characteristics (e.g. `ApiTokens` lazily fetching its list only when
expanded) are preserved unchanged.

**Constraints**: Zero backend changes (spec.md FR-008); zero behavior change to the three
relocated components (FR-005/FR-006/FR-007); garage screen's unrelated session controls must be
visually/functionally undisturbed (FR-004).

**Scale/Scope**: One new top-level screen, one new nav entry, one new icon, ~4-6 new i18n string
keys, three existing component call-sites moved.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle VI (Hardened API Tokens)**: Unaffected — token hashing, scoping, revocation, and
  last-used tracking all live in the existing server route and `ApiTokens` component, neither of
  which this feature modifies internally. PASS.
- **Principle VIII (GDPR Erasure by Design)**: Unaffected — `AccountDeletion`'s confirm-phrase
  flow and its `deleteAccount` call are relocated, not altered. PASS.
- **Principle IX (i18n from Screen One)**: New user-facing strings (nav label, screen heading) MUST
  route through `src/client/i18n/strings.ts`'s `t()`, matching every existing string in the three
  relocated components and in `AppShell`. Planned. PASS (with this plan's design honoring it).
- **Principle X (Toolchain Discipline)**: No new dependency; `deno fmt`/`deno task check` gate
  applies as normal. PASS.
- **Principle XI (English-Only Project Artifacts)**: Spec, plan, and code comments in English;
  UI strings default to English per existing i18n setup. PASS.
- No other principle (I-V, VII) is implicated — no D1 schema change, no tenant-isolation surface,
  no new upload path, no new session/transport concern.

No violations. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/029-settings-screen/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command) — N/A, no new entities
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command) — N/A, no new API surface
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/client/
├── components/
│   ├── AppShell.tsx           # MODIFY: AppView union gains "settings"; NAV_ITEMS gains an entry
│   ├── SettingsView.tsx       # NEW: composes ApiTokens + PushNotifications + AccountDeletion
│   ├── ApiTokens.tsx          # UNCHANGED internally — only its call site moves
│   ├── PushNotifications.tsx  # UNCHANGED internally — only its call site moves
│   └── AccountDeletion.tsx    # UNCHANGED internally — only its call site moves
├── design/
│   └── icons.tsx               # MODIFY: add SettingsIcon (ported from the mockup icon sheet)
├── i18n/
│   └── strings.ts              # MODIFY: add settingsNavLabel, settingsScreenHeading keys
└── App.tsx                     # MODIFY: remove the three components from the garage-view
                                 # account-controls row; add an `if (view === "settings")` branch
                                 # rendering <AppShell><SettingsView /></AppShell>, matching the
                                 # existing dashboard/review branches
```

**Structure Decision**: Client-only change within the existing single-package structure (no
`backend/`/`frontend/` split — this repo is one Worker + one client tree under `src/`). No new
directories; one new component file (`SettingsView.tsx`) plus targeted edits to `AppShell.tsx`,
`icons.tsx`, `strings.ts`, and `App.tsx`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
