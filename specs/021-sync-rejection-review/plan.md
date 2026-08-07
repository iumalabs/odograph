# Implementation Plan: Sync Rejection Review Screen

**Branch**: `021-sync-rejection-review` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-sync-rejection-review/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Adds a dedicated nav-rail screen listing every currently-rejected action from issue #20's offline
write queue, across all vehicles at once, each with a plain-language description of what was
attempted, the server's rejection reason, and Discard/Retry actions. Entirely client-side: no new
server endpoint, no schema change — `queue.ts` gains one new function, `retryRejected()`, alongside
the `discardRejected()` #20 already shipped in anticipation of this feature. A retry reuses the
action's original id as its `Idempotency-Key`, so it's automatically deduped by #20's existing
idempotency ledger under the exact same guarantee as any other queued write.

## Technical Context

**Language/Version**: TypeScript, Vite-built React 19 SPA client — client-only feature.

**Primary Dependencies**: None new.

**Storage**: None new — reuses #20's existing IndexedDB `pendingActions` store unchanged.

**Testing**: No new `deno task test` coverage. This feature has no server-side behavior at all (no
new endpoint, no schema) — retry/discard both operate entirely within the already-tested server
contract from #20 (`tests/server/idempotency.test.ts` already covers replay-safety, which is what
makes retry safe). Verified live per quickstart.md, same precedent as the client-only portions of
specs/018-020.

**Target Platform**: Every browser visiting the client — same set as #20, no new platform surface.

**Performance Goals**: None specific.

**Constraints**: MUST NOT introduce a new server endpoint or schema change (spec.md Assumptions —
this is a UI layer on top of #20's already-complete mechanism). Retry MUST reuse the action's
original id/idempotency key unchanged, not generate a new one — generating a new id on retry would
mean a retry that actually reached the server on a prior attempt (but whose response was lost to a
network blip) could apply twice, exactly the failure mode idempotency keys exist to prevent.

**Scale/Scope**: 1 new screen component (`SyncReviewScreen.tsx`), 1 new nav entry in `AppShell.tsx`,
1 new icon, `queue.ts` +1 function (`retryRejected`), 2 small new pure-function helper modules
(action description, reject-reason formatting), new i18n strings, `App.tsx` wiring (new view branch,
click-through from `SyncStatusIndicator`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — N/A, no data-access code touched.
- **II. Server-Computed, Division-Safe Aggregates** — N/A.
- **III. Idempotent, Ordered Offline Sync** — this feature is the direct completion of this
  principle's "surface in a user-facing review screen" clause, which #20 deliberately left for this
  feature to build.
- **IV. No Interpolated Data** — PASS: retry resubmits the user's original input completely
  unchanged; discard applies nothing at all. Neither path invents or guesses a value.
- **V. Private Object Storage with Validated Uploads** — N/A.
- **VI. Hardened API Tokens** — N/A.
- **VII. Locked-Down Session and Transport Security** — PASS: a retried action goes through the
  exact same `fetch` path, headers, rate limiting, and session checks as any other queued action —
  no new trust boundary, no bypass.
- **VIII. GDPR Erasure by Design** — N/A: no new table, column, or stored data of any kind.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: every new string routes
  through `t()`.
- **X. Toolchain Discipline** — PASS: no new dependency.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change; nothing server-side
  changes at all, so there isn't even a migration to pick up.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/021-sync-rejection-review/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: no new API surface of any kind — this feature is entirely a new client
UI over #20's existing queue.

### Source Code (repository root)

```text
src/client/
├── offline/
│   ├── queue.ts                    # extended: + retryRejected(id)
│   ├── describe-action.ts          # new: plain-language "what was attempted" per PendingAction
│   └── reject-reason.ts            # new: formats a stored rejectReason for display
├── components/
│   ├── AppShell.tsx                # extended: + "review" nav entry (badge-able via rejected count)
│   ├── SyncStatusIndicator.tsx     # extended: rejected badge becomes a link/button into the
│   │                                 #   review screen (FR-007/FR-008)
│   └── SyncReviewScreen.tsx        # new: lists every rejected action, Discard/Retry per item
├── design/icons.tsx                # extended: + AlertIcon (hand-rolled, not in the mockup sheet)
├── i18n/strings.ts                 # extended: nav label, screen strings, per-entity/action-type
│                                     #   labels, empty state
└── App.tsx                         # extended: new "review" view branch, passes queueSnapshot
                                      #   through to SyncReviewScreen
```

No `src/server/`, `migrations/`, or `tests/server/` changes.

**Structure Decision**: Single-project web app (existing structure) — client-only change set,
consistent with #20's own `src/client/offline/` module boundary.
