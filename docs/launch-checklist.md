# v1.0 launch checklist

Pre-GA checklist for Odograph, tracked against
[issue #26](https://github.com/iumalabs/odograph/issues/26).

## Milestones

| Milestone                     | Status                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1: Auth & Tenancy foundation | Shipped, closed.                                                                                                                                                                                                                                                                         |
| M2: Vehicles                  | Shipped, closed.                                                                                                                                                                                                                                                                         |
| M3: Service records           | Shipped, closed.                                                                                                                                                                                                                                                                         |
| M4: Fuel records              | Shipped, closed.                                                                                                                                                                                                                                                                         |
| M5: Reminders                 | Shipped, closed — email delivery (`#14`) and, once M7's service worker/push subscription infrastructure landed, web push delivery too (`#15`).                                                                                                                                           |
| M6: Dashboard & aggregates    | Shipped, closed.                                                                                                                                                                                                                                                                         |
| M7: PWA & offline sync        | Shipped, closed — all 4 issues (`#18`–`#21`: PWA installability, camera capture, offline write queue, sync rejection review). Originally deprioritized past v1.0 GA, built in a later cycle; see the updated Principle III readiness below and the "Beyond original v1.0 scope" section. |
| M8: v1.0 launch hardening     | Shipped: CSP (`#24`), GDPR erasure (`#22`), API tokens (`#23`), i18n audit (`#25`, zero violations found). This checklist (`#26`) is the last item.                                                                                                                                      |

**Housekeeping**: issues `#6`, `#8`, and `#9` (early M1/M2 work merged before this project
consistently closed issues via PR-linked comments) are confirmed closed as of this update — no
action needed.

## Docs

- [x] [README.md](../README.md) — stack, dev process, environments, getting started.
- [x] [CONTRIBUTING.md](../CONTRIBUTING.md) — Spec Kit cycle, exemptions, git workflow.
- [x] [docs/deployment.md](deployment.md) — this project's own GitHub-Actions-only pipeline for
      `odograph.iuma.dev`.
- [x] [docs/self-hosting.md](self-hosting.md) — deploying your own instance to your own Cloudflare
      account, independent of this project's CI/CD.
- [x] [docs/backup-restore.md](backup-restore.md) — D1/R2/KV backup and disaster-recovery
      procedures.
- [x] `.specify/memory/constitution.md` — the locked product/architecture decisions every spec is
      checked against.
- [x] [LICENSE](../LICENSE) — present (AGPL-3.0, matching the README's stated license).

## Principle-by-principle launch readiness

Cross-checked against `.specify/memory/constitution.md`:

- [x] **I. Tenant Isolation via Repository Layer** — enforced throughout; every query in
      `src/server/db/repository.ts` is `TenantContext`-scoped.
- [x] **II. Server-Computed, Division-Safe Aggregates** — shipped (spec 013).
- [x] **III. Idempotent, Ordered Offline Sync** — shipped and verified against the actual
      implementation (M7, spec 020): `src/client/offline/queue.ts`'s `enqueue()` generates a
      `crypto.randomUUID()` per action, used as both the resource id (for creates) and the
      `Idempotency-Key` request header; `drain()` processes exactly one `pending` action at a time
      in array (creation) order, never concurrently. Server-side,
      `src/server/middleware/
      idempotency.ts`'s `idempotent` middleware checks that key
      against a `findWriteOperation` lookup before applying a write. Rejected operations surface via
      the sync review screen (spec 021, `#21`) rather than failing silently.
- [x] **IV. No Interpolated Data** — no feature in this codebase invents/interpolates data.
- [x] **V. Private Object Storage with Validated Uploads** — shipped (R2 attachments, tenant-scoped
      keys, spec 007).
- [x] **VI. Hardened API Tokens** — shipped (spec 017).
- [x] **VII. Locked-Down Session and Transport Security** — CSP with nonces (spec 015), `HttpOnly`/
      `Secure`/`SameSite=Lax` cookies, rate limiting on auth + every write path.
- [x] **VIII. GDPR Erasure by Design** — shipped (spec 016); every table has a documented
      delete-vs-anonymise decision (full deletion, no exceptions).
- [x] **IX. Separated Language and Locale Axes; i18n from Screen One** — audited (`#25`), zero
      hardcoded user-facing strings found.
- [x] **X. Toolchain Discipline** — Deno-only, enforced by `deno task check`'s repository-boundary
      guard and this project's own CI.
- [x] **XI. English-Only Project Artifacts** — consistent throughout.
- [x] **XII. GitHub-Actions-Only Deployment** — enforced for `odograph.iuma.dev` itself
      (docs/deployment.md); self-hosters use plain `wrangler` by design (docs/self-hosting.md),
      which is a deliberately different, supported path for a different audience, not a violation of
      this principle as it applies to _this project's own_ deployment.

## Beyond original v1.0 scope

M7 was originally deferred past v1.0 GA in this checklist's earlier drafts but was in fact built in
a later cycle before this checklist was ever signed off or tagged — so the "not in scope" framing
this section used to carry no longer applies to anything. Since then, milestones M9–M12 (documents &
renewal reminders, maintenance planner, quality-of-life extensions — expense analytics/PDF
export/search/settings screen, and VIN lookup) also shipped, all beyond this checklist's original
M1–M8 scope. This document intentionally stays scoped to the original v1.0 (M1–M8, tracked by `#26`)
rather than being rewritten to chase the moving target of "everything shipped so far" — later
milestones don't need a retroactive v1.0 checklist entry, they're already each individually spec'd
and shipped on their own terms (see `specs/`).

## Sign-off

All housekeeping is done, M8 is fully closed, and every constitution principle is shipped and
verified — including III, now that M7 gives it something real to apply to. Docs cover both this
project's own deployment and third-party self-hosting, and backup/restore is documented for anyone
running their own instance. **v1.0 is ready to tag.** No `v1.0` (or any) git tag exists yet as of
this update — tagging is a visible, external-facing action this checklist deliberately leaves to an
explicit human decision rather than performing itself, same as the (now-resolved) housekeeping issue
closures above.
