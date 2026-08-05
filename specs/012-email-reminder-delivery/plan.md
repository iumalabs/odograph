# Implementation Plan: Email Reminder Delivery

**Branch**: `012-email-reminder-delivery` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-email-reminder-delivery/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Extend spec 011's Cron-triggered `evaluateAllReminders` sweep with an email side effect: after
computing each reminder rule's status, compare it against a new `last_notified_severity` column on
that row and send one email (reusing the existing `env.EMAIL` send_email binding, exactly as
`sendMagicLinkEmail()` already does) only when the new status is strictly more severe than what was
last notified. Placeholder (`@example.invalid`) addresses are detected and skipped without being
recorded as notified, so a later real address still gets an overdue notification. No new Cron
job, no new route, no new client UI — this is a pure sweep-side-effect feature.

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers) — same as the existing server.

**Primary Dependencies**: None new — reuses the existing `env.EMAIL` (`send_email`) binding already
declared in `wrangler.toml` and already used by `sendMagicLinkEmail()`
(`src/server/auth/magic-link.ts`).

**Storage**: D1 (`reminder_rules` gains one new column, migration 0011) — no R2, no new KV usage.

**Testing**: `deno task test` (vitest) — the scheduled handler is already invoked directly via
`createScheduledController()` in `tests/server/reminder-rules.test.ts` (spec 011); this feature
extends that same test file rather than adding a new one, plus unit coverage for the pure
severity-comparison/placeholder-detection logic.

**Target Platform**: Cloudflare Workers (`workerd`) — extends the existing `scheduled()` export;
no new Worker entry point.

**Project Type**: Web application (existing structure) — server-only change, no client work.

**Performance Goals**: One email attempt per reminder rule whose severity increased since its last
notification, per daily sweep — bounded by the same rule count the sweep already iterates; no
batching/pagination needed at current scale (same assumption spec 011 made for evaluation itself).

**Constraints**: A single reminder's email failure (provider error, placeholder address, anything)
MUST NOT stop the rest of the sweep from evaluating and notifying (FR-010) — same per-row isolation
discipline spec 011 already established for status evaluation, now covering the email step too.
Status MUST NOT be re-derived or altered by this feature (FR reference: spec 011's
`computeReminderStatus` is consumed as-is, never modified).

**Scale/Scope**: 1 new D1 column (`last_notified_severity` on `reminder_rules`), 1 new
migration, ~2-3 new/extended repository functions (a pure severity-comparison helper + the email
side effect wired into `evaluateAllReminders`), 1 new email-sending helper extracted from the
`sendMagicLinkEmail()` pattern, 0 new routes, 0 new client UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: the email side effect runs entirely inside
  `evaluateAllReminders`, which already operates cross-tenant by design (spec 011's documented
  exception, since a Cron Trigger has no session to scope by); no new route or per-tenant D1 access
  point is introduced, and recipient email is resolved through repository.ts, never raw D1 access
  from elsewhere.
- **II. Server-Computed, Division-Safe Aggregates** — N/A for this feature specifically: it
  consumes the already-computed, already-division-safe `status` from spec 011 and does not perform
  any new aggregate math itself.
- **III. Idempotent, Ordered Offline Sync** — N/A, no offline-queue writes in this feature.
- **IV. No Interpolated Data** — PASS: a "not enough data" status never triggers a notification
  (FR-004) — this feature never sends an email implying a due date/mileage it doesn't actually have.
- **V. Private Object Storage with Validated Uploads** — N/A, no attachments in this feature.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — N/A: no new HTTP route, so no new rate-limit
  or session surface; the scheduled handler remains unreachable via `fetch`, unchanged from spec
  011.
- **VIII. GDPR Erasure by Design** — addressed in data-model.md: the new column lives on the
  existing `reminder_rules` row and is erased by the exact same `ON DELETE CASCADE` chain
  (`vehicles` → `reminder_rules`) spec 011 already established; no new table, no new R2/KV key
  prefix.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: the email's copy (a
  server-rendered string, not client UI) is written in English per Principle XI/D-006 (v1
  English-only), and does not touch `src/client/i18n/strings.ts` since it isn't rendered by the
  client at all; documented as an explicit scope note in research.md rather than silently skipped.
- **X. Toolchain Discipline** — PASS: no new dependencies; reuses the existing structured
  `env.EMAIL.send({...})` call shape, no new templating library.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no new binding or environment config beyond what
  `send_email` already declares in `wrangler.toml`; deploys the same way every other change does.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/012-email-reminder-delivery/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/internal.md # Phase 1 output (/speckit-plan command) — internal function contracts;
│                          # this feature adds no new HTTP route
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
migrations/0011_reminder_notifications.sql   # new: reminder_rules gains last_notified_severity

src/server/
├── db/repository.ts                   # extended: severityOf/shouldNotify pure helper, and
│                                        # evaluateAllReminders gains the email side effect +
│                                        # last_notified_severity read/write per row
├── auth/magic-link.ts                  # unchanged — read as the precedent for the new helper
└── email/reminder-notification.ts      # new: sendReminderDueEmail(env, to, vehicle, rule)
                                          # helper, mirrors sendMagicLinkEmail()'s shape
                                          # (FROM_ADDRESS, subject/body construction, try/catch
                                          # returning a sent/not-sent result, never throws)

tests/server/
└── reminder-rules.test.ts              # extended: scheduled-sweep section gains assertions on
                                          # email-send counts/recipients per escalation scenario,
                                          # using the existing test email capture mechanism
                                          # (see research.md for how magic-link tests already
                                          # assert on sent emails)
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level
directories, no new route, no client work. This feature is scoped entirely to `repository.ts`'s
existing scheduled-sweep function plus one new small email-sending helper module, following the
precedent `sendMagicLinkEmail()` already set.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
