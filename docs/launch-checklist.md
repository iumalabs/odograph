# v1.0 launch checklist

Pre-GA checklist for Odograph, tracked against
[issue #26](https://github.com/maksimyugai/odograph/issues/26).

## Milestones

| Milestone                     | Status                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1: Auth & Tenancy foundation | Shipped. `#6`/`#8` (magic link, account linking) were merged but never closed on GitHub — see the housekeeping note below.                                                                                           |
| M2: Vehicles                  | Shipped. `#9` (Vehicle CRUD) was merged but never closed — see below.                                                                                                                                                |
| M3: Service records           | Shipped, closed.                                                                                                                                                                                                     |
| M4: Fuel records              | Shipped, closed.                                                                                                                                                                                                     |
| M5: Reminders                 | Email delivery shipped, closed (`#14`). Web push delivery (`#15`) intentionally not built — it depends on a service worker/push subscription, which is M7 (PWA) scope, not shipped this cycle. Correctly stays open. |
| M6: Dashboard & aggregates    | Shipped, closed.                                                                                                                                                                                                     |
| M7: PWA & offline sync        | **Not started** — deliberately deprioritized in favor of M8 (launch hardening) this cycle. All 4 issues (`#18`–`#21`) remain open. Out of scope for v1.0 GA; revisit for a post-GA release.                          |
| M8: v1.0 launch hardening     | Shipped: CSP (`#24`), GDPR erasure (`#22`), API tokens (`#23`), i18n audit (`#25`, zero violations found). This checklist (`#26`) is the last item.                                                                  |

**Housekeeping finding**: issues `#6`, `#8`, and `#9` represent work that was fully merged (`#33`,
`#35`, `#36` respectively) early in this project's development but were never closed on GitHub — an
oversight from before this project consistently closed issues via PR-linked comments. They're not
open work; someone with repo write access should close them (referencing the PRs above) as part of
finishing this checklist. This audit did not close them itself — confirming and closing stale issues
from outside the current unit of work needs an explicit human decision, not an inference this
checklist makes on its own.

## Docs

- [x] [README.md](../README.md) — stack, dev process, environments, getting started.
- [x] [CONTRIBUTING.md](../CONTRIBUTING.md) — Spec Kit cycle, exemptions, git workflow.
- [x] [docs/deployment.md](deployment.md) — this project's own GitHub-Actions-only pipeline for
      `odograph.dev`.
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
- [ ] **III. Idempotent, Ordered Offline Sync** — not applicable yet; there's no offline write queue
      to be idempotent about (M7, not started). Not a v1.0 GA blocker since the app has no offline
      mode to make a promise about yet — the principle has nothing to violate until M7 exists.
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
- [x] **XII. GitHub-Actions-Only Deployment** — enforced for `odograph.dev` itself
      (docs/deployment.md); self-hosters use plain `wrangler` by design (docs/self-hosting.md),
      which is a deliberately different, supported path for a different audience, not a violation of
      this principle as it applies to _this project's own_ deployment.

## Not in scope for v1.0 GA

- M7 (PWA installability, camera capture, offline write queue, sync rejection review) — explicitly
  deferred this cycle. The app works fully online-only; nothing in v1.0's feature set depends on
  offline support existing.
- Web push reminder delivery (`#15`) — depends on M7's service worker infrastructure.

## Sign-off

Once the housekeeping issue closures above are done (human action, not automated by this checklist),
M8 is fully closed and v1.0 is ready to tag — every constitution principle that applies to a
fully-online v1.0 (all except III, which has nothing to apply to yet) is shipped and verified, docs
cover both this project's own deployment and third-party self-hosting, and backup/restore is
documented for anyone running their own instance.
