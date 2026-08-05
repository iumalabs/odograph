# Implementation Plan: Reminder Rules & Cron Scheduling

**Branch**: `011-reminder-rules-cron` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-reminder-rules-cron/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Tenant-scoped CRUD for reminder rules (label + date and/or mileage interval, per vehicle),
following the same repository/route shape as prior record features, plus two genuinely new
pieces: (1) a pure status-computation function — "on track" / "coming up" / "overdue" / "not
enough data," from the interval and last-done anchor compared to today's date and the vehicle's
latest known odometer reading — shared identically by the live read path and (2) a Cloudflare Cron
Trigger `scheduled()` handler that runs the same computation across every rule in every tenant and
persists a cached status + timestamp, with no notification delivery (that's issues #14/#15).

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers; React 19/Vite client) — same as
the existing server/client split.

**Primary Dependencies**: None new.

**Storage**: D1 (new `reminder_rules` table, migration 0010) — no R2, no new KV usage.

**Testing**: `deno task test` (vitest) for CRUD, status computation, and the scheduled handler
(invoked directly via `createScheduledController()` from `cloudflare:test`, not through HTTP —
the standard way `@cloudflare/vitest-pool-workers` exercises a `scheduled()` export) plus live
browser verification for the UI.

**Target Platform**: Cloudflare Workers (`workerd`) API + Vite-built React SPA, plus a Cron
Trigger (`[triggers] crons` in `wrangler.toml`) — the first scheduled-work surface in this
project.

**Project Type**: Web application (existing structure), gaining its first non-`fetch` Worker
entry point.

**Performance Goals**: One evaluation pass over every reminder rule per scheduled run (daily,
research.md) — bounded by total rule count, not per-tenant, and expected to be small for the
foreseeable future; no pagination/batching needed yet.

**Constraints**: The scheduled evaluation MUST NOT use Cloudflare Queues (constitution) and MUST
NOT let one rule's evaluation failure stop the rest of the run (FR-011). Status MUST NOT be
guessed when mileage data is missing (FR-007, Principle IV) — same "never invent, always derive or
omit" discipline as spec 009's fuel economy.

**Scale/Scope**: 1 new D1 table, ~8 new repository functions (CRUD + status computation + the
scheduled sweep), 6 new API routes (2 vehicle-nested + 4 standalone, including mark-done), 1 new
Worker export (`scheduled`), 1 new client screen section styled per spec 008.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: every per-tenant repository function scopes
  by `ctx.tenantId`, matching every prior feature; the scheduled sweep is the one function that
  legitimately operates *across* tenants (by design — a Cron Trigger has no session to scope by),
  and it still only ever reads/writes `reminder_rules` rows through repository.ts, never raw D1
  access from the scheduled handler itself.
- **II. Server-Computed, Division-Safe Aggregates** — the status computation is the central
  concern here: every "remaining" calculation (days or distance until due) is checked before any
  proportional/threshold math, and missing mileage data produces "not enough data," never a
  guessed status or a crash (FR-007).
- **III. Idempotent, Ordered Offline Sync** — N/A, this feature's writes (rule CRUD, mark-done) go
  through the normal synchronous request path; the scheduled sweep is idempotent by construction
  (recomputing and overwriting the same cached fields is safe to repeat or retry).
- **IV. No Interpolated Data** — PASS (FR-007): a mileage-based rule for a vehicle with no
  odometer history shows "not enough data," never an invented distance-remaining figure.
- **V. Private Object Storage with Validated Uploads** — N/A, no attachments in this feature.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: new write routes sit behind
  `rateLimitBySession`, matching every existing write route; the scheduled handler has no HTTP
  surface at all (Cloudflare invokes it directly, not reachable via `fetch`).
- **VIII. GDPR Erasure by Design** — addressed in data-model.md: `reminder_rules` cascades from
  `vehicles` the same way every other vehicle-scoped table does; no R2 or other out-of-D1 storage
  to worry about for this feature.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS (FR-012): all new UI
  copy routes through `src/client/i18n/strings.ts`.
- **X. Toolchain Discipline** — PASS: no new dependencies.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: the Cron Trigger schedule is declared in
  `wrangler.toml` and deployed the same way every other binding already is — through CI, never a
  manual `wrangler deploy`.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/011-reminder-rules-cron/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/api.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
migrations/0010_reminder_rules.sql   # new: reminder_rules

wrangler.toml                         # extended: [triggers] crons on default/preview/production

src/server/
├── db/repository.ts                   # extended: reminder-rule CRUD, computeReminderStatus
│                                        # (pure function, no D1 access — testable standalone),
│                                        # listVehicleOdometerReadings helper, evaluateAllReminders
│                                        # (the scheduled sweep, cross-tenant by design)
├── routes/v1/
│   ├── vehicles.ts                      # extended: POST/GET :vehicleId/reminder-rules
│   └── reminder-rules.ts                # new: GET/PATCH/DELETE /:id, POST /:id/mark-done
└── index.ts                             # extended: exports { fetch: app.fetch, scheduled }
                                          # instead of the bare Hono app (Cloudflare's
                                          # modules-worker convention for a Cron-Trigger-capable
                                          # Worker)

src/client/
├── reminder-rules.ts                    # new: thin client wrapper, mirrors fuel-records.ts
├── components/
│   └── ReminderRulePanel.tsx             # new: styled per spec 008, list + add-form + mark-done/
│                                          # edit/delete actions, status badge per computed state
└── App.tsx                               # extended: renders ReminderRulePanel alongside the
                                           # existing service/fuel panels for the selected vehicle

tests/server/
└── reminder-rules.test.ts                # new: CRUD, status computation (all four states, both-
                                           # intervals-disagree), mark-done, and the scheduled
                                           # handler invoked directly via createScheduledController()
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level
directories. This feature adds one genuinely new architectural piece (the `scheduled()` Worker
export) but otherwise follows the exact repository/route/client-wrapper/panel-component shape
every prior record feature (specs 006/007/009) already established.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
