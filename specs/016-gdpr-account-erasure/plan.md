# Implementation Plan: GDPR Account Erasure

**Branch**: `016-gdpr-account-erasure` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-gdpr-account-erasure/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the
execution workflow.

## Summary

A new `DELETE /api/v1/account` route lets the signed-in owner permanently erase their entire tenant.
Every tenant/user-scoped D1 table already cascades correctly via `ON DELETE CASCADE` foreign keys
(confirmed by inspecting every migration) — a single `DELETE FROM tenants WHERE id =
?` removes
vehicles, service/fuel records, their attachment rows, reminder rules, sessions, passkey
credentials, magic-link identities, and Google identities in one atomic statement. Three things the
cascade doesn't reach are handled explicitly, in the same order the existing single-vehicle deletion
already established: (1) R2 attachment objects, enumerated and deleted before the D1 delete; (2)
outstanding sign-in magic-link tokens, which are keyed by email with no foreign key to the user at
all; (3) the browser's own session cookie, cleared after the D1 rows that would otherwise track it
are already gone. A required `confirm` field in the request body is the deliberate second step
FR-002 requires — the client only sends it after the owner types a confirmation phrase, and the
server refuses the request without it.

## Technical Context

**Language/Version**: TypeScript (Hono API on Cloudflare Workers; React 19/Vite client) — same as
the existing server/client split.

**Primary Dependencies**: None new.

**Storage**: D1 (deletes across `tenants` and every table that cascades from it — no new table, no
migration) and R2 (deletes existing attachment objects — no new bucket).

**Testing**: `deno task test` (vitest) for the repository/route layer — erasure completeness across
every affected table, R2 cleanup, the outstanding-magic-link-token edge case, tenant isolation
(deleting one tenant never touches another), the missing-confirmation rejection path, and session
invalidation. Live browser verification for the confirmation UI flow (this project has no automated
client tests yet — established pattern from spec 014).

**Target Platform**: Cloudflare Workers (`workerd`) API + Vite-built React SPA — no new
architectural surface, extends the existing route/repository/client-wrapper shape.

**Performance Goals**: One erasure per request, bounded by that tenant's own record count — no
different in shape from the existing single-vehicle deletion this already mirrors.

**Constraints**: The D1 portion MUST be atomic — either every cascading row is gone or none of them
are (FR-008); relying on a single `DELETE FROM tenants` statement rather than a sequence of
per-table deletes is what guarantees this, since D1/SQLite's own cascade execution is part of that
one statement's atomicity, not a separate step that could partially fail. R2 cleanup MUST happen
_before_ the D1 delete (same ordering the existing vehicle-deletion route already established) — if
R2 deletion fails partway, the D1 rows referencing those objects are still present and the owner's
account remains intact and retryable, rather than ending up with orphaned files and no way to find
them again.

**Scale/Scope**: 0 new tables, 3-4 new/extended repository functions, 1 new route file
(`account.ts`), 1 new client wrapper function, 1 new client UI affordance (a destructive-action
confirmation flow, the first of its kind in this app).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Tenant Isolation via Repository Layer** — this is the central concern: the erasure function
  takes a `TenantContext` and every query it runs is scoped by `ctx.tenantId`, exactly like every
  other repository function; a single `DELETE FROM tenants WHERE id = ?` can only ever remove rows
  reachable by cascade from that one tenant id, never another tenant's data (FR-009, tested
  explicitly).
- **II. Server-Computed, Division-Safe Aggregates** — N/A, no computation.
- **III. Idempotent, Ordered Offline Sync** — N/A, not a sync-queue write.
- **IV. No Interpolated Data** — PASS: this feature's whole reason for existing is the _opposite_
  concern — removing real data completely rather than replacing it with anything invented; the
  spec's own Assumptions section explicitly reasons from this principle to justify full deletion
  over anonymisation.
- **V. Private Object Storage with Validated Uploads** — this feature is what finally exercises
  Principle VIII's erasure promise for R2 objects at full-account scope, extending the exact
  ownership-scoped cleanup pattern the single-vehicle deletion route already established.
- **VI. Hardened API Tokens** — N/A, no API tokens exist yet (separate future issue #23).
- **VII. Locked-Down Session and Transport Security** — PASS: the route sits behind
  `rateLimitBySession` like every other write route; ending the session (FR-007) reuses the existing
  cookie-expiry mechanism `POST /_dev/session/invalidate` already established, applied here to a
  session whose underlying D1 row is already gone by the time the cookie is cleared.
- **VIII. GDPR Erasure by Design** — this feature _is_ Principle VIII's payoff: every table this
  project has now has a documented, implemented delete decision (data-model.md enumerates each one),
  closing out the principle's "must have a decision before the feature that populates it ships"
  requirement retroactively for every table that predates this feature.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: the new confirmation UI's
  copy routes through `src/client/i18n/strings.ts`, same as every other screen.
- **X. Toolchain Discipline** — PASS: no new dependency.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: no deployment-config change.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-gdpr-account-erasure/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/api.md     # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/
├── db/repository.ts        # extended:
│                             #  - listAttachmentKeysForTenant(db, ctx) / ...FuelRecords(db, ctx)
│                             #    (tenant-scoped, no vehicle join needed — both attachment
│                             #    tables already carry their own tenant_id column directly)
│                             #  - deleteOutstandingMagicLinkTokensForTenant(db, ctx) — deletes
│                             #    magic_link_tokens rows keyed by any of this tenant's users'
│                             #    email addresses (the one table with no FK to user_id at all)
│                             #  - deleteTenantAccount(db, tenantId) — the single cascading
│                             #    DELETE FROM tenants statement
├── auth/session.ts         # extended: clearSessionCache(kv, tokenHash) — deletes the
│                             #  cache-aside KV entry directly; needed because the existing
│                             #  invalidateSession() silently no-ops once the sessions row is
│                             #  already gone (research.md)
└── routes/v1/
    └── account.ts            # new: DELETE /api/v1/account — R2 cleanup, then the two D1
                                # cleanup steps above, then clears both the session cookie and
                                # its KV cache entry; 400 if the request body's confirm field
                                # doesn't match the required phrase, nothing touched

src/client/
├── account.ts                # new: thin client wrapper, mirrors vehicles.ts's shape —
│                               # deleteAccount(confirmPhrase: string): Promise<void>
└── components/
    └── AccountDeletion.tsx    # new: the confirmation UI — a warning, a text input requiring
                                 # the exact phrase before the final destructive button enables,
                                 # styled per spec 008

tests/server/
└── account-erasure.test.ts    # new: full-account erasure removes every affected table's rows
                                 # and every R2 object, an outstanding magic-link token is gone,
                                 # a missing/wrong confirm value changes nothing, a second
                                 # tenant's data survives untouched, and the session cookie is
                                 # cleared and unusable afterward
```

**Structure Decision**: Single-project web app (existing structure) — no new top-level directories,
no new table. This is the first feature in the app requiring a deliberate two-step
destructive-action confirmation on the client, but otherwise follows the exact
repository/route/client-wrapper shape every prior feature already established.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
