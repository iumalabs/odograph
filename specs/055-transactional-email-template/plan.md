# Implementation Plan: Styled Transactional Email Template

**Branch**: `055-transactional-email-template` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/055-transactional-email-template/spec.md`

## Summary

Replace the two hand-written, unstyled `html`/`text` bodies in `src/server/auth/magic-link.ts`
and `src/server/email/reminder-notification.ts` with a single shared HTML-email chrome (dark
header, white body, lime CTA button, dark footer) that each sender fills with its own
purpose-specific content. No new dependency, no new HTTP surface, no schema change — purely a
formatting change to two existing `env.EMAIL.send()` call sites, extracted into one new internal
module both share.

## Technical Context

**Language/Version**: TypeScript on Deno tooling / `workerd` runtime (existing project stack)

**Primary Dependencies**: None new. Inline-styled HTML built as plain template strings — matches
the existing hand-written approach in both files today; no email-templating library is justified
for two call sites producing one shared layout.

**Storage**: N/A — no new persisted data.

**Testing**: Vitest via `@cloudflare/vitest-pool-workers` (existing `tests/server/*.test.ts`
pattern). No existing test asserts on the current unstyled `html`/`text` shape (checked
`tests/server/magic-link-auth.test.ts`), so this is a pure addition, not a breaking change to
test expectations.

**Target Platform**: Cloudflare Workers (`workerd`), both `preview` and `production` environments
— same as every other server module.

**Project Type**: Existing single-project web service (Hono API + Worker). No new project/package.

**Performance Goals**: N/A — building one HTML string per outbound email is negligible relative
to the `env.EMAIL.send()` call itself; not a performance-sensitive path.

**Constraints**: Must render correctly (layout, colors, working button) in email clients that
never load external stylesheets (Gmail, Outlook, Apple Mail) — inline `style=""` attributes for
every element, table-based layout (the design source already uses `<table role="presentation">`,
the standard email-HTML pattern for this reason). One exception: a single embedded `<style>`
block carries the narrow-viewport responsive breakpoint (FR-009) — the design source
(`Письмо - ссылка для входа.html`) ships exactly this (`@media only screen and (max-width:620px)`
narrowing `.wrap`/`.pad`, shrinking `.h1`), since CSS media queries have no inline equivalent.
Clients that strip `<style>` blocks entirely fall back to the inline (desktop) layout, which must
itself stay correct and legible — never broken — without the media query's help.

**Scale/Scope**: Two existing call sites (`sendMagicLinkEmail`, `sendReminderDueEmail`), one new
shared internal module. No new routes, no new bindings, no new environment variables.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation** — N/A. Email content is built from data the caller already resolved
  (tenant-scoped) before calling; this feature doesn't touch data access.
- **II. Server-Computed Aggregates** — N/A, no aggregates involved.
- **III. Offline Sync** — N/A, no offline write queue interaction.
- **IV. No Interpolated Data** — Directly applies (spec FR-007). The "request details" content
  slot only ever receives fields the caller genuinely has (recipient email, target hostname) —
  device/IP fields the design shows are not currently captured anywhere in the request-handling
  path, and this plan does not add new request-plumbing to fabricate them (see Phase 1 below).
  **PASS**.
- **V–VIII, XII** — N/A (no object storage, no new tokens, no session/CSP change, no schema/GDPR
  surface, no deploy-path change).
- **IX. i18n** — Email subject/body content is not currently routed through
  `src/client/i18n/strings.ts` (that system is client-UI-only); `SUBJECTS`/`ACTIONS` in
  `magic-link.ts` are already plain English constants, consistent with the locked v1-English-only
  scope. This feature continues that existing, already-shipped pattern rather than introducing a
  new one — **not a new violation**, no i18n plumbing added or owed by this change.
- **X. Toolchain Discipline** — No new dependency to add to `deno.json`; plain TS module.
- **XI. English-Only Artifacts** — Email copy is English, matching the design source and existing
  `SUBJECTS`/`ACTIONS` strings.

No violations. Complexity Tracking table not needed.

**Post-Phase-1 re-check**: data-model.md and quickstart.md introduced no new data access, no new
dependency, and no new externally-reachable surface — the `EmailContent` shape is purely an
in-memory parameter object. Conclusion unchanged: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/055-transactional-email-template/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` directory — this feature has no external interface (no new HTTP route, no new
public API); it's an internal formatting change to two existing send functions.

### Source Code (repository root)

```text
src/server/
├── email/
│   ├── template.ts              # NEW — shared chrome renderer (this feature)
│   └── reminder-notification.ts  # MODIFIED — builds EmailContent, calls shared renderer
└── auth/
    └── magic-link.ts              # MODIFIED — builds EmailContent per purpose, calls shared renderer

tests/server/
├── email-template.test.ts        # NEW — chrome renderer unit tests
├── magic-link-auth.test.ts       # existing — unaffected (asserts token/verify flow, not email body)
└── reminder-rules.test.ts        # existing — covers sendReminderDueEmail indirectly today
```

**Structure Decision**: Single new internal module (`src/server/email/template.ts`) shared by the
two existing sender functions, which are edited in place — no new directories, no restructuring.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
